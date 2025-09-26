"use client";

import {
  type Comment,
  type CommentSystem,
  createCommentSystem,
  type Decision,
  type Event,
  type Turn,
} from "@prof/ai-reaction";
import { useAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiKeysAtom, systemConfigAtom } from "@/components/config/atom";
import { CommentFeed } from "@/components/playground/comment-feed";
import { CueDisplay } from "@/components/playground/cue-display";
import { InputSection } from "@/components/playground/input-section";
import { LoggerSection } from "@/components/playground/logger-section";
import { PlayerControls } from "@/components/playground/player-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Player } from "@/lib/player";
import { mimicTurns, parseSubtitle } from "@/lib/subtitle";
import { nanoid } from "nanoid";
import Link from "next/link";
import { Settings } from "lucide-react";

interface LogEntry {
  id: string;
  type: "event" | "decision";
  timestamp: number;
  turn: Turn;
  data: Event | Decision;
  processingTimeMs: number;
}

interface CommentWithStatus extends Comment {
  turn: Turn;
  status: 'generating' | 'completed' | 'rejected';
  partialText?: string;
  rejectionReason?: string;
}

interface PlaygroundState {
  turns: Turn[];
  activeTurns: Set<string>;
  comments: CommentWithStatus[];
  logEntries: LogEntry[];
  isPlaying: boolean;
  currentTime: number;
  playbackSpeed: number;
  completedTurns: Set<string>;
}

export default function PlaygroundPage() {
  const [apiKeys] = useAtom(apiKeysAtom);
  const [systemConfig] = useAtom(systemConfigAtom);
  const [state, setState] = useState<PlaygroundState>({
    turns: [],
    activeTurns: new Set(),
    comments: [],
    logEntries: [],
    isPlaying: false,
    currentTime: 0,
    playbackSpeed: 1,
    completedTurns: new Set(),
  });

  const systemRef = useRef<
    { comment: CommentSystem; player: Player } & Disposable
  >(null);

  const initializeSystem = useCallback(
    async (turns: Turn[]) => {
      if (!apiKeys.openai) {
        alert("Please configure API keys first");
        return;
      }

      systemRef.current?.[Symbol.dispose]();

      using stack = new DisposableStack();

      // Initialize player
      const player = stack.use(new Player(turns));

      // Initialize comment system
      const commentSystem = stack.use(
        createCommentSystem({
          apiKeys,
          config: systemConfig,
        }),
      );

      // Wire up events
      stack.defer(
        player.on("play", () => {
          setState((prev) => ({ ...prev, isPlaying: true }));
        }),
      );

      stack.defer(
        player.on("pause", () => {
          setState((prev) => ({ ...prev, isPlaying: false }));
        }),
      );

      stack.defer(
        player.on("time-update", (currentTime) => {
          setState((prev) => ({ ...prev, currentTime }));
        }),
      );

      stack.defer(
        player.on("cue-start", (cue) => {
          setState((prev) => ({
            ...prev,
            activeTurns: new Set([...prev.activeTurns, cue.id]),
          }));
        }),
      );

      stack.defer(
        player.on("cue-end", (cue) => {
          setState((prev) => {
            const newActiveTurns = new Set(prev.activeTurns);
            newActiveTurns.delete(cue.id);
            const newCompletedTurns = new Set(prev.completedTurns);
            newCompletedTurns.add(cue.id);

            // Only generate comment if enabled
            if (commentSystem) {
              commentSystem.onTurnCompleted(cue);
            }

            return {
              ...prev,
              activeTurns: newActiveTurns,
              completedTurns: newCompletedTurns,
            };
          });
        }),
      );

      stack.defer(
        player.on("speed-changed", (speed) => {
          setState((prev) => ({ ...prev, playbackSpeed: speed }));
        }),
      );

      stack.defer(
        commentSystem.on(
          "comment-generated",
          (comment: Comment, turn: Turn) => {
            setState((prev) => ({
              ...prev,
              comments: prev.comments.map((existingComment) =>
                existingComment.status === 'generating' &&
                existingComment.turn.id === turn.id
                  ? {
                      ...comment,
                      turn,
                      status: 'completed' as const,
                      partialText: undefined,
                    }
                  : existingComment
              ),
            }));
          },
        ),
      );
      stack.defer(
        commentSystem.on(
          "comment-rejected",
          (reason: string, turn: Turn) => {
            setState((prev) => ({
              ...prev,
              comments: prev.comments.map((existingComment) =>
                existingComment.status === 'generating' &&
                existingComment.turn.id === turn.id
                  ? {
                      ...existingComment,
                      status: 'rejected' as const,
                      rejectionReason: reason,
                      partialText: undefined,
                    }
                  : existingComment
              ),
            }));
          },
        ),
      );

      stack.defer(
        commentSystem.on(
          "events-detected",
          (events: Event[], turn: Turn, processingTimeMs: number) => {
            const logEntries = events.map((event) => ({
              id: nanoid(),
              type: "event" as const,
              timestamp: Date.now(),
              turn,
              data: event,
              processingTimeMs,
            }));
            setState((prev) => ({
              ...prev,
              logEntries: [...prev.logEntries, ...logEntries],
            }));
          },
        ),
      );

      stack.defer(
        commentSystem.on(
          "decision-made",
          (decision: Decision, turn: Turn, processingTimeMs: number) => {
            const logEntry = {
              id: nanoid(),
              type: "decision" as const,
              timestamp: Date.now(),
              turn,
              data: decision,
              processingTimeMs,
            };
            setState((prev) => ({
              ...prev,
              logEntries: [...prev.logEntries, logEntry],
            }));
          },
        ),
      );

      stack.defer(
        commentSystem.on("comment-started", async (response, turn) => {
          // Create partial comment immediately
          const partialCommentId = nanoid();
          setState((prev) => ({
            ...prev,
            comments: [
              ...prev.comments,
              {
                id: partialCommentId,
                content: "",
                writer: "AI Assistant",
                length: 0,
                generationTime: 0,
                metadata: { timestamp: turn.startTime },
                turn,
                status: 'generating' as const,
                partialText: "",
              },
            ],
          }));

          let responseText = "";
          for await (const event of response) {
            if (event.type === "agent_updated_stream_event") {
              console.debug(
                "[agent_updated_stream_event]",
                event.agent.name,
                event.agent,
              );
            } else if (event.type === "run_item_stream_event") {
              console.debug("[run_item_stream_event]", event.name);
            } else if (event.type === "raw_model_stream_event") {
              if (event.data.type === "response_started") {
                responseText = "";
                // Reset partial text on response restart
                setState((prev) => ({
                  ...prev,
                  comments: prev.comments.map((comment) =>
                    comment.id === partialCommentId
                      ? { ...comment, partialText: "" }
                      : comment
                  ),
                }));
              }
              if (event.data.type === "output_text_delta") {
                responseText += event.data.delta;
                console.log("[comment-generating]", responseText);
                // Update partial text in real-time
                setState((prev) => ({
                  ...prev,
                  comments: prev.comments.map((comment) =>
                    comment.id === partialCommentId
                      ? { ...comment, partialText: responseText }
                      : comment
                  ),
                }));
              }
              if (event.data.type === "response_done") {
                console.log("[comment-done]", responseText);
                responseText = "";
              }
            }
          }
        }),
      );

      const disposables = stack.move();
      systemRef.current = {
        comment: commentSystem,
        player,
        [Symbol.dispose]: () => {
          disposables.dispose();
        },
      };

      setState((prev) => ({ ...prev, turns }));
    },
    [apiKeys, systemConfig],
  );

  useEffect(() => {
    return () => {
      systemRef.current?.[Symbol.dispose]();
    };
  }, []);

  const handleTextSubmit = async (text: string) => {
    try {
      const turns = mimicTurns(text);
      await initializeSystem(turns);
    } catch (error) {
      console.error("Error parsing text input:", error);
      alert("Error parsing text input. Please check the format.");
    }
  };

  const handleFileSubmit = async (file: File) => {
    try {
      const text = await file.text();
      const turns = await parseSubtitle(text);
      await initializeSystem(turns);
    } catch (error) {
      console.error("Error reading file:", error);
      alert("Error reading file. Please check the format.");
    }
  };

  const togglePlay = () => {
    const player = systemRef.current?.player;
    if (!player) return;

    if (state.isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  };

  const handlePause = () => {
    const player = systemRef.current?.player;
    if (!player) return;
    player.pause();
  };

  const handleSpeedChange = (speed: number) => {
    const player = systemRef.current?.player;
    if (!player) return;
    player.setSpeed(speed);
  };

  const handleSeek = (time: number) => {
    const player = systemRef.current?.player;
    if (!player) return;
    player.seekTo(time);
  };

  const reset = () => {
    const player = systemRef.current?.player;
    if (!player) return;
    player.pause();
    player.seekTo(0);
    setState((prev) => ({
      ...prev,
      activeTurns: new Set(),
      comments: [],
      logEntries: [],
      currentTime: 0,
      completedTurns: new Set(),
    }));
  };

  const handleExportLogs = () => {
    const exportData = {
      exportedAt: new Date().toISOString(),
      totalEntries: state.logEntries.length,
      entries: state.logEntries,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `playground-logs-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const totalDuration =
    state.turns.length > 0 ? Math.max(...state.turns.map((t) => t.endTime)) : 0;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Realtime Comment Playground</h1>
            <p className="text-muted-foreground mt-2">
              Test AI comment generation with subtitle files or plain text input.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/config">
              <Settings className="mr-2 h-4 w-4" />
              Configuration
            </Link>
          </Button>
        </div>

        {/* Input Section */}
        <Card>
          <CardHeader>
            <CardTitle>Input & Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <InputSection
              onTextSubmit={handleTextSubmit}
              onFileSubmit={handleFileSubmit}
            />
            {state.turns.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-3">Player Controls</h3>
                <PlayerControls
                  isPlaying={state.isPlaying}
                  currentTime={state.currentTime}
                  totalDuration={totalDuration}
                  playbackSpeed={state.playbackSpeed}
                  onTogglePlay={togglePlay}
                  onPause={handlePause}
                  onReset={reset}
                  onSpeedChange={handleSpeedChange}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Active Cues */}
          <Card>
            <CardHeader>
              <CardTitle>Active Cues</CardTitle>
            </CardHeader>
            <CardContent>
              {state.turns.length > 0 ? (
                <CueDisplay
                  turns={state.turns}
                  activeTurns={state.activeTurns}
                  onSeek={handleSeek}
                />
              ) : (
                <p className="text-muted-foreground text-sm">
                  No cues loaded yet
                </p>
              )}
            </CardContent>
          </Card>

          {/* Comments Feed */}
          <Card>
            <CardHeader>
              <CardTitle>Generated Comments</CardTitle>
            </CardHeader>
            <CardContent>
              <CommentFeed comments={state.comments} />
            </CardContent>
          </Card>
        </div>

        {/* Logger Section */}
        <LoggerSection entries={state.logEntries} onExport={handleExportLogs} />
      </div>
    </div>
  );
}
