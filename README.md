# NewspaperEngine

> A news intelligence engine that aggregates 23 sources and surfaces hidden connections between stories — the kind a human skimming headlines would miss.

## What it does

Most news readers show you articles in isolation. NewspaperEngine ingests articles from wire services, national press, and specialist tech publications, then runs three passes over the data:

1. **Entity extraction** — every article is passed through Gemini 2.5 Flash, which identifies people, organisations, places, events, and topics, along with how the article frames each one (positive / negative / neutral) and whether the entity is the main actor, acted upon, or just mentioned.

2. **Connection analysis** — three algorithms look for non-obvious links across the article corpus:
   - **Co-mention** — two articles share an entity. Rare entities produce stronger signals than common ones (weighted by `1 / log₂(frequency + 2)`).
   - **Sentiment divergence** — two articles cover the same entity but frame it oppositely (e.g. one praises a policy, another condemns it). Full-strength for positive ↔ negative; half-strength for either ↔ neutral.
   - **Temporal spike** — an entity appearing far more today than its 30-day rolling average (z-score > 2σ). Flags sudden narratives before they become obvious.

3. **Graph visualisation** — a React + React Flow canvas shows entities and articles as nodes, with edges coloured by connection type. A side panel surfaces the top divergences and spikes separately.

## Why

Standard aggregators surface *volume* (what's trending) and *recency* (what's new). They don't surface *tension* (two outlets framing the same story opposite ways) or *surprise* (an entity spiking beyond its normal mention rate). Those two signals are often where the interesting analysis starts.

## Architecture

```
RSS feeds (23 sources)
       │
       ▼
 Ingestion pipeline          ← rss-parser, parallel fetch, dedup by URL
       │
       ▼
  SQLite database            ← better-sqlite3, WAL mode, SHA-256 content IDs
  ┌─────────────┐
  │  articles   │
  │  entities   │
  │ art_entities│
  │ connections │
  └─────────────┘
       │
       ▼
 Entity extraction           ← Gemini 2.5 Flash, structured JSON output
       │
       ▼
 Connection algorithms       ← co-mention · sentiment divergence · temporal spike
       │
       ▼
 Express API (port 3001)     ← /api/graph · /api/divergence · /api/spikes · admin endpoints
       │
       ▼
 React + React Flow UI       ← Vite dev server (port 5173), proxied to API
```

## Sources

| Tier | Sources |
|------|---------|
| 1 — Wire services | Reuters, AP News, BBC World, Al Jazeera |
| 2 — Generalist press | NYT, Washington Post, The Guardian, Bloomberg, FT, The Economist, Politico, The Hill, Axios, CNBC, WSJ, MarketWatch, Forbes |
| 3 — Tech / specialist | TechCrunch, The Verge, Wired, CNET, Hacker News, arXiv CS |

## Getting started

### Prerequisites

- Node.js 18+
- A [Gemini API key](https://aistudio.google.com/app/apikey) (free tier is sufficient)

### Setup

```bash
git clone https://github.com/SajithKSwami/NewspaperEngine
cd NewspaperEngine
npm install
cp .env.example .env.local
# edit .env.local and set GEMINI_API_KEY=your_key_here
```

### Running

Open two terminals:

```bash
# Terminal 1 — API server + ingestion scheduler
npm run dev          # starts Express on :3001, ingests RSS every 2 hours

# Terminal 2 — Frontend
npm run dev:ui       # starts Vite on :5173
```

Then open `http://localhost:5173`.

### Populating data

On first run the database is empty. The scheduler ingests automatically every 2 hours, or you can trigger it manually via the **Ingest** button in the status bar. After ingestion, click **Enrich** to run entity extraction (uses Gemini API), then **Compute Graph** to run the connection algorithms.

For a larger initial batch:

```bash
npx tsx src/bulk-enrich.ts   # enriches up to 100 pending articles
```

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/graph` | Graph nodes + edges (`?hours=24&min_strength=0.1`) |
| GET | `/api/divergence` | Top sentiment-divergence connections |
| GET | `/api/spikes` | Active temporal spikes |
| GET | `/api/articles` | Recent articles (`?limit=50&source=Reuters`) |
| GET | `/api/entities` | All entities (`?type=person&limit=100`) |
| GET | `/api/entities/:id/articles` | Articles linked to one entity |
| POST | `/api/admin/ingest` | Trigger RSS ingestion |
| POST | `/api/admin/enrich` | Trigger entity extraction |
| POST | `/api/admin/graph` | Trigger connection computation |
| GET | `/api/admin/status` | DB counts (articles, entities, connections) |

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Gemini API key for entity extraction |
| `PORT` | No | API server port (default: `3001`) |

## Tech stack

| Layer | Technology |
|-------|-----------|
| Database | SQLite via `better-sqlite3` |
| Ingestion | `rss-parser`, `cheerio` |
| AI extraction | `@google/genai` (Gemini 2.5 Flash) |
| API | Express 4 |
| Frontend | React 19 + Vite 6 |
| Graph | `@xyflow/react` (React Flow) |
| Styling | Tailwind CSS 4 |
| Runtime | Node.js + `tsx` (TypeScript without compile step) |
