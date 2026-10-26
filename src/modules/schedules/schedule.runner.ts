// Once per minute: closes irrigation events whose duration has passed, then
// checks enabled schedules. When a schedule is due, it skips
// the run if it rained enough in the last 24 h, otherwise it hands the zone's
// soil moisture sensors to IrrigationService, which decides whether to water.
import { ScheduleRepository } from './schedule.repository';
import { SensorRepository } from '../sensors/sensor.repository';
import { IrrigationService } from '../irrigation/irrigation.service';
import { WeatherService } from '../weather/weather.service';
import { cronMatches } from './cron';
import { logger } from '../../infrastructure/logger';

export class ScheduleRunner {
  private timer?: NodeJS.Timeout;
  private lastMinute = '';

  constructor(
    private readonly scheduleRepo: ScheduleRepository,
    private readonly sensorRepo: SensorRepository,
    private readonly irrigationService: IrrigationService,
    private readonly weatherService: WeatherService,
  ) {}

  start(intervalMs = 15_000): void {
    // Poll more often than once a minute so a slow tick can't skip a minute;
    // lastMinute makes sure each minute is only processed once.
    this.timer = setInterval(() => {
      this.tick(new Date()).catch((err) => logger.error('Schedule tick failed', { err }));
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // Returns the ids of schedules that fired this minute (used by tests).
  async tick(now: Date): Promise<string[]> {
    const minuteKey = now.toISOString().slice(0, 16);
    if (minuteKey === this.lastMinute) return [];
    this.lastMinute = minuteKey;

    await this.irrigationService.completeFinished(now);

    const due = (await this.scheduleRepo.findAllEnabled()).filter((s) => cronMatches(s.cronExpr, now));
    if (due.length === 0) return [];

    if (await this.weatherService.hasSufficientRecentPrecipitation()) {
      logger.info('Skipping scheduled irrigation: enough rain in the last 24h', {
        scheduleIds: due.map((s) => s.id),
      });
      return [];
    }

    const fired: string[] = [];
    for (const schedule of due) {
      const sensors = await this.sensorRepo.findAll({
        zoneId: schedule.zoneId,
        type: { equals: 'SOIL_MOISTURE' },
        isActive: true,
        limit: 100,
        offset: 0,
      });
      const event = await this.irrigationService.evaluateAndTrigger(
        schedule.zoneId,
        sensors.map((s) => s.id),
        schedule.durationSec,
      );
      if (event) fired.push(schedule.id);
    }
    return fired;
  }
}
