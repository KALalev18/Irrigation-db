import { z } from 'zod';

// Enums are inlined as literals since the Prisma client may not export them
// before the first `prisma generate` in a fresh checkout.
const IrrigationTrigger = ['SCHEDULED', 'MANUAL', 'SENSOR_THRESHOLD', 'WEATHER_ADJUSTED'] as const;
const IrrigationEventStatus = ['PENDING', 'ACTIVE', 'COMPLETED', 'FAILED', 'SKIPPED'] as const;

export const StartIrrigationSchema = z.object({
  zoneId: z.string().uuid(),
  trigger: z.enum(IrrigationTrigger),
  durationSec: z.number().int().min(1).max(86400),
  notes: z.string().max(500).optional(),
});

export const UpdateIrrigationEventSchema = z.object({
  status: z.enum(IrrigationEventStatus),
  volumeLiters: z.number().positive().optional(),
  notes: z.string().max(500).optional(),
});

export type StartIrrigationDto = z.infer<typeof StartIrrigationSchema>;
export type UpdateIrrigationEventDto = z.infer<typeof UpdateIrrigationEventSchema>;
