import { PrismaClient, SensorType, IrrigationTrigger, IrrigationEventStatus } from '@prisma/client';

const prisma = new PrismaClient();

// Seed generates 30 days of realistic data with intentional messiness:
//   - sensor clock drift (timestamps slightly out of order within a batch)
//   - ~3% anomalous readings (negative values, out-of-range spikes)
//   - irregular reading cadence (dropped packets from reconnects)
//   - two sensor types per zone to reflect real deployments

const DAYS = 30;
const READINGS_PER_SENSOR_PER_DAY = 144; // one every 10 minutes
const ANOMALY_RATE = 0.03;

function gaussianRandom(mean: number, stddev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return mean + stddev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function jitteredTimestamp(base: Date, intervalMs: number, index: number): Date {
  const drift = (Math.random() - 0.5) * 5000;
  return new Date(base.getTime() + index * intervalMs + drift);
}

async function main() {
  await prisma.$transaction(async (tx) => {
    console.log('Seeding zones...');
    const zones = await Promise.all([
      tx.zone.upsert({
        where: { name: 'North Field - Wheat' },
        update: {},
        create: { name: 'North Field - Wheat', areaM2: 12000, cropType: 'Winter Wheat', description: 'Sandy loam, installed drip lines 2023' },
      }),
      tx.zone.upsert({
        where: { name: 'Greenhouse A - Tomatoes' },
        update: {},
        create: { name: 'Greenhouse A - Tomatoes', areaM2: 800, cropType: 'Cherry Tomato', description: 'Climate-controlled, substrate irrigation' },
      }),
      tx.zone.upsert({
        where: { name: 'Orchard Block 3 - Apple' },
        update: {},
        create: { name: 'Orchard Block 3 - Apple', areaM2: 5400, cropType: 'Gala Apple', description: 'Clay soil, established trees' },
      }),
    ]);

    console.log(`Created ${zones.length} zones`);

    const sensorConfigs = [
      // North Field
      { zoneId: zones[0].id, serial: 'SM-NF-001', type: SensorType.SOIL_MOISTURE, unit: '% VWC', min: 0, max: 60, baseMean: 38, stddev: 8 },
      { zoneId: zones[0].id, serial: 'TMP-NF-001', type: SensorType.TEMPERATURE, unit: '°C', min: -5, max: 45, baseMean: 14, stddev: 6 },
      { zoneId: zones[0].id, serial: 'FLOW-NF-001', type: SensorType.FLOW_RATE, unit: 'L/min', min: 0, max: 50, baseMean: 22, stddev: 4 },
      // Greenhouse
      { zoneId: zones[1].id, serial: 'SM-GHA-001', type: SensorType.SOIL_MOISTURE, unit: '% VWC', min: 20, max: 80, baseMean: 58, stddev: 5 },
      { zoneId: zones[1].id, serial: 'TMP-GHA-001', type: SensorType.TEMPERATURE, unit: '°C', min: 10, max: 40, baseMean: 22, stddev: 2 },
      { zoneId: zones[1].id, serial: 'PH-GHA-001', type: SensorType.PH, unit: 'pH', min: 5.0, max: 8.0, baseMean: 6.2, stddev: 0.3 },
      // Orchard
      { zoneId: zones[2].id, serial: 'SM-OB3-001', type: SensorType.SOIL_MOISTURE, unit: '% VWC', min: 0, max: 55, baseMean: 42, stddev: 10 },
      { zoneId: zones[2].id, serial: 'RAIN-OB3-001', type: SensorType.RAIN_GAUGE, unit: 'mm', min: 0, max: 100, baseMean: 0.2, stddev: 1.5 },
    ];

    console.log('Seeding sensors...');
    const sensors = await Promise.all(
      sensorConfigs.map((cfg) =>
        tx.sensor.upsert({
          where: { serialNumber: cfg.serial },
          update: {},
          create: {
            zoneId: cfg.zoneId,
            serialNumber: cfg.serial,
            type: cfg.type,
            unit: cfg.unit,
            minValue: cfg.min,
            maxValue: cfg.max,
          },
        }),
      ),
    );

    console.log(`Created ${sensors.length} sensors`);
    console.log('Generating sensor readings (this may take a moment)...');

    const now = new Date();
    const startDate = new Date(now.getTime() - DAYS * 24 * 60 * 60 * 1000);
    const intervalMs = (24 * 60 * 60 * 1000) / READINGS_PER_SENSOR_PER_DAY;
    const totalReadings = DAYS * READINGS_PER_SENSOR_PER_DAY;

    for (let s = 0; s < sensors.length; s++) {
      const sensor = sensors[s];
      const cfg = sensorConfigs[s];
      const readings = [];

      for (let i = 0; i < totalReadings; i++) {
        // Simulate ~5% packet loss (IoT devices drop on reconnect)
        if (Math.random() < 0.05) continue;

        const isAnomaly = Math.random() < ANOMALY_RATE;
        let value: number;

        if (isAnomaly) {
          // Either a negative spike or a value 2x the max
          value = Math.random() < 0.5 ? -Math.random() * 10 : cfg.max * 2 * Math.random();
        } else {
          value = Math.max(cfg.min, Math.min(cfg.max, gaussianRandom(cfg.baseMean, cfg.stddev)));
        }

        readings.push({
          sensorId: sensor.id,
          value: parseFloat(value.toFixed(2)),
          recordedAt: jitteredTimestamp(startDate, intervalMs, i),
          isAnomaly,
        });
      }

      // Insert in batches of 1000 to avoid hitting Prisma's parameter limit
      for (let b = 0; b < readings.length; b += 1000) {
        await tx.sensorReading.createMany({ data: readings.slice(b, b + 1000), skipDuplicates: true });
      }
      console.log(`  Sensor ${sensor.serialNumber}: ${readings.length} readings`);
    }

    console.log('Seeding weather snapshots...');
    const weatherReadings = [];
    for (let i = 0; i < DAYS * 24; i++) {
      const ts = new Date(startDate.getTime() + i * 3600 * 1000);
      const hour = ts.getHours();
      const tempC = gaussianRandom(15 + 10 * Math.sin((hour - 6) * Math.PI / 12), 2);
      const precipitation = Math.random() < 0.08 ? gaussianRandom(2, 3) : 0;
      weatherReadings.push({
        recordedAt: ts,
        temperatureC: parseFloat(tempC.toFixed(1)),
        humidityPct: parseFloat(Math.max(20, Math.min(100, gaussianRandom(60, 15))).toFixed(1)),
        precipitationMm: parseFloat(Math.max(0, precipitation).toFixed(2)),
        windSpeedMs: parseFloat(Math.max(0, gaussianRandom(3, 2)).toFixed(1)),
        evapotranspirationMm: parseFloat(Math.max(0, gaussianRandom(4.5, 1.5)).toFixed(2)),
        source: 'FMI-SYNOP-Helsinki',
      });
    }
    await tx.weatherSnapshot.createMany({ data: weatherReadings });
    console.log(`  Created ${weatherReadings.length} weather snapshots`);

    console.log('Seeding irrigation events and schedules...');
    for (const zone of zones) {
      await tx.schedule.createMany({
        data: [
          { zoneId: zone.id, cronExpr: '0 6 * * *', durationSec: 900, isEnabled: true },
          { zoneId: zone.id, cronExpr: '0 18 * * 1,3,5', durationSec: 600, isEnabled: true },
        ],
      });

      // Seed ~3 irrigation events per zone over the seeded period
      for (let d = 0; d < DAYS; d += 10) {
        const startedAt = new Date(startDate.getTime() + d * 24 * 60 * 60 * 1000 + 6 * 3600 * 1000);
        const duration = 600 + Math.floor(Math.random() * 600);
        await tx.irrigationEvent.create({
          data: {
            zoneId: zone.id,
            trigger: d % 20 === 0 ? IrrigationTrigger.MANUAL : IrrigationTrigger.SCHEDULED,
            status: IrrigationEventStatus.COMPLETED,
            startedAt,
            endedAt: new Date(startedAt.getTime() + duration * 1000),
            durationSec: duration,
            volumeLiters: parseFloat((duration * gaussianRandom(0.8, 0.1)).toFixed(1)),
          },
        });
      }
    }

    console.log('Seed complete.');
  }, { timeout: 300000, maxWait: 300000 });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
