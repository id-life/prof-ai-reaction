"use client";

import type { Comment, Turn } from "@prof/ai-reaction";
import { Check, Loader2, X } from "lucide-react";

interface CommentWithStatus extends Comment {
  turn: Turn;
  status: "generating" | "completed" | "rejected";
  partialText?: string;
  rejectionReason?: string;
}

interface CommentFeedProps {
  comments: CommentWithStatus[];
}

export function CommentFeed({ comments }: CommentFeedProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-3 max-h-64 overflow-y-auto">
      {comments.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No comments generated yet
        </p>
      ) : (
        comments.map((comment) => {
          const getStatusIcon = () => {
            switch (comment.status) {
              case "generating":
                return <Loader2 className="w-3 h-3 animate-spin" />;
              case "completed":
                return <Check className="w-3 h-3 text-green-500" />;
              case "rejected":
                return <X className="w-3 h-3 text-red-500" />;
            }
          };

          const getContent = () => {
            if (comment.status === "generating") {
              return comment.partialText || "";
            }
            return comment.content;
          };

          const getBorderColor = () => {
            switch (comment.status) {
              case "generating":
                return "border-blue-200";
              case "completed":
                return "border-green-200";
              case "rejected":
                return "border-red-200";
              default:
                return "border";
            }
          };

          return (
            <div
              key={comment.id}
              className={`p-3 bg-muted/30 rounded border ${getBorderColor()}`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-primary/20 px-2 py-1 rounded">
                    {comment.writer}
                  </span>
                  {getStatusIcon()}
                </div>
                <span className="text-xs text-muted-foreground">
                  @{formatTime(comment.metadata?.timestamp || 0)}
                </span>
              </div>
              <p className="text-sm">{getContent()}</p>
              {comment.status === "rejected" && comment.rejectionReason && (
                <div className="text-xs text-red-600 mt-1 italic">
                  Rejected: {comment.rejectionReason}
                </div>
              )}
              {comment.status === "completed" && (
                <div className="text-xs text-muted-foreground mt-1">
                  Generated in {Math.round(comment.generationTime)}ms
                </div>
              )}
              {comment.status === "generating" && (
                <div className="text-xs text-blue-600 mt-1">Generating...</div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
