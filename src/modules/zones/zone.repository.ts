import { PrismaClient, Zone } from '@prisma/client';
import { CreateZoneDto, UpdateZoneDto } from './zone.validation';

export class ZoneRepository {
  constructor(private readonly db: PrismaClient) {}

  async findById(id: string): Promise<Zone | null> {
    return this.db.zone.findUnique({ where: { id } });
  }

  async findAll(): Promise<Zone[]> {
    return this.db.zone.findMany({ orderBy: { name: 'asc' } });
  }

  async create(dto: CreateZoneDto): Promise<Zone> {
    return this.db.zone.create({ data: dto });
  }

  async update(id: string, dto: UpdateZoneDto): Promise<Zone> {
    return this.db.zone.update({ where: { id }, data: dto });
  }

  async delete(id: string): Promise<void> {
    await this.db.zone.delete({ where: { id } });
  }
}
