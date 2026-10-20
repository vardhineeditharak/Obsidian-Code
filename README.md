<div align="center">

<img src="public/logo.svg" alt="Obsidian Code Logo" width="88" height="88" />

# Obsidian Code

**Production-grade, real-time collaborative code editor combining CRDT multiplayer synchronization with VS Code ergonomics and a Cursor-inspired warm parchment atelier design.**

*Available as a Web IDE and native desktop application for Windows & macOS.*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.0+-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Electron](https://img.shields.io/badge/Electron-44+-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Yjs CRDT](https://img.shields.io/badge/CRDT-Yjs-orange?style=flat-square)](https://yjs.dev/)
[![Monaco Editor](https://img.shields.io/badge/Editor-Monaco-1E1E1E?style=flat-square&logo=visualstudiocode&logoColor=white)](https://microsoft.github.io/monaco-editor/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Tests](https://img.shields.io/badge/Tests-157%20Passed-success?style=flat-square&logo=vitest&logoColor=white)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

<br />

[Features](#key-features) • [Desktop Downloads](#native-desktop-app) • [Architecture](#architecture) • [Tech Stack](#tech-stack) • [Quickstart](#quickstart) • [Scripts](#available-scripts) • [Testing](#testing--research-evaluation) • [Deployment](#deployment)

</div>

---

## Overview

**Obsidian Code** brings Google Docs-style real-time multiplayer collaboration to a modern code editor. Powered by **Yjs Conflict-free Replicated Data Types (CRDTs)**, multi-user edits converge deterministically across network boundaries without race conditions, overwrites, or merge conflicts.

Designed with an artisanal **Cursor-inspired warm parchment atelier theme**, Obsidian Code replaces stark dark blue palettes with warm stone neutrals, hairline dividers, rich typography, and micro-animations calibrated for deep focus.

---

## Key Features

| Feature | Description |
| :--- | :--- |
| **Real-Time Multiplayer** | Sub-millisecond CRDT synchronization over WebSockets and WebRTC P2P data channels with presence, live remote cursors, and follow-mode. |
| **Role-Based Security** | Enforced RBAC (**Owner**, **Editor**, **Viewer**) across REST endpoints and at the raw WebSocket CRDT protocol layer. |
| **VS Code Ergonomics** | Powered by Monaco Editor with syntax highlighting, autocomplete, split panes, tab isolation, and sandboxed preview drawer. |
| **Parchment Atelier UI** | Warm parchment canvas (`#f7f7f4` / `#1c1b17`), bone elevated panels, hairline stone borders, and ember accent indicators. |
| **Multi-Language Runner** | Isolated sandboxed execution for JavaScript, TypeScript, Python, C, C++, and Java with strict resource and timeout guards. |
| **Offline Persistence** | Instant document hydration from local storage via `y-indexeddb` with automatic catchup when connectivity resumes. |
| **Version Snapshots** | Immutable checkpoint snapshots with Monaco `DiffEditor` side-by-side comparisons and one-click rollback. |
| **Native Desktop** | Frameless desktop window with custom title bar, local loopback OAuth server, and auto-updater integration. |

---

## Native Desktop App

Obsidian Code packages cleanly as a production desktop app using Electron 44 and `electron-builder`:

- **Windows**: `Obsidian.Code-Setup-*.exe` — NSIS setup wizard with desktop & start menu shortcuts, install directory selection, and background auto-update.
- **macOS**: `Obsidian.Code-*.dmg` — High-performance native disk images with drag-to-Applications installation, optimized separately for Apple Silicon (`arm64`) and Intel (`x64`).
- **Loopback OAuth Server**: Automatically spins up an ephemeral loopback listener on `http://localhost:3000` during production desktop sessions to enable seamless Google and GitHub OAuth authentication.

---

## Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                 OBSIDIAN CODE RUNTIME (Web or Desktop)                 │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ Electron Native Shell (Desktop Only)                           │   │
│   │ • Frameless window IPC           • Loopback Auth Server (:3000)│   │
│   │ • User-Agent normalization       • System & Auto-Updater hooks │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   │                                    │
│   ┌───────────────────────────────▼────────────────────────────────┐   │
│   │ React 19 Workspace                                             │   │
│   │                                                                │   │
│   │   ┌───────────────┐     ┌───────────────┐    ┌─────────────┐   │   │
│   │   │ Monaco Editor │ ◄─► │ y-monaco Bind │ ◄─►│ Canonical   │   │   │
│   │   └───────────────┘     └───────────────┘    │ Y.Doc       │   │   │
│   │                                              └──────┬──────┘   │   │
│   │                 ┌────────────────┐                  │          │   │
│   │                 │  y-indexeddb   │ ◄────────────────┤          │   │
│   │                 │ (Local Cache)  │                  │          │   │
│   │                 └────────────────┘                  ▼          │   │
│   │                                          ┌─────────────────┐   │   │
│   │                                          │  Transport Mesh │   │   │
│   │                                          └────┬───────┬────┘   │   │
│   └───────────────────────────────────────────────┼───────┼────────┘   │
└───────────────────────────────────────────────────┼───────┼────────────┘
                                                    │       │
                                WebRTC P2P (Public) │       │ WebSocket (Secure)
                                                    ▼       ▼
                                    ┌────────────────┐  ┌────────────────┐
                                    │ Direct Peer    │  │ Express + WS   │
                                    │ Collaborators  │  │ Relay Server   │
                                    └────────────────┘  └───────┬────────┘
                                                                │
                                                                ▼
                                                        ┌────────────────┐
                                                        │ MongoDB Atlas  │
                                                        └────────────────┘
```

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Tailwind CSS 4, Lucide Icons |
| **Desktop Shell** | Electron 44, `vite-plugin-electron`, `electron-builder`, `electron-updater` |
| **Editor** | Monaco Editor, `@monaco-editor/react` |
| **Multiplayer / CRDT** | Yjs, `y-monaco`, `y-websocket`, `y-webrtc`, `y-indexeddb` |
| **Backend & WS** | Node.js (18+), Express 5, `ws` (binary sync with RBAC filtering) |
| **Database** | MongoDB Atlas with Mongoose 9 |
| **Auth** | Clerk (`@clerk/react`), JWT |
| **Build & Tooling** | Vite 8, Rolldown / Rollup, Vitest |

---

## Quickstart

### Prerequisites

- **Node.js** `>= 18.0.0` (v20+ recommended)
- **npm** `>= 9.0.0`
- **MongoDB** (Local instance or [MongoDB Atlas](https://www.mongodb.com/atlas))
- **Clerk Account** ([clerk.com](https://clerk.com))

### 1. Clone & Install

```bash
git clone https://github.com/vardhineeditharak/Obsidian-Code.git
cd "Obsidian Code"
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Set the required environment keys in `.env`:
```env
MONGODB_URI=mongodb://127.0.0.1:27017/obsidian-code
JWT_SECRET=your-secure-random-jwt-secret-at-least-32-chars
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

### 3. Run Development

- **Web IDE (Client + Backend)**:
  ```bash
  npm run dev
  ```
  Client runs at `http://localhost:3000` • API & WebSocket server runs at `http://localhost:5000`.

- **Desktop Application (Live Window + HMR)**:
  ```bash
  npm run desktop:dev
  ```

---

## Available Scripts

| Script | Command | Purpose |
| :--- | :--- | :--- |
| `npm run dev` | `concurrently "vite" "tsx server/index.ts"` | Run web client (`:3000`) and backend server (`:5000`) |
| `npm run desktop:dev` | `cross-env ELECTRON=true ...` | Run desktop app with Electron live window and HMR |
| `npm run desktop:build:win` | `electron-builder --win` | Build Windows NSIS setup installer (`.exe`) |
| `npm run desktop:build:mac` | `electron-builder --mac` | Build macOS `.dmg` installers (`arm64` and `x64`) |
| `npm run desktop:pack` | `electron-builder --dir` | Unpackaged desktop binary test directory |
| `npm run build` | `tsc --noEmit && vite build` | Typecheck and build production web client bundle |
| `npm run typecheck` | `tsc --noEmit` | Run TypeScript strict compiler verification |
| `npm test` | `vitest run` | Run all 157 unit, integration, and research tests |
| `npm start` | `tsx server/index.ts` | Start production Express server serving SPA and API |

---

## Automated Desktop Release Workflow

A production GitHub Actions workflow is located at [`.github/workflows/desktop-release.yml`](.github/workflows/desktop-release.yml).

- **Clean Release Assets**: Generates only essential production binaries:
  - `Obsidian.Code-Setup-*.exe` (Windows NSIS Installer)
  - `Obsidian.Code-*-arm64.dmg` (macOS Apple Silicon)
  - `Obsidian.Code-*-x64.dmg` (macOS Intel)
  - `latest.yml` & `latest-mac.yml` (Auto-update channel manifests)
- **Automatic Version Tagging**: Automatically bumps version (`patch`, `minor`, `major`, or retry), commits changes, tags the release, and creates the GitHub release page.
- **Resource Optimized**: Excludes redundant intermediate archives (`.zip`), debug traces (`builder-debug.yml`), and blockmaps to keep runner usage minimal and release pages clean.

---

## Testing & Research Evaluation

Obsidian Code features a test suite of **157 automated tests across 39 suites**:

- **CRDT Synchronization**: Validates eventual consistency, sub-millisecond merge latency (<0.2 ms), and linear asymptotic metadata scaling.
- **Offline Divergence**: Asserts zero lost updates when reconciling divergent offline edits.
- **Tab-Switch Registry**: Verifies per-file Monaco model registry prevents buffer cross-contamination during active file switching.
- **Security & RBAC**: Asserts read-only enforcement on document payloads originating from `viewer` roles.
- **Process Sandbox**: Tests execution deadlines, stream size caps (64 KB), and recursive tree termination.

Run the test suite:
```bash
npm test
```

For the full academic research evaluation and empirical benchmarks, see [**docs/EVALUATION.md**](docs/EVALUATION.md).

---

## Deployment

The application is structured for single-service deployment on **Render**, **Railway**, **Fly.io**, or **Docker**:

```bash
# Build Command
npm install && npm run build

# Start Command
npm start

# Health Check Probe
/healthz
```

---

## License

This project is licensed under the [MIT License](LICENSE).
