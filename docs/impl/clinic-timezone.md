# «Сегодня» во frontend по часовому поясу клиники

Frontend считает «сегодня» в часовом поясе клиники (`CLINIC_TZ`), который сообщает backend, а не по часам браузера. Календари «Запись на приём» и «Записи» отключают и подсвечивают дни так же, как их проверяет сервер.

Статус: реализовано 2026-11-26. Результаты: API-тесты 265/265, unit-тесты frontend 305/305, `npm run lint`, `tsc --noEmit` и `npm run build` без ошибок. e2e: на момент реализации 52 из 53 (падал AC-I18N-01, не связанный с этой фичей); позже исправлен, теперь 53 из 53, см. [code-quality.md](code-quality.md).

От пояса зависит только «сегодня». День недели по строке `YYYY-MM-DD` (`weekdayOf`) считается календарной арифметикой и от пояса не зависит ни на backend, ни на frontend.

## Критерии приёмки

| AC-ID | Что проверяет | Тест |
|-------|---------------|------|
| AC-TZ-01 | `GET /api/clinic` отдаёт `{ timezone }` всем ролям и гостю, по умолчанию `Europe/Athens` | `tests/api/clinic.spec.ts` |
| AC-TZ-02 | `todayIso(timeZone, now)` для четырёх поясов; без пояса — дата браузера | `tests/frontend/clinic-timezone.spec.tsx` |
| AC-TZ-03 | `DatePicker.today`: подсветка и начальный месяц | `tests/frontend/clinic-timezone.spec.tsx` |
| AC-TZ-04 | «Запись на приём»: вчера по клинике отключено, сегодня доступно | `tests/frontend/clinic-timezone.spec.tsx` |
| AC-TZ-05 | «Записи»: подсвечено сегодня клиники | `tests/frontend/clinic-timezone.spec.tsx` |
| AC-TZ-06 | при ошибке `GET /api/clinic` — пояс браузера, без сообщения об ошибке, один запрос | `tests/frontend/clinic-timezone.spec.tsx` |
| AC-TZ-07 | все прежние тесты проходят без изменений | `tests/api`, `tests/frontend`, `tests/e2e` |

Тесты не зависят от пояса машины: для AC-TZ-04 и AC-TZ-05 берутся `Pacific/Kiritimati` (UTC+14) и `Pacific/Pago_Pago` (UTC−11) на одном моменте времени, у них разные даты, поэтому реализация по поясу браузера падает хотя бы на одном из двух.

## Файлы

| Файл | Назначение |
|------|------------|
| `backend/src/clinic/clinic.controller.ts` | публичный `GET /api/clinic` → `{ timezone }` из `ResolvedAppOptions` |
| `frontend/src/api/clinic.ts` | `getClinic()` |
| `frontend/src/clinic/ClinicContext.tsx` | `ClinicProvider` (один запрос при старте) и хук `useToday()` |
| `frontend/src/utils/date.ts` | `todayIso(timeZone?, now?)` через `Intl.DateTimeFormat`, без новых зависимостей |
| `frontend/src/components/DatePicker/DatePicker.tsx` | необязательное свойство `today` |
| `frontend/src/pages/BookingPage/BookingPage.tsx`, `RecordsPage/RecordsPage.tsx` | берут `today` из `useToday()` |
| `tests/frontend/support/render.tsx` | маршрут `GET /api/clinic` по умолчанию (пояс процесса) |

## Решения

- Пока пояс не загружен или запрос не удался, `useToday()` возвращает «сегодня» по поясу браузера. Ошибка пользователю не показывается: backend проверяет слот сам и остаётся источником истины.
- `DatePicker` самодостаточен: без свойства `today` он работает как раньше (по часам браузера) и не требует провайдера. Страницы ставят `key={today}`, чтобы календарь пересобрался, если пояс клиники загрузился позже и сменил «сегодня» (например, на границе месяца).
- Пояс по умолчанию в хелпере тестов совпадает с поясом процесса, поэтому прежние 293 теста остались без правок.
- Пояс нельзя зашить в сборку frontend (`VITE_*`): образ собирается один раз, а `CLINIC_TZ` задаётся при запуске контейнера.

## Спеки

- [api.md](../specs/system/api.md): раздел 4.16 и строка в сводке доступа 4.15.
- [screens.md](../specs/ui/screens.md): раздел 4 (`DatePicker.today`) и общее правило про «сегодня».
