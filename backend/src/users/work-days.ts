/** Приёмные дни в колонке `Users.workDays`: `"1,3,5"` (1 = Пн … 7 = Вс). */

/** `"1,3,5"` → `[1, 3, 5]`; пусто или NULL → `[]`. */
export function parseWorkDays(stored: string | null): number[] {
  return stored ? stored.split(',').map(Number) : [];
}

/** `[5, 1, 3]` → `"1,3,5"` (по возрастанию). */
export function serializeWorkDays(days: number[]): string {
  return [...days].sort((a, b) => a - b).join(',');
}
