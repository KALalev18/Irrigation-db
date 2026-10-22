import { PrismaClient, Prisma } from '@prisma/client';
import { CreateScheduleDto, UpdateScheduleDto } from './schedule.validation';

type Schedule = Prisma.ScheduleGetPayload<Record<string, never>>;

export class ScheduleRepository {
  constructor(private readonly db: PrismaClient) {}

  async findById(id: string): Promise<Schedule | null> {
    return this.db.schedule.findUnique({ where: { id } });
  }

  async findByZone(zoneId: string): Promise<Schedule[]> {
    return this.db.schedule.findMany({
      where: { zoneId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllEnabled(): Promise<Schedule[]> {
    return this.db.schedule.findMany({ where: { isEnabled: true } });
  }

  async create(dto: CreateScheduleDto): Promise<Schedule> {
    return this.db.schedule.create({ data: dto });
  }

  async update(id: string, dto: UpdateScheduleDto): Promise<Schedule> {
    return this.db.schedule.update({ where: { id }, data: dto });
  }

  async delete(id: string): Promise<void> {
    await this.db.schedule.delete({ where: { id } });
  }
}
