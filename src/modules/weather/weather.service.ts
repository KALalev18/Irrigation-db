import { WeatherSnapshot } from '@prisma/client';
import { WeatherRepository } from './weather.repository';
import { CreateWeatherSnapshotDto } from './weather.validation';

export class WeatherService {
  constructor(private readonly weatherRepo: WeatherRepository) {}

  async record(dto: CreateWeatherSnapshotDto): Promise<WeatherSnapshot> {
    return this.weatherRepo.create(dto);
  }

  async getLatest(limit = 48): Promise<WeatherSnapshot[]> {
    return this.weatherRepo.findLatest(limit);
  }

  async getRange(from: Date, to: Date): Promise<WeatherSnapshot[]> {
    return this.weatherRepo.findInRange(from, to);
  }

  // Returns true if recent precipitation makes irrigation unnecessary.
  // ScheduleRunner skips scheduled runs when the last 24 h of snapshots add up to 5 mm or more.
  async hasSufficientRecentPrecipitation(): Promise<boolean> {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const snapshots = await this.weatherRepo.findInRange(yesterday, new Date());
    const totalPrecip = snapshots.reduce((sum, s) => sum + s.precipitationMm, 0);
    return totalPrecip >= 5;
  }
}
