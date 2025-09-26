"use client";

import { Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PlayerControlsProps {
  isPlaying: boolean;
  currentTime: number;
  totalDuration: number;
  playbackSpeed: number;
  onTogglePlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onSpeedChange: (speed: number) => void;
  onSeek?: (time: number) => void;
}

export function PlayerControls({
  isPlaying,
  currentTime,
  totalDuration,
  playbackSpeed,
  onTogglePlay,
  onPause,
  onReset,
  onSpeedChange,
}: PlayerControlsProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSpeedChange = (value: string) => {
    onSpeedChange(parseFloat(value));
  };

  const speedOptions = [
    { value: "0.5", label: "0.5x" },
    { value: "1", label: "1x" },
    { value: "1.5", label: "1.5x" },
    { value: "2", label: "2x" },
    { value: "2.5", label: "2.5x" },
    { value: "3", label: "3x" },
  ];

  return (
    <div className="flex items-center gap-4">
      <Button onClick={onTogglePlay} size="sm">
        {isPlaying ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4" />
        )}
      </Button>
      <Button onClick={onPause} size="sm" variant="outline">
        <Pause className="w-4 h-4" />
      </Button>
      <Button onClick={onReset} size="sm" variant="outline">
        <Square className="w-4 h-4" />
      </Button>
      <span className="text-sm">
        {formatTime(currentTime)} / {formatTime(totalDuration)}
      </span>
      <div className="flex items-center gap-2">
        <Label className="text-sm">Speed:</Label>
        <Select
          value={playbackSpeed.toString()}
          onValueChange={handleSpeedChange}
        >
          <SelectTrigger className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {speedOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
