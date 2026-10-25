import { Temporal } from '@js-temporal/polyfill';

/** Deliberate compatible policy: fold chooses first occurrence; gap advances by transition length. */
export function routineInstant(date: string, time: string, timeZone: string): number {
  return Temporal.ZonedDateTime.from(`${date}T${time}[${timeZone}]`, { disambiguation: 'compatible' }).epochMilliseconds;
}
export function routineDate(instant: number, timeZone: string): string {
  return Temporal.Instant.fromEpochMilliseconds(instant).toZonedDateTimeISO(timeZone).toPlainDate().toString();
}
export function calendarAnniversary(birthDate: string, months: number): string {
  return Temporal.PlainDate.from(birthDate).add({ months }, { overflow: 'constrain' }).toString();
}
export function routineDayBounds(date: string, timeZone: string): { start: number; end: number } {
  return { start: routineInstant(date, '00:00', timeZone),
    end: routineInstant(Temporal.PlainDate.from(date).add({ days: 1 }).toString(), '00:00', timeZone) };
}
export function calendarAgeMonths(birthDate: string, date: string): number {
  const birth = Temporal.PlainDate.from(birthDate), today = Temporal.PlainDate.from(date);
  if (Temporal.PlainDate.compare(today, birth) < 0) return -1;
  let months = (today.year - birth.year) * 12 + today.month - birth.month;
  if (calendarAnniversary(birthDate, months) > date) months--;
  return months;
}
/** Select the first desired-night range whose end has not passed at the waking anchor, never now. */
export function targetNight(anchor: number, from: string, to: string, timeZone: string): { start: number; end: number; localDate: string; collapsedByDst: boolean } {
  const date = Temporal.PlainDate.from(routineDate(anchor, timeZone));
  for (const offset of [-1, 0, 1]) {
    const startDate = date.add({ days: offset });
    const endDate = to < from ? startDate.add({ days: 1 }) : startDate;
    const start = routineInstant(startDate.toString(), from, timeZone);
    const resolvedEnd = routineInstant(endDate.toString(), to, timeZone);
    // Independently shifted gap endpoints can invert a narrow range: collapse it, never silently skip this night.
    const end = Math.max(start, resolvedEnd);
    if (end >= anchor) return { start, end, localDate: startDate.toString(), collapsedByDst: resolvedEnd < start };
  }
  throw new Error('Unable to resolve desired night range.');
}
