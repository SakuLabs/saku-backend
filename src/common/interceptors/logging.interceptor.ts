import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

interface AuthedRequest extends Request {
  user?: { sub?: string; id?: string };
}

/**
 * Logs every HTTP request: method, URL, status, duration, and user id (if
 * authenticated). Registered globally via APP_INTERCEPTOR in AppModule, so it
 * covers all controller endpoints without per-route wiring.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Only handle HTTP; skip ws/rpc contexts (e.g. chat gateway).
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<AuthedRequest>();
    const res = http.getResponse<Response>();
    const { method, originalUrl } = req;
    const userId = req.user?.sub ?? req.user?.id;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.log(method, originalUrl, res.statusCode, start, userId),
        error: (err: { status?: number; message?: string; stack?: string }) =>
          this.log(
            method,
            originalUrl,
            err?.status ?? 500,
            start,
            userId,
            err?.message,
            err?.stack,
          ),
      }),
    );
  }

  private log(
    method: string,
    url: string,
    status: number,
    start: number,
    userId?: string,
    message?: string,
    stack?: string,
  ): void {
    const ms = Date.now() - start;
    const who = userId ? ` user=${userId}` : '';
    const msg = message ? ` - ${message}` : '';
    const line = `${method} ${url} ${status} ${ms}ms${who}${msg}`;
    if (status >= 500) {
      // 5xx: include stack for debugging the failure.
      this.logger.error(line, stack);
    } else if (status >= 400) {
      this.logger.warn(line);
    } else {
      this.logger.log(line);
    }
  }
}
