# Demo Script - Impact Analysis Agent

## 0. Architecture In One Minute (Use This First)

How the project uses OpenMetadata and still fulfills hackathon goals:

- Demo Mode ON:
	- Uses seeded realistic metadata and lineage from backend demo services.
	- Guarantees reliable high-risk vs low-risk examples for judges.
- Demo Mode OFF:
	- Uses real OpenMetadata APIs for tables and lineage.
	- If real metadata/lineage is limited, system extends it with synthetic enterprise metadata (100-1000 entities) instead of replacing real data.

Request flow:

1. Frontend sends query + demoMode toggle to backend simulate endpoint.
2. Backend parses intent with LLM.
3. Impact engine chooses data source:
	 - seeded demo graph, or
	 - real OpenMetadata (+ optional synthetic extension when sparse).
4. Deterministic risk scorer computes 0-100 score + level.
5. Backend returns enriched output: impacted assets, lineage depth, dependency count, type breakdown, narrative, graph, recommendations, suggested fixes.

Why this is hackathon-friendly:

- Reliable live demo behavior (with Demo Mode).
- Enterprise-scale behavior when real metadata is shallow.
- Clear business story from technical lineage.

## 1. Pre-Demo Checklist

- Confirm backend is running on port 5000.
- Confirm frontend is running and reachable.
- Confirm MongoDB is connected and writable.
- Confirm OpenMetadata is running at configured base URL.
- Confirm OpenMetadata token is valid.
- Confirm GROQ_API_KEY is set and valid.
- Confirm at least one successful analysis exists in history.
- Keep terminal logs visible for backend request trace.

Toggle guidance:

- Keep Demo Mode ON for judge walkthrough.
- Optionally switch Demo Mode OFF once to show live OpenMetadata integration.

## 2. Demo Flow (Run These 3 Queries In Exact Order)

### Query 1

What happens if I delete raw_orders?

Expected:
Critical risk (~80+), deep lineage chain, multiple asset types.

Talking points:
- Explain natural-language to structured intent conversion.
- Show affected tables, dashboards, pipelines, and ML model in one output.
- Show lineage depth and dependency count to justify high risk.
- Point out "Deep dependency chain detected -> High risk" narrative.

### Query 2

What happens if I delete user_profiles?

Expected:
High/Critical risk (~60-80), with broad downstream propagation.

Talking points:
- Emphasize transitive impact, not only direct children.
- Highlight grouped impact breakdown by asset type.
- Show risk meter and explainability reasons.
- Mention rollout planning value for release governance.

### Query 3

What happens if I delete temp_logs_table?

Expected:
Low risk (~0-5), no meaningful lineage.

Talking points:
- Show explicit no-lineage minimal-risk behavior.
- Contrast with Query 1 for judges: same action, very different blast radius.
- Explain this reduces false alarms and improves trust in scoring.

## 3. How To Answer Judge Questions

### Why not just use OpenMetadata's built-in lineage?

OpenMetadata lineage is foundational but descriptive. This project adds decision support: natural language intake, weighted risk scoring, recommendation generation, and CI-ready gating behavior. It transforms lineage data into an actionable release-risk workflow.

It also handles sparse enterprise metadata by extending real graphs with synthetic entities/lineage for demo realism while keeping real OpenMetadata data as the source of truth.

### How is the risk score calculated?

Risk is additive on a 0-100 scale.

- Base per downstream asset:
	- table +10
	- dashboard +20
	- pipeline +15
	- ml model +25
- Modifiers:
	- deep lineage (depth > 2): +10
	- high usage / business critical: +10
	- no lineage: -20 (floor 0)
- Level mapping:
	- 0-10 LOW
	- 11-30 MEDIUM
	- 31-60 HIGH
	- 61-100 CRITICAL

### What makes this production-ready?

It uses separated backend/frontend services, persistent history in MongoDB, centralized error handling, health checks, OpenMetadata API integration, and a GitHub Action that can block risky pull requests.

### How does the AI part work?

The LLM is used in two focused steps: parse intent from natural language and generate recommendations from a structured impact report. Core risk math and lineage traversal remain deterministic in backend services.

### What is Demo Mode exactly?

Demo Mode uses a seeded metadata graph with realistic tables, dashboards, pipelines, and ML models so the demo always shows predictable outcomes. It is intentionally deterministic for presentations.

### What happens when OpenMetadata has limited data?

With Demo Mode OFF, the system calls real OpenMetadata first. If catalog or lineage is too limited, it auto-applies a synthetic enterprise extension (100-1000 entities) to simulate realistic scale. This extends real data; it does not replace it.

## 4. Backup Plan If Demo Fails

- Prepare screenshots for all three expected query outputs.
- Keep one screenshot per query showing risk badge, affected assets, and recommendations.
- Keep one screenshot showing Demo Mode ON and one with Demo Mode OFF.
- Keep a screenshot of OpenMetadata lineage for the same entities.
- Keep a screenshot of GitHub Action impact-check output with a sample PR comment.
- If live API is unavailable, present the screenshots and walk through architecture and request flow.

## Demo Video
https://youtu.be/aUfCREfMvjo?si=GDZZTCjKwksZ54DX

