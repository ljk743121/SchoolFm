/** 日期工具：全部以 YYYY-MM-DD 字符串为唯一表示，避免时区偏移 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateString(value: string): boolean {
  return DATE_RE.test(value);
}

/** 解析为 UTC 时间戳，仅用于日期差值计算 */
export function dateToUtcMs(dateStr: string): number {
  const match = DATE_RE.exec(dateStr);
  if (!match)
    throw new Error(`非法日期：${dateStr}`);
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

/** b - a 的自然日差值（可为负） */
export function diffDays(a: string, b: string): number {
  return Math.round((dateToUtcMs(b) - dateToUtcMs(a)) / 86_400_000);
}

export function addDays(dateStr: string, n: number): string {
  const next = new Date(dateToUtcMs(dateStr) + n * 86_400_000);
  const year = next.getUTCFullYear();
  const month = String(next.getUTCMonth() + 1).padStart(2, "0");
  const day = String(next.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** 含首尾的日期区间 */
export function getDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  if (diffDays(start, end) < 0)
    return dates;
  for (let date = start; date <= end; date = addDays(date, 1))
    dates.push(date);
  return dates;
}

/** 以本地日历取“今天”，与数据库中的 YYYY-MM-DD 语义一致 */
export function localToday(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
