"use client";

import type { Turn } from "@prof/ai-reaction";
import { useEffect, useRef } from "react";

interface CueDisplayProps {
  turns: Turn[];
  activeTurns: Set<string>;
  onSeek?: (time: number) => void;
}

export function CueDisplay({ turns, activeTurns, onSeek }: CueDisplayProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeCueRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleCueClick = (turn: Turn) => {
    if (onSeek) {
      onSeek(turn.startTime);
    }
  };

  // Auto-scroll to active cue
  useEffect(() => {
    if (activeTurns.size === 0) return;

    const firstActiveTurnId = Array.from(activeTurns)[0];
    const activeCueElement = activeCueRefs.current.get(firstActiveTurnId);
    const container = scrollContainerRef.current;

    if (activeCueElement && container) {
      const containerRect = container.getBoundingClientRect();
      const cueRect = activeCueElement.getBoundingClientRect();

      const scrollTop =
        container.scrollTop +
        (cueRect.top - containerRect.top) -
        containerRect.height / 2 +
        cueRect.height / 2;

      container.scrollTo({
        top: scrollTop,
        behavior: "smooth",
      });
    }
  }, [activeTurns]);

  return (
    <div
      ref={scrollContainerRef}
      className="space-y-2 max-h-64 overflow-y-auto"
    >
      {turns.map((turn) => {
        const isActive = activeTurns.has(turn.id);
        return (
          <button
            type="button"
            key={turn.id}
            ref={(el) => {
              if (el && isActive) {
                activeCueRefs.current.set(turn.id, el);
              } else {
                activeCueRefs.current.delete(turn.id);
              }
            }}
            onClick={() => handleCueClick(turn)}
            className={`p-3 rounded border transition-colors cursor-pointer hover:bg-muted/70 ${
              isActive ? "bg-primary/10 border-primary" : "bg-muted/50"
            }`}
          >
            <div className="text-xs text-muted-foreground">
              {formatTime(turn.startTime)} - {formatTime(turn.endTime)}
            </div>
            <div className="text-sm">{turn.content}</div>
          </button>
        );
      })}
    </div>
  );
}
