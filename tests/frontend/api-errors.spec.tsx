/** apiErrorKey — общий перевод кода ошибки API в i18n-ключ (docs/plans/code-quality.md, AC-REFAC-06). */
import { ApiError } from '../../frontend/src/api/client';
import { apiErrorKey } from '../../frontend/src/api/errors';

describe('apiErrorKey', () => {
  test('AC-REFAC-06: код из specific → его ключ', () => {
    const error = new ApiError(409, 'SLOT_TAKEN');
    expect(apiErrorKey(error, { SLOT_TAKEN: 'bookingForm.slotTaken' })).toBe('bookingForm.slotTaken');
  });

  test('AC-REFAC-06: TOO_MANY_REQUESTS → common.tooManyRequests', () => {
    expect(apiErrorKey(new ApiError(429, 'TOO_MANY_REQUESTS'))).toBe('common.tooManyRequests');
  });

  test('AC-REFAC-06: specific важнее общего TOO_MANY_REQUESTS', () => {
    const error = new ApiError(429, 'TOO_MANY_REQUESTS');
    expect(apiErrorKey(error, { TOO_MANY_REQUESTS: 'custom.key' })).toBe('custom.key');
  });

  test('AC-REFAC-06: неизвестный код → common.genericError', () => {
    expect(apiErrorKey(new ApiError(500, 'INTERNAL_ERROR'), { SLOT_TAKEN: 'x' })).toBe('common.genericError');
  });

  test('AC-REFAC-06: сетевая ошибка → common.genericError', () => {
    expect(apiErrorKey(new ApiError(0, 'NETWORK_ERROR'))).toBe('common.genericError');
  });

  test('AC-REFAC-06: не ApiError → common.genericError', () => {
    expect(apiErrorKey(new Error('boom'))).toBe('common.genericError');
    expect(apiErrorKey(undefined)).toBe('common.genericError');
  });
});
