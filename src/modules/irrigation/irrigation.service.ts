// Irrigation event lifecycle + sensor-driven auto-trigger logic.
import { Prisma } from '@prisma/client';
import { IrrigationRepository } from './irrigation.repository';
import { SensorRepository } from '../sensors/sensor.repository';
import { StartIrrigationDto, UpdateIrrigationEventDto } from './irrigation.validation';
import { AppError, ErrorCode } from '../../shared/errors/AppError';
import { logger } from '../../infrastructure/logger';

type IrrigationEvent = Prisma.IrrigationEventGetPayload<Record<string, never>>;

// Minimum avg soil moisture (% VWC) before auto-irrigation fires.
// Matches the dashed line on the dashboard chart.
const MOISTURE_THRESHOLD_PCT = 30;

// Abort auto-irrigation if this fraction of sensor readings are anomalous.
// Prevents a broken sensor stuck at 0% from flooding the field every cycle.
const ANOMALY_ABORT_RATIO = 0.5;

export class IrrigationService {
  constructor(
    private readonly irrigationRepo: IrrigationRepository,
    private readonly sensorRepo: SensorRepository,
  ) {}

  async start(dto: StartIrrigationDto): Promise<IrrigationEvent> {
    return this.irrigationRepo.create(dto);
  }

  async getById(id: string): Promise<IrrigationEvent> {
    const event = await this.irrigationRepo.findById(id);
    if (!event) throw AppError.notFound('IrrigationEvent', id, ErrorCode.IRRIGATION_EVENT_NOT_FOUND);
    return event;
  }

  async listByZone(
    zoneId: string,
    params: { limit: number; offset: number },
  ): Promise<IrrigationEvent[]> {
    return this.irrigationRepo.findByZone(zoneId, params);
  }

  async complete(id: string, dto: UpdateIrrigationEventDto): Promise<IrrigationEvent> {
    await this.getById(id);
    return this.irrigationRepo.complete(id, dto);
  }

  // Called by the schedule runner before firing a SENSOR_THRESHOLD event.
  // Returns null if conditions don't warrant irrigation (and logs the reason).
  async evaluateAndTrigger(zoneId: string, moistureSensors: string[]): Promise<IrrigationEvent | null> {
    if (moistureSensors.length === 0) {
      logger.warn('No moisture sensors configured for zone', { zoneId });
      return null;
    }

    const latestReadings = await Promise.all(
      moistureSensors.map((id) => this.sensorRepo.findLatestReadings(id, 1)),
    );
    const flat = latestReadings.flat();

    if (flat.length === 0) {
      logger.warn('No sensor readings available', { zoneId });
      return null;
    }

    // Gate 1: abort if too many sensors report broken values.
    // A sensor stuck at 0% would otherwise trigger irrigation every cycle.
    const anomalyCount = flat.filter((r) => r.isAnomaly).length;
    if (anomalyCount / flat.length >= ANOMALY_ABORT_RATIO) {
      logger.warn('Anomaly ratio too high, skipping auto-irrigation', { zoneId, anomalyCount, total: flat.length });
      return null;
    }

    const validReadings = flat.filter((r) => !r.isAnomaly && r.value >= 0);
    if (validReadings.length === 0) {
      logger.warn('All readings anomalous, cannot determine moisture level', { zoneId });
      return null;
    }

    const avgMoisture = validReadings.reduce((sum, r) => sum + r.value, 0) / validReadings.length;

    // Gate 2: moisture threshold check
    if (avgMoisture >= MOISTURE_THRESHOLD_PCT) {
      logger.debug('Moisture sufficient', { zoneId, avgMoisture });
      return null;
    }

    logger.info('Moisture below threshold, triggering irrigation', { zoneId, avgMoisture });
    return this.irrigationRepo.create({
      zoneId,
      trigger: 'SENSOR_THRESHOLD',
      durationSec: 600,
    });
  }
}

