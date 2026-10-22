import { cronMatches } from '../../../src/modules/schedules/cron';

// 2026-06-03 is a Wednesday (day of week 3)
const at = (h: number, m: number) => new Date(2026, 5, 3, h, m);

describe('cronMatches', () => {
  it('matches an exact daily time', () => {
    expect(cronMatches('0 6 * * *', at(6, 0))).toBe(true);
    expect(cronMatches('0 6 * * *', at(6, 1))).toBe(false);
    expect(cronMatches('0 6 * * *', at(7, 0))).toBe(false);
  });

  it('matches day-of-week lists', () => {
    expect(cronMatches('0 18 * * 1,3,5', at(18, 0))).toBe(true);
    expect(cronMatches('0 18 * * 2,4', at(18, 0))).toBe(false);
  });

  it('matches steps and ranges', () => {
    expect(cronMatches('*/15 * * * *', at(10, 45))).toBe(true);
    expect(cronMatches('*/15 * * * *', at(10, 50))).toBe(false);
    expect(cronMatches('0 8-17 * * *', at(12, 0))).toBe(true);
    expect(cronMatches('0 8-17 * * *', at(18, 0))).toBe(false);
    expect(cronMatches('0-30/10 * * * *', at(1, 20))).toBe(true);
    expect(cronMatches('0-30/10 * * * *', at(1, 40))).toBe(false);
  });

  it('rejects malformed expressions instead of matching', () => {
    expect(cronMatches('0 6 * *', at(6, 0))).toBe(false);
    expect(cronMatches('a 6 * * *', at(6, 0))).toBe(false);
    expect(cronMatches('*/0 * * * *', at(6, 0))).toBe(false);
  });
});
