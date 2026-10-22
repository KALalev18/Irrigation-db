import { Zone } from '@prisma/client';
import { ZoneRepository } from './zone.repository';
import { CreateZoneDto, UpdateZoneDto } from './zone.validation';
import { AppError, ErrorCode } from '../../shared/errors/AppError';

export class ZoneService {
  constructor(private readonly zoneRepo: ZoneRepository) {}

  async getById(id: string): Promise<Zone> {
    const zone = await this.zoneRepo.findById(id);
    if (!zone) throw AppError.notFound('Zone', id, ErrorCode.ZONE_NOT_FOUND);
    return zone;
  }

  async listAll(): Promise<Zone[]> {
    return this.zoneRepo.findAll();
  }

  async create(dto: CreateZoneDto): Promise<Zone> {
    return this.zoneRepo.create(dto);
  }

  async update(id: string, dto: UpdateZoneDto): Promise<Zone> {
    await this.getById(id);
    return this.zoneRepo.update(id, dto);
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.zoneRepo.delete(id);
  }
}
