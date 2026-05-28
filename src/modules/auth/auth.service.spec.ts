import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { createPrismaMock, MockPrisma } from '../../../test/utils/prisma-mock';

jest.mock('bcrypt');

const bcryptMock = bcrypt;

describe('AuthService', () => {
  let service: AuthService;
  let prisma: MockPrisma;
  let jwt: jest.Mocked<JwtService>;

  beforeEach(async () => {
    prisma = createPrismaMock();
    jwt = {
      sign: jest.fn().mockReturnValue('signed.jwt.token'),
    } as unknown as jest.Mocked<JwtService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('register', () => {
    const input = {
      email: 'a@b.com',
      password: 'pw123',
      name: 'Alice',
    };

    const dbUser = {
      id: 'user-1',
      email: input.email,
      name: input.name,
      userCode: 'ABCDEFG',
      password: 'hashed',
      bio: null,
      avatarUrl: null,
    };

    it('throws ConflictException if email already registered', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'x' } as any);
      await expect(service.register(input)).rejects.toThrow(ConflictException);
      expect(bcryptMock.hash).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('hashes password, creates user, returns token + safe profile', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce(null); // generateUserCode lookup
      bcryptMock.hash.mockResolvedValue('hashed' as never);
      prisma.user.create.mockResolvedValueOnce(dbUser as any);

      const result = await service.register(input);

      expect(bcryptMock.hash).toHaveBeenCalledWith(input.password, 10);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: input.email,
          name: input.name,
          password: 'hashed',
          userCode: expect.any(String),
        }),
      });
      expect(jwt.sign).toHaveBeenCalledWith({
        sub: dbUser.id,
        email: dbUser.email,
      });
      expect(result).toEqual({
        access_token: 'signed.jwt.token',
        user: {
          id: dbUser.id,
          name: dbUser.name,
          email: dbUser.email,
          userCode: dbUser.userCode,
          bio: dbUser.bio,
          avatarUrl: dbUser.avatarUrl,
        },
      });
      expect(result.user).not.toHaveProperty('password');
    });

    it('retries userCode if collision, succeeds within 5 attempts', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce({ id: 'x' } as any) // code attempt 1 collision
        .mockResolvedValueOnce({ id: 'y' } as any) // collision 2
        .mockResolvedValueOnce(null); // free
      bcryptMock.hash.mockResolvedValue('hashed' as never);
      prisma.user.create.mockResolvedValueOnce(dbUser as any);

      const result = await service.register(input);

      expect(result.access_token).toBe('signed.jwt.token');
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(4);
    });

    it('throws if userCode collides 5 times', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValue({ id: 'x' } as any); // every code attempt collides
      bcryptMock.hash.mockResolvedValue('hashed' as never);

      await expect(service.register(input)).rejects.toThrow(
        'Gagal membuat userCode unik',
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const dbUser = {
      id: 'user-1',
      email: 'a@b.com',
      name: 'Alice',
      userCode: 'CODE123',
      password: 'hashed-pw',
      bio: null,
      avatarUrl: null,
    };

    it('throws UnauthorizedException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(service.login('missing@x.com', 'pw')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(bcryptMock.compare).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException if password mismatch', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(dbUser as any);
      bcryptMock.compare.mockResolvedValue(false as never);

      await expect(service.login(dbUser.email, 'wrong')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('returns token + safe profile on success', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(dbUser as any);
      bcryptMock.compare.mockResolvedValue(true as never);

      const result = await service.login(dbUser.email, 'pw');

      expect(bcryptMock.compare).toHaveBeenCalledWith('pw', dbUser.password);
      expect(jwt.sign).toHaveBeenCalledWith({
        sub: dbUser.id,
        email: dbUser.email,
      });
      expect(result.access_token).toBe('signed.jwt.token');
      expect(result.user).not.toHaveProperty('password');
      expect(result.user).toEqual({
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        userCode: dbUser.userCode,
        bio: dbUser.bio,
        avatarUrl: dbUser.avatarUrl,
      });
    });
  });
});
