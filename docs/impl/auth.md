# Аутентификация и сессии

Вход в систему по magic link (письмо со ссылкой) или по логину и паролю, серверные сессии в cookie, rate limit входа, страницы входа и выхода.

Статус: реализовано, 2026-11-26. Обзор MVP и принятые решения — [clinic-mvp.md](clinic-mvp.md).

## Что реализовано

- **API**: `POST /api/auth/magic-link`, `POST /api/auth/magic-link/verify`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- **Сессия.** Cookie `session`: `HttpOnly`, `SameSite=Lax`, `Path=/`, 30 дней. Токен — 32 случайных байта (base64url), в БД лежит только sha256-хеш (`Sessions.tokenHash`). Срок не продлевается. Истёкшая сессия удаляется при первом обращении.
- **Magic link.** Ссылка `APP_URL/auth/magic?token=…` живёт 30 минут и одноразовая. Письмо уходит на языке `lang` из запроса (шаблоны в `backend/src/i18n/{ru,en,el}.json`, ключи `mail.magicLink.*`).
- **Вход по паролю.** Пароль хранится как `scrypt$<соль>$<хеш>` (N=16384, r=8, p=1, сравнение через `timingSafeEqual`).
- **Guard.** Глобальный `SessionGuard` на каждый запрос разбирает cookie в `req.user`; декораторы `@Auth()` и `@Roles(...)` ограничивают маршруты (401 без сессии, 403 при неподходящей роли).
- **Деактивация.** `UsersService.update` при `isActive=false` вызывает `AuthService.revokeUserSessions`; деактивированный пользователь не входит ни одним способом и не проходит проверку сессии.
- **Frontend.** `LoginPage` (два режима: email и логин/пароль), `MagicLinkPage` (`/auth/magic?token=…`), `AuthContext` (`user`, `loading`, `refresh`, `logout`), выход через `ConfirmDialog` в `Header`.

## Ключевые файлы

| Файл | Назначение |
|------|------------|
| `backend/src/auth/auth.service.ts` | magic link, сессии, вход по паролю, отзыв сессий |
| `backend/src/auth/auth.controller.ts` | маршруты `/api/auth/*`, установка cookie |
| `backend/src/auth/session.guard.ts`, `auth.decorators.ts`, `auth-user.ts` | guard, `@Auth()`, `@Roles()`, `@CurrentUser()`, роль пользователя |
| `backend/src/auth/rate-limiter.ts` | in-memory rate limit |
| `backend/src/auth/password.ts`, `tokens.ts` | scrypt-хеш, токены и их sha256 |
| `backend/src/mail/mail.service.ts` | отправка писем (nodemailer, `memory`-транспорт для тестов) |
| `frontend/src/auth/AuthContext.tsx` | состояние пользователя и выход |
| `frontend/src/pages/LoginPage/`, `frontend/src/pages/MagicLinkPage/` | страницы входа |
| `frontend/src/components/Header/Header.tsx`, `ConfirmDialog/` | кнопки «Войти»/«Выйти» и попап подтверждения |
| `frontend/src/AppRoutes.tsx` | `Guard` закрытых маршрутов |

## Поведение и решения сверх описания

- **Порядок проверок в маршрутах входа**: rate limit, затем валидация, затем поиск пользователя. Поэтому невалидные запросы тоже расходуют лимит.
- **Rate limit** (оба маршрута входа, у каждого свои счётчики): скользящее окно 15 минут по `Clock`, 5 запросов на один email (приводится к нижнему регистру) или логин и 20 на один IP. Отклонённые запросы (429 `TOO_MANY_REQUESTS`) в счётчики не записываются. Счётчики лежат в памяти процесса и сбрасываются при перезапуске. `verify` лимитом не ограничен.
- **Ответы magic link**: неизвестный и деактивированный email дают одинаковый 404 `USER_NOT_FOUND` (это сознательно раскрывает существование email, так задано требованиями); недоступный SMTP даёт 503 `MAIL_FAILED`.
- **verify**: «использована или не найдена» (`LINK_INVALID`, 401) проверяется раньше «просрочена» (`LINK_EXPIRED`, 401). Ссылка деактивированного пользователя недействительна.
- **Логин** сравнивается точно, с учётом регистра. Все ошибки входа (неверный пароль, неизвестный логин, деактивирован) дают один код `INVALID_CREDENTIALS`.
- **Logout** идемпотентен: cookie сбрасывается всегда, ответ 200 даже без сессии.
- **Frontend**:
  - Пока `GET /api/auth/me` не ответил, закрытые страницы показывают «Загрузка…» без редиректа на `/login`.
  - Вошедший пользователь на `/login` уходит на `/records`; после входа (любым способом) тоже на `/records` с `replace`.
  - После выхода переход на `/doctors` (открытая страница) выполняется в одном `startTransition` с очисткой пользователя, иначе `Guard` на миг отправил бы гостя на `/login`.
  - `MagicLinkPage` вызывает `verify` один раз даже при двойном запуске эффекта в StrictMode. Ошибки: `LINK_EXPIRED` — «Ссылка устарела», остальные 4xx — «Ссылка недействительна или уже использована», прочее — общая ошибка; везде есть ссылка на вход.
  - В режиме логина кнопка «Войти по email» возвращает форму с email. `TOO_MANY_REQUESTS` показывается отдельным текстом.
  - Кнопка «Авторизоваться» активна при email формата `x@y.z` или при заполненных логине и пароле.
  - Попап выхода закрывается по «Нет», Escape и клику по фону.

## Критерии приёмки

Все тесты: API — `tests/api/auth.spec.ts`; unit — `tests/frontend/`; e2e — `tests/e2e/auth.e2e.spec.ts` (Playwright, нужен Mailpit).

| AC-ID | Что проверяется | Тесты |
|-------|-----------------|-------|
| AC-AUTH-01 | magic link для активного email: 200 и письмо со ссылкой на языке `lang` | `tests/api/auth.spec.ts` |
| AC-AUTH-02 | неизвестный или деактивированный email: 404 `USER_NOT_FOUND`, письма нет | `tests/api/auth.spec.ts` |
| AC-AUTH-03 | verify с действующим токеном: 200, httpOnly cookie на 30 дней | `tests/api/auth.spec.ts` |
| AC-AUTH-04 | токен старше 30 минут: 401 `LINK_EXPIRED` | `tests/api/auth.spec.ts` |
| AC-AUTH-05 | повторный токен: 401 | `tests/api/auth.spec.ts` |
| AC-AUTH-06 | login с верной парой: 200 и cookie; `root`/`root1234` работает | `tests/api/auth.spec.ts` |
| AC-AUTH-07 | неверный пароль, неизвестный логин, деактивированный: 401 `INVALID_CREDENTIALS` | `tests/api/auth.spec.ts` |
| AC-AUTH-08 | `me` с cookie возвращает `{id, surname, name, role}`, без cookie 401 | `tests/api/auth.spec.ts` |
| AC-AUTH-09 | через 30 дней сессия истекает, 401 | `tests/api/auth.spec.ts` |
| AC-AUTH-10 | после logout сессия недействительна | `tests/api/auth.spec.ts` |
| AC-AUTH-11 | rate limit magic-link: больше 5 на email или 20 на IP за 15 минут — 429 | `tests/api/auth.spec.ts` |
| AC-AUTH-12 | тот же rate limit на login (по логину и IP) | `tests/api/auth.spec.ts` |
| AC-AUTH-13 | при деактивации пользователя все его сессии завершаются | `tests/api/auth.spec.ts` |
| AC-UI-LOGIN-01 | страница входа: поле email, кнопка «Авторизоваться» активна только при корректном email, кнопка «Войти по логину и паролю» | `tests/frontend/login.spec.tsx`, `tests/e2e/auth.e2e.spec.ts` |
| AC-UI-LOGIN-02 | неизвестный email: красный текст ошибки под полем | `tests/frontend/login.spec.tsx`, `tests/e2e/auth.e2e.spec.ts` |
| AC-UI-LOGIN-03 | успех: «Ссылка отправлена на почту» | `tests/frontend/login.spec.tsx`, `tests/e2e/auth.e2e.spec.ts` |
| AC-UI-LOGIN-04 | режим логина и пароля: поля друг под другом, кнопка активна при обоих заполненных, ошибка, возврат «Войти по email» | `tests/frontend/login.spec.tsx`, `tests/e2e/auth.e2e.spec.ts` |
| AC-UI-LOGIN-05 | `/auth/magic?token` выполняет вход и ведёт на «Записи»; просроченная или недействительная ссылка показывает ошибку | `tests/frontend/login.spec.tsx` (в том числе просроченная ссылка), `tests/e2e/auth.e2e.spec.ts` (ссылка из письма Mailpit и недействительный токен) |
| AC-UI-LOGOUT-01 | «Выйти» открывает попап «Да»/«Нет»; «Нет» закрывает, «Да» завершает сессию, в шапке «Войти» | `tests/frontend/header.spec.tsx`, `tests/frontend/confirm-dialog.spec.tsx`, `tests/e2e/auth.e2e.spec.ts` |

## Спеки

- [docs/specs/system/api.md](../specs/system/api.md) — разделы 1 (ошибки), 3 (rate limit), 4.2–4.6 (маршруты), 5 (письма).
- [docs/specs/design/data-model.md](../specs/design/data-model.md) — разделы 2.3 (`MagicLinks`), 2.4 (`Sessions`), 2.5 (хеш пароля).
- [docs/specs/ui/screens.md](../specs/ui/screens.md) — разделы 3 (шапка, `ConfirmDialog`), 5.1–5.2 (вход).

## Ограничения

- Rate limit хранится в памяти одного процесса: при перезапуске сбрасывается, при нескольких экземплярах не общий. IP берётся из `req.ip` без `trust proxy`; за обратным прокси все запросы будут с одного IP, и лимит 20 на IP станет общим для всех.
- Смена пароля root через API или интерфейс невозможна (см. [clinic-mvp.md](clinic-mvp.md), «Известные ограничения»).
- Просроченный magic link в e2e не проверяется (только unit-тестами frontend и API-тестом AC-AUTH-04): истечение 30 минут в e2e не воспроизвести без подмены часов.
- Сессии не продлеваются и не отзываются при смене пароля; отзыв только при деактивации и выходе.
