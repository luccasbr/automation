export function DATE(date: { day: number; month: number; year: number } | Date) {
  const now = Date.now();
  let targetDate: Date;

  if (!(date instanceof Date)) {
    targetDate = new Date(date.year, date.month - 1, date.day);
  }

  const diff = targetDate.getTime() - now;

  return diff < 0 ? 0 : diff;
}

export function MONTHS(months: number) {
  return DAYS(30 * months);
}

export function WEEK(weeks: number) {
  return DAYS(7 * weeks);
}

export function DAYS(days: number) {
  return HOURS(24 * days);
}

export function HOURS(hours: number) {
  return MINUTES(60 * hours);
}

export function MINUTES(minutes: number) {
  return SECONDS(60 * minutes);
}

export function SECONDS(seconds: number) {
  return 1000 * seconds;
}

export const NEVER = 0;
