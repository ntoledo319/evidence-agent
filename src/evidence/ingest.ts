import type { EvidenceSource } from "./sources.ts";

export interface IngestResult {
  sourceId: string;
  count: number;
  memoryIds: string[];
}

// Every evidence item becomes a durable H-MEM memory with the source and item
// id in the memory's source field. That makes the answer and audit trail point
// back to a row, not to an unattributed model claim.
export async function ingestSources(hmem: any, sources: EvidenceSource[]): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  for (const source of sources) {
    const items = await source.load();
    const memoryIds: string[] = [];
    for (const item of items) {
      const record = hmem.add({
        content: item.content,
        type: "evidence",
        source: `${source.id}:${item.id}`,
        tags: item.tags,
      });
      memoryIds.push(record.id);
    }
    results.push({ sourceId: source.id, count: items.length, memoryIds });
  }
  return results;
}
