"use client";

import type { Decision, Event, Turn } from "@prof/ai-reaction";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface LogEntry {
  id: string;
  type: "event" | "decision";
  timestamp: number;
  turn: Turn;
  data: Event | Decision;
  processingTimeMs: number;
}

interface LoggerSectionProps {
  entries: LogEntry[];
  onExport: () => void;
}

export function LoggerSection({ entries, onExport }: LoggerSectionProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatConfidence = (value: number) => `${(value * 100).toFixed(1)}%`;

  const renderEvent = (entry: LogEntry) => {
    const event = entry.data as Event;
    return (
      <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded border">
        <div className="flex justify-between items-start mb-2">
          <div className="flex gap-2">
            <span className="text-xs bg-blue-200 dark:bg-blue-800 px-2 py-1 rounded">
              EVENT
            </span>
            <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">
              {event.type}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            @{formatTime(entry.turn.endTime)}
          </span>
        </div>
        <div className="text-sm space-y-1">
          <div>Confidence: {formatConfidence(event.confidence)}</div>
          <div>Intensity: {formatConfidence(event.intensity)}</div>
          {event.triggers.length > 0 && (
            <div>Triggers: {event.triggers.join(", ")}</div>
          )}
          {event.metadata?.reasoning && (
            <div className="text-muted-foreground italic">
              {event.metadata.reasoning}
            </div>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Detected in {entry.processingTimeMs}ms
        </div>
      </div>
    );
  };

  const renderDecision = (entry: LogEntry) => {
    const decision = entry.data as Decision;
    return (
      <div className="p-3 bg-green-50 dark:bg-green-950 rounded border">
        <div className="flex justify-between items-start mb-2">
          <div className="flex gap-2">
            <span className="text-xs bg-green-200 dark:bg-green-800 px-2 py-1 rounded">
              DECISION
            </span>
            <span
              className={`text-xs px-2 py-1 rounded ${
                decision.shouldComment
                  ? "bg-green-300 dark:bg-green-700"
                  : "bg-gray-300 dark:bg-gray-600"
              }`}
            >
              {decision.shouldComment ? "COMMENT" : "SKIP"}
            </span>
            <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">
              {decision.priority}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            @{formatTime(entry.turn.endTime)}
          </span>
        </div>
        <div className="text-sm space-y-1">
          <div>Score: {formatConfidence(decision.score)}</div>
          <div>Confidence: {formatConfidence(decision.confidence)}</div>
          <div>Delay: {decision.suggestedDelay}ms</div>
          <div className="text-muted-foreground italic">
            {decision.reasoning}
          </div>
          {Object.keys(decision.factors).length > 0 && (
            <div className="text-xs">
              Factors:{" "}
              {Object.entries(decision.factors)
                .map(([key, value]) => `${key}:${(value * 100).toFixed(0)}%`)
                .join(", ")}
            </div>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Decided in {entry.processingTimeMs}ms
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>System Logger</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={onExport}
            disabled={entries.length === 0}
            className="flex gap-2"
          >
            <Download className="h-4 w-4" />
            Export JSON
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {entries.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No events or decisions logged yet
            </p>
          ) : (
            entries
              .sort((a, b) => b.timestamp - a.timestamp)
              .map((entry) => (
                <div key={entry.id}>
                  {entry.type === "event"
                    ? renderEvent(entry)
                    : renderDecision(entry)}
                </div>
              ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
