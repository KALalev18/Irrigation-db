// Minimal 5-field cron matcher (minute hour day-of-month month day-of-week).
// Supports the syntax CreateScheduleSchema accepts: *, numbers, lists (1,3,5),
// ranges (1-5) and steps (*/15, 0-30/10). Day-of-week uses 0 = Sunday.

const FIELD_RANGES: Array<[number, number]> = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6], // day of week
];

function fieldMatches(field: string, value: number, [min, max]: [number, number]): boolean {
  return field.split(',').some((part) => {
    const [rangePart, stepPart] = part.split('/');
    const step = stepPart ? parseInt(stepPart, 10) : 1;

    let start = min;
    let end = max;
    if (rangePart !== '*') {
      const [a, b] = rangePart.split('-').map((n) => parseInt(n, 10));
      start = a;
      // "5/10" means "from 5 to max, every 10"; a plain "5" means just 5
      end = b ?? (stepPart ? max : a);
    }

    if (Number.isNaN(start) || Number.isNaN(end) || Number.isNaN(step) || step < 1) return false;
    return value >= start && value <= end && (value - start) % step === 0;
  });
}

export function cronMatches(expr: string, date: Date): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;

  const values = [date.getMinutes(), date.getHours(), date.getDate(), date.getMonth() + 1, date.getDay()];

  return fields.every((field, i) => fieldMatches(field, values[i], FIELD_RANGES[i]));
}
