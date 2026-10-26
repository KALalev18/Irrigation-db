import { IrrigationService } from '../../../src/modules/irrigation/irrigation.service';
import { IrrigationRepository } from '../../../src/modules/irrigation/irrigation.repository';
import { SensorRepository } from '../../../src/modules/sensors/sensor.repository';
import { SensorReading } from '@prisma/client';

function mockReading(value: number, isAnomaly = false): SensorReading {
  return {
    id: BigInt(Math.floor(Math.random() * 1e9)),
    sensorId: 'sensor-1',
    value,
    recordedAt: new Date(),
    isAnomaly,
  };
}

function makeMockIrrigationRepo(): IrrigationRepository {
  return {
    create: jest.fn().mockResolvedValue({ id: 'event-1', status: 'ACTIVE' }),
    findActiveByZone: jest.fn().mockResolvedValue(null),
    findById: jest.fn(),
    findByZone: jest.fn(),
    complete: jest.fn(),
  } as unknown as IrrigationRepository;
}

describe('IrrigationService.evaluateAndTrigger', () => {
  it('returns null when no sensors are provided', async () => {
    const irrigationRepo = makeMockIrrigationRepo();
    const sensorRepo = { findLatestReadings: jest.fn() } as unknown as SensorRepository;
    const service = new IrrigationService(irrigationRepo, sensorRepo);

    const result = await service.evaluateAndTrigger('zone-1', []);
    expect(result).toBeNull();
    expect(irrigationRepo.create).not.toHaveBeenCalled();
  });

  it('returns null when no readings are available', async () => {
    const irrigationRepo = makeMockIrrigationRepo();
    const sensorRepo = { findLatestReadings: jest.fn().mockResolvedValue([]) } as unknown as SensorRepository;
    const service = new IrrigationService(irrigationRepo, sensorRepo);

    const result = await service.evaluateAndTrigger('zone-1', ['sensor-1']);
    expect(result).toBeNull();
  });

  it('aborts when anomaly ratio exceeds threshold', async () => {
    const irrigationRepo = makeMockIrrigationRepo();
    const sensorRepo = {
      findLatestReadings: jest
        .fn()
        .mockResolvedValueOnce([mockReading(-5, true)])
        .mockResolvedValueOnce([mockReading(-3, true)]),
    } as unknown as SensorRepository;
    const service = new IrrigationService(irrigationRepo, sensorRepo);

    const result = await service.evaluateAndTrigger('zone-1', ['sensor-1', 'sensor-2']);
    expect(result).toBeNull();
  });

  it('triggers irrigation when average moisture is below threshold', async () => {
    const irrigationRepo = makeMockIrrigationRepo();
    const sensorRepo = {
      findLatestReadings: jest.fn().mockResolvedValue([mockReading(20)]),
    } as unknown as SensorRepository;
    const service = new IrrigationService(irrigationRepo, sensorRepo);

    const result = await service.evaluateAndTrigger('zone-1', ['sensor-1']);
    expect(result).not.toBeNull();
    expect(irrigationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'SENSOR_THRESHOLD' }),
    );
  });

  it('skips irrigation when moisture is sufficient', async () => {
    const irrigationRepo = makeMockIrrigationRepo();
    const sensorRepo = {
      findLatestReadings: jest.fn().mockResolvedValue([mockReading(45)]),
    } as unknown as SensorRepository;
    const service = new IrrigationService(irrigationRepo, sensorRepo);

    const result = await service.evaluateAndTrigger('zone-1', ['sensor-1']);
    expect(result).toBeNull();
  });

  it('does not start a second event while the zone is already irrigating', async () => {
    const irrigationRepo = makeMockIrrigationRepo();
    (irrigationRepo.findActiveByZone as jest.Mock).mockResolvedValue({ id: 'event-0', status: 'ACTIVE' });
    const sensorRepo = {
      findLatestReadings: jest.fn().mockResolvedValue([mockReading(10)]),
    } as unknown as SensorRepository;
    const service = new IrrigationService(irrigationRepo, sensorRepo);

    const result = await service.evaluateAndTrigger('zone-1', ['sensor-1']);
    expect(result).toBeNull();
    expect(irrigationRepo.create).not.toHaveBeenCalled();
  });
});
