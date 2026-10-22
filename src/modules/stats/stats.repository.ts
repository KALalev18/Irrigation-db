// Read-only queries behind the dashboard: table sizes, recent activity and
// the query plan for the hot "latest readings" query.
import { PrismaClient } from '@prisma/client';

export type TableCounts = {
  zones: number;
  sensors: number;
  activeSensors: number;
  readings: number;
  weatherSnapshots: number;
  irrigationEvents: number;
  schedules: number;
};

export type QueryPlan = {
  planningMs: number;
  executionMs: number;
  plan: string[];
};

type PlanNode = {
  'Node Type': string;
  'Index Name'?: string;
  'Actual Rows': number;
  'Actual Total Time': number;
  Plans?: PlanNode[];
};

function flattenPlan(node: PlanNode, depth = 0): string[] {
  const index = node['Index Name'] ? ` using ${node['Index Name']}` : '';
  const line =
    `${'  '.repeat(depth)}${node['Node Type']}${index}` +
    ` (rows=${node['Actual Rows']}, ${node['Actual Total Time'].toFixed(3)} ms)`;
  return [line, ...(node.Plans ?? []).flatMap((child) => flattenPlan(child, depth + 1))];
}

export class StatsRepository {
  constructor(private readonly db: PrismaClient) {}

  async counts(): Promise<TableCounts> {
    const [zones, sensors, activeSensors, readings, weatherSnapshots, irrigationEvents, schedules] =
      await Promise.all([
        this.db.zone.count(),
        this.db.sensor.count(),
        this.db.sensor.count({ where: { isActive: true } }),
        this.db.sensorReading.count(),
        this.db.weatherSnapshot.count(),
        this.db.irrigationEvent.count(),
        this.db.schedule.count(),
      ]);
    return { zones, sensors, activeSensors, readings, weatherSnapshots, irrigationEvents, schedules };
  }

  // Uses the (recorded_at) index, so this stays cheap as the table grows.
  async readingsSince(since: Date): Promise<{ total: number; anomalies: number; latestAt: Date | null }> {
    const [total, anomalies, latest] = await Promise.all([
      this.db.sensorReading.count({ where: { recordedAt: { gte: since } } }),
      this.db.sensorReading.count({ where: { recordedAt: { gte: since }, isAnomaly: true } }),
      this.db.sensorReading.findFirst({ orderBy: { recordedAt: 'desc' }, select: { recordedAt: true } }),
    ]);
    return { total, anomalies, latestAt: latest?.recordedAt ?? null };
  }

  async databaseSizeBytes(): Promise<number> {
    const rows = await this.db.$queryRaw<Array<{ size: bigint }>>`
      SELECT pg_database_size(current_database()) AS size`;
    return Number(rows[0].size);
  }

  async recentEvents(limit: number) {
    return this.db.irrigationEvent.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: { zone: { select: { name: true } } },
    });
  }

  async explainLatestReadings(sensorId: string, limit: number): Promise<QueryPlan> {
    const rows = await this.db.$queryRaw<Array<{ 'QUERY PLAN': Array<Record<string, unknown>> }>>`
      EXPLAIN (ANALYZE, FORMAT JSON)
      SELECT * FROM sensor_readings
      WHERE sensor_id = ${sensorId}
      ORDER BY recorded_at DESC
      LIMIT ${limit}`;
    const result = rows[0]['QUERY PLAN'][0];
    return {
      planningMs: result['Planning Time'] as number,
      executionMs: result['Execution Time'] as number,
      plan: flattenPlan(result['Plan'] as PlanNode),
    };
  }
}
