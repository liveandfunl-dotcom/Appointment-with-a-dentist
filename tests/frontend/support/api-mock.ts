/**
 * Мок `global.fetch` для unit-тестов фронтенда (контракт: docs/specs/ui/screens.md, раздел 9;
 * формат ответов и коды ошибок: docs/specs/system/api.md).
 *
 * В jsdom нет ни `fetch`, ни `Response`, поэтому мок ставит свой `fetch` (jest.fn) и отдаёт
 * объект, совместимый с `Response` (ok, status, headers, json(), text(), clone()).
 *
 * Использование:
 *
 * ```ts
 * const api = mockApi({
 *   'GET /api/auth/me': ok(ME.admin),                         // любой query
 *   'GET /api/appointments?date=2026-11-27': ok([...]),       // только при date=2026-11-27
 *   'POST /api/appointments/:id/cancel': (call) => ok({ ...appt, id: Number(call.params.id) }),
 *   'POST /api/auth/login': [fail(429, 'TOO_MANY_REQUESTS'), ok({ user })], // по очереди, последний повторяется
 * });
 * api.on('GET /api/users', ok([]));                           // добавить/заменить маршрут позже
 * expect(api.lastCall('POST /api/auth/magic-link')?.body).toEqual({ email: 'a@b.cc', lang: 'ru' });
 * expect(api.callsTo('GET /api/appointments')).toHaveLength(1);
 * ```
 *
 * Правила сопоставления ключа `'METHOD /path[?query]'` с запросом:
 * - метод сравнивается без учёта регистра; хост в URL игнорируется (запросы идут на `/api/...`);
 * - сегмент `:name` в пути совпадает с любым непустым сегментом и попадает в `call.params.name`;
 * - если в ключе есть `?a=1&b=2`, в запросе должны быть эти параметры с этими значениями
 *   (лишние параметры запроса допустимы); без `?` ключ совпадает при любом query;
 * - при нескольких совпадениях побеждает самый конкретный ключ (больше литеральных сегментов
 *   и параметров query).
 * - Неописанный маршрут → 404 `{ code: 'NOT_FOUND' }` (как у бэкенда), вызов попадает в `api.unhandled`.
 *
 * Обработчик маршрута — `MockReply`, функция `(call) => MockReply | Promise<MockReply>`
 * (можно вернуть `deferred().promise`, чтобы держать запрос «в полёте») или массив ответов
 * (по очереди; последний повторяется).
 *
 * После каждого теста мок снимается автоматически (afterEach ниже).
 */

export interface MockReply {
  /** HTTP-статус, по умолчанию 200. */
  status?: number;
  /** Тело ответа; сериализуется в JSON. `undefined` → пустое тело. */
  body?: unknown;
  headers?: Record<string, string>;
}

export interface ApiCall {
  /** `GET`, `POST`, … (в верхнем регистре). */
  method: string;
  /** Путь без query: `/api/appointments`. */
  path: string;
  /** Исходный URL, как его передал фронтенд. */
  url: string;
  query: URLSearchParams;
  /** Значения `:name`-сегментов совпавшего ключа. */
  params: Record<string, string>;
  /** Тело запроса: распарсенный JSON, иначе строка; `undefined`, если тела нет. */
  body: unknown;
  headers: Headers;
  init: RequestInit | undefined;
  /** Ключ совпавшего маршрута или `null`, если маршрут не описан. */
  route: string | null;
}

export type RouteHandler =
  | MockReply
  | MockReply[]
  | ((call: ApiCall) => MockReply | Promise<MockReply>);

export type ApiRoutes = Record<string, RouteHandler>;

export interface ApiMock {
  /** Все запросы в порядке вызова. */
  readonly calls: ApiCall[];
  /** Запросы, для которых не нашлось маршрута (получили 404). */
  readonly unhandled: ApiCall[];
  /** Сам мок fetch (jest.fn). */
  readonly fetch: jest.Mock<Promise<Response>, [RequestInfo | URL, RequestInit?]>;
  /** Добавить или заменить маршрут. */
  on(key: string, handler: RouteHandler): ApiMock;
  /** Добавить или заменить несколько маршрутов. */
  use(routes: ApiRoutes): ApiMock;
  /** Есть ли маршрут с ровно таким ключом. */
  has(key: string): boolean;
  /** Вызовы, совпадающие с ключом (по тем же правилам, что и маршруты). */
  callsTo(key: string): ApiCall[];
  /** Последний вызов, совпадающий с ключом. */
  lastCall(key: string): ApiCall | undefined;
  /** Снять мок и вернуть исходный `fetch`. Вызывается автоматически после каждого теста. */
  restore(): void;
}

/** Успешный ответ: `ok(body)` → 200, `ok(body, 201)` → 201. */
export function ok(body?: unknown, status = 200): MockReply {
  return { status, body };
}

/** Ответ-ошибка в формате API: `fail(404, 'USER_NOT_FOUND')` → `{ code: 'USER_NOT_FOUND' }`. */
export function fail(status: number, code: string, fields?: string[]): MockReply {
  return { status, body: fields ? { code, fields } : { code } };
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason?: unknown): void;
}

/** Промис, которым управляет тест: держит запрос (или onConfirm) «в полёте», пока не вызван resolve. */
export function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Минимальная совместимая с `Response` реализация (в jsdom глобального `Response` нет). */
class MockResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  readonly url: string;
  readonly redirected = false;
  readonly type = 'basic';
  readonly body = null;
  bodyUsed = false;

  constructor(
    private readonly payload: string,
    init: { status: number; headers: Record<string, string>; url: string },
  ) {
    this.status = init.status;
    this.ok = init.status >= 200 && init.status < 300;
    this.statusText = String(init.status);
    this.headers = new Headers(init.headers);
    this.url = init.url;
  }

  async text(): Promise<string> {
    this.bodyUsed = true;
    return this.payload;
  }

  async json(): Promise<unknown> {
    this.bodyUsed = true;
    return JSON.parse(this.payload);
  }

  clone(): MockResponse {
    return new MockResponse(this.payload, {
      status: this.status,
      headers: Object.fromEntries(this.headers.entries()),
      url: this.url,
    });
  }
}

interface ParsedKey {
  method: string;
  segments: string[];
  query: [string, string][];
}

function parseKey(key: string): ParsedKey {
  const match = /^\s*([A-Za-z]+)\s+(\S+)\s*$/.exec(key);
  if (!match) throw new Error(`mockApi: ключ "${key}" должен иметь вид "METHOD /path[?query]"`);
  const [pathPart, queryPart = ''] = match[2].split('?');
  return {
    method: match[1].toUpperCase(),
    segments: pathPart.split('/').filter(Boolean),
    query: [...new URLSearchParams(queryPart).entries()],
  };
}

/** Совпадение ключа с запросом: `null` или { score, params }. */
function matchKey(
  key: ParsedKey,
  method: string,
  path: string,
  query: URLSearchParams,
): { score: number; params: Record<string, string> } | null {
  if (key.method !== method) return null;
  const segments = path.split('/').filter(Boolean);
  if (segments.length !== key.segments.length) return null;
  const params: Record<string, string> = {};
  let score = 0;
  for (let i = 0; i < segments.length; i += 1) {
    const expected = key.segments[i];
    const actual = decodeURIComponent(segments[i]);
    if (expected.startsWith(':')) {
      params[expected.slice(1)] = actual;
    } else if (expected === actual) {
      score += 2;
    } else {
      return null;
    }
  }
  for (const [name, value] of key.query) {
    if (query.get(name) !== value) return null;
    score += 1;
  }
  return { score, params };
}

function resolveInput(input: RequestInfo | URL, init?: RequestInit) {
  let url: string;
  let method = init?.method;
  let headersInit = init?.headers;
  if (typeof input === 'string') {
    url = input;
  } else if (input instanceof URL) {
    url = input.href;
  } else {
    url = input.url;
    method = method ?? input.method;
    headersInit = headersInit ?? input.headers;
  }
  return { url, method: (method ?? 'GET').toUpperCase(), headers: new Headers(headersInit) };
}

function parseBody(raw: unknown): unknown {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

let current: ApiMock | undefined;
const hadFetch = Object.prototype.hasOwnProperty.call(globalThis, 'fetch');
const originalFetch = globalThis.fetch;

/** Текущий установленный мок (если `mockApi` уже вызывался в этом тесте). */
export function getApiMock(): ApiMock | undefined {
  return current;
}

/** Установить мок `fetch` с маршрутами. Повторный вызов в том же тесте заменяет предыдущий мок. */
export function mockApi(routes: ApiRoutes = {}): ApiMock {
  current?.restore();

  const table = new Map<string, { parsed: ParsedKey; handler: RouteHandler; served: number }>();
  const calls: ApiCall[] = [];
  const unhandled: ApiCall[] = [];

  const fetchMock = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const { url, method, headers } = resolveInput(input, init);
      const parsedUrl = new URL(url, 'http://localhost');
      const path = parsedUrl.pathname;
      const query = parsedUrl.searchParams;
      let rawBody: unknown = init?.body;
      if (rawBody === undefined && typeof input === 'object' && 'text' in input) {
        rawBody = await (input as Request).text();
      }

      let best: { key: string; score: number; params: Record<string, string> } | null = null;
      for (const [key, entry] of table) {
        const m = matchKey(entry.parsed, method, path, query);
        if (m && (!best || m.score > best.score)) best = { key, ...m };
      }

      const call: ApiCall = {
        method,
        path,
        url,
        query,
        params: best?.params ?? {},
        body: parseBody(rawBody),
        headers,
        init,
        route: best?.key ?? null,
      };
      calls.push(call);

      let reply: MockReply;
      if (!best) {
        unhandled.push(call);
        reply = fail(404, 'NOT_FOUND');
      } else {
        const entry = table.get(best.key)!;
        const { handler } = entry;
        if (typeof handler === 'function') {
          reply = await handler(call);
        } else if (Array.isArray(handler)) {
          reply = handler[Math.min(entry.served, handler.length - 1)];
        } else {
          reply = handler;
        }
        entry.served += 1;
      }

      const status = reply.status ?? 200;
      const payload = reply.body === undefined ? '' : JSON.stringify(reply.body);
      return new MockResponse(payload, {
        status,
        headers: { 'content-type': 'application/json', ...reply.headers },
        url: parsedUrl.href,
      }) as unknown as Response;
    },
  );

  const filter = (key: string) => {
    const parsed = parseKey(key);
    return calls.filter((c) => matchKey(parsed, c.method, c.path, c.query) !== null);
  };

  const api: ApiMock = {
    calls,
    unhandled,
    fetch: fetchMock,
    on(key, handler) {
      table.set(key, { parsed: parseKey(key), handler, served: 0 });
      return api;
    },
    use(more) {
      for (const [key, handler] of Object.entries(more)) api.on(key, handler);
      return api;
    },
    has(key) {
      return table.has(key);
    },
    callsTo: filter,
    lastCall(key) {
      const list = filter(key);
      return list[list.length - 1];
    },
    restore() {
      if (current !== api) return;
      if (hadFetch) globalThis.fetch = originalFetch;
      else delete (globalThis as { fetch?: unknown }).fetch;
      current = undefined;
    },
  };

  api.use(routes);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  current = api;
  return api;
}

if (typeof afterEach === 'function') {
  afterEach(() => {
    current?.restore();
  });
}
