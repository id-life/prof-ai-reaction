import type { Comment, Event } from "../type.js";
import type { Decision, DecisionEngineConfig } from "./def.js";

export class DecisionEngine {
  private lastCommentTime = -Infinity;
  private commentHistory: Comment[] = [];
  private dynamicThreshold: number;

  constructor(private config: DecisionEngineConfig) {
    // Start with higher threshold to avoid early comments
    this.dynamicThreshold = Math.min(config.baseThreshold * 1.3, 0.85);
  }

  evaluate(events: Event[], timestamp: number): Decision {
    const factors: Record<string, number> = {
      emotion: 0,
      topic: 0,
      timing: 0,
      importance: 0,
      keyword: 0,
    };

    // Calculate emotion factor
    const emotionEvents = events.filter((e) => e.type === "emotion_peak");
    if (emotionEvents.length > 0) {
      factors.emotion = Math.max(...emotionEvents.map((e) => e.confidence));
    }

    // Calculate topic factor
    const topicEvents = events.filter((e) => e.type === "topic_change");
    if (topicEvents.length > 0) {
      factors.topic = Math.max(...topicEvents.map((e) => e.confidence));
    }

    // Calculate timing factor (convert milliseconds to seconds)
    const timeSinceLastComment =
      this.lastCommentTime === -Infinity
        ? 0 // Don't allow immediate first comment
        : Math.max(0, (timestamp - this.lastCommentTime) / 1000);

    // Require minimum conversation time before first comment (20 seconds)
    const conversationTime = timestamp / 1000;
    const isEarlyInConversation = conversationTime < 20;

    factors.timing = isEarlyInConversation
      ? 0.1 // Suppress early comments
      : this.calculateTimingScore(timeSinceLastComment);

    // Calculate importance factor
    const importantEvents = events.filter(
      (e) =>
        e.type === "conclusion_reached" ||
        e.type === "key_point" ||
        e.type === "summary_point",
    );
    if (importantEvents.length > 0) {
      factors.importance = Math.max(
        ...importantEvents.map((e) => e.confidence),
      );
    }

    // Calculate keyword factor (question events)
    const questionEvents = events.filter((e) => e.type === "question_raised");
    if (questionEvents.length > 0) {
      factors.keyword = Math.max(...questionEvents.map((e) => e.confidence));
    }

    // Calculate content quality bonus
    const contentQualityBonus = this.calculateContentQualityBonus(events);

    // Calculate weighted score
    const baseScore = this.calculateWeightedScore(factors);

    // Apply modifiers
    const timeDecay =
      this.config.timeDecayRate **
      (Math.max(0, 60 - timeSinceLastComment) / 60);
    const frequencySuppression = this.calculateFrequencySuppression(timestamp);

    const finalScore =
      (baseScore + contentQualityBonus) * timeDecay * frequencySuppression;

    // Determine priority
    const priority = this.determinePriority(finalScore, events);

    // Make decision
    const shouldComment = finalScore > this.dynamicThreshold;

    // Adjust threshold for next decision
    this.adjustThreshold(shouldComment, timeSinceLastComment);

    return {
      shouldComment,
      confidence: Math.min(finalScore / this.dynamicThreshold, 1),
      score: finalScore,
      factors,
      priority,
      suggestedDelay: this.calculateSuggestedDelay(
        priority,
        timeSinceLastComment,
      ),
      reasoning: this.generateReasoning(factors, finalScore, shouldComment),
    };
  }

  private calculateWeightedScore(factors: Record<string, number>): number {
    return (
      factors.emotion * this.config.emotionWeight +
      factors.topic * this.config.topicWeight +
      factors.timing * this.config.timingWeight +
      factors.importance * this.config.importanceWeight +
      factors.keyword * this.config.keywordWeight
    );
  }

  private calculateTimingScore(timeSinceLastComment: number): number {
    const { minInterval, maxInterval } = this.config;

    if (timeSinceLastComment < minInterval) {
      // Strongly suppress comments that are too close together
      return Math.max(0.05, (timeSinceLastComment / minInterval) * 0.2);
    }

    if (timeSinceLastComment > maxInterval) {
      return 1;
    }

    // Linear interpolation between min and max
    return (timeSinceLastComment - minInterval) / (maxInterval - minInterval);
  }

  private calculateFrequencySuppression(currentTimestamp: number): number {
    // Count recent comments in the last 90 seconds (based on conversation time)
    const recentComments = this.commentHistory.filter((c) => {
      const timestamp = c.metadata?.timestamp;
      return (
        typeof timestamp === "number" &&
        currentTimestamp - timestamp < 90000 &&
        currentTimestamp - timestamp >= 0
      );
    }).length;

    // Stronger suppression for multiple recent comments
    if (recentComments >= 3) return 0.2;
    if (recentComments >= 2) return 0.4;
    if (recentComments >= 1) return 0.6;
    return 1.0;
  }

  private determinePriority(
    score: number,
    events: Event[],
  ): "low" | "medium" | "high" {
    const hasImportantEvent = events.some(
      (e) => e.type === "conclusion_reached" || e.type === "climax_moment",
    );

    // Raise thresholds for priority determination
    if (hasImportantEvent && score > 0.95) {
      return "high";
    }

    if (score > 0.85) {
      return "medium";
    }

    return "low";
  }

  private calculateSuggestedDelay(
    priority: "low" | "medium" | "high",
    timeSinceLastComment: number,
  ): number {
    // Increase delays to avoid rapid commenting
    const baseDelay =
      priority === "high" ? 1500 : priority === "medium" ? 2500 : 4000;

    // Add extra delay if commenting too frequently
    if (timeSinceLastComment < this.config.minInterval) {
      return (
        baseDelay + (this.config.minInterval - timeSinceLastComment) * 1000
      );
    }

    return baseDelay;
  }

  private adjustThreshold(
    commented: boolean,
    timeSinceLastComment: number,
  ): void {
    if (commented && timeSinceLastComment < this.config.minInterval * 1.5) {
      // Increase threshold if commenting too frequently
      this.dynamicThreshold = Math.min(0.95, this.dynamicThreshold * 1.05);
    } else if (!commented && timeSinceLastComment > this.config.maxInterval) {
      // Decrease threshold if not commenting enough
      this.dynamicThreshold = Math.max(0.3, this.dynamicThreshold * 0.95);
    } else {
      // Slowly return to base threshold
      const diff = this.config.baseThreshold - this.dynamicThreshold;
      this.dynamicThreshold += diff * 0.1;
    }
  }

  private calculateContentQualityBonus(events: Event[]): number {
    let bonus = 0;

    for (const event of events) {
      const contentQualityScore = event.metadata?.contentQualityScore;
      if (typeof contentQualityScore === "number") {
        // Convert 0-10 score to 0-0.3 bonus range
        bonus += Math.max(0, ((contentQualityScore - 3) / 10) * 0.3);
      }
    }

    return Math.min(bonus, 0.3); // Cap bonus at 0.3 to avoid over-boosting
  }

  private generateReasoning(
    factors: Record<string, number>,
    score: number,
    shouldComment: boolean,
  ): string {
    const topFactors = Object.entries(factors)
      .filter(([_, value]) => value > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([name]) => name);

    if (shouldComment) {
      return `Score ${score.toFixed(2)} exceeds threshold ${this.dynamicThreshold.toFixed(2)}. Top factors: ${topFactors.join(", ")}`;
    } else {
      return `Score ${score.toFixed(2)} below threshold ${this.dynamicThreshold.toFixed(2)}. Waiting for stronger signals.`;
    }
  }

  updateHistory(comment: Comment): void {
    this.commentHistory.push(comment);
    const timestamp = comment.metadata?.timestamp;
    this.lastCommentTime =
      typeof timestamp === "number" ? timestamp : Date.now();

    // Keep only recent history (last 10 comments)
    if (this.commentHistory.length > 10) {
      this.commentHistory.shift();
    }
  }
}
