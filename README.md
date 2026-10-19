# Obsidian Code

![Obsidian Code Logo](public/logo.svg)

**A production-grade, real-time collaborative code editor combining CRDT multiplayer synchronization with VS Code ergonomics and a Cursor-inspired warm parchment atelier design — available as both a Web IDE and a Native Desktop Application for Windows and macOS.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.0+-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Electron](https://img.shields.io/badge/Electron-44+-47848F?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Yjs CRDT](https://img.shields.io/badge/CRDT-Yjs-orange?style=flat-square)](https://yjs.dev/)
[![Monaco Editor](https://img.shields.io/badge/Editor-Monaco-1E1E1E?style=flat-square&logo=visualstudiocode&logoColor=white)](https://microsoft.github.io/monaco-editor/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Tests](https://img.shields.io/badge/Tests-127%20Passed-success?style=flat-square&logo=vitest&logoColor=white)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

[Overview](#overview) • [Key Features](#key-features) • [Architecture](#architecture) • [Research Evaluation](docs/EVALUATION.md) • [Tech Stack](#tech-stack) • [Quickstart](#quickstart) • [Running](#running-the-application) • [Release Workflow](#automated-desktop-release-workflow) • [Configuration](#environment-variables--security) • [Testing](#testing--research-evaluation) • [Deployment](#deployment)

---

## Overview

**Obsidian Code** brings the seamless multiplayer presence and instant conflict-free collaboration of Google Docs into a full-featured, developer-friendly IDE. Built from the ground up on Conflict-free Replicated Data Types (CRDTs) via **Yjs**, Obsidian Code ensures that multi-user edits always converge deterministically without data loss—even across network interruptions or high-latency connections.

Wrapped in an artisanal **Cursor-inspired warm parchment atelier design**, the interface replaces harsh synthetic dark blues with warm canvas tones, hairline stone borders, crisp typography, and fluid micro-interactions designed for deep focus and long coding sessions.

Obsidian Code runs seamlessly in **modern web browsers** and as a **native cross-platform desktop application** on **Windows** and **macOS**.

---

## Key Features

### Real-Time Multiplayer Collaboration (CRDT)

- **Deterministic Convergence**: Powered by `yjs` and `y-monaco`, enabling simultaneous typing across distributed users with zero race conditions or overwrites.
- **Multi-Transport Synchronization**:
  - **WebSocket Relay**: Low-latency centralized synchronization for enterprise firewalls and private rooms.
  - **WebRTC P2P Mesh**: Decentralized direct peer-to-peer data channels for low latency in public rooms.
  - **Hybrid Mode (Default)**: Automatically balances server durability and peer-to-peer performance.
- **Awareness & Presence**: Real-time multi-cursor position tracking, collaborator name tags, deterministic color assignment, and an active **Follow Mode** viewport synchronizer.
- **Role-Based Access Control (RBAC)**: Enforces **Owner**, **Editor**, and **Viewer** permissions at both the REST API level and the WebSocket protocol level (unauthorized sync updates from Viewers are dropped by the server).

### Native Desktop Application (Windows & macOS)

- **Frameless Native Experience**: Custom parchment-themed title bar with integrated window drag region, window controls (minimize, maximize, close), and native system dialogs.
- **Local Loopback OAuth Server**: Automatically spins up an embedded loopback server on `http://localhost:3000` in production desktop mode, bypassing Chromium `file://` restrictions and enabling seamless OAuth login with Clerk, Google, and GitHub.
- **User-Agent Normalization**: Prevents identity providers from rejecting embedded Electron web views.
- **Multi-Platform Installers**:
  - **Windows**: NSIS Setup installer (`.exe`) with custom installation paths and desktop shortcuts, plus standalone portable `.exe`.
  - **macOS**: Apple Silicon (`arm64`) and Intel (`x64`) disk images (`.dmg`) and zip archives (`.zip`).
- **Offline Persistence**: Hydrates local documents directly from IndexedDB via `y-indexeddb` when working without internet connectivity.

### Cursor-Inspired Warm Parchment Atelier UI

- **Refined Color Palette**: Warm parchment canvas (`#f7f7f4` light / `#1c1b17` dark), bone elevated surfaces (`#f2f1ed` / `#232219`), hairline stone borders (`#cdcdc9` / `#3d3c33`), and ink typography (`#26251e` / `#f2f1ed`).
- **Accent Philosophy**: Ember orange (`#f54e00`) is reserved strictly for inline interactive emphasis and key indicators.
- **Crafted Typography**: Headline scale with Instrument Serif & EB Garamond paired with CursorGothic (Inter) and JetBrains Mono for editor buffers.
- **Auditory & Motion Design**: Subtle Web Audio synthesizer audio feedback for key operations (save, error, run) paired with Morphicons physics-based animations (`smooth`, `snappy`, `bouncy`).

### Professional VS Code-Style Workspace

- **Monaco Editor Engine**: Fully configured with syntax highlighting, autocomplete, code folding, minimap, line numbers, and custom `cursor-parchment-light` & `cursor-parchment-dark` themes.
- **Split Editor Panes**: Seamless horizontal and vertical split views with synchronized tab states.
- **Hierarchical File Tree**: Full project tree supporting nested folders, inline file creation, renaming, deletion, and quick filtering.
- **Per-File Model Registry**: Eliminates tab-switch buffer duplication and state corruption by maintaining isolated Monaco models tied to unique file IDs.
- **Bottom Drawer Suite**: Integrated drawers for **Output**, **Terminal**, **Problems / Diagnostics**, and **Live HTML/CSS Preview** in an isolated sandbox.

### Multi-Language Code Execution

- **Sandboxed Runner**: Execute **JavaScript**, **TypeScript**, **Python**, **C**, **C++**, and **Java** code directly within the workspace.
- **Safety & Resource Guardrails**:
  - Ephemeral per-run workspace directories (`fs.mkdtemp`).
  - Strict compile (10s) and execution (5s) timeouts with recursive process tree killing.
  - Output stream capping at 64 KB to prevent buffer exhaustion.
  - Sliding-window rate limiting (10 executions per minute per user).
  - Shell-less execution to prevent shell injection vulnerabilities.

### Offline-First & Version Control

- **IndexedDB Persistence**: Local-first document hydration via `y-indexeddb` allows offline editing with immediate conflict-free catchup when connectivity resumes.
- **Named Version History**: Create immutable checkpoint snapshots with Monaco `DiffEditor` side-by-side comparisons and one-click CRDT rollback.
- **Workspace ZIP Export**: Instant client-side workspace packaging and export using `JSZip`.

---

## Architecture

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        OBSIDIAN CODE RUNTIME (Web or Desktop)                          │
│                                                                                        │
│   ┌────────────────────────────────────────────────────────────────────────────────┐   │
│   │ Electron Native Shell (Desktop Only)                                           │   │
│   │ • Window frame & control IPC           • Local Loopback Server (:3000)         │   │
│   │ • User-Agent identity normalization    • File & OS integration                 │   │
│   └──────────────────────────────────────┬─────────────────────────────────────────┘   │
│                                          │                                             │
│   ┌──────────────────────────────────────▼─────────────────────────────────────────┐   │
│   │ React 19 Frontend Workspace                                                    │   │
│   │                                                                                │   │
│   │   ┌───────────────┐      ┌─────────────────┐     ┌──────────────────┐          │   │
│   │   │ Monaco Editor │ ◄──► │  y-monaco Bind  │ ◄─► │  Canonical Y.Doc │          │   │
│   │   └───────────────┘      └─────────────────┘     └────────┬─────────┘          │   │
│   │                                                           │                    │   │
│   │                 ┌──────────────────┐                      │                    │   │
│   │                 │   y-indexeddb    │ ◄────────────────────┤                    │   │
│   │                 │ (Local Storage)  │                      │                    │   │
│   │                 └──────────────────┘                      │                    │   │
│   │                                                           ▼                    │   │
│   │                          ┌──────────────────────────────────────┐              │   │
│   │                          │      Transport Coordinator (Mesh)     │              │   │
│   │                          └──────────┬───────────────────┬───────┘              │   │
│   └─────────────────────────────────────┼───────────────────┼──────────────────────┘   │
└─────────────────────────────────────────┼───────────────────┼──────────────────────────┘
                                          │                   │
                      WebRTC P2P (Public) │                   │ WebSocket (Secure)
                                          ▼                   ▼
                          ┌──────────────────────┐    ┌──────────────────────┐
                          │ Peer Collaborators   │    │ Express + WS Server  │
                          │ (Direct DataChannel) │    │ (/ws + /api + SPA)   │
                          └──────────────────────┘    └──────────┬───────────┘
                                                                 │
                                                                 ▼
                                                      ┌──────────────────────┐
                                                      │    MongoDB Atlas     │
                                                      │ (Users, Projects,    │
                                                      │  Snapshots, Members) │
                                                      └──────────────────────┘
```

---

## Tech Stack

| Domain | Technology / Library | Description |
| :--- | :--- | :--- |
| **Frontend Framework** | React 19, TypeScript | Reactive, typed component hierarchy |
| **Desktop Runtime** | Electron 44, `vite-plugin-electron`, `electron-builder` | Cross-platform desktop runtime for Windows & macOS |
| **Bundler & Tooling** | Vite 8, Rolldown / Rollup | High-speed HMR and optimized production bundles |
| **Styling** | Tailwind CSS 4, CSS Modules | Modern zero-runtime stylesheet with custom parchment tokens |
| **Editor Engine** | Monaco Editor, `@monaco-editor/react` | Visual Studio Code editing engine in browser & desktop |
| **CRDT Multiplayer** | Yjs, `y-monaco`, `y-websocket`, `y-webrtc`, `y-indexeddb` | Conflict-free real-time sync, P2P mesh & local cache |
| **Authentication** | Clerk (`@clerk/react`), JWT | Enterprise-grade user authentication and session sync |
| **Backend Runtime** | Node.js (v18+ / v20+ / v24+), Express 5 | High-performance RESTful API and static asset delivery |
| **WebSockets** | `ws` (v8) | Real-time Yjs binary sync protocol handler with RBAC filter |
| **Database** | MongoDB Atlas, Mongoose 9 | Document persistence with automatic fallback support |
| **Audio & Motion** | Web Audio API, Morphicons, Sonner | Sonic interaction feedback and physics-based animations |
| **CI / CD** | GitHub Actions | Automated multi-platform build, packaging, and version bump |
| **Testing** | Vitest | Comprehensive test runner with 127 automated regression tests |

---

## Quickstart

### Prerequisites

Ensure you have the following installed on your machine:

- **Node.js** `>= 18.0.0` (v20.x or v24.x recommended)
- **npm** `>= 9.0.0` (or `pnpm` / `yarn`)
- **MongoDB** (Local instance or free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster)
- **Clerk Account** (Free tier available at [clerk.com](https://clerk.com))

### 1. Clone the Repository

```bash
git clone https://github.com/vardhineeditharak/Obsidian-Code.git
cd "Obsidian Code"
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example environment configuration:

```bash
cp .env.example .env
```

Open `.env` and fill in your values (notably `VITE_CLERK_PUBLISHABLE_KEY` and `MONGODB_URI`).

---

## Running the Application

### Option A: Web Application (Browser)

To run both the Vite frontend client and Express / WebSocket backend simultaneously:

```bash
npm run dev
```

The application will be accessible at:

- **Client Web Workspace**: [`http://localhost:3000`](http://localhost:3000)
- **API & WebSocket Server**: [`http://localhost:5000`](http://localhost:5000)
- **Health Check Endpoint**: [`http://localhost:5000/healthz`](http://localhost:5000/healthz)

### Option B: Desktop Application (Windows & macOS)

#### 1. Run in Development Mode

Launches the native Electron window connected to the Vite dev server with instant Hot Module Replacement (HMR):

```bash
npm run desktop:dev
```

#### 2. Package & Build Desktop Installers Locally

To compile TypeScript, build the web client, and generate native desktop packages:

- **Build Windows Installers** (NSIS Setup `.exe` + Standalone Portable `.exe`):

  ```bash
  npm run desktop:build:win
  ```

- **Build macOS Packages** (Universal/Intel/Apple Silicon `.dmg` + `.zip`):

  ```bash
  npm run desktop:build:mac
  ```

- **Unpackaged Directory Pack** (Quick local smoke test without creating installer files):

  ```bash
  npm run desktop:pack
  ```

Output binaries will be placed in `dist/desktop/`.

---

## Automated Desktop Release Workflow

The repository includes a dedicated, automated GitHub Actions workflow at [`.github/workflows/desktop-release.yml`](.github/workflows/desktop-release.yml) to package and release the desktop application for both **Windows** and **macOS**.

### Key Workflow Highlights

- **100% Manual Dispatch (`workflow_dispatch`)**: Does not trigger unexpectedly on git pushes or PRs.
- **Automatic Version Incrementing**: Every time the workflow is dispatched, it automatically increments the application version (`patch` by default, or selectable `minor` / `major`), commits the updated `package.json`, creates an annotated git tag (e.g., `v1.0.1`), and pushes it to the repository with `[skip ci]`.
- **Retry Current Version Support**: Includes a `none (retry current version)` option that rebuilds and replaces release binaries without incrementing version numbers.
- **Parallel Cross-Platform Matrix Build**: Spawns concurrent build runners on `windows-latest` and `macos-latest` to compile and package:
  - Windows: NSIS Installer (`.exe`) + Portable executable (`.exe`)
  - macOS: Apple Silicon (`arm64`) & Intel (`x64`) disk images (`.dmg`) & archives (`.zip`)
- **Automated GitHub Release**: Automatically generates a GitHub Release tagged with the new version and attaches all installers and binary artifacts directly to the release.
- **Action Artifacts**: Retains build artifacts on the GitHub Action run summary for 14 days.

### Triggering the Release Workflow

1. Navigate to your repository on GitHub.
2. Click the **Actions** tab.
3. Select **"Build Desktop (Windows & macOS)"** in the left sidebar.
4. Click **Run workflow**, choose your branch and desired version action (`patch`, `minor`, `major`, or `none (retry current version)`), and click **Run workflow**.

> [!IMPORTANT]
> **Repository Prerequisite**: To enable GitHub Actions to commit and push the bumped version tag back to your repository, make sure **Workflow permissions** is set to **"Read and write permissions"** under **Repository Settings** → **Actions** → **General**.

---

## Environment Variables & Security

### Environment Configuration Reference

A complete, documented [.env.example](.env.example) file is provided in the repository. Below is a breakdown of all configuration keys:

| Variable | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | No | `development` | Environment mode (`development`, `production`, `test`) |
| `PORT` | No | `5000` | Port for Express REST API and WebSocket Yjs server |
| `CLIENT_ORIGIN` | No | `http://localhost:3000` | Allowed CORS origin for frontend client requests |
| `APP_URL` | No | `http://localhost:5000` | Canonical backend application URL |
| `MONGODB_URI` | **Yes** | `mongodb://127.0.0.1:27017/obsidian-code` | MongoDB connection URI (Atlas or local) |
| `JWT_SECRET` | **Yes** | *Dev Placeholder* | Secret key for signing session tokens (min. 32 chars; **must change in production**) |
| `VITE_CLERK_PUBLISHABLE_KEY` | **Yes** | — | Clerk Publishable Key (`pk_test_...` or `pk_live_...`) |
| `CLERK_SECRET_KEY` | No | — | Clerk Secret Key (`sk_test_...` or `sk_live_...`) |
| `WEBRTC_STUN_URLS` | No | `stun:stun.l.google.com:19302` | STUN server for WebRTC P2P mesh discovery |
| `VITE_API_URL` | No | `http://localhost:5000/api` | Backend API URL for desktop app |
| `VITE_WS_URL` | No | `ws://localhost:5000/ws` | Backend WebSocket sync URL for desktop app |

### Sensitive Data Protection & Git Hygiene

> [!CAUTION]
> **Never commit secrets, tokens, or environment files into version control.**

The repository's [.gitignore](.gitignore) is strictly configured to protect all sensitive assets:

- **Environment Files**: `.env`, `.env.*` (excluding `.env.example`), `.env.local`, `.env.production.local`
- **Keys & Certificates**: `*.pem`, `*.key`, `*.pfx`, `*.p12`, `*.cer`, `*.crt`, `*.der`
- **Code Signing Credentials**: `*.keystore`, `*.jks`, `*.mobileprovision`, `*.provisionprofile`, `.csc/`
- **API Secrets & Service Accounts**: `credentials.json`, `client_secret*.json`, `service-account*.json`, `*.secret`, `*.tokens`
- **Database Dumps & Local Stores**: `*.sqlite*`, `*.db`, `*.db-wal`, `*.dump`, `*.bson`, `data/`, `mongodb/`
- **Binary Packages & Build Outputs**: `dist/`, `dist-electron/`, `release/`, `*.exe`, `*.dmg`, `*.blockmap`, etc.

---

## Available Scripts

| Script | Command | Purpose |
| :--- | :--- | :--- |
| `npm run dev` | `concurrently "vite" "tsx server/index.ts"` | Starts Web IDE: Vite client (`:3000`) and Express server (`:5000`) |
| `npm run dev:client` | `vite` | Runs only the Vite client development server |
| `npm run dev:server` | `tsx server/index.ts` | Runs only the Express & WebSocket backend server |
| `npm run desktop:dev` | `cross-env ELECTRON=true concurrently "vite" "tsx server/index.ts"` | Starts Desktop App with Electron live window and HMR |
| `npm run desktop:client` | `cross-env ELECTRON=true vite` | Runs Vite client configured for Electron |
| `npm run desktop:build` | `cross-env ELECTRON=true tsc ... && electron-builder --publish never` | Builds desktop packages for current host OS |
| `npm run desktop:build:win` | `cross-env ELECTRON=true tsc ... && electron-builder --win --publish never` | Builds Windows NSIS installer & portable `.exe` |
| `npm run desktop:build:mac` | `cross-env ELECTRON=true tsc ... && electron-builder --mac --publish never` | Builds macOS `.dmg` and `.zip` packages |
| `npm run desktop:pack` | `cross-env ELECTRON=true tsc ... && electron-builder --dir` | Creates unpacked desktop binary directory |
| `npm run build` | `tsc --noEmit && vite build` | Typechecks and compiles web client bundle to `dist/client` |
| `npm run typecheck` | `tsc --noEmit` | Runs TypeScript static type checking across the entire project |
| `npm run lint` | `tsc --noEmit` | Static analysis verification |
| `npm run preview` | `vite preview` | Previews the compiled production web build locally |
| `npm start` | `tsx server/index.ts` | Runs production backend (serves compiled SPA and API) |
| `npm test` | `vitest run` | Runs all 127 automated unit, integration, and research tests |
| `npm run test:watch` | `vitest` | Runs Vitest in interactive watch mode |
| `npm run db:clear` | `tsx server/scripts/clearDb.ts` | Clears MongoDB test collections |

---

## Testing & Research Evaluation

Obsidian Code includes an empirical research evaluation harness and comprehensive test suite totaling **127 unit, integration, and research evaluation tests across 33 test suites**:

### Academic Research Suites (PROJ2999 Capstone Alignment)

- **Offline Divergence & Reconnection**: Verifies deterministic recovery and zero lost updates following extended offline editing sessions (`tests/crdt_offline_convergence.test.ts`).
- **Merge Latency & Metadata Overhead**: Empirically benchmarks sub-millisecond merge latency (<0.2 ms) and asymptotic ~1.001x metadata overhead scaling (`tests/benchmark_sync.test.ts`, `src/lib/crdt/benchmark.ts`).
- **Offline Recovery Time**: Measures snapshot hydration and network state reconciliation (<0.6 ms) (`tests/crdt_offline_recovery.test.ts`).
- **Post-Merge Source-Code Integrity**: Investigates the "Convergence != Validity" dichotomy under concurrent edits (100% convergence vs 20% intent preservation) (`tests/code_integrity_experiment.test.ts`).
- **Realistic Code Workloads**: Analyzes linear CRDT behavior on functions, moves, and symbol renames (`tests/code_workloads.test.ts`).

> For the complete academic research evaluation report, methodology, and empirical tables, see [**docs/EVALUATION.md**](docs/EVALUATION.md).

### Core Workspace Engineering Suites

- **CRDT Document Convergence**: Validates eventual consistency of concurrent edits across isolated `Y.Doc` instances.
- **Monaco Tab-Switch Isolation**: Verifies per-file model binding to prevent editor content corruption when switching active files.
- **WebSocket RBAC Enforcement**: Tests that Viewers receive initial document state but are rejected when attempting to push CRDT updates to the server.
- **Multi-Language Process Runner**: Tests isolated process execution, runaway timeout termination, and memory bounds.
- **CORS & Zod 4 Schemas**: Asserts secure cross-origin headers and standard API error payloads.
- **Font & Asset Readiness**: Tests that self-hosted font loading resolves deterministically without unhandled promise rejections.
- **UI & Brand Consistency**: Ensures design tokens strictly follow the Cursor warm parchment atelier palette with zero regression leaks.

To execute the test suite:

```bash
npm test
```

---

## Deployment

Obsidian Code is designed for **single-service container or web service deployment** (such as [Render](https://render.com), [Railway](https://railway.app), [Fly.io](https://fly.io), or Docker).

### Deployment Architecture

The Express server (`server/index.ts`) serves:

1. All REST endpoints under `/api/*`
2. The WebSocket Yjs sync server under `/ws` and project rooms
3. Compiled Vite static assets from `dist/client`
4. SPA fallback routing for client-side navigation (`/`, `/dashboard`, `/workspace/*`)
5. Health check probe at `/healthz`

### Step-by-Step Production Deployment (e.g., Render)

1. **Build Command**:

   ```bash
   npm install && npm run build
   ```

2. **Start Command**:

   ```bash
   npm start
   ```

3. **Health Check Path**:

   ```text
   /healthz
   ```

4. **Environment Variables**:
   Configure `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET`, `VITE_CLERK_PUBLISHABLE_KEY`, and `CLIENT_ORIGIN` matching your production domain.

---

## Security & Privacy

- **Transport Security**: WebSockets validate origin headers; cookies are set with `HttpOnly`, `SameSite=Lax`, and `Secure` flags in production.
- **CRDT RBAC Protocol Guard**: The Yjs WebSocket server parses document update payloads and drops unauthorized write transactions originating from users with the `viewer` role.
- **Sandboxed Execution**: Code runners execute in isolated ephemeral temporary directories without shell wrappers (`shell: false`), enforcing strict memory limits and execution deadlines.
- **Safe Secrets Handling**: Production mode enforces a non-default high-entropy `JWT_SECRET` (minimum 32 characters) and halts startup if a placeholder secret is detected.
- **Desktop Isolation**: Production desktop mode serves local files via an internal HTTP loopback server with normalized User-Agents, shielding tokens from `file://` privilege elevation attacks.

---

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository and create a feature branch (`git checkout -b feature/amazing-feature`).
2. Adhere to TypeScript strict mode and the Cursor warm parchment design guidelines.
3. Ensure all tests pass (`npm run typecheck && npm test`).
4. Commit your changes with conventional commit messages (`feat: ...`, `fix: ...`).
5. Open a Pull Request with a clear description of changes.

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

*Crafted with passion for collaborative engineering by the Obsidian Code Team.*
