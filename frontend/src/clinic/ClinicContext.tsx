import { createContext, useContext, type ReactNode } from 'react';

import { getClinic } from '../api/clinic';
import { useAsync } from '../hooks/useAsync';
import { todayIso } from '../utils/date';

/** Пояс клиники; `undefined`, пока он не загружен или запрос не удался (тогда действует пояс браузера). */
const ClinicTimezoneContext = createContext<string | undefined>(undefined);

/** Один раз запрашивает пояс клиники; ошибка не показывается: backend остаётся источником истины. */
export function ClinicProvider({ children }: { children: ReactNode }) {
  const clinic = useAsync(getClinic, []);
  return <ClinicTimezoneContext.Provider value={clinic.data?.timezone}>{children}</ClinicTimezoneContext.Provider>;
}

/** Сегодняшняя дата `YYYY-MM-DD` в поясе клиники (пока он неизвестен — в поясе браузера). */
export function useToday(): string {
  return todayIso(useContext(ClinicTimezoneContext));
}
