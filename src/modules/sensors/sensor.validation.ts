// Zod schemas for the Sensor domain.
import { z } from 'zod';
import { SensorType } from '@prisma/client';

export const CreateSensorSchema = z.object({
  zoneId:       z.string().uuid(),
  // Serial numbers identify physical hardware: uppercase alphanumeric only,
  // 4-64 chars.
  serialNumber: z.string().min(4).max(64).regex(/^[A-Z0-9_-]+$/, 'Serial must be uppercase alphanumeric'),
  type:         z.nativeEnum(SensorType),
  unit:         z.string().min(1).max(20),
  // Calibration bounds — the service uses these to flag anomalous readings.
  minValue:     z.number(),
  maxValue:     z.number(),
}).refine((d) => d.maxValue > d.minValue, {
  message: 'maxValue must be strictly greater than minValue',
  path: ['maxValue'],
});

export const IngestReadingSchema = z.object({
  sensorId:   z.string().uuid(),
  value:      z.number().finite(), // Reject NaN / Infinity at the boundary
  // ISO-8601 datetime string from the gateway; optional — server time is used
  // if the gateway firmware doesn’t embed timestamps.
  recordedAt: z.string().datetime().optional(),
});

export const BulkIngestReadingSchema = z.object({
  // Min 1 (empty batch is a client bug), max 500 (keeps payload under 1 MB).
  readings: z.array(IngestReadingSchema).min(1).max(500),
});

export const SensorQuerySchema = z.object({
  limit:    z.coerce.number().int().min(1).max(1000).default(100),
  offset:   z.coerce.number().int().min(0).default(0),
  type:     z.nativeEnum(SensorType).optional(),
  isActive: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

export type CreateSensorDto       = z.infer<typeof CreateSensorSchema>;
export type IngestReadingDto      = z.infer<typeof IngestReadingSchema>;
export type BulkIngestReadingDto  = z.infer<typeof BulkIngestReadingSchema>;
export type SensorQueryDto        = z.infer<typeof SensorQuerySchema>;
