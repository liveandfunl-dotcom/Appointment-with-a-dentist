/**
 * Общие helper'ы рендера для unit-тестов фронтенда.
 * Контракт модулей — docs/specs/ui/screens.md, раздел 9: тесты импортируют только
 * `createI18n`, `AppProviders`, `AppRoutes`, `DatePicker`, `ConfirmDialog`; страницы рендерятся
 * через `AppRoutes` на нужном маршруте.
 *
 * Страница целиком:
 *
 * ```tsx
 * const app = await renderApp('/records', {
 *   me: 'admin',                                   // 'guest' | 'doctor' | 'admin' | 'root' | AuthUser | null
 *   api: { 'GET /api/users': ok([doctorCard]) },   // доп. маршруты мока fetch (см. api-mock.ts)
 * });
 * await screen.findByRole('button', { name: 'Выйти' });   // дождаться ответа /api/auth/me
 * await app.user.click(...);
 * expect(app.location().pathname).toBe('/booking/form');
 * expect(app.location().state).toEqual({ ... });
 * expect(app.api.lastCall('POST /api/appointments')?.body).toMatchObject({ ... });
 * ```
 *
 * - Маршрут — строка (`'/auth/magic?token=abc'`) или `{ pathname, search?, state? }`
 *   (например, слот для `/booking/form`).
 * - `lang` передаётся в `createI18n(lang)`; без него язык берётся из `localStorage['lang']` → `ru`.
 * - Сессия: `me` задаёт пользователя, которого вернёт `GET /api/auth/me` (по умолчанию — гость → 401).
 *   `POST /api/auth/logout` по умолчанию завершает сессию (дальше `me` → 401) и отвечает 200.
 *   Сессию можно поменять из обработчика маршрута: `setSessionUser(ME.root)` (например, при успешном
 *   login/verify — обработчик может сработать ещё до того, как renderApp вернул результат) или
 *   `app.session.set(...)` после рендера.
 *   Явно переданные в `api`/`mockApi` маршруты `GET /api/auth/me` и `POST /api/auth/logout` важнее.
 * - Если тест уже вызвал `mockApi(...)`, renderApp дополняет этот мок, а не создаёт новый.
 * - `strict: true` оборачивает в `<StrictMode>` (двойной вызов эффектов, как в dev-сборке).
 * - Фиксированное «сегодня»: `freezeTime('2026-11-26T10:00')` до рендера — userEvent сам
 *   подхватит фейковые таймеры.
 * - Положение роутера читается через `app.location()` (pathname, search, state, navigationType)
 *   и `app.history` — без data-testid.
 *
 * Перед каждым тестом очищается localStorage, после — восстанавливаются реальные таймеры.
 */
import { StrictMode, useEffect, type ReactElement, type ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router';
import type { i18n as I18n } from 'i18next';

import { createI18n } from '../../../frontend/src/i18n/index';
import { AppProviders } from '../../../frontend/src/AppProviders';
import { AppRoutes } from '../../../frontend/src/AppRoutes';
import { fail, getApiMock, mockApi, ok, type ApiMock, type ApiRoutes } from './api-mock';

export type Lang = 'ru' | 'en' | 'el';
export type Role = 'doctor' | 'admin' | 'root';

/** Ответ `GET /api/auth/me` (api.md, 2.1). */
export interface AuthUser {
  id: number;
  surname: string;
  name: string;
  role: Role;
}

/** Готовые пользователи для `me`. */
export const ME: Record<Role, AuthUser> = {
  root: { id: 1, surname: 'Root', name: 'Root', role: 'root' },
  admin: { id: 2, surname: 'Админова', name: 'Анна', role: 'admin' },
  doctor: { id: 3, surname: 'Иванов', name: 'Иван', role: 'doctor' },
};

export type MeOption = AuthUser | Role | 'guest' | null;

export interface RouteEntry {
  pathname: string;
  search?: string;
  hash?: string;
  state?: unknown;
}

export interface RenderAppOptions {
  lang?: Lang;
  me?: MeOption;
  api?: ApiRoutes;
  strict?: boolean;
}

export interface ProbedLocation {
  pathname: string;
  search: string;
  hash: string;
  state: unknown;
  /** 'POP' (начальный), 'PUSH' или 'REPLACE' — для проверки редиректов с replace. */
  navigationType: string;
}

export interface Session {
  get(): AuthUser | null;
  set(user: AuthUser | null): void;
}

export interface RenderAppResult extends RenderResult {
  user: UserEvent;
  i18n: I18n;
  api: ApiMock;
  session: Session;
  /** Текущее положение роутера. */
  location(): ProbedLocation;
  /** Все положения роутера по порядку (первое — начальное). */
  history: ProbedLocation[];
}

function toUser(me: MeOption | undefined): AuthUser | null {
  if (me === undefined || me === null || me === 'guest') return null;
  return typeof me === 'string' ? ME[me] : me;
}

/** Фейковые таймеры jest с фиксированным «сегодня» (раздел 9 спеки). */
export function freezeTime(now: Date | string | number): void {
  jest.useFakeTimers({
    now: typeof now === 'string' ? new Date(now) : now,
    doNotFake: ['queueMicrotask', 'nextTick', 'setImmediate'],
  });
}

function timersAreFake(): boolean {
  const st = globalThis.setTimeout as unknown as { clock?: unknown; _isMockFunction?: boolean };
  return typeof st.clock === 'object' || st._isMockFunction === true;
}

/** userEvent, совместимый с текущими (реальными или фейковыми) таймерами. */
export function setupUser(): UserEvent {
  return timersAreFake() ? userEvent.setup({ advanceTimers: jest.advanceTimersByTime }) : userEvent.setup();
}

function LocationProbe({ sink }: { sink: ProbedLocation[] }) {
  const location = useLocation();
  const navigationType = useNavigationType();
  useEffect(() => {
    sink.push({
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      state: location.state,
      navigationType: String(navigationType),
    });
  }, [location, navigationType, sink]);
  return null;
}

const ownedRoutes = new WeakMap<ApiMock, Set<string>>();
let activeSession: Session | undefined;

/**
 * Поменять пользователя сессии последнего renderApp: дальше `GET /api/auth/me` вернёт его
 * (`null` — гость). Удобно вызывать из обработчиков `POST /api/auth/login` и `…/verify`.
 */
export function setSessionUser(user: AuthUser | Role | null): void {
  if (!activeSession) throw new Error('setSessionUser: renderApp ещё не вызывался в этом тесте');
  activeSession.set(toUser(user));
}

/** Рендер всего приложения (шапка + маршруты) в MemoryRouter на маршруте `entry`. */
export async function renderApp(
  entry: string | RouteEntry,
  options: RenderAppOptions = {},
): Promise<RenderAppResult> {
  const api = getApiMock() ?? mockApi();
  let sessionUser = toUser(options.me);
  const session: Session = {
    get: () => sessionUser,
    set: (user) => {
      sessionUser = user;
    },
  };
  activeSession = session;

  const defaults: ApiRoutes = {
    'GET /api/auth/me': () => (sessionUser ? ok(sessionUser) : fail(401, 'UNAUTHORIZED')),
    'POST /api/auth/logout': () => {
      sessionUser = null;
      return ok({ ok: true });
    },
  };
  // Маршруты сессии, поставленные прошлым вызовом renderApp, перезаписываются; заданные тестом — нет.
  const owned = ownedRoutes.get(api) ?? new Set<string>();
  ownedRoutes.set(api, owned);
  for (const [key, handler] of Object.entries(defaults)) {
    if (!api.has(key) || owned.has(key)) {
      api.on(key, handler);
      owned.add(key);
    }
  }
  if (options.api) {
    api.use(options.api);
    for (const key of Object.keys(options.api)) owned.delete(key);
  }

  const i18n = await createI18n(options.lang);
  const history: ProbedLocation[] = [];

  const tree = (
    <MemoryRouter initialEntries={[entry]}>
      <AppProviders i18n={i18n}>
        <AppRoutes />
      </AppProviders>
      <LocationProbe sink={history} />
    </MemoryRouter>
  );

  const result = render(options.strict ? <StrictMode>{tree}</StrictMode> : tree);
  return {
    ...result,
    user: setupUser(),
    i18n,
    api,
    session,
    history,
    location: () => {
      const last = history[history.length - 1];
      if (!last) throw new Error('renderApp: роутер ещё не отрендерился');
      return last;
    },
  };
}

export interface RenderWithI18nResult extends RenderResult {
  user: UserEvent;
  i18n: I18n;
}

/** Рендер отдельного компонента (DatePicker, ConfirmDialog) с переводами, без роутера и AuthContext. */
export async function renderWithI18n(
  ui: ReactElement,
  options: { lang?: Lang } = {},
): Promise<RenderWithI18nResult> {
  const i18n = await createI18n(options.lang ?? 'ru');
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
  );
  const result = render(ui, { wrapper: Wrapper });
  return { ...result, user: setupUser(), i18n };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
  activeSession = undefined;
});
