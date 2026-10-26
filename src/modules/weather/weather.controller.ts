// Weather HTTP router — stored snapshots, new snapshot recording, and Open-Meteo proxy.
import { Router, Request, Response, NextFunction } from 'express';
import { WeatherService } from './weather.service';
import { CreateWeatherSnapshotSchema, ExternalWeatherQuerySchema } from './weather.validation';
import { AppError, ErrorCode } from '../../shared/errors/AppError';

export function buildWeatherRouter(weatherService: WeatherService): Router {
  const router = Router();

  // GET /api/v1/weather?from=ISO&to=ISO  — date range
  // GET /api/v1/weather?limit=48         — latest N snapshots (default 48h worth)
  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.query.from && req.query.to) {
        const from = new Date(req.query.from as string);
        const to = new Date(req.query.to as string);
        const snapshots = await weatherService.getRange(from, to);
        res.json({ data: snapshots });
        return;
      }
      // Cap at 720 = 30 days of hourly data
      const limit = Math.min(parseInt((req.query.limit as string) ?? '48', 10), 720);
      const snapshots = await weatherService.getLatest(limit);
      res.json({ data: snapshots });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = CreateWeatherSnapshotSchema.parse(req.body);
      const snapshot = await weatherService.record(dto);
      res.status(201).json({ data: snapshot });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/v1/weather/external?lat=&lon=&timezone=&past_days=
  router.get('/external', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { lat, lon, timezone: tz, past_days: days } = ExternalWeatherQuerySchema.parse(req.query);

      const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${lat}&longitude=${lon}` +
        `&hourly=soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_moisture_3_to_9cm` +
        `,precipitation,temperature_2m,relative_humidity_2m,et0_fao_evapotranspiration` +
        `&past_days=${days}&forecast_days=1&timezone=${encodeURIComponent(tz)}`;

      const upstream = await fetch(url);
      if (!upstream.ok) {
        throw new AppError(`Open-Meteo responded with ${upstream.status}`, ErrorCode.UPSTREAM_ERROR, 502);
      }
      const data = (await upstream.json()) as unknown;
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
