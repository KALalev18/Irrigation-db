import { SensorService } from '../../../src/modules/sensors/sensor.service';
import { SensorRepository } from '../../../src/modules/sensors/sensor.repository';
import { ErrorCode } from '../../../src/shared/errors/AppError';
import { Sensor, SensorReading } from '@prisma/client';

const mockSensor: Sensor = {
  id: 'uuid-sensor-1',
  zoneId: 'uuid-zone-1',
  serialNumber: 'SM-TEST-001',
  type: 'SOIL_MOISTURE',
  unit: '% VWC',
  minValue: 0,
  maxValue: 60,
  installedAt: new Date(),
  isActive: true,
};

function makeMockRepo(overrides: Partial<SensorRepository> = {}): SensorRepository {
  return {
    findById: jest.fn().mockResolvedValue(mockSensor),
    findAll: jest.fn().mockResolvedValue([mockSensor]),
    create: jest.fn().mockResolvedValue(mockSensor),
    deactivate: jest.fn().mockResolvedValue({ ...mockSensor, isActive: false }),
    findLatestReadings: jest.fn().mockResolvedValue([]),
    bulkCreateReadings: jest.fn().mockImplementation(async (rows: unknown[]) => ({ count: rows.length })),
    ...overrides,
  } as unknown as SensorRepository;
}

describe('SensorService.bulkIngest', () => {
  it('marks negative values as anomalies and still inserts them', async () => {
    const repo = makeMockRepo({
      findById: jest.fn().mockResolvedValue(mockSensor),
    });
    const service = new SensorService(repo);

    const result = await service.bulkIngest({
      readings: [
        { sensorId: mockSensor.id, value: -5.2 },
        { sensorId: mockSensor.id, value: 35.0 },
      ],
    });

    expect(result.accepted).toBe(2);
    expect(result.anomalies).toBe(1);
    expect(result.rejected).toBe(0);
    const insertedData = (repo.bulkCreateReadings as jest.Mock).mock.calls[0][0] as SensorReading[];
    const anomalousEntry = insertedData.find((r) => r.value === -5.2);
    expect(anomalousEntry?.isAnomaly).toBe(true);
  });

  it('rejects readings for unknown sensors', async () => {
    const repo = makeMockRepo({ findById: jest.fn().mockResolvedValue(null) });
    const service = new SensorService(repo);

    const result = await service.bulkIngest({
      readings: [{ sensorId: 'non-existent-id', value: 30 }],
    });

    expect(result.rejected).toBe(1);
    expect(result.accepted).toBe(0);
    expect(repo.bulkCreateReadings).not.toHaveBeenCalled();
  });

  it('rejects readings for inactive sensors', async () => {
    const repo = makeMockRepo({
      findById: jest.fn().mockResolvedValue({ ...mockSensor, isActive: false }),
    });
    const service = new SensorService(repo);

    const result = await service.bulkIngest({
      readings: [{ sensorId: mockSensor.id, value: 30 }],
    });

    expect(result.rejected).toBe(1);
  });

  it('flags values outside calibration range as anomalies', async () => {
    const repo = makeMockRepo();
    const service = new SensorService(repo);

    const result = await service.bulkIngest({
      readings: [{ sensorId: mockSensor.id, value: 999 }],
    });

    expect(result.anomalies).toBe(1);
    expect(result.accepted).toBe(1);
  });

  it('reports readings the database skipped as duplicates', async () => {
    const repo = makeMockRepo({ bulkCreateReadings: jest.fn().mockResolvedValue({ count: 1 }) });
    const service = new SensorService(repo);

    const result = await service.bulkIngest({
      readings: [
        { sensorId: mockSensor.id, value: 30, recordedAt: '2026-10-01T06:00:00.000Z' },
        { sensorId: mockSensor.id, value: 31, recordedAt: '2026-10-01T06:10:00.000Z' },
      ],
    });

    expect(result.accepted).toBe(1);
    expect(result.duplicates).toBe(1);
  });
});

describe('SensorService.getById', () => {
  it('throws SENSOR_NOT_FOUND when sensor does not exist', async () => {
    const repo = makeMockRepo({ findById: jest.fn().mockResolvedValue(null) });
    const service = new SensorService(repo);

    await expect(service.getById('missing-id')).rejects.toMatchObject({
      code: ErrorCode.SENSOR_NOT_FOUND,
      statusCode: 404,
    });
  });
});
