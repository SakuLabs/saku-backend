import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let service: jest.Mocked<AuthService>;

  beforeEach(async () => {
    service = {
      register: jest.fn(),
      login: jest.fn(),
    } as unknown as jest.Mocked<AuthService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: service }],
    }).compile();

    controller = module.get(AuthController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('register', () => {
    const validBody = {
      email: 'a@b.com',
      password: 'pw123',
      name: 'Alice',
    };

    it.each([
      [{ password: 'pw', name: 'a' }, 'missing email'],
      [{ email: 'a@b', name: 'a' }, 'missing password'],
      [{ email: 'a@b', password: 'pw' }, 'missing name'],
      [{}, 'all missing'],
    ])('throws BadRequest when %s (%s)', async (body) => {
      await expect(controller.register(body)).rejects.toThrow(
        BadRequestException,
      );
      expect(service.register).not.toHaveBeenCalled();
    });

    it('delegates to service and returns its result on success', async () => {
      const payload = { access_token: 'tok', user: { id: '1' } };
      service.register.mockResolvedValueOnce(payload as any);

      const result = await controller.register(validBody);

      expect(service.register).toHaveBeenCalledWith(validBody);
      expect(result).toBe(payload);
    });

    it('re-throws HttpException from service (e.g. ConflictException)', async () => {
      service.register.mockRejectedValueOnce(
        new ConflictException('Email sudah terdaftar'),
      );
      await expect(controller.register(validBody)).rejects.toThrow(
        ConflictException,
      );
    });

    it('wraps non-HttpException error as BadRequest with message', async () => {
      service.register.mockRejectedValueOnce(new Error('db down'));
      await expect(controller.register(validBody)).rejects.toMatchObject({
        message: 'db down',
        status: 400,
      });
    });

    it('falls back to default message when error has no message', async () => {
      service.register.mockRejectedValueOnce({});
      await expect(controller.register(validBody)).rejects.toMatchObject({
        message: 'Registrasi gagal',
        status: 400,
      });
    });
  });

  describe('login', () => {
    const validBody = { email: 'a@b.com', password: 'pw' };

    it.each([
      [{ password: 'pw' }, 'missing email'],
      [{ email: 'a@b' }, 'missing password'],
      [{}, 'both missing'],
    ])('throws BadRequest when %s (%s)', async (body) => {
      await expect(controller.login(body)).rejects.toThrow(BadRequestException);
      expect(service.login).not.toHaveBeenCalled();
    });

    it('delegates to service.login(email, password)', async () => {
      const payload = { access_token: 'tok', user: { id: '1' } };
      service.login.mockResolvedValueOnce(payload as any);

      const result = await controller.login(validBody);

      expect(service.login).toHaveBeenCalledWith(
        validBody.email,
        validBody.password,
      );
      expect(result).toBe(payload);
    });

    it('re-throws UnauthorizedException from service', async () => {
      service.login.mockRejectedValueOnce(
        new UnauthorizedException('Email atau password salah'),
      );
      await expect(controller.login(validBody)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('wraps non-HttpException error as BadRequest', async () => {
      service.login.mockRejectedValueOnce(new Error('jwt broken'));
      await expect(controller.login(validBody)).rejects.toMatchObject({
        message: 'jwt broken',
        status: 400,
      });
    });

    it('falls back to default message when error has no message', async () => {
      service.login.mockRejectedValueOnce({});
      await expect(controller.login(validBody)).rejects.toMatchObject({
        message: 'Login gagal',
        status: 400,
      });
    });
  });
});
