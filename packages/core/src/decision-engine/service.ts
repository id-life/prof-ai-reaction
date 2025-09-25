import { getLogger } from "@logtape/logtape";
import type { Comment, Event } from "../type.js";
import type { Decision, DecisionEngineConfig } from "./def.js";

export class DecisionEngine {
  private lastCommentTime = -Infinity;
  private commentHistory: Comment[] = [];
  private dynamicThreshold: number;

  private logger = getLogger(["ai-reaction", "decision-engine"]);

  constructor(private config: DecisionEngineConfig) {
    // Start with higher threshold to avoid early comments
    this.dynamicThreshold = Math.min(config.baseThreshold * 1.3, 0.85);
  }

  evaluate(events: Event[], timestamp: number): Decision {
    this.logger.debug("Starting decision evaluation", () => ({
      eventCount: events.length,
      eventTypes: events.map((e) => e.type),
      timestamp,
      lastCommentTime: this.lastCommentTime,
      dynamicThreshold: this.dynamicThreshold,
    }));

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
      this.logger.trace("Calculated emotion factor", {
        emotionEventsCount: emotionEvents.length,
        maxConfidence: factors.emotion,
        avgConfidence:
          emotionEvents.reduce((sum, e) => sum + e.confidence, 0) /
          emotionEvents.length,
      });
    }

    // Calculate topic factor
    const topicEvents = events.filter((e) => e.type === "topic_change");
    if (topicEvents.length > 0) {
      factors.topic = Math.max(...topicEvents.map((e) => e.confidence));
      this.logger.trace("Calculated topic factor", {
        topicEventsCount: topicEvents.length,
        maxConfidence: factors.topic,
        avgConfidence:
          topicEvents.reduce((sum, e) => sum + e.confidence, 0) /
          topicEvents.length,
      });
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

    this.logger.trace("Calculated timing factor", {
      timeSinceLastComment,
      conversationTime,
      isEarlyInConversation,
      timingFactor: factors.timing,
      minInterval: this.config.minInterval,
      maxInterval: this.config.maxInterval,
    });

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
      this.logger.trace("Calculated importance factor", {
        importantEventsCount: importantEvents.length,
        eventTypes: importantEvents.map((e) => e.type),
        maxConfidence: factors.importance,
        avgConfidence:
          importantEvents.reduce((sum, e) => sum + e.confidence, 0) /
          importantEvents.length,
      });
    }

    // Calculate keyword factor (question events)
    const questionEvents = events.filter((e) => e.type === "question_raised");
    if (questionEvents.length > 0) {
      factors.keyword = Math.max(...questionEvents.map((e) => e.confidence));
      this.logger.trace("Calculated keyword factor", {
        questionEventsCount: questionEvents.length,
        maxConfidence: factors.keyword,
        avgConfidence:
          questionEvents.reduce((sum, e) => sum + e.confidence, 0) /
          questionEvents.length,
      });
    }

    // Calculate content quality bonus
    const contentQualityBonus = this.calculateContentQualityBonus(events);
    this.logger.trace("Calculated content quality bonus", {
      bonus: contentQualityBonus,
      eventsWithQuality: events.filter(
        (e) => e.metadata?.contentQualityScore !== undefined,
      ).length,
    });

    // Calculate weighted score
    const baseScore = this.calculateWeightedScore(factors);
    this.logger.trace("Calculated base score", {
      baseScore,
      factors,
      weights: {
        emotion: this.config.emotionWeight,
        topic: this.config.topicWeight,
        timing: this.config.timingWeight,
        importance: this.config.importanceWeight,
        keyword: this.config.keywordWeight,
      },
    });

    // Apply modifiers
    const timeDecay =
      this.config.timeDecayRate **
      (Math.max(0, 60 - timeSinceLastComment) / 60);
    const frequencySuppression = this.calculateFrequencySuppression(timestamp);

    this.logger.trace("Calculated modifiers", {
      timeDecay,
      frequencySuppression,
      timeDecayRate: this.config.timeDecayRate,
      timeSinceLastComment,
      recentCommentsCount: this.commentHistory.filter((c) => {
        const commentTimestamp = c.metadata?.timestamp;
        return (
          typeof commentTimestamp === "number" &&
          timestamp - commentTimestamp < 90000 &&
          timestamp - commentTimestamp >= 0
        );
      }).length,
    });

    const finalScore =
      (baseScore + contentQualityBonus) * timeDecay * frequencySuppression;

    // Determine priority
    const priority = this.determinePriority(finalScore, events);

    // Make decision
    const shouldComment = finalScore > this.dynamicThreshold;
    const confidence = Math.min(finalScore / this.dynamicThreshold, 1);
    const suggestedDelay = this.calculateSuggestedDelay(
      priority,
      timeSinceLastComment,
    );
    const reasoning = this.generateReasoning(
      factors,
      finalScore,
      shouldComment,
    );

    // Adjust threshold for next decision
    const oldThreshold = this.dynamicThreshold;
    this.adjustThreshold(shouldComment, timeSinceLastComment);
    const thresholdAdjustment = this.dynamicThreshold - oldThreshold;

    this.logger.info("Decision evaluation completed", {
      decision: shouldComment ? "COMMENT" : "SKIP",
      score: parseFloat(finalScore.toFixed(3)),
      threshold: parseFloat(this.dynamicThreshold.toFixed(3)),
      confidence: parseFloat(confidence.toFixed(3)),
      priority,
      suggestedDelayMs: suggestedDelay,
      thresholdAdjustment: parseFloat(thresholdAdjustment.toFixed(3)),
      reasoning,
      factors: Object.fromEntries(
        Object.entries(factors).map(([k, v]) => [k, parseFloat(v.toFixed(3))]),
      ),
      modifiers: {
        contentQualityBonus: parseFloat(contentQualityBonus.toFixed(3)),
        timeDecay: parseFloat(timeDecay.toFixed(3)),
        frequencySuppression: parseFloat(frequencySuppression.toFixed(3)),
      },
    });

    return {
      shouldComment,
      confidence,
      score: finalScore,
      factors,
      priority,
      suggestedDelay,
      reasoning,
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
    });

    const recentCommentsCount = recentComments.length;
    let suppression: number;

    // Stronger suppression for multiple recent comments
    if (recentCommentsCount >= 3) suppression = 0.2;
    else if (recentCommentsCount >= 2) suppression = 0.4;
    else if (recentCommentsCount >= 1) suppression = 0.6;
    else suppression = 1.0;

    this.logger.trace("Calculated frequency suppression", {
      currentTimestamp,
      recentCommentsCount,
      suppression,
      recentCommentTimes: recentComments.map((c) => c.metadata?.timestamp),
    });

    return suppression;
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
    const oldThreshold = this.dynamicThreshold;
    let adjustmentReason: string;

    if (commented && timeSinceLastComment < this.config.minInterval * 1.5) {
      // Increase threshold if commenting too frequently
      this.dynamicThreshold = Math.min(0.95, this.dynamicThreshold * 1.05);
      adjustmentReason = "increase due to frequent commenting";
    } else if (!commented && timeSinceLastComment > this.config.maxInterval) {
      // Decrease threshold if not commenting enough
      this.dynamicThreshold = Math.max(0.3, this.dynamicThreshold * 0.95);
      adjustmentReason = "decrease due to infrequent commenting";
    } else {
      // Slowly return to base threshold
      const diff = this.config.baseThreshold - this.dynamicThreshold;
      this.dynamicThreshold += diff * 0.1;
      adjustmentReason = "gradual return to base";
    }

    const adjustment = this.dynamicThreshold - oldThreshold;
    if (Math.abs(adjustment) > 0.001) {
      // Only log significant changes
      this.logger.debug("Adjusted dynamic threshold", {
        oldThreshold: parseFloat(oldThreshold.toFixed(3)),
        newThreshold: parseFloat(this.dynamicThreshold.toFixed(3)),
        adjustment: parseFloat(adjustment.toFixed(3)),
        reason: adjustmentReason,
        commented,
        timeSinceLastComment,
        baseThreshold: this.config.baseThreshold,
        minInterval: this.config.minInterval,
        maxInterval: this.config.maxInterval,
      });
    }
  }

  private calculateContentQualityBonus(events: Event[]): number {
    let bonus = 0;
    const qualityScores: number[] = [];

    for (const event of events) {
      const contentQualityScore = event.metadata?.contentQualityScore;
      if (typeof contentQualityScore === "number") {
        qualityScores.push(contentQualityScore);
        // Convert 0-10 score to 0-0.3 bonus range
        const eventBonus = Math.max(0, ((contentQualityScore - 3) / 10) * 0.3);
        bonus += eventBonus;
      }
    }

    const cappedBonus = Math.min(bonus, 0.3); // Cap bonus at 0.3 to avoid over-boosting

    if (qualityScores.length > 0) {
      this.logger.trace("Calculated content quality bonus", {
        eventsWithQuality: qualityScores.length,
        rawBonus: parseFloat(bonus.toFixed(3)),
        cappedBonus: parseFloat(cappedBonus.toFixed(3)),
        avgQualityScore: parseFloat(
          (
            qualityScores.reduce((sum, s) => sum + s, 0) / qualityScores.length
          ).toFixed(2),
        ),
        qualityScores,
      });
    }

    return cappedBonus;
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
    this.logger.debug("Updating comment history", {
      commentId: comment.id,
      commentLength: comment.length,
      writer: comment.writer,
      generationTimeMs: comment.generationTime,
      timestamp: comment.metadata?.timestamp,
      previousHistoryLength: this.commentHistory.length,
    });

    this.commentHistory.push(comment);
    const timestamp = comment.metadata?.timestamp;
    const previousLastCommentTime = this.lastCommentTime;
    this.lastCommentTime =
      typeof timestamp === "number" ? timestamp : Date.now();

    // Keep only recent history (last 10 comments)
    const trimmed = this.commentHistory.length > 10;
    if (trimmed) {
      const trimmedComment = this.commentHistory.shift();
      this.logger.trace("Trimmed old comment from history", {
        trimmedCommentId: trimmedComment?.id,
        historyLength: this.commentHistory.length,
      });
    }

    this.logger.debug("Comment history updated", {
      historyLength: this.commentHistory.length,
      lastCommentTimeChanged: this.lastCommentTime !== previousLastCommentTime,
      timeSincePreviousComment:
        previousLastCommentTime === -Infinity
          ? null
          : (this.lastCommentTime - previousLastCommentTime) / 1000,
      trimmed,
    });
  }
}
