import { HttpException } from '@nestjs/common';

/** Ошибка API в едином формате `{code, fields?}` (api.md, 1.1–1.2). */
export class ApiError extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    readonly fields?: string[],
  ) {
    super(fields ? { code, fields } : { code }, status);
  }

  static validation(fields: string[]): ApiError {
    return new ApiError(400, 'VALIDATION_ERROR', fields);
  }

  static unauthorized(): ApiError {
    return new ApiError(401, 'UNAUTHORIZED');
  }

  static forbidden(): ApiError {
    return new ApiError(403, 'FORBIDDEN');
  }

  static notFound(): ApiError {
    return new ApiError(404, 'NOT_FOUND');
  }
}
