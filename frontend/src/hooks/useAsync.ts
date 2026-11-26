import { useCallback, useEffect, useMemo, useState, type DependencyList } from 'react';

interface Settled<T> {
  run: object;
  data?: T;
  error?: unknown;
}

export interface AsyncResult<T> {
  data: T | undefined;
  error: unknown;
  /** Запрос идёт и ответа для текущих зависимостей ещё нет. */
  loading: boolean;
  /** Заменить загруженные данные (например, после локального изменения записи). */
  setData(next: T): void;
}

/**
 * Загружает данные при монтировании и при смене `deps`. Ответ устаревшего запроса и ответ после
 * размонтирования отбрасываются. `fn = null` — запрос не выполняется (нечего загружать).
 * `fn` читается только при смене `deps` — как у useEffect, все его входы должны быть в `deps`.
 */
export function useAsync<T>(fn: (() => Promise<T>) | null, deps: DependencyList): AsyncResult<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  // Новый токен при каждой смене deps: результат актуален, только если он получен для текущего токена.
  // Зависимости приходят от вызывающего, поэтому список не литерал: правила exhaustive-deps и use-memo здесь неприменимы.
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  const run = useMemo(() => ({}), deps);

  useEffect(() => {
    if (!fn) return;
    let cancelled = false;
    fn().then(
      (data) => {
        if (!cancelled) setSettled({ run, data });
      },
      (error: unknown) => {
        if (!cancelled) setSettled({ run, error });
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  const setData = useCallback((next: T) => setSettled({ run, data: next }), [run]);

  const current = settled?.run === run ? settled : null;
  return { data: current?.data, error: current?.error, loading: fn !== null && current === null, setData };
}
