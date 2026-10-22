import { z } from 'zod';

export const CreateZoneSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  areaM2: z.number().positive(),
  cropType: z.string().min(1).max(100),
});

export const UpdateZoneSchema = CreateZoneSchema.partial();

export type CreateZoneDto = z.infer<typeof CreateZoneSchema>;
export type UpdateZoneDto = z.infer<typeof UpdateZoneSchema>;
