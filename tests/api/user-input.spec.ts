/** Разбор тел создания и изменения пользователя — чистые функции (docs/plans/review-leftovers.md, AC-CLEAN-02). */
import { parseCreateUser, parseUpdateUser, type UpdateTarget } from '../../backend/src/users/user-input';

const DOCTOR = {
  role: 'doctor',
  surname: 'Иванов',
  name: 'Иван',
  phone: '+30 210 000 0001',
  email: 'ivanov@clinic.local',
  specialization: 'Терапевт',
  room: 101,
  workDays: [3, 1],
  workStart: '09:00',
  workEnd: '17:00',
};

describe('parseCreateUser', () => {
  test('AC-CLEAN-02: корректный врач → значения в формате колонок, ошибок нет', () => {
    const parsed = parseCreateUser(DOCTOR);
    expect(parsed.invalid).toEqual([]);
    expect(parsed.role).toBe('doctor');
    expect(parsed.values).toMatchObject({
      surname: 'Иванов',
      email: 'ivanov@clinic.local',
      specialization: 'Терапевт',
      room: 101,
      workDays: '1,3',
      workStart: 540,
      workEnd: 1020,
    });
    expect(parsed.login).toBe('');
    expect(parsed.password).toBe('');
  });

  test('AC-CLEAN-02: неверная роль → role первым, затем ошибки общих полей', () => {
    const parsed = parseCreateUser({ role: 'nurse', surname: '', name: 'Иван', phone: 'x', email: 'bad' });
    expect(parsed.role).toBeNull();
    expect(parsed.invalid).toEqual(['role', 'surname', 'email']);
  });

  test('AC-CLEAN-02: администратор — поля врача игнорируются', () => {
    const parsed = parseCreateUser({ ...DOCTOR, role: 'admin' });
    expect(parsed.role).toBe('admin');
    expect(parsed.invalid).toEqual([]);
    expect(parsed.values).not.toHaveProperty('specialization');
    expect(parsed.values).not.toHaveProperty('workDays');
  });

  test('AC-CLEAN-02: врач без полей врача → все они в invalid по порядку', () => {
    const { role, surname, name, phone, email } = DOCTOR;
    const parsed = parseCreateUser({ role, surname, name, phone, email });
    expect(parsed.invalid).toEqual(['specialization', 'room', 'workDays', 'workStart', 'workEnd']);
  });

  test('AC-CLEAN-02: workStart >= workEnd → workEnd', () => {
    expect(parseCreateUser({ ...DOCTOR, workStart: '17:00', workEnd: '09:00' }).invalid).toEqual(['workEnd']);
  });

  test('AC-CLEAN-02: логин и пароль задаются вместе', () => {
    expect(parseCreateUser({ ...DOCTOR, login: 'ivanov', password: 'secret123' }).invalid).toEqual([]);
    expect(parseCreateUser({ ...DOCTOR, login: 'ivanov' }).invalid).toEqual(['password']);
    expect(parseCreateUser({ ...DOCTOR, password: 'secret123' }).invalid).toEqual(['password']);
  });

  test('AC-CLEAN-02: невалидный логин и короткий пароль', () => {
    expect(parseCreateUser({ ...DOCTOR, login: 'a!', password: 'secret123' }).invalid).toEqual(['login']);
    expect(parseCreateUser({ ...DOCTOR, login: 'ivanov', password: 'short' }).invalid).toEqual(['password']);
  });
});

describe('parseUpdateUser', () => {
  const doctor: UpdateTarget = { role: 'doctor', workStart: 540, workEnd: 1020, login: 'ivanov', hasPassword: true };
  const admin: UpdateTarget = { role: 'admin', workStart: null, workEnd: null, login: null, hasPassword: false };

  test('AC-CLEAN-02: пустое тело → нечего менять', () => {
    expect(parseUpdateUser({}, doctor)).toEqual({ values: {}, password: '', invalid: [] });
  });

  test('AC-CLEAN-02: отсутствующие поля пропускаются', () => {
    expect(parseUpdateUser({ phone: ' +30 1 ' }, doctor).values).toEqual({ phone: '+30 1' });
  });

  test('AC-CLEAN-02: workEnd сравнивается с текущим workStart цели', () => {
    expect(parseUpdateUser({ workEnd: '08:00' }, doctor).invalid).toEqual(['workEnd']);
    expect(parseUpdateUser({ workEnd: '18:00' }, doctor).invalid).toEqual([]);
  });

  test('AC-CLEAN-02: у администратора поля врача игнорируются', () => {
    const parsed = parseUpdateUser({ room: 5, workDays: [1] }, admin);
    expect(parsed.values).toEqual({});
    expect(parsed.invalid).toEqual([]);
  });

  test('AC-CLEAN-02: isActive — только boolean', () => {
    expect(parseUpdateUser({ isActive: false }, doctor).values).toEqual({ isActive: 0 });
    expect(parseUpdateUser({ isActive: true }, doctor).values).toEqual({ isActive: 1 });
    expect(parseUpdateUser({ isActive: 'no' }, doctor).invalid).toEqual(['isActive']);
  });

  test('AC-CLEAN-02: пароль без логина у цели → password', () => {
    expect(parseUpdateUser({ password: 'secret123' }, admin).invalid).toEqual(['password']);
  });

  test('AC-CLEAN-02: логин цели без пароля требует пароль', () => {
    expect(parseUpdateUser({ login: 'boss' }, admin).invalid).toEqual(['password']);
    expect(parseUpdateUser({ login: 'boss', password: 'secret123' }, admin).invalid).toEqual([]);
  });

  test('AC-CLEAN-02: очистка логина сбрасывает логин и пароль', () => {
    expect(parseUpdateUser({ login: '' }, doctor).values).toEqual({ login: null, pass: null });
  });

  test('AC-CLEAN-02: новый пароль при существующем логине возвращается отдельно для хеширования', () => {
    const parsed = parseUpdateUser({ password: 'secret123' }, doctor);
    expect(parsed.password).toBe('secret123');
    expect(parsed.values).toEqual({});
    expect(parsed.invalid).toEqual([]);
  });

  test('AC-CLEAN-02: невалидный логин и короткий пароль', () => {
    expect(parseUpdateUser({ login: 'a!' }, doctor).invalid).toEqual(['login']);
    expect(parseUpdateUser({ password: 'short' }, doctor).invalid).toEqual(['password']);
  });
});
