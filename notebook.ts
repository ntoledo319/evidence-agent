// Evidence Agent CLI: H-MEM memory plus labeled fixture and Zetaris evidence.
// State persists in .notebook/ between invocations.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadHMEM } from "./src/engine.ts";
import { answer } from "./src/llm.ts";
import { ingestSources } from "./src/evidence/ingest.ts";
import { defaultFixtureSources, type EvidenceSource } from "./src/evidence/sources.ts";
import { loadLiveDemoEvidence } from "./src/evidence/live-demo.ts";
import { configFromEnv, ZetarisClient } from "./src/evidence/zetaris.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const TTY = process.stdout.isTTY === true;
const dim = (s: string) => (TTY ? `\u001b[2m${s}\u001b[0m` : s);
const green = (s: string) => (TTY ? `\u001b[32m${s}\u001b[0m` : s);

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const arg = rest.filter((a) => !a.startsWith("--")).join(" ");
  const fresh = rest.includes("--fresh");
  const persistDir = fresh ? fs.mkdtempSync(path.join(os.tmpdir(), "evidence-agent-")) : path.join(here, ".notebook");
  const { HMEM, source } = await loadHMEM();
  console.log(dim(`engine source: ${source} | state: ${fresh ? "fresh temp" : ".notebook/"}`));
  const hmem = new HMEM({ persistDir });

  switch (command) {
    case "remember": {
      if (!arg) return usage();
      const mined = await hmem.mine("chat_message", arg);
      if (mined.length === 0) {
        const record = hmem.add({ content: arg, type: "general", source: "notebook:manual" });
        console.log(green(`remembered ${record.id}`) + ` [${record.layer}] ${record.content}`);
      } else {
        for (const m of mined) console.log(green(`mined ${m.id}`) + ` [${m.layer}] (${m.type}) ${m.content}` + dim(` confidence=${m.confidence}`));
      }
      break;
    }
    case "ingest-fixtures": {
      const sources = defaultFixtureSources();
      const results = await ingestSources(hmem, sources);
      for (const result of results) {
        console.log(green(`ingested ${result.count} evidence item(s) from ${result.sourceId}`));
        console.log(dim(`memory ids: ${result.memoryIds.join(", ")}`));
      }
      console.log(dim('\nnow ask: npx tsx notebook.ts ask "what caused the checkout latency"'));
      break;
    }
    case "zetaris-health": {
      const config = configFromEnv();
      if (!config) {
        console.log("Zetaris is not configured; fixture mode is available. Set ZETARIS_BASE_URL, ZETARIS_API_KEY or ZETARIS_USERNAME/PASSWORD, and ZETARIS_ORG_ID.");
        process.exitCode = 1;
        break;
      }
      const client = new ZetarisClient(config);
      const result = await client.healthCheck();
      console.log(green("Zetaris health check passed: SELECT 1"));
      console.log(dim(JSON.stringify(result)));
      break;
    }
    case "zetaris-demo": {
      const config = configFromEnv();
      if (!config) {
        console.log("Zetaris is not configured; run ingest-fixtures for the labeled offline fixture demo.");
        process.exitCode = 1;
        break;
      }
      const client = new ZetarisClient(config);
      await client.healthCheck();
      const groups = await loadLiveDemoEvidence(client);
      const sources: EvidenceSource[] = groups.map((group) => ({
        id: group.id,
        kind: "zetaris",
        describe: () => `${group.id}: ${group.sql}`,
        load: async () => group.items,
      }));
      const results = await ingestSources(hmem, sources);
      for (const result of results) {
        console.log(green(`loaded ${result.count} live evidence item(s) from ${result.sourceId}`));
      }
      const question = "What evidence connects weather, surge pricing, and taxi demand?";
      const result = hmem.query(question, { threshold: 0.1 });
      const memories = result.memories.map((r: any) => ({ relevance: r.relevance, content: r.memory.content }));
      const res = await answer(question, result.context, memories);
      console.log(dim(`mode: live-zetaris + ${res.mode} | strategy: ${result.trace.strategy}`));
      console.log(res.text);
      if (result.memories.length) {
        console.log(dim(`\nprovenance: ${result.memories.map((r: any) => r.memory.id).join(", ")}`));
      }
      break;
    }
    case "ask": {
      if (!arg) return usage();
      const result = hmem.query(arg, { threshold: 0.1 });
      const memories = result.memories.map((r: any) => ({ relevance: r.relevance, content: r.memory.content }));
      const res = await answer(arg, result.context, memories);
      console.log(dim(`mode: ${res.mode} | strategy: ${result.trace.strategy}`));
      console.log(res.text);
      if (result.memories.length) {
        console.log(dim(`\nprovenance: ${result.memories.map((r: any) => r.memory.id).join(", ")} (audit any of them: notebook audit <id>)`));
      }
      break;
    }
    case "sources": {
      for (const source of defaultFixtureSources()) console.log(source.describe());
      console.log(dim("Live demo uses NY_TAXI weather_data, surge_pricing, and taxi_trips through Zetaris SQL."));
      break;
    }
    case "audit": {
      if (!arg) return usage();
      const history = hmem.ledger.history(arg);
      if (history.length === 0) {
        console.log(`no ledger entries for ${arg}`);
        break;
      }
      for (const e of history) {
        const conf = e.newState?.confidence !== undefined ? ` confidence ${e.previousState?.confidence ?? "-"} -> ${e.newState.confidence}` : "";
        console.log(`- ${e.action} by ${e.actor} at ${new Date(e.timestamp).toISOString()}${conf}`);
      }
      break;
    }
    case "sleep": {
      const preview = hmem.sleep.preview();
      console.log("sleep plan (nothing applied):");
      console.log(`  consolidate: ${preview.toConsolidate.length} | archive: ${preview.toArchive.length} | synthesize: ${preview.toSynthesize.length} groups`);
      if (!rest.includes("--preview")) {
        const report = hmem.sleep.execute(preview);
        console.log(green(`executed with backup ${report.backupId}`));
      } else {
        console.log(dim("run without --preview to execute (a backup is taken first)"));
      }
      break;
    }
    case "seed": {
      const seedText = fs.readFileSync(path.join(here, "seed", "example-session.txt"), "utf-8");
      for (const line of seedText.split("\n").map((l) => l.trim()).filter(Boolean)) {
        const mined = await hmem.mine("chat_message", line);
        for (const m of mined) console.log(green(`mined ${m.id}`) + ` ${m.content.slice(0, 70)}`);
      }
      console.log(dim('\nnow try: npx tsx notebook.ts ask "what evidence sources are available"'));
      break;
    }
    default:
      usage();
  }
}

function usage(): void {
  console.log(`evidence agent (memory: H-MEM)

  npx tsx notebook.ts seed                     load the example research notes
  npx tsx notebook.ts ingest-fixtures          load two labeled fixture sources
  npx tsx notebook.ts sources                  list evidence sources
  npx tsx notebook.ts remember "<fact>"        mine a fact into memory
  npx tsx notebook.ts ask "<question>"         retrieve + answer with provenance
  npx tsx notebook.ts audit <memory-id>        the memory's full ledger history
  npx tsx notebook.ts zetaris-health           SELECT 1 through Zetaris
  npx tsx notebook.ts zetaris-demo [--fresh]   load live NY_TAXI evidence + answer
  npx tsx notebook.ts sleep [--preview]        consolidation preview / run`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
