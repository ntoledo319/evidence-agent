import { rowsFromResponse, type ZetarisClient, type ZetarisProxyResponse } from "./zetaris.ts";
import type { EvidenceItem } from "./sources.ts";

export interface LiveDemoQuery {
  id: string;
  sql: string;
  rowToItem(row: Record<string, unknown>, index: number): EvidenceItem;
}

// Small LIMIT queries keep the baseline responsive on the local hackathon
// instance while still proving three distinct real evidence tables.
export const LIVE_DEMO_QUERIES: LiveDemoQuery[] = [
  {
    id: "zetaris:NY_TAXI.weather_data",
    sql: "SELECT weather_id, zone_id, weather_condition, precipitation FROM NY_TAXI.weather_data LIMIT 5",
    rowToItem: (row, index) => ({
      id: String(row.weather_id ?? `weather-${index + 1}`),
      content: `Weather evidence ${row.weather_id}: zone ${row.zone_id} reported ${row.weather_condition} with ${row.precipitation} precipitation.`,
      tags: ["zetaris", "ny_taxi", "weather"],
    }),
  },
  {
    id: "zetaris:NY_TAXI.surge_pricing",
    sql: "SELECT surge_id, zone_id, reason, surge_multiplier FROM NY_TAXI.surge_pricing LIMIT 5",
    rowToItem: (row, index) => ({
      id: String(row.surge_id ?? `surge-${index + 1}`),
      content: `Surge evidence ${row.surge_id}: zone ${row.zone_id} had multiplier ${row.surge_multiplier} for reason ${row.reason}.`,
      tags: ["zetaris", "ny_taxi", "surge"],
    }),
  },
  {
    id: "zetaris:NY_TAXI.taxi_trips",
    sql: "SELECT pickup_location_id, COUNT(*) AS trips FROM NY_TAXI.taxi_trips GROUP BY pickup_location_id ORDER BY trips DESC LIMIT 5",
    rowToItem: (row, index) => ({
      id: `top-zone-${index + 1}`,
      content: `Trip evidence: pickup zone ${row.pickup_location_id} is a top-5 zone with ${row.trips} recorded trips.`,
      tags: ["zetaris", "ny_taxi", "trips"],
    }),
  },
];

export async function loadLiveDemoEvidence(client: ZetarisClient) {
  const groups: { id: string; sql: string; items: EvidenceItem[] }[] = [];
  for (const query of LIVE_DEMO_QUERIES) {
    const result = (await client.query(query.sql)) as ZetarisProxyResponse;
    groups.push({
      id: query.id,
      sql: query.sql,
      items: rowsFromResponse(result).map((row, index) => query.rowToItem(row, index)),
    });
  }
  return groups;
}
