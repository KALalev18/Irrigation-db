import { Router, Request, Response, NextFunction } from 'express';
import { IrrigationService } from './irrigation.service';
import { StartIrrigationSchema, UpdateIrrigationEventSchema } from './irrigation.validation';

export function buildIrrigationRouter(irrigationService: IrrigationService): Router {
  const router = Router();

  // GET /api/v1/irrigation/zones/:zoneId
  router.get('/zones/:zoneId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Math.min(parseInt((req.query.limit as string) ?? '50', 10), 500);
      const offset = parseInt((req.query.offset as string) ?? '0', 10);
      const events = await irrigationService.listByZone(req.params.zoneId as string, { limit, offset });
      res.json({ data: events });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const event = await irrigationService.getById(req.params.id as string);
      res.json({ data: event });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = StartIrrigationSchema.parse(req.body);
      const event = await irrigationService.start(dto);
      res.status(201).json({ data: event });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id/complete', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = UpdateIrrigationEventSchema.parse(req.body);
      const event = await irrigationService.complete(req.params.id as string, dto);
      res.json({ data: event });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
