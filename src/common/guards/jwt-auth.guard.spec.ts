import { JwtService } from '@nestjs/jwt';
import { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

type FakeRequest = {
  headers: { authorization?: string };
  user?: unknown;
};

const buildCtx = (req: FakeRequest): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => req }),
  }) as unknown as ExecutionContext;

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwt: jest.Mocked<JwtService>;

  beforeEach(() => {
    jwt = { verify: jest.fn() } as unknown as jest.Mocked<JwtService>;
    guard = new JwtAuthGuard(jwt);
  });

  it('allows request and sets user=null when no Authorization header', () => {
    const req: FakeRequest = { headers: {} };
    expect(guard.canActivate(buildCtx(req))).toBe(true);
    expect(req.user).toBeNull();
    expect(jwt.verify).not.toHaveBeenCalled();
  });

  it('strips Bearer prefix and verifies token, attaches payload to request', () => {
    const payload = { sub: 'u1', email: 'a@b.com' };
    jwt.verify.mockReturnValue(payload);
    const req: FakeRequest = {
      headers: { authorization: 'Bearer abc.def.ghi' },
    };

    expect(guard.canActivate(buildCtx(req))).toBe(true);
    expect(jwt.verify).toHaveBeenCalledWith('abc.def.ghi');
    expect(req.user).toEqual(payload);
  });

  it('allows request and sets user=null when token is invalid', () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('invalid signature');
    });
    const req: FakeRequest = { headers: { authorization: 'Bearer bad' } };

    expect(guard.canActivate(buildCtx(req))).toBe(true);
    expect(req.user).toBeNull();
  });

  it('handles raw token without Bearer prefix (replace leaves as-is)', () => {
    jwt.verify.mockReturnValue({ sub: 'u2', email: 'x@y.com' });
    const req: FakeRequest = { headers: { authorization: 'tok' } };

    expect(guard.canActivate(buildCtx(req))).toBe(true);
    expect(jwt.verify).toHaveBeenCalledWith('tok');
  });
});
