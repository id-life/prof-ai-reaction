# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

- `pnpm build` - Compile TypeScript to JavaScript in dist/
- `pnpm dev` - Start TypeScript compiler in watch mode
- `pnpm typecheck` - Type check without emitting files

## Architecture Overview

This is an AI-powered comment generation system for real-time conversation analysis. The system processes audio transcription turns through multiple stages:

### Core Components

**CommentSystem (`src/system.ts`)** - Main orchestrator that coordinates all components:
- Manages two text buffers: full context (1-hour retention) and uncommented-only text
- Processes incoming turns through short turn aggregation
- Coordinates event detection, decision making, and comment generation
- Handles comment timing and scheduling

**Text Processing Pipeline:**
1. **TextBuffer (`src/text-buffer/service.ts`)** - Stores conversation segments with time-based windows
2. **ShortTurnAggregator** - Combines brief turns into meaningful segments
3. **EventDetectionQueue (`src/event-detector/queue.ts`)** - Queues detection jobs with staleness handling

**Analysis Components:**
- **EventDetector (`src/event-detector/service.ts`)** - Identifies conversation events (emotion peaks, topic changes, questions, etc.)
- **DecisionEngine (`src/decision-engine/service.ts`)** - Evaluates whether to generate comments based on events and timing
- **CommentGenerator (`src/comment-gen/`)** - Uses OpenAI agents to generate contextual comments

### Key Concepts

**Turns** - Audio segments with content, start/end timestamps (in seconds)
**Events** - Detected conversation moments (7 types: emotion_peak, topic_change, question_raised, etc.)
**Buffers** - Two separate text buffers track full context vs uncommented portions
**Staleness** - Turns older than 5 seconds are dropped to maintain real-time relevance

### Configuration

All components are configurable through the `Config` type in `src/config.ts`. The system requires OpenAI and Google API keys for LLM-powered analysis.

### Dependencies

- OpenAI Agents for comment generation
- Google GenAI for event detection
- LogTape for structured logging
- Zod for schema validation