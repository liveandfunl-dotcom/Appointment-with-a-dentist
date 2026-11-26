# Реализованные фичи — индекс

Индекс документов о реализованных фичах (`docs/impl/<фича>.md`).
Запись добавляется на шаге 4 «Документация» порядка разработки (см. `AGENTS.md`).

| Фича | Документ | AC-ID | Спеки | Дата |
|------|----------|-------|-------|------|
| Аутентификация и сессии | [auth.md](auth.md) | AC-AUTH-01…13, AC-UI-LOGIN-01…05, AC-UI-LOGOUT-01 | [api.md](../specs/system/api.md), [data-model.md](../specs/design/data-model.md), [screens.md](../specs/ui/screens.md) | 2026-11-26 |
| Пользователи, роли, карточки и форма врача | [users.md](users.md) | AC-USERS-01…11, AC-DB-01…04, AC-UI-CARDS-01…03, AC-UI-DOC-01…06 | [data-model.md](../specs/design/data-model.md), [api.md](../specs/system/api.md), [screens.md](../specs/ui/screens.md) | 2026-11-26 |
| Запись на приём: окна, записи, отмена, письма | [appointments.md](appointments.md) | AC-SLOTS-01…04, AC-APPT-01…11, AC-MAIL-01…02, AC-UI-REC-01…04, AC-UI-BOOK-01…05, AC-UI-FORM-01…05 | [api.md](../specs/system/api.md), [data-model.md](../specs/design/data-model.md), [screens.md](../specs/ui/screens.md) | 2026-11-26 |
| Каркас интерфейса: шапка, i18n, DatePicker, стили | [ui-shell.md](ui-shell.md) | AC-UI-HEADER-01…04, AC-I18N-01…02, AC-UI-DP-01, AC-STYLE-01…03 | [screens.md](../specs/ui/screens.md) | 2026-11-26 |
| Развёртывание в Docker | [deploy.md](deploy.md) | AC-DEPLOY-01 | [api.md](../specs/system/api.md) (раздел 7), [guide/](../guide/deploy.md) | 2026-11-26 |
| Обзор MVP: решения, история задач, проверки, ограничения | [clinic-mvp.md](clinic-mvp.md) | все перечисленные выше | все | 2026-11-26 |
