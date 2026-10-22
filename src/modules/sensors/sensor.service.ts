// Sensor domain logic — CRUD + IoT bulk ingest.
// IrrigationService reads from SensorRepository directly (cross-module),
// so wire both repos there rather than proxying through here.
import { Sensor, SensorReading, Prisma } from '@prisma/client';
import { SensorRepository } from './sensor.repository';
import { CreateSensorDto, BulkIngestReadingDto } from './sensor.validation';
import { AppError, ErrorCode } from '../../shared/errors/AppError';
import { logger } from '../../infrastructure/logger';

type IngestResult = {
  accepted: number;
  rejected: number; // unknown or deactivated sensor
  anomalies: number; // stored with isAnomaly=true, not dropped
};

export class SensorService {
  constructor(private readonly repo: SensorRepository) {}

  async getById(id: string): Promise<Sensor> {
    const sensor = await this.repo.findById(id);
    if (!sensor) throw AppError.notFound('Sensor', id, ErrorCode.SENSOR_NOT_FOUND);
    return sensor;
  }

  async list(params: {
    zoneId?: string;
    type?: Prisma.EnumSensorTypeFilter;
    isActive?: boolean;
    limit: number;
    offset: number;
  }): Promise<Sensor[]> {
    return this.repo.findAll(params);
  }

  async register(dto: CreateSensorDto): Promise<Sensor> {
    return this.repo.create(dto);
  }

  async deactivate(id: string): Promise<Sensor> {
    await this.getById(id);
    return this.repo.deactivate(id);
  }

  async getLatestReadings(sensorId: string, limit = 100): Promise<SensorReading[]> {
    await this.getById(sensorId);
    return this.repo.findLatestReadings(sensorId, limit);
  }

  async bulkIngest(dto: BulkIngestReadingDto): Promise<IngestResult> {
    const result: IngestResult = { accepted: 0, rejected: 0, anomalies: 0 };

    // batch-fetch all referenced sensors to avoid N+1 inside the loop
    const uniqueIds = [...new Set(dto.readings.map((r) => r.sensorId))];
    const found = await Promise.all(uniqueIds.map((id) => this.repo.findById(id)));
    const sensorMap = new Map(
      found.filter((s): s is Sensor => s !== null).map((s) => [s.id, s]),
    );

    const toInsert: Prisma.SensorReadingCreateManyInput[] = [];

    for (const reading of dto.readings) {
      const sensor = sensorMap.get(reading.sensorId);

      if (!sensor) {
        logger.warn('Dropping reading: unknown sensor', { sensorId: reading.sensorId });
        result.rejected++;
        continue;
      }

      if (!sensor.isActive) {
        logger.warn('Dropping reading: sensor deactivated', { sensorId: sensor.id });
        result.rejected++;
        continue;
      }

      // out-of-range values stored with isAnomaly=true rather than dropped — audit trail
      // survives recalibration, and irrigation.service can abort when the rate is too high.
      const isAnomaly =
        reading.value < 0 ||
        reading.value < sensor.minValue ||
        reading.value > sensor.maxValue;

      if (isAnomaly) {
        logger.warn('Anomalous reading', {
          sensorId: sensor.id,
          value: reading.value,
          range: [sensor.minValue, sensor.maxValue],
        });
        result.anomalies++;
      }

      toInsert.push({
        sensorId: reading.sensorId,
        value: reading.value,
        recordedAt: reading.recordedAt ? new Date(reading.recordedAt) : new Date(),
        isAnomaly,
      });
      result.accepted++;
    }

    // skipDuplicates handles gateway replays after a connectivity outage
    if (toInsert.length > 0) {
      await this.repo.bulkCreateReadings(toInsert);
    }

    return result;
  }
}

