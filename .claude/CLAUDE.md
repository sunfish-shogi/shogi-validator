# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

A browser-based validation and conversion tool for Shogi (Japanese chess) game records and position data. The tool accepts game data in various formats, auto-detects the format, validates it, and converts to other formats.

## Commands

```bash
npm run dev       # Start dev server with HMR
npm run build     # Type-check, build for production, then generate third-party license page
npm run preview   # Preview the production build locally
npm run license   # Generate third-party license page only (docs/third-party-licenses.html)
```

## Tech Stack

- **Vue 3** with `<script setup>` SFCs and TypeScript
- **Vite** for bundling and dev server (output: `docs/`)
- **tsshogi** — shogi library used for format detection, parsing, and conversion
- **license-checker** — generates third-party license page at build time

## Architecture

Single-page Vue 3 application. Key files:

- `src/App.vue` — root component; contains all validation/conversion logic
- `src/components/ConversionResult.vue` — displays one format's conversion result with a copy button
- `src/style.css` — global styles with CSS custom properties for light/dark mode
- `scripts/report-license.mjs` — generates `docs/third-party-licenses.html`
- `specs/main.md` — feature spec

**Supported formats:** KIF, KI2, CSA, JKF, USI, SFEN, USEN

**Format detection:** `detectRecordFormat()` from tsshogi returns `RecordFormatType` enum.

**Parsing:** per-format import functions (`importKIF`, `importKI2`, `importCSA`, `importJKFString`, `Record.newByUSI`, `Record.newByUSEN`, `Position.newBySFEN`) — all return `Record | Error`.

**Conversion:** `exportKIF`, `exportKI2`, `exportCSA`, `exportJKFString`, `record.getUSI({ allMoves: true })`, `record.sfen`, `record.usen[0]`.

## Feature Priorities

- P0: Format auto-detection and display — **done**
- P1: Show parse errors from tsshogi — **done**
- P2: Convert to other formats and display results — **done**
- P3: File upload with auto character encoding detection (UTF-8 / Shift-JIS) — **done**
- P4: Flag differences from Kakugyoku Shogi's KIF/KI2 output style — **not yet implemented**

## Deployment

Build output goes to `docs/` with `base: './'` (relative paths) for GitHub Pages compatibility.
