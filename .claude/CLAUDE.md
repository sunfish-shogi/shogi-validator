# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

A browser-based validation and conversion tool for Shogi (Japanese chess) game records and position data. The tool accepts game data in various formats, auto-detects the format, validates it, and optionally converts to other formats.

## Commands

```bash
npm run dev       # Start dev server with HMR
npm run build     # Type-check with vue-tsc, then build for production
npm run preview   # Preview the production build locally
```

## Tech Stack

- **Vue 3** with `<script setup>` SFCs and TypeScript
- **Vite** for bundling and dev server
- **tsshogi** — the shogi library used for parsing/validation (referenced in specs, not yet installed)

## Architecture

The app is a single-page Vue 3 application (`src/App.vue` as root). The spec (`specs/main.md`) defines the UI and features:

**Planned UI components (single page):**
- Text area for data input
- File selection button (with auto-detected character encoding display)
- Validate button
- Validation result display (detected format, errors from tsshogi)
- Conversion results for each supported format, each with a copy button

**Supported formats (P0):** KIF, KI2, CSA, JKF, USI, SFEN

**Feature priorities:**
- P0: Format auto-detection and display
- P1: Show parse errors from tsshogi
- P2: Convert to other formats and display results
- P3: File upload with auto character encoding detection
- P4: Flag differences from Kakugyoku Shogi's KIF/KI2 output style

## Current State

The codebase is in early development — `src/App.vue` and `src/components/HelloWorld.vue` are still the Vite+Vue scaffold. The actual shogi validator UI and logic need to be built out per `specs/main.md`.
