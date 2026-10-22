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

export type CreateWeatherSnapshotDto = z.infer<typeof CreateWeatherSnapshotSchema>;
