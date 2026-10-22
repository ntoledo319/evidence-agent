import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadHMEM } from "../src/engine.ts";
import { ingestSources } from "../src/evidence/ingest.ts";
import { defaultFixtureSources, ZetarisSource } from "../src/evidence/sources.ts";
import { rowsFromResponse } from "../src/evidence/zetaris.ts";

test("fixture sources load two distinct evidence sets", async () => {
  const sources = defaultFixtureSources();
  assert.equal(sources.length, 2);
  const groups = await Promise.all(sources.map((s) => s.load()));
  assert.equal(groups[0][0].id, "INC-1042");
  assert.equal(groups[1][0].id, "DEP-2026-09-14");
});

test("ingesting fixture evidence into H-MEM preserves row provenance", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-agent-"));
  const { HMEM } = await loadHMEM();
  const hmem = new HMEM({ persistDir: dir });
  const results = await ingestSources(hmem, defaultFixtureSources());
  assert.deepEqual(results.map((r) => r.count), [3, 3]);
  const found = hmem.query("checkout latency", { threshold: 0.1 });
  assert.ok(found.memories.some((r: any) => r.memory.source === "fixture:incident-reports:INC-1042"));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("ZetarisSource maps normalized rows to evidence items", async () => {
  const client = {
    query: async () => ({ headers: ["id", "value"], data: [["row-1", "ok"]] }),
  } as any;
  const source = new ZetarisSource("zetaris:test", client, "SELECT 1", (row) => ({
    id: String(row.id),
    content: `value ${row.value}`,
    tags: ["zetaris"],
  }));
  assert.deepEqual(await source.load(), [{ id: "row-1", content: "value ok", tags: ["zetaris"] }]);
  assert.equal(rowsFromResponse(null).length, 0);
});
