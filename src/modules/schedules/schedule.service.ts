import { Prisma } from '@prisma/client';
import { ScheduleRepository } from './schedule.repository';
import { CreateScheduleDto, UpdateScheduleDto } from './schedule.validation';
import { AppError, ErrorCode } from '../../shared/errors/AppError';

type Schedule = Prisma.ScheduleGetPayload<Record<string, never>>;

export class ScheduleService {
  constructor(private readonly scheduleRepo: ScheduleRepository) {}

  async getById(id: string): Promise<Schedule> {
    const schedule = await this.scheduleRepo.findById(id);
    if (!schedule) throw AppError.notFound('Schedule', id, ErrorCode.SCHEDULE_NOT_FOUND);
    return schedule;
  }

  async listByZone(zoneId: string): Promise<Schedule[]> {
    return this.scheduleRepo.findByZone(zoneId);
  }

  async create(dto: CreateScheduleDto): Promise<Schedule> {
    return this.scheduleRepo.create(dto);
  }

  async update(id: string, dto: UpdateScheduleDto): Promise<Schedule> {
    await this.getById(id);
    return this.scheduleRepo.update(id, dto);
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.scheduleRepo.delete(id);
  }
}
