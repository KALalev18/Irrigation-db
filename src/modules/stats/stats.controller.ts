import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { StatsRepository } from './stats.repository';

const QueryPlanSchema = z.object({
  sensorId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});

export function buildStatsRouter(statsRepo: StatsRepository): Router {
  const router = Router();

  // GET /api/v1/stats
  router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [counts, last24h, databaseSizeBytes, recentEvents] = await Promise.all([
        statsRepo.counts(),
        statsRepo.readingsSince(since),
        statsRepo.databaseSizeBytes(),
        statsRepo.recentEvents(8),
      ]);
      res.json({ data: { counts, last24h, databaseSizeBytes, recentEvents } });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/stats/query-plan?sensorId=&limit=
  // Runs EXPLAIN ANALYZE on the dashboard's latest-readings query.
  router.get('/query-plan', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sensorId, limit } = QueryPlanSchema.parse(req.query);
      const plan = await statsRepo.explainLatestReadings(sensorId, limit);
      res.json({ data: plan });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
