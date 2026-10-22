import { Router, Request, Response, NextFunction } from 'express';
import { ZoneService } from './zone.service';
import { CreateZoneSchema, UpdateZoneSchema } from './zone.validation';

export function buildZoneRouter(zoneService: ZoneService): Router {
  const router = Router();

  router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const zones = await zoneService.listAll();
      res.json({ data: zones });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const zone = await zoneService.getById(req.params.id as string);
      res.json({ data: zone });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = CreateZoneSchema.parse(req.body);
      const zone = await zoneService.create(dto);
      res.status(201).json({ data: zone });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = UpdateZoneSchema.parse(req.body);
      const zone = await zoneService.update(req.params.id as string, dto);
      res.json({ data: zone });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      await zoneService.remove(req.params.id as string);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
