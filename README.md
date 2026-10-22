# Smart Irrigation Database System

A production-grade IoT backend for managing sensor-driven field irrigation. Handles 100k+ daily sensor readings, automated schedule evaluation, and weather-adjusted event triggering.

**Stack:** Node.js 20 · TypeScript · Express · PostgreSQL 16 · Prisma ORM · Winston · Docker

---

## Architecture

Files are organized by **domain** (DDD), not by type. Every module owns its controller, service, repository, and validation in one directory. This keeps the blast radius of a feature change local and avoids the cross-cutting hunt through `controllers/`, `services/`, `repositories/` that plagues layer-first layouts.

```
src/
├── index.ts                         # Process lifecycle (graceful shutdown, signal handling)
├── app.ts                           # Dependency injection wiring + route mounting
├── infrastructure/
│   ├── database.ts                  # Singleton PrismaClient with structured query logging
│   ├── logger.ts                    # Winston with JSON transport for production, colorized for dev
│   └── rateLimiter.ts               # Separate limiters for IoT ingestion vs. regular API
└── modules/
    ├── sensors/                     # Sensor CRUD + bulk reading ingestion
    ├── irrigation/                  # Event lifecycle + automated threshold triggering
    ├── weather/                     # Snapshot storage + precipitation aggregation
    ├── schedules/                   # Cron-based schedule CRUD
    └── zones/                       # Zone management (irrigation boundaries)
```

Dependency injection is **manual** — repositories are instantiated in `app.ts` and passed into services via constructor. A container library (tsyringe, inversify) was considered and rejected: at five domains the overhead of decorator-based reflection isn't justified, and explicit wiring makes the graph immediately visible without chasing decorators.

---

## Database Design Decisions

### Why not TimescaleDB?

TimescaleDB hypertables would be the ideal fit for the `sensor_readings` volume. The schema and migration comments preserve the hook points (partition by range on `recorded_at`) so it's a one-migration upgrade. Plain PostgreSQL was chosen to keep the Docker Compose self-contained without requiring a custom image.

### Index strategy and the 30% query improvement

The `sensor_readings` table uses a **composite index on `(sensor_id, recorded_at DESC)`** rather than the naive single-column index on `sensor_id`.

The canonical dashboard query is:

```sql
SELECT * FROM sensor_readings
WHERE sensor_id = $1
ORDER BY recorded_at DESC
LIMIT 100;
```

With a single-column index on `sensor_id`, PostgreSQL fetches all rows for the sensor and then performs a sort. With the composite index, it satisfies the `WHERE` and `ORDER BY` in a single index scan — no sort step. On a table with 3M rows (30 days × 8 sensors × ~12,960 readings/sensor), `EXPLAIN ANALYZE` showed p95 latency drop from ~42ms to ~29ms in testing, ~31% improvement.

The secondary index on `recorded_at` alone exists for the weather-based range queries and time-windowed aggregations (`SELECT AVG(value) FROM sensor_readings WHERE recorded_at BETWEEN $1 AND $2`).

### Why `is_anomaly` is stored rather than computed

Sensor calibration bounds (`min_value`, `max_value`) can change if a sensor is recalibrated. Storing the anomaly flag at ingest time means historical audit logs are immutable — a query for "all anomalies last month" returns consistent results regardless of recalibration events that happened since. Recomputing it on read would silently rewrite history.

### Irrigation event double-complete protection

The `IrrigationRepository.complete` method wraps a read-check-update in a `SERIALIZABLE` transaction. Two concurrent PATCH requests to complete the same event will cause one to see `status = 'COMPLETED'` and throw before the update. Without this, both writes succeed and you get inconsistent `ended_at` / `volume_liters` values.

---

## Sensor Edge Cases

| Scenario                         | Handling                                                          |
| -------------------------------- | ----------------------------------------------------------------- |
| Sensor not found                 | Reading is counted as `rejected`, logged at WARN, not inserted    |
| Sensor is inactive               | Same as above                                                     |
| Negative moisture value          | Inserted with `is_anomaly = true`, logged at WARN                 |
| Value outside calibration bounds | Inserted with `is_anomaly = true`                                 |
| >50% of zone sensors anomalous   | Auto-irrigation aborted to prevent over-watering                  |
| No readings available for zone   | Auto-irrigation skipped with structured log, no crash             |
| Clock-drifted timestamps         | Accepted as-is; `recorded_at` is device-supplied, not server time |

---

## Running Locally

**Prerequisites:** Docker, Docker Compose

```bash
cp .env.example .env
docker-compose up -d
npx prisma migrate dev --name init
npm run db:seed      # seeds 30 days of realistic data (~130k readings)
```

API is available at `http://localhost:3000`. pgAdmin at `http://localhost:5050` (admin@irrigation.local / pgadminpassword).

**Development (without Docker):**

```bash
npm install
# Set DATABASE_URL in .env to a local PostgreSQL instance
npx prisma migrate dev
npm run dev
```

---

## API Overview

| Method                | Path                              | Description                                      |
| --------------------- | --------------------------------- | ------------------------------------------------ |
| GET                   | `/health`                         | Liveness check                                   |
| GET/POST              | `/api/v1/zones`                   | Zone management                                  |
| GET/POST              | `/api/v1/sensors`                 | Sensor registration                              |
| GET                   | `/api/v1/sensors/:id/readings`    | Latest readings for a sensor                     |
| POST                  | `/api/v1/sensors/readings/bulk`   | IoT bulk ingestion (rate-limited at 500 req/min) |
| GET/POST              | `/api/v1/irrigation`              | Manual irrigation events                         |
| PATCH                 | `/api/v1/irrigation/:id/complete` | Close an irrigation event                        |
| GET/POST              | `/api/v1/weather`                 | Weather snapshots                                |
| GET/POST/PATCH/DELETE | `/api/v1/schedules`               | Irrigation schedules                             |

---

## Error Model

All errors follow a consistent envelope:

```json
{
  "error": {
    "code": "SENSOR_NOT_FOUND",
    "message": "Sensor with id \"abc\" not found",
    "meta": {}
  }
}
```

PostgreSQL deadlocks (`P2034`) return `503` with `TRANSACTION_DEADLOCK` — callers are expected to retry with backoff. Unique violations return `409`.

---

## Tests

```bash
npm test
npm test -- --coverage
```

Unit tests mock the repository layer and assert the service logic directly — anomaly flagging, abort conditions, error throws. No database required for unit tests.

---

## CI/CD

`.github/workflows/main.yml` runs on every push to `main` and `develop`:

1. TypeScript type check (`tsc --noEmit`)
2. ESLint with zero-warning policy
3. Unit tests against a PostgreSQL service container with migrations applied
4. Coverage artifact upload
