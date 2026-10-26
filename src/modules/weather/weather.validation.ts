import { z } from 'zod';

export const CreateWeatherSnapshotSchema = z.object({
  recordedAt: z.string().datetime(),
  temperatureC: z.number().min(-60).max(60),
  humidityPct: z.number().min(0).max(100),
  precipitationMm: z.number().min(0),
  windSpeedMs: z.number().min(0),
  evapotranspirationMm: z.number().min(0),
  source: z.string().min(1).max(100),
});

// Query for GET /weather/external (Open-Meteo proxy)
export const ExternalWeatherQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  timezone: z.string().max(64).default('UTC'),
  past_days: z.coerce.number().int().min(0).max(14).default(7),
});

export type CreateWeatherSnapshotDto = z.infer<typeof CreateWeatherSnapshotSchema>;
