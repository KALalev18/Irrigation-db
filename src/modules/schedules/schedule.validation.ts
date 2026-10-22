import { z } from 'zod';

export const CreateScheduleSchema = z.object({
  zoneId: z.string().uuid(),
  // Cron expression is validated syntactically here; semantic validation
  // (e.g., no conflicting schedules) is enforced in the service layer.
  cronExpr: z
    .string()
    .regex(
      /^(\*|[0-9,-/]+)\s(\*|[0-9,-/]+)\s(\*|[0-9,-/]+)\s(\*|[0-9,-/]+)\s(\*|[0-9,-/]+)$/,
      'Invalid cron expression',
    ),
  durationSec: z.number().int().min(30).max(86400),
  isEnabled: z.boolean().default(true),
});

export const UpdateScheduleSchema = z.object({
  cronExpr: z
    .string()
    .regex(
      /^(\*|[0-9,-/]+)\s(\*|[0-9,-/]+)\s(\*|[0-9,-/]+)\s(\*|[0-9,-/]+)\s(\*|[0-9,-/]+)$/,
    )
    .optional(),
  durationSec: z.number().int().min(30).max(86400).optional(),
  isEnabled: z.boolean().optional(),
});

export type CreateScheduleDto = z.infer<typeof CreateScheduleSchema>;
export type UpdateScheduleDto = z.infer<typeof UpdateScheduleSchema>;
