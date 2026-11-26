/** useAsync — загрузка данных с отбрасыванием устаревших ответов (docs/plans/code-quality.md, AC-REFAC-07). */
import { act, renderHook, waitFor } from '@testing-library/react';

import { useAsync } from '../../frontend/src/hooks/useAsync';
import { deferred } from './support/api-mock';

describe('useAsync', () => {
  test('AC-REFAC-07: loading → data', async () => {
    const { result } = renderHook(() => useAsync(() => Promise.resolve(42), []));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeUndefined();

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toBe(42);
    expect(result.current.error).toBeUndefined();
  });

  test('AC-REFAC-07: loading → error', async () => {
    const failure = new Error('boom');
    const { result } = renderHook(() => useAsync(() => Promise.reject(failure), []));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(failure);
    expect(result.current.data).toBeUndefined();
  });

  test('AC-REFAC-07: при смене зависимостей поздний ответ прежнего запроса отбрасывается', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const { result, rerender } = renderHook(
      ({ id }) => useAsync(() => (id === 1 ? first.promise : second.promise), [id]),
      { initialProps: { id: 1 } },
    );

    rerender({ id: 2 });
    await act(async () => second.resolve('second'));
    await waitFor(() => expect(result.current.data).toBe('second'));
    await act(async () => first.resolve('first'));

    expect(result.current.data).toBe('second');
  });

  test('AC-REFAC-07: после размонтирования state не обновляется (нет предупреждений)', async () => {
    const pending = deferred<string>();
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { unmount } = renderHook(() => useAsync(() => pending.promise, []));

    unmount();
    await act(async () => pending.resolve('late'));

    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  test('AC-REFAC-07: fn = null → запрос не выполняется, loading = false', () => {
    const { result } = renderHook(() => useAsync<number>(null, []));
    expect(result.current).toMatchObject({ loading: false, data: undefined, error: undefined });
  });
});
