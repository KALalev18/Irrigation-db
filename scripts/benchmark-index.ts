// Measures the effect of the composite (sensor_id, recorded_at DESC) index on the
// "latest N readings for a sensor" query, plus bulk-insert throughput.
//
// Everything runs in a separate `bench` schema so the app's tables are untouched.
// Usage: npm run bench   (needs DATABASE_URL, e.g. the Docker Compose database)
import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'fs';
import { PrismaClient } from '@prisma/client';

const SENSORS = 50;
const READINGS_PER_SENSOR = 60_000; // 50 x 60k = 3M rows, ~1 year at one reading per 10 min
const RUNS = 300;
const WARMUP = 30;
const LIMIT = 100;
const INSERT_ROWS = 100_000;
const INSERT_BATCH = 1_000;

const prisma = new PrismaClient();

type Stats = { median: number; p95: number; mean: number; plan: string };

function percentile(sorted: number[], p: number): number {
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[i];
}

function describePlan(node: Record<string, unknown>): string {
  const children = (node['Plans'] as Record<string, unknown>[] | undefined) ?? [];
  const name = [node['Node Type'], node['Index Name']].filter(Boolean).join(' using ');
  return [name, ...children.map(describePlan)].join(' -> ');
}

async function timeQuery(label: string): Promise<Stats> {
  const times: number[] = [];
  let plan = '';

  for (let i = 0; i < WARMUP + RUNS; i++) {
    const sensorId = `sensor-${(i * 7) % SENSORS}`;
    const rows = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': unknown }>>(
      `EXPLAIN (ANALYZE, FORMAT JSON)
       SELECT * FROM bench.readings WHERE sensor_id = $1 ORDER BY recorded_at DESC LIMIT ${LIMIT}`,
      sensorId,
    );
    const result = (rows[0]['QUERY PLAN'] as Array<Record<string, unknown>>)[0];
    if (i >= WARMUP) times.push(result['Execution Time'] as number);
    if (i === 0) plan = describePlan(result['Plan'] as Record<string, unknown>);
  }

  times.sort((a, b) => a - b);
  const stats = {
    median: percentile(times, 50),
    p95: percentile(times, 95),
    mean: times.reduce((s, t) => s + t, 0) / times.length,
    plan,
  };
  console.log(`${label}: median ${stats.median.toFixed(3)} ms, p95 ${stats.p95.toFixed(3)} ms`);
  console.log(`  plan: ${plan}`);
  return stats;
}

async function setUpTable() {
  console.log(`Creating bench.readings with ${(SENSORS * READINGS_PER_SENSOR).toLocaleString()} rows...`);
  await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS bench CASCADE');
  await prisma.$executeRawUnsafe('CREATE SCHEMA bench');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE bench.readings (
      id          BIGSERIAL PRIMARY KEY,
      sensor_id   TEXT NOT NULL,
      value       DOUBLE PRECISION NOT NULL,
      recorded_at TIMESTAMP(3) NOT NULL,
      is_anomaly  BOOLEAN NOT NULL DEFAULT false
    )`);
  // Rows are interleaved by time (like real ingestion), not grouped by sensor
  await prisma.$executeRawUnsafe(`
    INSERT INTO bench.readings (sensor_id, value, recorded_at)
    SELECT 'sensor-' || s, random() * 60, now() - (n * interval '10 minutes')
    FROM generate_series(1, ${READINGS_PER_SENSOR}) n, generate_series(0, ${SENSORS - 1}) s`);
}

async function benchmarkInsert(): Promise<number> {
  const sensor = await prisma.sensor.findFirst();
  if (!sensor) throw new Error('No sensors found. Run `npm run db:seed` first.');

  const rows = Array.from({ length: INSERT_ROWS }, (_, i) => ({
    sensorId: sensor.id,
    value: Math.random() * 60,
    recordedAt: new Date(Date.now() - i * 1000),
  }));

  const start = performance.now();
  let elapsed = 0;
  // Insert through the same Prisma createMany path the bulk endpoint uses,
  // then roll back so the seeded data stays as it was.
  await prisma
    .$transaction(
      async (tx) => {
        for (let b = 0; b < rows.length; b += INSERT_BATCH) {
          await tx.sensorReading.createMany({ data: rows.slice(b, b + INSERT_BATCH) });
        }
        elapsed = performance.now() - start;
        throw new Error('rollback');
      },
      { timeout: 300_000 },
    )
    .catch((err: Error) => {
      if (err.message !== 'rollback') throw err;
    });

  console.log(`Bulk insert: ${INSERT_ROWS.toLocaleString()} rows in ${(elapsed / 1000).toFixed(2)} s`);
  return elapsed;
}

async function main() {
  const [{ version }] = await prisma.$queryRawUnsafe<Array<{ version: string }>>('SELECT version()');

  await setUpTable();

  await prisma.$executeRawUnsafe('CREATE INDEX readings_sensor_id ON bench.readings (sensor_id)');
  await prisma.$executeRawUnsafe('ANALYZE bench.readings');
  const single = await timeQuery('Index on (sensor_id)');

  await prisma.$executeRawUnsafe('DROP INDEX bench.readings_sensor_id');
  await prisma.$executeRawUnsafe(
    'CREATE INDEX readings_sensor_id_recorded_at ON bench.readings (sensor_id, recorded_at DESC)',
  );
  await prisma.$executeRawUnsafe('ANALYZE bench.readings');
  const composite = await timeQuery('Index on (sensor_id, recorded_at DESC)');

  const insertMs = await benchmarkInsert();
  await prisma.$executeRawUnsafe('DROP SCHEMA bench CASCADE');

  const reduction = (1 - composite.median / single.median) * 100;
  const fmt = (n: number) => n.toFixed(3);
  const report = `# Index benchmark

Generated by \`npm run bench\` on ${new Date().toISOString().slice(0, 10)}.

**Setup:** ${version.split(',')[0]} in Docker on a local machine. Table with
${(SENSORS * READINGS_PER_SENSOR).toLocaleString()} rows (${SENSORS} sensors x ${READINGS_PER_SENSOR.toLocaleString()} readings),
inserted in time order so each sensor's rows are spread across the table.

**Query:** \`SELECT * FROM readings WHERE sensor_id = $1 ORDER BY recorded_at DESC LIMIT ${LIMIT}\`

**Method:** \`EXPLAIN (ANALYZE)\` execution time, ${RUNS} runs per index after ${WARMUP} warm-up runs,
rotating through sensors. Times are server-side and exclude network and Prisma overhead.

| Index | Median | p95 | Plan |
| --- | --- | --- | --- |
| \`(sensor_id)\` | ${fmt(single.median)} ms | ${fmt(single.p95)} ms | ${single.plan} |
| \`(sensor_id, recorded_at DESC)\` | ${fmt(composite.median)} ms | ${fmt(composite.p95)} ms | ${composite.plan} |

Median execution time dropped by **${reduction.toFixed(1)}%**. With the single-column index Postgres
reads all of the sensor's rows and sorts them; the composite index returns them already in order,
so it stops after ${LIMIT} rows.

**Bulk insert:** ${INSERT_ROWS.toLocaleString()} rows into \`sensor_readings\` through Prisma \`createMany\`
in batches of ${INSERT_BATCH.toLocaleString()} took ${(insertMs / 1000).toFixed(2)} s (one run, rolled back afterwards).
`;

  mkdirSync('docs', { recursive: true });
  writeFileSync('docs/benchmark.md', report);
  console.log('\nWrote docs/benchmark.md');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
