export interface WakeNorm {
  readonly minAgeDays: number;
  readonly maxAgeDays: number | null;
  readonly label: string;
  readonly minWakeMinutes: number;
  readonly maxWakeMinutes: number;
  readonly minDailySleepHours: number;
  readonly maxDailySleepHours: number;
}

// Ориентиры, а не медицинское назначение: учитывайте индивидуальные признаки усталости.
export const WAKE_NORMS: readonly WakeNorm[] = [
  { minAgeDays: 0, maxAgeDays: 30, label: '0–1 месяц', minWakeMinutes: 40, maxWakeMinutes: 60, minDailySleepHours: 14, maxDailySleepHours: 17 },
  { minAgeDays: 31, maxAgeDays: 60, label: '1–2 месяца', minWakeMinutes: 50, maxWakeMinutes: 75, minDailySleepHours: 14, maxDailySleepHours: 17 },
  { minAgeDays: 61, maxAgeDays: 90, label: '2–3 месяца', minWakeMinutes: 60, maxWakeMinutes: 80, minDailySleepHours: 14, maxDailySleepHours: 17 },
  { minAgeDays: 91, maxAgeDays: 120, label: '3–4 месяца', minWakeMinutes: 80, maxWakeMinutes: 110, minDailySleepHours: 12, maxDailySleepHours: 16 },
  { minAgeDays: 121, maxAgeDays: 150, label: '4–5 месяцев', minWakeMinutes: 105, maxWakeMinutes: 135, minDailySleepHours: 12, maxDailySleepHours: 16 },
  { minAgeDays: 151, maxAgeDays: 180, label: '5–6 месяцев', minWakeMinutes: 120, maxWakeMinutes: 150, minDailySleepHours: 12, maxDailySleepHours: 16 },
  { minAgeDays: 181, maxAgeDays: 240, label: '6–8 месяцев', minWakeMinutes: 150, maxWakeMinutes: 180, minDailySleepHours: 12, maxDailySleepHours: 16 },
  { minAgeDays: 241, maxAgeDays: 365, label: '8–12 месяцев', minWakeMinutes: 180, maxWakeMinutes: 240, minDailySleepHours: 12, maxDailySleepHours: 16 },
  { minAgeDays: 366, maxAgeDays: null, label: 'Старше года', minWakeMinutes: 210, maxWakeMinutes: 300, minDailySleepHours: 11, maxDailySleepHours: 14 },
];
