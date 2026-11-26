/** Время `HH:mm` с шагом 30 минут от `00:00` до `24:00` (api.md, 1.4). */
export const TIME_RE = /^(([01][0-9]|2[0-3]):(00|30)|24:00)$/;

/** `"HH:mm"` → минуты от полуночи; неверный формат → null. */
export function parseTime(value: unknown): number | null {
  if (typeof value !== 'string' || !TIME_RE.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

/** Минуты от полуночи → `"HH:mm"` (1440 → `"24:00"`). */
export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
