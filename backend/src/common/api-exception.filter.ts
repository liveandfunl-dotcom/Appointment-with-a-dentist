import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ApiError } from './api-error';

const CODES: Record<number, string> = {
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  429: 'TOO_MANY_REQUESTS',
};

function statusOf(exception: unknown): number | undefined {
  if (exception instanceof HttpException) return exception.getStatus();
  const status = (exception as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}

/** Глобальный фильтр: любая ошибка → `{code, fields?}` (api.md, 1.1). */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) return;

    if (exception instanceof ApiError) {
      res.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    const status = statusOf(exception);
    if (status !== undefined && status >= 400 && status < 500) {
      // Некорректный JSON и прочие ошибки разбора тела → 400 VALIDATION_ERROR (api.md, 1.1).
      const code = CODES[status];
      if (code) res.status(status).json({ code });
      else res.status(400).json({ code: 'VALIDATION_ERROR', fields: [] });
      return;
    }

    this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
    res.status(500).json({ code: 'INTERNAL_ERROR' });
  }
}
