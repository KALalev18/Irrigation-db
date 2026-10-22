import { Router, Request, Response, NextFunction } from 'express';
import { ScheduleService } from './schedule.service';
import { CreateScheduleSchema, UpdateScheduleSchema } from './schedule.validation';

export function buildScheduleRouter(scheduleService: ScheduleService): Router {
  const router = Router();

  router.get('/zones/:zoneId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schedules = await scheduleService.listByZone(req.params.zoneId as string);
      res.json({ data: schedules });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schedule = await scheduleService.getById(req.params.id as string);
      res.json({ data: schedule });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = CreateScheduleSchema.parse(req.body);
      const schedule = await scheduleService.create(dto);
      res.status(201).json({ data: schedule });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = UpdateScheduleSchema.parse(req.body);
      const schedule = await scheduleService.update(req.params.id as string, dto);
      res.json({ data: schedule });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      await scheduleService.remove(req.params.id as string);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
