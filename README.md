<div align="center">

<img src="public/logo.svg" alt="Obsidian Code Logo" width="80" height="80" />

# Obsidian Code

**Real-time collaborative code editor combining Yjs CRDT multiplayer synchronization with VS Code ergonomics and an Obsidian Crystalline dark design system.**

[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Yjs CRDT](https://img.shields.io/badge/CRDT-Yjs-7C3AED?style=flat-square)](https://yjs.dev/)
[![Monaco Editor](https://img.shields.io/badge/Editor-Monaco-1E1E1E?style=flat-square&logo=visualstudiocode&logoColor=white)](https://microsoft.github.io/monaco-editor/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

</div>

---

## Overview

**Obsidian Code** brings instant, conflict-free multiplayer collaboration into a full-featured web IDE. Built on **Yjs CRDTs**, **Monaco Editor**, **Express 5**, **WebSockets (`ws`)**, and **MongoDB / Mongoose** (with automatic in-memory fallback in local development), it enables simultaneous editing across distributed peers with deterministic convergence, role-based access control, live project file/role synchronization, version checkpoints with side-by-side diffs, and multi-language code execution.

---

## Key Features

- **Real-Time CRDT Collaboration (`yjs` + `y-monaco`)**:
  - Multi-transport sync (`Hybrid`, `WebSocket Only`, `P2P Mesh Only` for public rooms) and offline-first `y-indexeddb` persistence.
  - Real-time collaborator presence, cursors, and **Follow Mode** with a live tracking banner.
  - Project-wide real-time event stream (`/ws/obsidian-project-events-<projectId>`) broadcasting file creations, renames, deletions, and live member role changes with immediate WebSocket RBAC enforcement.
- **VS Code-Grade Workspace**:
  - Per-file Monaco model registry (`file://<id>`), self-hosted `JetBrains Mono` font-readiness gating, `localStorage` tab persistence, and context-aware completions for Python, Java, C, C++, and Go.
  - **Independent Editable Split Editor**: Vertical or horizontal split panes with independent file selection, simultaneous editing, and draggable split ratio.
  - Hierarchical collapsible folder tree, Quick Open (`Ctrl+P`), Workspace Search & Replace (`Ctrl+Shift+F`), Version History & Diff Viewer, and ZIP workspace export.
- **Integrated Bottom Panel**:
  - Resizable `OUTPUT`, interactive `TERMINAL` (command history + `Ctrl+L`), keyboard-accessible `PROBLEMS`, and dark-themed HTML/CSS/JS `PREVIEW` sandbox.
- **Multi-Language Sandboxed Runner**:
  - Executes JavaScript, TypeScript, Python, C, C++, Java, Go, Ruby, PHP, and Bash in ephemeral directories (`fs.mkdtemp`) with `shell: false`, whitelisted environment variables, strict compile/run timeouts, 64 KB stream caps, and per-user rate limiting.
- **Authentication & RBAC**:
  - Clerk authentication (`@clerk/react`) with backend verification when `CLERK_SECRET_KEY` is configured, plus JWT email/password and GitHub OAuth support.
  - Owner, Editor, and Viewer permissions enforced across REST endpoints and Yjs WebSocket updates.

---

## Quickstart

### Prerequisites
- **Node.js** `>= 18.0.0` (v20+ / v24+ recommended)
- **npm** `>= 9.0.0`
- **MongoDB** (local instance or MongoDB Atlas URI; optional in local development via in-memory fallback)
- **Clerk Publishable Key** from [clerk.com](https://clerk.com)

### Setup & Run

```bash
npm install
cp .env.example .env
# Fill in VITE_CLERK_PUBLISHABLE_KEY (and MONGODB_URI / CLERK_SECRET_KEY if applicable)
npm run dev
```

- **Frontend Client**: `http://localhost:3000`
- **Backend API & WebSocket Server**: `http://localhost:5000`
- **Health Check**: `http://localhost:5000/healthz`

---

## Scripts

| Script | Command | Purpose |
| :--- | :--- | :--- |
| `npm run dev` | `concurrently "vite" "tsx server/index.ts"` | Starts Vite client (`:3000`) and Express/WS server (`:5000`) |
| `npm run build` | `tsc --noEmit && vite build` | Typechecks TypeScript and builds client into `dist/client` |
| `npm run typecheck` | `tsc --noEmit` | Runs strict TypeScript checks |
| `npm test` | `vitest run` | Runs the Vitest automated test suite (`tests/*.test.ts`) |
| `npm start` | `tsx server/index.ts` | Starts production server serving API, WS, and `dist/client` |

---

## Testing & Verification

Obsidian Code ships with **11 modular Vitest test suites (90 tests)** under [`tests/`](tests/) covering backend security, WebSocket/Yjs CRDT collaboration, research evaluation benchmarks, and frontend/UI modules:

- **Backend & Security**:
  - [`tests/auth_security.test.ts`](tests/auth_security.test.ts) — JWT/cookie auth, `param()`, `requireProjectRole`, Zod v4 validation formatting, Clerk Backend API verification (`/api/auth/clerk-sync`), GitHub OAuth CSRF/callback flow, and CORS origin allowlisting.
  - [`tests/projects_members_invitations.test.ts`](tests/projects_members_invitations.test.ts) — Project templates (`blank`, `web`, `node`, `algorithms`), cascade deletes, member role protection (last-owner guard), single-use invitations, and role-downgrade safety.
  - [`tests/files_versions_snapshots.test.ts`](tests/files_versions_snapshots.test.ts) — Path-traversal validation, cross-project parent checks, folder rename/delete cascades, version checkpoint restore IDOR protection, 50-auto-checkpoint pruning, and server-side Yjs snapshot flushing.
  - [`tests/execution_sandbox.test.ts`](tests/execution_sandbox.test.ts) — `languageRegistry`, `processRunner` (ephemeral dirs, timeouts, 64 KB stream caps, env whitelisting), `sandboxRunner`, and per-user rate-limited execution API routes.
- **CRDT, WebSockets & Research Evaluation**:
  - [`tests/realtime_websocket_rbac.test.ts`](tests/realtime_websocket_rbac.test.ts) — WebSocket upgrade auth, viewer SyncStep2/Update protocol write blocking, live role promotion/demotion on active rooms, project event broadcasts (`file:*`, `project:updated`, `member:*`), and `4003` disconnect on member removal.
  - [`tests/crdt_convergence_recovery.test.ts`](tests/crdt_convergence_recovery.test.ts) — Deterministic multi-replica convergence, offline divergence/partition healing, snapshot hydration & reconciliation latency tiers, live-content priority, and checkpoint CRDT rollback.
  - [`tests/crdt_benchmarks_integrity.test.ts`](tests/crdt_benchmarks_integrity.test.ts) — Merge latency and state-vector delta overhead benchmarks (`src/lib/crdt/benchmark.ts`), post-merge code integrity scenarios, and realistic AST/code workloads.
- **Frontend Modules & UI/UX Components**:
  - [`tests/frontend_utilities.test.ts`](tests/frontend_utilities.test.ts) — `fonts`, `theme`, `language`, `codeDiagnostics`, `exportWorkspaceAsZip`, `monacoCompletions`, and `editorOptions`.
  - [`tests/docmanager_panes.test.ts`](tests/docmanager_panes.test.ts) — `docManager` session deduplication, private-room P2P guard, tab-switch buffer isolation, and independent primary/secondary split-pane bindings.
  - [`tests/ui_design_components.test.ts`](tests/ui_design_components.test.ts) — `AuthPage` layout invariants, `BrandMark` & SVG/favicon assets, `LoadingState`, `Skeleton`, `IconButton`, `ErrorBoundary`, `Modal`/`ConfirmDialog`/`PromptDialog` focus-trap stability, and `src/index.css` tokens.
  - [`tests/workspace_ui_modals.test.ts`](tests/workspace_ui_modals.test.ts) — `SearchReplaceModal` hooks-order & regex safety, `ShareModal` link regeneration, `Sidebar` folder tree, `Header` menus & sidebar toggle, `BottomPanel` semantic problem rows, `StatusBar`, `Dashboard` filter, and `WorkspacePage` tab persistence & autosave debounce.

Run full verification inside the project root:

```bash
npm run typecheck
npm test
npm run build
```

---

## License

Licensed under the **MIT License** — see [LICENSE](LICENSE).
