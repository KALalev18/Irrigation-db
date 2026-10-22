// Weather HTTP router — stored snapshots, new snapshot recording, and Open-Meteo proxy.
import { Router, Request, Response, NextFunction } from 'express';
import { WeatherService } from './weather.service';
import { CreateWeatherSnapshotSchema } from './weather.validation';

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
      const lat  = parseFloat(req.query.lat as string);
      const lon  = parseFloat(req.query.lon as string);
      const tz   = (req.query.timezone as string) || 'UTC';
      const days = Math.min(parseInt((req.query.past_days as string) || '7', 10), 14);

      if (isNaN(lat) || lat < -90  || lat > 90)  { res.status(400).json({ error: 'Invalid lat' }); return; }
      if (isNaN(lon) || lon < -180 || lon > 180) { res.status(400).json({ error: 'Invalid lon' }); return; }

      const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${lat}&longitude=${lon}` +
        `&hourly=soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_moisture_3_to_9cm` +
        `,precipitation,temperature_2m,relative_humidity_2m,et0_fao_evapotranspiration` +
        `&past_days=${days}&forecast_days=1&timezone=${encodeURIComponent(tz)}`;

      const upstream = await fetch(url);
      if (!upstream.ok) {
        res.status(502).json({ error: `Open-Meteo responded with ${upstream.status}` });
        return;
      }
      const data = await upstream.json() as unknown;
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
