import { PrismaClient, WeatherSnapshot } from '@prisma/client';
import { CreateWeatherSnapshotDto } from './weather.validation';

export class WeatherRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(dto: CreateWeatherSnapshotDto): Promise<WeatherSnapshot> {
    return this.db.weatherSnapshot.create({
      data: { ...dto, recordedAt: new Date(dto.recordedAt) },
    });
  }

  async findLatest(limit = 48): Promise<WeatherSnapshot[]> {
    return this.db.weatherSnapshot.findMany({
      orderBy: { recordedAt: 'desc' },
      take: limit,
    });
  }

  async findInRange(from: Date, to: Date): Promise<WeatherSnapshot[]> {
    return this.db.weatherSnapshot.findMany({
      where: { recordedAt: { gte: from, lte: to } },
      orderBy: { recordedAt: 'asc' },
    });
  }
}
