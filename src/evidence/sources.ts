// Evidence sources. Fixture mode is the labeled offline default; Zetaris mode
// runs only when the caller supplies complete ZETARIS_* configuration.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rowsFromResponse, ZetarisClient, type ZetarisProxyResponse } from "./zetaris.ts";

export interface EvidenceItem {
  id: string;
  content: string;
  tags: string[];
}

export interface EvidenceSource {
  id: string;
  kind: "fixture" | "zetaris";
  describe(): string;
  load(): Promise<EvidenceItem[]>;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(here, "..", "..", "fixtures");

interface FixtureFile {
  source: string;
  description: string;
  items: EvidenceItem[];
}

export class FixtureSource implements EvidenceSource {
  readonly kind = "fixture" as const;
  readonly id: string;
  private readonly file: string;
  private readonly description: string;
  private readonly items: EvidenceItem[];

  constructor(fileName: string) {
    const raw: FixtureFile = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, fileName), "utf-8"));
    this.id = raw.source;
    this.file = fileName;
    this.description = raw.description;
    for (const item of raw.items) {
      if (!item.id || !item.content) throw new Error(`fixture ${fileName} has an item without id/content`);
    }
    this.items = raw.items;
  }

  describe(): string {
    return `${this.id} (fixture file fixtures/${this.file}): ${this.description}`;
  }

  async load(): Promise<EvidenceItem[]> {
    return this.items;
  }
}

export class ZetarisSource implements EvidenceSource {
  readonly kind = "zetaris" as const;

  constructor(
    readonly id: string,
    private readonly client: ZetarisClient,
    private readonly sql: string,
    private readonly rowToItem: (row: Record<string, unknown>, index: number) => EvidenceItem,
  ) {}

  describe(): string {
    return `${this.id} (LIVE Zetaris SQL): ${this.sql}`;
  }

  async load(): Promise<EvidenceItem[]> {
    const result = (await this.client.query(this.sql)) as ZetarisProxyResponse;
    return rowsFromResponse(result).map((row, i) => this.rowToItem(row, i));
  }
}

// Deliberately distinct fixture datasets: an answer must combine postmortem
// evidence with deployment evidence instead of reading one flat file.
export function defaultFixtureSources(): FixtureSource[] {
  return [new FixtureSource("incident-reports.json"), new FixtureSource("deploy-log.json")];
}
