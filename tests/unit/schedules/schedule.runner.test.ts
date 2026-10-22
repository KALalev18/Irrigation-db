import { ScheduleRunner } from '../../../src/modules/schedules/schedule.runner';
import { ScheduleRepository } from '../../../src/modules/schedules/schedule.repository';
import { SensorRepository } from '../../../src/modules/sensors/sensor.repository';
import { IrrigationService } from '../../../src/modules/irrigation/irrigation.service';
import { WeatherService } from '../../../src/modules/weather/weather.service';

const schedule = {
  id: 'schedule-1',
  zoneId: 'zone-1',
  cronExpr: '0 6 * * *',
  durationSec: 900,
  isEnabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function setup({ rained = false } = {}) {
  const scheduleRepo = {
    findAllEnabled: jest.fn().mockResolvedValue([schedule]),
  } as unknown as ScheduleRepository;
  const sensorRepo = {
    findAll: jest.fn().mockResolvedValue([{ id: 'sensor-1' }, { id: 'sensor-2' }]),
  } as unknown as SensorRepository;
  const irrigationService = {
    evaluateAndTrigger: jest.fn().mockResolvedValue({ id: 'event-1' }),
  } as unknown as IrrigationService;
  const weatherService = {
    hasSufficientRecentPrecipitation: jest.fn().mockResolvedValue(rained),
  } as unknown as WeatherService;

  const runner = new ScheduleRunner(scheduleRepo, sensorRepo, irrigationService, weatherService);
  return { runner, sensorRepo, irrigationService };
}

describe('ScheduleRunner.tick', () => {
  it('evaluates the zone when a schedule is due', async () => {
    const { runner, sensorRepo, irrigationService } = setup();

    const fired = await runner.tick(new Date(2026, 5, 3, 6, 0));

    expect(fired).toEqual(['schedule-1']);
    expect(sensorRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ zoneId: 'zone-1', type: { equals: 'SOIL_MOISTURE' }, isActive: true }),
    );
    expect(irrigationService.evaluateAndTrigger).toHaveBeenCalledWith('zone-1', ['sensor-1', 'sensor-2'], 900);
  });

  it('does nothing when no schedule is due', async () => {
    const { runner, irrigationService } = setup();

    const fired = await runner.tick(new Date(2026, 5, 3, 7, 0));

    expect(fired).toEqual([]);
    expect(irrigationService.evaluateAndTrigger).not.toHaveBeenCalled();
  });

  it('skips due schedules after enough rain', async () => {
    const { runner, irrigationService } = setup({ rained: true });

    const fired = await runner.tick(new Date(2026, 5, 3, 6, 0));

    expect(fired).toEqual([]);
    expect(irrigationService.evaluateAndTrigger).not.toHaveBeenCalled();
  });

  it('processes each minute only once', async () => {
    const { runner, irrigationService } = setup();

    await runner.tick(new Date(2026, 5, 3, 6, 0, 5));
    await runner.tick(new Date(2026, 5, 3, 6, 0, 20));

    expect(irrigationService.evaluateAndTrigger).toHaveBeenCalledTimes(1);
  });
});
