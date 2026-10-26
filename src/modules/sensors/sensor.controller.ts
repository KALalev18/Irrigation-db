// Sensor HTTP router — thin controller, no business logic.
// Routes: GET /, GET /:id, GET /:id/readings, POST /, POST /readings/bulk, DELETE /:id
import { Router, Request, Response, NextFunction } from 'express';
import { SensorService } from './sensor.service';
import { CreateSensorSchema, BulkIngestReadingSchema, SensorQuerySchema } from './sensor.validation';
import { iotRateLimiter } from '../../infrastructure/rateLimiter';

export function buildSensorRouter(sensorService: SensorService): Router {
  const router = Router();

  // GET /api/v1/sensors?limit=&offset=&type=&isActive=
  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      // SensorQuerySchema coerces string query params and applies defaults (limit=100, offset=0).
      const query = SensorQuerySchema.parse(req.query);
      const sensors = await sensorService.list({
        ...query,
        // Prisma filter shape requires { equals: ... } for enum fields.
        type: query.type ? { equals: query.type } : undefined,
      });
      res.json({ data: sensors });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/sensors/:id
  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sensor = await sensorService.getById(req.params.id as string);
      res.json({ data: sensor });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/sensors/:id/readings?limit=
  router.get('/:id/readings', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Math.min(parseInt((req.query.limit as string) ?? '100', 10), 1000);
      const readings = await sensorService.getLatestReadings(req.params.id as string, limit);
      res.json({ data: readings });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/sensors — register a new sensor
  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = CreateSensorSchema.parse(req.body);
      const sensor = await sensorService.register(dto);
      res.status(201).json({ data: sensor });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/sensors/readings/bulk — IoT gateway batch ingest
  // This endpoint has its own rate limiter (500 req/min) instead of the
  // global 200 req/min because gateways legitimately burst during reconnects.
  router.post('/readings/bulk', iotRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = BulkIngestReadingSchema.parse(req.body);
      const result = await sensorService.bulkIngest(dto);
      res.status(202).json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/v1/sensors/:id — soft-delete (deactivate)
  router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sensor = await sensorService.deactivate(req.params.id as string);
      res.json({ data: sensor });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
