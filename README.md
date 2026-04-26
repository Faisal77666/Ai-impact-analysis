# Impact Analysis Agent

Full-stack impact analysis app for metadata-driven change risk assessment.

It accepts natural-language change requests (for example: `update raw_orders`), resolves metadata from OpenMetadata, computes risk, stores history in MongoDB, and returns recommendations and explainability.

This project is designed for both:

- Real OpenMetadata analysis (primary mode for hackathons and production demos)
- Reliable demo fallback with synthetic extension when real metadata is sparse

## What You Get

- Real OpenMetadata integration (tables, dashboards, pipelines, ML models)
- Automatic synthetic enterprise extension when real metadata is limited
- Risk scoring with two modes:
       - Standard (cumulative)
       - Light Scoring (peak-impact, less likely to saturate at 100)
- Persistent analysis history in MongoDB (`/api/analyze` path)
- React dashboard with recent queries, impact summary, recommendations, and explainability

## Architecture

```text
Frontend (React + Vite)
       -> Backend API (Express)
                     -> OpenMetadata APIs
                     -> MongoDB (Query + AnalysisResult history)
                     -> LLM provider (Groq/OpenAI-compatible)
```

## Tech Stack

- Backend: Node.js, Express, Axios, Mongoose
- Frontend: React 18, Vite, React Router
- Metadata: OpenMetadata
- Database: MongoDB
- LLM: Groq (default) or OpenAI-compatible mode

## Prerequisites

- Node.js 18+
- npm 9+
- Docker Desktop (for OpenMetadata stack)
- MongoDB (local or Atlas)
- Groq API key (or alternative LLM provider configuration)

## Quick Start (10-15 Minutes)

1. Install dependencies:

```powershell
npm install
npm install --prefix backend
npm install --prefix frontend
```

2. Create env files:

```powershell
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env
```

3. Start OpenMetadata (your current setup path):

```powershell
docker compose -f "D:\openmetadata-docker\docker-compose.yml" up -d
```

4. Start the app:

```powershell
npm run dev
```

5. Open UI and run a real query:

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:5000/health`
- In UI, keep Demo Mode OFF for real OpenMetadata analysis.

## Project Structure

- `backend/` Express API, OpenMetadata integration, scoring, persistence
- `frontend/` React dashboard
- `backend/ingest-sample-data.js` optional metadata seed helper

## 1. Install Dependencies

From repository root:

```powershell
npm install
npm install --prefix backend
npm install --prefix frontend
```

Important:
- Root `npm run dev` needs `concurrently` from root `node_modules`.
- If root script fails, run backend and frontend separately (documented below).

## 2. Configure Environment

### Backend

Create `backend/.env` from `backend/.env.example`.

Minimum required:

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/impact_analysis

OPENMETADATA_BASE_URL=http://localhost:8585
OPENMETADATA_TOKEN=replace-with-openmetadata-token

OPENMETADATA_ADMIN_EMAIL=admin@open-metadata.org
OPENMETADATA_ADMIN_PASSWORD=admin

LLM_PROVIDER=groq
GROQ_API_KEY=replace-with-groq-api-key
GROQ_MODEL=llama-3.3-70b-versatile
```

Important OpenMetadata URL note:

- If backend and OpenMetadata run in the same Docker network, `http://localhost:8585` is common.
- If you run OpenMetadata via an external compose mapping (as in your setup), update `OPENMETADATA_BASE_URL` to the mapped host port, often `http://localhost:18685`.

Other supported backend vars (see `backend/.env.example`):
- `LLM_TIMEOUT_MS`, `LLM_RETRY_COUNT`
- `OM_TIMEOUT_MS`, `OM_RETRY_COUNT`
- `LINEAGE_MAX_HOPS`
- `SYNTHETIC_METADATA_MIN_ENTITIES`
- `SYNTHETIC_METADATA_MAX_ENTITIES`
- `SYNTHETIC_METADATA_VISIBLE_NODE_CAP`

### Frontend

Create `frontend/.env` from `frontend/.env.example`:

```env
VITE_API_URL=http://localhost:5000
VITE_API_TIMEOUT_MS=90000
```

## 3. Start OpenMetadata (Docker)

If your compose file is in `D:\openmetadata-docker\docker-compose.yml`:

```powershell
docker compose -f "D:\openmetadata-docker\docker-compose.yml" up -d
docker compose -f "D:\openmetadata-docker\docker-compose.yml" ps
```

Expected services:
- `openmetadata_server`
- `openmetadata_mysql`
- `openmetadata_elasticsearch`
- `openmetadata_ingestion`

Useful checks:

```powershell
docker inspect --format "{{.State.Status}} | {{if .State.Health}}{{.State.Health.Status}}{{end}}" openmetadata_server
```

OpenMetadata URLs (common mapping in this project):
- API/UI via mapped port: `http://localhost:18685`

## 4. Seed Real Metadata (Recommended)

You can seed using project scripts and/or API helper scripts.

### Option A: project ingest script

```powershell
cd backend
node ingest-sample-data.js
```

If token authorization fails due to stale bot token, either:
- update `OPENMETADATA_TOKEN`, or
- clear token and rely on admin login (`OPENMETADATA_ADMIN_EMAIL/PASSWORD`).

### Option B: manual verification of entity counts

Check counts via API helper command (example pattern used during setup):
- tables
- dashboards
- pipelines
- mlmodels

For demo readiness, ensure non-zero values across all key entity types.

Recommended minimum for a strong demo:

- Tables: greater than 0
- Dashboards: greater than 0
- Pipelines: greater than 0
- ML Models: greater than 0

## 5. Run the Application

### Preferred (single command from root)

```powershell
npm run dev
```

### Fallback (recommended if root script fails)

Terminal 1:

```powershell
npm run dev --prefix backend
```

Terminal 2:

```powershell
npm run dev --prefix frontend
```

Notes:
- Backend default: `http://localhost:5000`
- Frontend default: `http://localhost:5173`
- If `5173` is busy, Vite auto-picks another port (for example `5174`)

## 6. Health Checks

Backend:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:5000/health
```

OpenMetadata API example:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:18685/api/v1/system/version
```

## Frontend Usage

Main controls:
- `Demo Mode` (OFF = real OpenMetadata path)
- `Light Scoring` (ON = less score saturation, better demo differentiation)

Recommended hackathon settings:
- Demo Mode: OFF
- Light Scoring: ON

## Hackathon Runbook (What To Show)

1. Confirm stack health:
       - OpenMetadata containers are running.
       - Backend `/health` returns success.
2. Show real mode:
       - Keep Demo Mode OFF.
       - Run `update raw_orders`.
3. Show score variety:
       - Run a low-impact query (small/no downstream lineage).
       - Run a medium/high query (cross-domain lineage).
       - Run an ML-impact query (should trend higher when ML assets are affected).
4. Show persistence:
       - Open history panel and confirm runs are saved.
5. Explain credibility:
       - Real metadata first, synthetic extension only when real graph is too sparse.

## Key API Endpoints

- `POST /api/analyze`
       - Runs analysis and persists history (`Query` + `AnalysisResult`)
- `POST /api/analyze/simulate`
       - Runs analysis without persistence (simulation response)
- `GET /api/history`
       - Returns saved history
- `DELETE /api/history/:id`
       - Delete one history item
- `DELETE /api/history`
       - Bulk delete history
- `GET /api/metadata/:entityType/:fqn`
       - Metadata lookup

## Query Examples

- `update raw_orders`
- `update orders_cleaned`
- `rename raw_orders to raw_orders_v2`
- `drop column order_total from raw_orders`

## Persistence Behavior (Important)

- Use `/api/analyze` (or UI flow wired to it) when you need history saved.
- `/api/analyze/simulate` does not persist history by design.

## Risk Scoring Summary

Per-asset baseline impact weights:
- table: 10
- dashboard: 20
- pipeline: 30
- mlmodel: 50

Additional modifiers may apply (critical tags, usage, lineage depth, dependencies).

Risk levels (current code thresholds):
- `<= 10` LOW
- `<= 30` MEDIUM
- `<= 60` HIGH
- `> 60` CRITICAL

## Troubleshooting

### 1) `concurrently is not recognized`

Cause: root dependencies not installed.

Fix:

```powershell
npm install
```

Or run separate commands:

```powershell
npm run dev --prefix backend
npm run dev --prefix frontend
```

### 2) `EADDRINUSE: 5000`

Cause: backend already running.

Fix:
- stop existing process on 5000, or
- keep current one and avoid starting duplicate backend.

### 3) Frontend blank / not visible

Check:
- correct frontend port (5173 vs 5174)
- browser console errors
- backend reachability (`/health`)

### 4) History not saving

Cause: using simulate endpoint.

Fix:
- ensure frontend calls `/api/analyze` for persisted runs.

### 5) OpenMetadata 401 / token mismatch

Fix options:
- refresh `OPENMETADATA_TOKEN`, or
- provide admin credentials and let backend auto-login fallback:
       - `OPENMETADATA_ADMIN_EMAIL`
       - `OPENMETADATA_ADMIN_PASSWORD`

### 7) Could not identify target table from query

Try one of the following:

- Use direct table-focused verbs: `update raw_orders`, `delete raw_orders`, `rename raw_orders to raw_orders_v2`.
- Use exact table names that exist in OpenMetadata.
- If table exists but still fails, verify backend can fetch table metadata from `OPENMETADATA_BASE_URL` and that auth is valid.

### 6) Docker shows server unhealthy briefly

This can happen during startup warmup. Recheck status after ~30-60 seconds.

## Demo Checklist

- OpenMetadata containers up and healthy
- MongoDB reachable
- Backend healthy on `:5000`
- Frontend reachable on Vite port
- Real metadata seeded (tables + dashboard + pipeline + mlmodel)
- Demo Mode OFF, Light Scoring ON
- Run 2-3 prepared queries and verify history entries are saved

## License

MIT
