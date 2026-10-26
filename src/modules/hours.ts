export type Interval = { opens: string; closes: string; nextDay?: boolean };
export type WeeklyInterval = Interval & { weekday: number };
export type Exception = {
  date: string;
  closed: boolean;
  intervals: Interval[];
};
const minutes = (clock: string) =>
  Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));
export function overlappingHours(hours: WeeklyInterval[]) {
  const intervals: Array<[number, number]> = [];
  for (const row of hours) {
    const start = row.weekday * 1440 + minutes(row.opens);
    const end =
      row.weekday * 1440 + minutes(row.closes) + (row.nextDay ? 1440 : 0);
    if (end > 10080) {
      intervals.push([start, 10080], [0, end - 10080]);
    } else intervals.push([start, end]);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  return intervals.some(
    (row, index) => index > 0 && row[0] < intervals[index - 1][1],
  );
}
function localParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minute: Number(get("hour")) * 60 + Number(get("minute")),
  };
}
export function isOpenAt(
  instant: Date,
  timeZone: string,
  weekly: WeeklyInterval[],
  exceptions: Exception[],
) {
  const local = localParts(instant, timeZone);
  const midnight = new Date(local.date + "T00:00:00Z");
  const previous = new Date(midnight.getTime() - 86400000)
    .toISOString()
    .slice(0, 10);
  const forDate = (date: string) => {
    const exception = exceptions.find((e) => e.date === date);
    if (exception) return exception.closed ? [] : exception.intervals;
    const weekday = new Date(date + "T00:00:00Z").getUTCDay();
    return weekly.filter((h) => h.weekday === weekday);
  };
  return (
    forDate(local.date).some(
      (h) =>
        local.minute >= minutes(h.opens) &&
        (h.nextDay || local.minute < minutes(h.closes)),
    ) ||
    forDate(previous).some((h) => h.nextDay && local.minute < minutes(h.closes))
  );
}
