// Runs against a real PostgreSQL database (DATABASE_URL), with migrations applied.
// Each run creates its own zone and sensor and deletes them afterwards, so it is
// safe to run against the seeded development database.
import request from 'supertest';
import { randomUUID } from 'crypto';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/infrastructure/database';
import { IrrigationRepository } from '../../src/modules/irrigation/irrigation.repository';

const { app } = buildApp();
const suffix = randomUUID().slice(0, 8).toUpperCase();
let zoneId: string;
let sensorId: string;

beforeAll(async () => {
  const zone = await prisma.zone.create({
    data: { name: `Integration test ${suffix}`, areaM2: 100, cropType: 'Test' },
  });
  const sensor = await prisma.sensor.create({
    data: {
      zoneId: zone.id,
      serialNumber: `IT-${suffix}`,
      type: 'SOIL_MOISTURE',
      unit: '% VWC',
      minValue: 0,
      maxValue: 60,
    },
  });
  zoneId = zone.id;
  sensorId = sensor.id;
});

afterAll(async () => {
  await prisma.sensorReading.deleteMany({ where: { sensorId } });
  await prisma.irrigationEvent.deleteMany({ where: { zoneId } });
  await prisma.sensor.deleteMany({ where: { zoneId } });
  await prisma.zone.deleteMany({ where: { id: zoneId } });
  await prisma.$disconnect();
});

describe('POST /api/v1/sensors/readings/bulk', () => {
  const batch = () => ({
    readings: [
      { sensorId, value: 31.5, recordedAt: '2026-01-01T06:00:00.000Z' },
      { sensorId, value: 30.9, recordedAt: '2026-01-01T06:10:00.000Z' },
      { sensorId, value: 140, recordedAt: '2026-01-01T06:20:00.000Z' }, // above maxValue
    ],
  });

  it('stores readings and flags out-of-range values', async () => {
    const res = await request(app).post('/api/v1/sensors/readings/bulk').send(batch());

    expect(res.status).toBe(202);
    expect(res.body.data).toEqual({ accepted: 3, duplicates: 0, rejected: 0, anomalies: 1 });
    const flagged = await prisma.sensorReading.count({ where: { sensorId, isAnomaly: true } });
    expect(flagged).toBe(1);
  });

  it('skips a replayed batch instead of storing it twice', async () => {
    const res = await request(app).post('/api/v1/sensors/readings/bulk').send(batch());

    expect(res.body.data.accepted).toBe(0);
    expect(res.body.data.duplicates).toBe(3);
    expect(await prisma.sensorReading.count({ where: { sensorId } })).toBe(3);
  });

  it('rejects readings from unknown sensors', async () => {
    const res = await request(app)
      .post('/api/v1/sensors/readings/bulk')
      .send({ readings: [{ sensorId: randomUUID(), value: 30 }] });

    expect(res.body.data).toMatchObject({ accepted: 0, rejected: 1 });
  });

  it('is limited by its own budget, not the general 200/min API limit', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 210; i++) {
      const res = await request(app).post('/api/v1/sensors/readings/bulk').send({ readings: [] });
      statuses.push(res.status);
    }
    expect(statuses).not.toContain(429);
  });

  it('returns 422 for a malformed batch', async () => {
    const res = await request(app).post('/api/v1/sensors/readings/bulk').send({ readings: [] });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/v1/sensors/:id/readings', () => {
  it('returns the newest readings first, with BIGINT ids as strings', async () => {
    const res = await request(app).get(`/api/v1/sensors/${sensorId}/readings?limit=2`);

    expect(res.status).toBe(200);
    expect(res.body.data.map((r: { value: number }) => r.value)).toEqual([140, 30.9]);
    expect(typeof res.body.data[0].id).toBe('string');
  });
});

describe('GET /api/v1/weather/external', () => {
  it('validates coordinates before calling Open-Meteo', async () => {
    const res = await request(app).get('/api/v1/weather/external?lat=999&lon=24.9');

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/v1/stats/query-plan', () => {
  it('uses the unique (sensor_id, recorded_at) index, with no sort step', async () => {
    const res = await request(app).get(`/api/v1/stats/query-plan?sensorId=${sensorId}`);

    expect(res.status).toBe(200);
    const plan = res.body.data.plan.join('\n');
    expect(plan).toContain('sensor_readings_sensor_id_recorded_at_key');
    expect(plan).not.toContain('Sort');
  });
});

describe('PATCH /api/v1/irrigation/:id/complete', () => {
  it('lets only one of several simultaneous requests complete an event', async () => {
    const created = await request(app)
      .post('/api/v1/irrigation')
      .send({ zoneId, trigger: 'MANUAL', durationSec: 600 });
    const id = created.body.data.id;

    // 25 parallel requests so their transactions really overlap in Postgres.
    // Under READ COMMITTED several of them succeed; SERIALIZABLE allows one.
    const responses = await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        request(app)
          .patch(`/api/v1/irrigation/${id}/complete`)
          .send({ status: 'COMPLETED', volumeLiters: 100 + i }),
      ),
    );

    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    // The others either saw the event as completed (409) or hit a serialization failure (503)
    expect(statuses.every((s) => [200, 409, 503].includes(s))).toBe(true);
  });

  it('returns 409 when the event is already completed', async () => {
    const created = await request(app)
      .post('/api/v1/irrigation')
      .send({ zoneId, trigger: 'MANUAL', durationSec: 600 });
    const id = created.body.data.id;

    await request(app).patch(`/api/v1/irrigation/${id}/complete`).send({ status: 'COMPLETED' });
    const again = await request(app).patch(`/api/v1/irrigation/${id}/complete`).send({ status: 'COMPLETED' });

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('EVENT_ALREADY_COMPLETED');
  });
});

describe('IrrigationRepository.completeFinished', () => {
  it('closes active events whose duration has passed, at their planned end time', async () => {
    const startedAt = new Date(Date.now() - 60 * 60 * 1000);
    const event = await prisma.irrigationEvent.create({
      data: { zoneId, trigger: 'SCHEDULED', status: 'ACTIVE', startedAt, durationSec: 600 },
    });

    await new IrrigationRepository(prisma).completeFinished(new Date());

    const closed = await prisma.irrigationEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(closed.status).toBe('COMPLETED');
    expect(closed.endedAt?.getTime()).toBe(startedAt.getTime() + 600 * 1000);
  });
});

describe('CHECK constraints', () => {
  it('reject invalid rows even when they bypass the API validation', async () => {
    await expect(
      prisma.schedule.create({ data: { zoneId, cronExpr: '0 6 * * *', durationSec: 5 } }),
    ).rejects.toThrow(/schedules_duration_range/);

    await expect(
      prisma.weatherSnapshot.create({
        data: {
          recordedAt: new Date(),
          temperatureC: 20,
          humidityPct: 140,
          precipitationMm: 0,
          windSpeedMs: 1,
          evapotranspirationMm: 3,
          source: 'test',
        },
      }),
    ).rejects.toThrow(/weather_humidity_range/);

    await expect(prisma.$executeRaw`UPDATE zones SET area_m2 = -1 WHERE id = ${zoneId}`).rejects.toThrow(
      /zones_area_positive/,
    );
  });
});
