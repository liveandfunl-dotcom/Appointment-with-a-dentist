/** Миграция схемы (docs/specs/design/data-model.md, раздел 3). Применённые миграции не редактируются. */
export interface Migration {
  version: number;
  name: string;
  /** SQL, выполняемый при применении миграции. */
  up: string;
}

const INITIAL = `
CREATE TABLE Users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,
  surname        TEXT    NOT NULL,
  isAdmin        INTEGER NOT NULL DEFAULT 0 CHECK (isAdmin  IN (0, 1)),
  isDoctor       INTEGER NOT NULL DEFAULT 0 CHECK (isDoctor IN (0, 1)),
  isRoot         INTEGER NOT NULL DEFAULT 0 CHECK (isRoot   IN (0, 1)),
  login          TEXT    UNIQUE,
  pass           TEXT,
  room           INTEGER,
  email          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  isActive       INTEGER NOT NULL DEFAULT 1 CHECK (isActive IN (0, 1)),
  specialization TEXT,
  phone          TEXT,
  workDays       TEXT,
  workStart      INTEGER CHECK (workStart IS NULL OR (workStart BETWEEN 0 AND 1440 AND workStart % 30 = 0)),
  workEnd        INTEGER CHECK (workEnd   IS NULL OR (workEnd   BETWEEN 0 AND 1440 AND workEnd   % 30 = 0)),
  createDate     INTEGER NOT NULL,
  CHECK (isAdmin + isDoctor + isRoot = 1),
  CHECK (workStart IS NULL OR workEnd IS NULL OR workStart < workEnd),
  CHECK (pass IS NULL OR login IS NOT NULL)
);
CREATE INDEX idx_users_name    ON Users(name);
CREATE INDEX idx_users_surname ON Users(surname);

CREATE TABLE Appointments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  doctorId        INTEGER NOT NULL REFERENCES Users(id),
  appointmentDate INTEGER NOT NULL,
  endDate         INTEGER NOT NULL,
  createDate      INTEGER NOT NULL,
  creatorId       INTEGER NOT NULL REFERENCES Users(id),
  patientName     TEXT    NOT NULL,
  patientPhone    TEXT    NOT NULL,
  comment         TEXT,
  status          TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  cancelDate      INTEGER,
  cancelerId      INTEGER REFERENCES Users(id),
  CHECK (endDate > appointmentDate),
  CHECK ((status = 'active'    AND cancelDate IS NULL     AND cancelerId IS NULL) OR
         (status = 'cancelled' AND cancelDate IS NOT NULL AND cancelerId IS NOT NULL))
);
CREATE INDEX idx_appointments_doctor_date ON Appointments(doctorId, appointmentDate);
CREATE INDEX idx_appointments_date        ON Appointments(appointmentDate);

CREATE TABLE MagicLinks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tokenHash  TEXT    NOT NULL UNIQUE,
  userId     INTEGER NOT NULL REFERENCES Users(id),
  expiresAt  INTEGER NOT NULL,
  usedAt     INTEGER,
  createDate INTEGER NOT NULL
);
CREATE INDEX idx_magiclinks_user ON MagicLinks(userId);

CREATE TABLE Sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tokenHash  TEXT    NOT NULL UNIQUE,
  userId     INTEGER NOT NULL REFERENCES Users(id),
  expiresAt  INTEGER NOT NULL,
  createDate INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON Sessions(userId);
`;

export const MIGRATIONS: Migration[] = [{ version: 1, name: 'initial', up: INITIAL }];
