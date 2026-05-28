import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../types/jwt-payload';

export const currentUserFactory = (
  _data: unknown,
  ctx: ExecutionContext,
): JwtPayload | null => {
  const request = ctx
    .switchToHttp()
    .getRequest<Request & { user?: JwtPayload | null }>();
  return request.user ?? null;
};

export const CurrentUser = createParamDecorator(currentUserFactory);
