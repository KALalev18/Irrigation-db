# Irrigation DB

A PostgreSQL database and REST API for a sensor-driven irrigation system: it stores soil and weather readings, runs watering schedules, and decides per zone whether to water based on soil moisture and recent rain.

![Dashboard](docs/dashboard.png)

## What it does

A farm or greenhouse has zones (a field, a greenhouse, an orchard block), each with sensors that report every few minutes. The system needs to store those readings, notice when a sensor is broken, and water a zone only when it is actually dry, not just because the clock says 06:00.

This project covers the backend side of that:

- **Ingests sensor readings in batches** (up to 500 per request) from IoT gateways. Readings from unknown or deactivated sensors are rejected. Readings outside a sensor's calibration range are stored but flagged as anomalies.
- **Runs schedules.** Every minute, `ScheduleRunner` checks which cron schedules are due. If 5 mm or more of rain fell in the last 24 hours, it skips them. Otherwise it reads the zone's latest soil moisture and starts an irrigation event only if the average is below 30%.
- **Stops broken sensors from flooding a field.** If half or more of a zone's latest readings are anomalies, auto-irrigation is aborted instead of trusting them.
- **Tracks irrigation events** from start to completion, with protection against the same event being completed twice by concurrent requests.
- **Includes a dashboard** at `http://localhost:3000` showing the stored data, with a live `EXPLAIN ANALYZE` of the main query and a button that sends a test batch through the ingest endpoint.

## Tech stack

TypeScript, Node.js 22, Express 5, PostgreSQL 16, Prisma 6, Zod (request validation), Winston (logging), Jest, Docker Compose, GitHub Actions.

## Running it

You need Docker and Node.js 22+.

```bash
git clone <repo-url> irrigation-db
cd irrigation-db
cp .env.example .env

docker compose up -d --build   # Postgres + API; migrations run on API start
npm install
npm run db:seed                # 30 days of sample data ending now (~33k readings)
```

Then open http://localhost:3000.

The seed clears existing data first, so you can re-run it at any time. The API runs in Docker; the seed and benchmark run from your machine and connect to Postgres on port 5433.

To run the API outside Docker (with hot reload), keep the `postgres` container running and use `npm run dev`.

pgAdmin is available with `docker compose --profile tools up -d` at http://localhost:5050 (admin@irrigation.local / pgadminpassword).

## Tests and checks

```bash
npm test            # unit tests (no database needed)
npm run lint
npm run typecheck
```

The unit tests cover the logic that decides things: anomaly flagging and rejection during ingest, the irrigation abort and threshold rules, the cron matcher, and the schedule runner (due / not due / skipped after rain / each minute processed once). Repositories are mocked. CI runs typecheck, lint and tests on every push.

## Index benchmark

The most frequent query is "latest 100 readings for a sensor". The `sensor_readings` table has a composite index on `(sensor_id, recorded_at DESC)` for it. `npm run bench` measures what that index does compared with a plain index on `sensor_id`:

| Index | Median | p95 |
| --- | --- | --- |
| `(sensor_id)` | 61.1 ms | 86.9 ms |
| `(sensor_id, recorded_at DESC)` | 0.19 ms | 0.31 ms |

That is on 3 million rows (50 sensors x 60,000 readings), 300 runs each, timed with `EXPLAIN ANALYZE`, PostgreSQL 16 in Docker on a laptop. With only the `sensor_id` index, Postgres has to fetch all ~60,000 rows for the sensor and sort them. With the composite index it reads the first 100 entries in order and stops. Full method and query plans are in [docs/benchmark.md](docs/benchmark.md).

The same script times a 100,000-row insert through Prisma `createMany` in batches of 1,000: 12.8 s on the same machine (then rolled back).

## Design decisions

**Anomalies are stored, not dropped.** A reading outside the calibration range is saved with `is_anomaly = true`. The flag is set at ingest time, so if a sensor is recalibrated later, old readings keep the flag they had when they arrived. This keeps the history auditable and lets the irrigation logic notice when a sensor starts failing.

**`SERIALIZABLE` transaction when completing an event.** Completing an irrigation event reads its status and then updates it. Two requests at the same moment could both see it as active and both write an end time and volume. Under `SERIALIZABLE`, Postgres rejects one of them, and the API returns `503 TRANSACTION_DEADLOCK` so the client can retry. A request for an event that is already completed gets `409`.

**A small cron matcher instead of a library.** Schedules only need standard five-field expressions (numbers, `*`, lists, ranges, steps), so `src/modules/schedules/cron.ts` is about 40 lines and fully tested. The runner polls every 15 seconds but processes each minute only once, so a slow tick can't skip or double-run a schedule.

**Modules by domain.** Each domain (`sensors`, `irrigation`, `schedules`, `weather`, `zones`, `stats`) has its own controller, service, repository and validation. Dependencies are wired by hand in `app.ts`, which keeps the graph easy to follow at this size.

**Plain PostgreSQL, not TimescaleDB.** TimescaleDB hypertables would suit `sensor_readings` at larger volumes, but plain Postgres keeps the setup to a stock Docker image. With the indexes above, the main queries stay fast at millions of rows.

## API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Liveness check |
| GET, POST, PATCH, DELETE | `/api/v1/zones` | Zones |
| GET, POST, DELETE | `/api/v1/sensors` | Register, list and deactivate sensors |
| GET | `/api/v1/sensors/:id/readings?limit=` | Latest readings for a sensor |
| POST | `/api/v1/sensors/readings/bulk` | Batch ingest, up to 500 readings (own rate limit) |
| GET, POST | `/api/v1/irrigation` | Start events, list by zone (`/zones/:zoneId`) |
| PATCH | `/api/v1/irrigation/:id/complete` | Complete an event |
| GET, POST | `/api/v1/weather` | Weather snapshots (latest or date range) |
| GET, POST, PATCH, DELETE | `/api/v1/schedules` | Cron schedules, list by zone (`/zones/:zoneId`) |
| GET | `/api/v1/stats` | Counts, last-24 h activity, database size |
| GET | `/api/v1/stats/query-plan?sensorId=` | `EXPLAIN ANALYZE` of the latest-readings query |

Errors use one shape: `{ "error": { "code": "SENSOR_NOT_FOUND", "message": "...", "meta": {} } }`. Validation errors return `422` with the field-level issues.

Example ingest request:

```bash
curl -X POST http://localhost:3000/api/v1/sensors/readings/bulk \
  -H "Content-Type: application/json" \
  -d '{"readings":[{"sensorId":"<sensor-id>","value":34.2,"recordedAt":"2026-10-22T06:00:00Z"}]}'
# {"data":{"accepted":1,"rejected":0,"anomalies":0}}
```

## Project structure

```
prisma/
  schema.prisma          tables, relations and indexes
  migrations/            SQL migrations
  seed.ts                30 days of sample data
public/index.html        dashboard (plain HTML/JS, no build step)
scripts/
  benchmark-index.ts     index and insert benchmark -> docs/benchmark.md
src/
  index.ts               starts the server and the schedule runner, graceful shutdown
  app.ts                 wires repositories, services and routes
  infrastructure/        Prisma client, logger, rate limiters
  modules/
    sensors/             sensor CRUD and batch ingest
    irrigation/          irrigation events and the auto-irrigation decision
    schedules/           schedule CRUD, cron matcher, ScheduleRunner
    weather/             weather snapshots, rain check
    zones/               zones
    stats/               dashboard queries
  shared/                AppError and the global error handler
tests/unit/              Jest unit tests
```

## What I would improve next

- Integration tests against a real Postgres container, especially for the `SERIALIZABLE` race and the ingest endpoint.
- Partition `sensor_readings` by month (or move to TimescaleDB) and add a retention policy once data reaches tens of millions of rows.
- Fetch weather on a schedule from a real provider (Open-Meteo has a free API) instead of relying on seeded snapshots.
- Close irrigation events automatically when their duration ends, and stop the runner from starting a new event while one is active in the same zone.
- Run the schedule runner in a single worker or behind a database lock, so several API instances don't trigger the same schedule.
- Authentication for the API and per-gateway API keys for ingest.

## License

MIT
