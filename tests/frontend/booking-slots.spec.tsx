/** booking-slots — расчёт меток начала и длительностей (docs/plans/code-quality.md, AC-REFAC-05). */
import { durationsFor, startMarks } from '../../frontend/src/pages/BookingPage/booking-slots';

const W = (start: string, end: string) => ({ start, end });

describe('startMarks', () => {
  test('AC-REFAC-05: шаг 30 минут, до конца окна остаётся ≥ 60 минут', () => {
    expect(startMarks([W('09:00', '11:00')])).toEqual(['09:00', '09:30', '10:00']);
  });

  test('AC-REFAC-05: окно ровно 60 минут → одна метка', () => {
    expect(startMarks([W('09:00', '10:00')])).toEqual(['09:00']);
  });

  test('AC-REFAC-05: окно короче 60 минут → меток нет', () => {
    expect(startMarks([W('09:00', '09:30')])).toEqual([]);
  });

  test('AC-REFAC-05: несколько окон → метки по порядку', () => {
    expect(startMarks([W('09:00', '10:00'), W('13:00', '14:30')])).toEqual(['09:00', '13:00', '13:30']);
  });

  test('AC-REFAC-05: окно до 24:00', () => {
    expect(startMarks([W('22:30', '24:00')])).toEqual(['22:30', '23:00']);
  });

  test('AC-REFAC-05: нет окон → пустой список', () => {
    expect(startMarks([])).toEqual([]);
  });
});

describe('durationsFor', () => {
  test('AC-REFAC-05: от 60 минут с шагом 30 до конца окна', () => {
    expect(durationsFor('09:00', [W('09:00', '11:00')])).toEqual([60, 90, 120]);
  });

  test('AC-REFAC-05: считается от выбранного начала внутри окна', () => {
    expect(durationsFor('10:00', [W('09:00', '11:30')])).toEqual([60, 90]);
  });

  test('AC-REFAC-05: выбирается окно, в которое попадает начало', () => {
    expect(durationsFor('13:00', [W('09:00', '10:00'), W('13:00', '15:00')])).toEqual([60, 90, 120]);
  });

  test('AC-REFAC-05: начало вне окон → пустой список', () => {
    expect(durationsFor('12:00', [W('09:00', '10:00'), W('13:00', '15:00')])).toEqual([]);
  });

  test('AC-REFAC-05: пустое начало → пустой список', () => {
    expect(durationsFor('', [W('09:00', '11:00')])).toEqual([]);
  });
});
