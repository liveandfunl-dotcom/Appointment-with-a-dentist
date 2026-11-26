# Остатки код-ревью: разбор входа, cookie, `useAsync` в `App`, общий пакет типов

Закрыты пункты ревью, оставшиеся после [code-quality.md](code-quality.md) и [clinic-timezone.md](clinic-timezone.md). Контракт HTTP API, схема БД, тексты и внешний вид не менялись.

Статус: реализовано 2026-11-26. Результаты: API-тесты 308/308, unit-тесты frontend 312/312, `npm run lint`, `tsc --noEmit`, `npm run build` и `build/smoke.sh` без ошибок. e2e: 53 из 53 (после исправления греческой строки AC-I18N-01, см. [code-quality.md](code-quality.md)).

## Эксперименты до реализации

| Вопрос | Результат |
|--------|-----------|
| Даёт ли `res.cookie(name, '', { maxAge: 0 })` `Max-Age=0`? | Да: `Max-Age=0; Path=/; Expires=…; HttpOnly; SameSite=Lax`. Дополнительный `Expires` тесты не запрещают. Ранее в `code-quality.md` было написано обратное («`res.cookie()` добавляет `Expires`, чего требуют тесты») — это неверно и исправлено. |
| Разрешается ли `.d.ts` из workspace `shared/` при `rootDir: "src"` у backend? | Да: файлы объявлений не подпадают под `rootDir`, структура `backend/dist` прежняя, импорты `import type` стираются, в `dist` ссылок на `@clinic/shared` нет. Работает в `tsc` backend, Vite, `ts-jest`. |
| Собирается ли образ? | Да, после двух правок `build/Dockerfile`: `COPY shared/package.json shared/` рядом с `package.json` остальных workspace и `COPY shared shared` в стадии сборки (без второго `tsc` не находит типы). В prod-образе каталога `shared/` нет; в `node_modules/@clinic/` остаётся неиспользуемая ссылка, созданная `npm ci`. |

## Критерии приёмки

| AC-ID | Что проверяет | Тест |
|-------|---------------|------|
| AC-CLEAN-01 | `parseMagicLinkRequest`, `parseVerifyRequest`, `parseLoginRequest` — чистый разбор; в `AuthController` нет `invalid.push` и `assertValid` | `tests/api/auth-fields.spec.ts`, `tests/api/structure.spec.ts` |
| AC-CLEAN-02 | `parseCreateUser`, `parseUpdateUser` — чистый разбор; в `UsersService` нет `invalid.push`; порядок проверок прежний | `tests/api/user-input.spec.ts`, `tests/api/structure.spec.ts`, прежний `tests/api/users.spec.ts` |
| AC-CLEAN-03 | cookie сессии выдаётся и сбрасывается через `res.cookie()`; в `backend/src` нет строки `'Set-Cookie'` | `tests/api/structure.spec.ts`, прежний `tests/api/auth.spec.ts` |
| AC-CLEAN-04 | `let cancelled = false` только в `hooks/useAsync.ts`; `MagicLinkPage` защищён `useRef` | `tests/frontend/structure.spec.tsx` |
| AC-CLEAN-05 | общие типы объявлены один раз в `shared/index.d.ts`; пакет содержит только типы; `LANGS` backend и frontend совпадают и поддержаны словарями | `tests/api/structure.spec.ts`, `tests/frontend/structure.spec.tsx`, `tests/frontend/shared-langs.spec.tsx` |
| AC-CLEAN-06 | сборка, образ Docker и `build/smoke.sh` проходят | `npm run build`, `bash build/smoke.sh` |
| AC-CLEAN-07 | все прежние тесты проходят без изменений | `tests/api`, `tests/frontend`, `tests/e2e` |

## Что изменилось

**Backend**

| Что | Где |
|-----|-----|
| Разбор тел auth | `auth/auth-fields.ts`; `AuthController` вызывает `parseMagicLinkRequest`, `parseVerifyRequest`, `parseLoginRequest`. Rate limit по сырому идентификатору остаётся в контроллере и идёт до разбора |
| Разбор тел users | `users/user-input.ts`: `parseCreateUser(body)`, `parseUpdateUser(body, target)`. Не бросают: возвращают значения, пароль открытым текстом и список `invalid` |
| Порядок проверок users | остался в `UsersService`: создание — неверная роль (400) → право создавать администратора (403) → поля (400) → уникальность (409); изменение — цель (404 / 403) → тело (400) → уникальность (409). Он зависит от БД и ролей, поэтому не может жить в чистом парсере |
| Cookie | `res.cookie(SESSION_COOKIE, token, { httpOnly, sameSite: 'lax', path: '/', maxAge })`; сброс — `maxAge: 0` |
| Типы | импортируются из `@clinic/shared`: `Role`, `Lang`, `AuthUser`, `UserCard`, `UserDetails`, `Appointment`, `TimeWindow`, `Clinic` |

**Frontend**

| Что | Где |
|-----|-----|
| `App.tsx` | `useAsync(() => createI18n(), [])` вместо ручного эффекта |
| Типы | `api/types.ts` и `api/clinic.ts` импортируют типы из `@clinic/shared`; `Me = AuthUser`, `FreeWindow = TimeWindow` |
| Языки | `LANGS` остаётся константой (нужна в рантайме) и типизирована `satisfies readonly Lang[]`; словарь ресурсов i18next проверяется `satisfies Record<Lang, unknown>` |

**Пакет `shared/`**

- Workspace `@clinic/shared`: `shared/package.json` и `shared/index.d.ts` (`"types": "index.d.ts"`). Рантайм-кода нет, в сборки не попадает.
- Подключён как `devDependency` у `backend`, `frontend` и `tests`.
- `build/Dockerfile`: `COPY shared/package.json shared/` в обеих стадиях с `npm ci` и `COPY shared shared` перед `npm run build`.

## Решения

- `MagicLinkPage` остаётся с `useRef`: это однократный не идемпотентный `POST /api/auth/magic-link/verify`. Двойной запуск эффекта в StrictMode с `useAsync` погасил бы токен первым запросом и дал бы `LINK_INVALID` вторым.
- Константа `LANGS` не вынесена в `shared/`: потребовалась бы сборка пакета и его копирование в prod-образ. Вместо этого расхождение ловится компилятором (`satisfies`) и тестом `shared-langs.spec.tsx`.
- Cookie сессии теперь содержит дополнительный `Expires`, равный `Max-Age`; клиенты ориентируются на `Max-Age`, `api.md` 4.3 и 4.5 это отражают.
- Структурные тесты `AC-CLEAN-05` ищут объявления типов по началу строки (`^\s*(export\s+)?(interface|type)\s+Имя`), иначе `import { type Lang }` давал ложные срабатывания.

## Известные ограничения

- `LANGS` и разбор тел остаются на стороне backend и frontend отдельно; общими стали только типы.
