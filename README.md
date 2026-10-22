# Evidence Agent

An evidence-backed research agent for **Open Agent Hackathon 2026 — Track 02: The Agent That Can Explain Why**.

The baseline answers an operational question by combining three distinct evidence tables through **Zetaris Lightning SQL**, then stores each source row in **Meterless H-MEM** with row-level provenance. The answer path is retrieval-first: it cites the memory IDs that came from source rows and never invents evidence.

## What the baseline proves

- **Zetaris:** the local hackathon platform runs in Docker; `zetaris-health` executes `SELECT 1` through the UI proxy, and `zetaris-demo` reads `NY_TAXI.weather_data`, `NY_TAXI.surge_pricing`, and `NY_TAXI.taxi_trips`.
- **Meterless:** the real H-MEM reference engine is vendored by `npm run setup`; `remember`, `ingest-fixtures`, `ask`, `audit`, and `sleep` map to named H-MEM services.
- **Evidence trail:** fixture and live evidence carry source IDs and item IDs; `ask` prints H-MEM memory IDs and `audit <id>` shows ledger history.
- **Offline mode:** `ingest-fixtures` uses two clearly labeled local fixture files (incident reports + deployment log) when no Zetaris configuration exists.

## Setup

Node 26+ and npm:

```bash
npm install
npm run setup   # vendors Meterless H-MEM into vendor/ (gitignored)
npm test
```

## Fixture demo (no credentials)

```bash
npx tsx notebook.ts ingest-fixtures
npx tsx notebook.ts ask "what caused the checkout latency"
npx tsx notebook.ts audit <memory-id>
```

Fixture files are labeled offline demo data, not live evidence.

## Live Zetaris demo

Start the local Zetaris platform and put credentials in `.env.local` (never commit it):

```dotenv
ZETARIS_BASE_URL=http://localhost:3000
ZETARIS_ORG_ID=1
# Preferred when created by a human in the Zetaris GUI:
ZETARIS_API_KEY=...
# Or the UI-proxy login used by the official local scripts:
ZETARIS_USERNAME=admin@zetaris.com
ZETARIS_PASSWORD=...
```

Then:

```bash
npx tsx notebook.ts zetaris-health
npx tsx notebook.ts zetaris-demo --fresh
```

The demo asks: “What evidence connects weather, surge pricing, and taxi demand?” It loads three small live query results into H-MEM, answers from retrieved evidence, and prints provenance.

## Cursor use

Cursor Agent CLI is installed locally for this entry. Organizer access/credit instructions were still marked TBC when the baseline began, so this file does not claim Cursor usage that has not happened yet. Before submission, record the actual Cursor commands/session used for development in this section or do not submit a noncompliant entry.

## Architecture

```text
question or evidence command
  -> ZetarisClient (UI-proxy Lightning SQL) or FixtureSource
  -> EvidenceItem(id, content, tags)
  -> Meterless H-MEM memory with source:id provenance
  -> retrieval + optional model answer
  -> printed answer + memory IDs + audit trail
```

## Files

- `notebook.ts` — CLI and demo commands
- `src/evidence/zetaris.ts` — Zetaris config/auth/query normalization
- `src/evidence/sources.ts` — fixture and live evidence source interfaces
- `src/evidence/live-demo.ts` — three live NY_TAXI evidence queries
- `src/evidence/ingest.ts` — source rows -> H-MEM provenance
- `fixtures/` — labeled offline demo data
- `tests/` — connector, fixture, and H-MEM provenance tests

## License

Apache-2.0. Built by Toledo Technologies LLC for Open Agent Hackathon 2026 with AI coding assistance; disclosure will be included in submission metadata.
