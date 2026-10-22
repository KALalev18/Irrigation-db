// Wires the full dependency graph and returns a configured Express app.
// Separated from index.ts so tests can call buildApp() without binding a port.
import express from 'express';
import path from 'path';
import { prisma } from './infrastructure/database';
import { apiRateLimiter } from './infrastructure/rateLimiter';
import { globalErrorHandler } from './shared/middleware/errorHandler';

import { SensorRepository } from './modules/sensors/sensor.repository';
import { SensorService } from './modules/sensors/sensor.service';
import { buildSensorRouter } from './modules/sensors/sensor.controller';

import { IrrigationRepository } from './modules/irrigation/irrigation.repository';
import { IrrigationService } from './modules/irrigation/irrigation.service';
import { buildIrrigationRouter } from './modules/irrigation/irrigation.controller';

import { WeatherRepository } from './modules/weather/weather.repository';
import { WeatherService } from './modules/weather/weather.service';
import { buildWeatherRouter } from './modules/weather/weather.controller';

import { ScheduleRepository } from './modules/schedules/schedule.repository';
import { ScheduleService } from './modules/schedules/schedule.service';
import { buildScheduleRouter } from './modules/schedules/schedule.controller';

import { ZoneRepository } from './modules/zones/zone.repository';
import { ZoneService } from './modules/zones/zone.service';
import { buildZoneRouter } from './modules/zones/zone.controller';

function buildApp() {
  // Manual DI — wire each layer: repo → service → router.
  // IrrigationService reaches into SensorRepository directly (cross-module)
  // to check moisture levels before triggering an event.
  const sensorRepo = new SensorRepository(prisma);
  const sensorService = new SensorService(sensorRepo);

  const irrigationRepo = new IrrigationRepository(prisma);
  const irrigationService = new IrrigationService(irrigationRepo, sensorRepo);

  const weatherRepo = new WeatherRepository(prisma);
  const weatherService = new WeatherService(weatherRepo);

  const scheduleRepo = new ScheduleRepository(prisma);
  const scheduleService = new ScheduleService(scheduleRepo);

  const zoneRepo = new ZoneRepository(prisma);
  const zoneService = new ZoneService(zoneRepo);

  const app = express();

  // 1 MB covers a batch of ~500 IoT readings; cap it here before the rate
  // limiter so oversized payloads don't exhaust heap memory.
  app.use(express.json({ limit: '1mb' }));
  app.use(apiRateLimiter);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Domain routes
  app.use('/api/v1/zones',      buildZoneRouter(zoneService));
  app.use('/api/v1/sensors',    buildSensorRouter(sensorService));
  app.use('/api/v1/irrigation', buildIrrigationRouter(irrigationService));
  app.use('/api/v1/weather',    buildWeatherRouter(weatherService));
  app.use('/api/v1/schedules',  buildScheduleRouter(scheduleService));

  // Serve the monitoring dashboard as a static HTML file.
  // Must come AFTER API routes so /dashboard doesn’t shadow any future
  // API endpoint, and BEFORE globalErrorHandler so 404s are handled correctly.
  // Serving via Express (not file://) gives the page a real HTTP origin,
  // which means browser CORS rules work normally for all fetch() calls.
  app.get('/dashboard', (_req, res) => {
    res.sendFile(path.resolve(__dirname, '..', 'dashboard.html'));
  });

  // Error handler must be last — Express identifies it by the 4-arg signature.
  app.use(globalErrorHandler);

  return app;
}

export { buildApp };
