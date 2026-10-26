// All SQL for the Sensor and SensorReading models.
// Only this layer imports PrismaClient — services work with plain Prisma types.
import { PrismaClient, Sensor, SensorReading, Prisma } from '@prisma/client';
import { CreateSensorDto } from './sensor.validation';

export class SensorRepository {
  constructor(private readonly db: PrismaClient) {}

  async findById(id: string): Promise<Sensor | null> {
    return this.db.sensor.findUnique({ where: { id } });
  }

  async findAll(params: {
    zoneId?: string;
    type?: Prisma.EnumSensorTypeFilter;
    isActive?: boolean;
    limit: number;
    offset: number;
  }): Promise<Sensor[]> {
    return this.db.sensor.findMany({
      where: {
        ...(params.zoneId && { zoneId: params.zoneId }),
        ...(params.type && { type: params.type }),
        ...(params.isActive !== undefined && { isActive: params.isActive }),
      },
      take: params.limit,
      skip: params.offset,
      orderBy: { installedAt: 'desc' },
    });
  }

  async create(data: CreateSensorDto): Promise<Sensor> {
    return this.db.sensor.create({ data });
  }

  async deactivate(id: string): Promise<Sensor> {
    return this.db.sensor.update({ where: { id }, data: { isActive: false } });
  }

  // Composite index on (sensor_id, recorded_at DESC) lets Postgres satisfy
  // the ORDER BY from the index itself rather than sorting after the fetch.
  async findLatestReadings(sensorId: string, limit: number): Promise<SensorReading[]> {
    return this.db.sensorReading.findMany({
      where: { sensorId },
      orderBy: { recordedAt: 'desc' },
      take: limit,
    });
  }

  // Skips rows that hit the unique (sensor_id, recorded_at) index; returns the inserted count
  async bulkCreateReadings(data: Prisma.SensorReadingCreateManyInput[]): Promise<Prisma.BatchPayload> {
    return this.db.sensorReading.createMany({ data, skipDuplicates: true });
  }
}
