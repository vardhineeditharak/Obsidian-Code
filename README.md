<div align="center">

<img src="public/logo.svg" alt="Obsidian Code" width="72" height="72" />

# Obsidian Code

Real-time collaborative code editor — Yjs CRDT · Monaco · Obsidian Crystalline UI

</div>

---

## Stack

React 19 · TypeScript · Vite 8 · Express 5 · MongoDB · Yjs · Clerk · Tailwind CSS v4

## Quickstart

```bash
npm install
cp .env.example .env   # add VITE_CLERK_PUBLISHABLE_KEY
npm run dev
```

| | URL |
|---|---|
| Client | `http://localhost:3000` |
| API / WS | `http://localhost:5000` |

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start client + server |
| `npm run build` | Typecheck & build |
| `npm test` | Run Vitest suite |
| `npm start` | Production server |

## License

[MIT](LICENSE)
