import { ExecutionContext } from '@nestjs/common';
import { currentUserFactory } from './user.decorator';

const ctxWith = (user: unknown): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describe('currentUserFactory', () => {
  it('returns user payload when present on request', () => {
    const payload = { sub: 'u1', email: 'a@b.com' };
    expect(currentUserFactory(undefined, ctxWith(payload))).toBe(payload);
  });

  it('returns null when user is undefined', () => {
    expect(currentUserFactory(undefined, ctxWith(undefined))).toBeNull();
  });

  it('returns null when user is null', () => {
    expect(currentUserFactory(undefined, ctxWith(null))).toBeNull();
  });
});
