import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Writable } from 'stream';
import { UserController } from './user.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { createPrismaMock, MockPrisma } from '../../../test/utils/prisma-mock';
import type { JwtPayload } from '../../common/types/jwt-payload';

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: { upload_stream: jest.fn() },
  },
}));

import { v2 as cloudinary } from 'cloudinary';

const cloudinaryMock = cloudinary as unknown as {
  config: jest.Mock;
  uploader: { upload_stream: jest.Mock };
};

const user: JwtPayload = { sub: 'user-1', email: 'a@b.com' };

const SELECT_FIELDS = {
  id: true,
  name: true,
  userCode: true,
  bio: true,
  avatarUrl: true,
  email: true,
};

describe('UserController', () => {
  let controller: UserController;
  let prisma: MockPrisma;
  const ORIGINAL_ENV = process.env;

  beforeEach(async () => {
    prisma = createPrismaMock();
    process.env = { ...ORIGINAL_ENV };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(UserController);
    cloudinaryMock.config.mockClear();
    cloudinaryMock.uploader.upload_stream.mockReset();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('me', () => {
    it('throws BadRequest when user is null', async () => {
      await expect(controller.me(null)).rejects.toThrow(BadRequestException);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('throws BadRequest when sub missing', async () => {
      await expect(
        controller.me({ sub: '', email: '' } as JwtPayload),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns prisma.user.findUnique result with safe select', async () => {
      const dbUser = {
        id: 'user-1',
        name: 'Alice',
        userCode: 'C',
        bio: null,
        avatarUrl: null,
        email: 'a@b.com',
      };
      prisma.user.findUnique.mockResolvedValueOnce(dbUser as any);

      const result = await controller.me(user);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: user.sub },
        select: SELECT_FIELDS,
      });
      expect(result).toBe(dbUser);
    });
  });

  describe('updateMe', () => {
    it('throws BadRequest when user is null', async () => {
      await expect(controller.updateMe(null, 'a', 'b', 'c')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('updates with trimmed name only when provided', async () => {
      prisma.user.update.mockResolvedValueOnce({ id: user.sub } as any);
      await controller.updateMe(user, '  Alice  ', undefined, undefined);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: user.sub },
        data: { name: 'Alice' },
        select: SELECT_FIELDS,
      });
    });

    it('omits name when empty/whitespace; sets bio + avatarUrl trimmed', async () => {
      prisma.user.update.mockResolvedValueOnce({ id: user.sub } as any);
      await controller.updateMe(user, '   ', ' hello ', ' url ');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: user.sub },
        data: { bio: 'hello', avatarUrl: 'url' },
        select: SELECT_FIELDS,
      });
    });

    it('passes empty data object when no fields provided', async () => {
      prisma.user.update.mockResolvedValueOnce({ id: user.sub } as any);
      await controller.updateMe(user, undefined, undefined, undefined);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: user.sub },
        data: {},
        select: SELECT_FIELDS,
      });
    });

    it('allows empty bio (clearing field) but trims it', async () => {
      prisma.user.update.mockResolvedValueOnce({ id: user.sub } as any);
      await controller.updateMe(user, undefined, '  ', undefined);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: user.sub },
        data: { bio: '' },
        select: SELECT_FIELDS,
      });
    });
  });

  describe('uploadAvatar', () => {
    const file = {
      buffer: Buffer.from('img-bytes'),
      mimetype: 'image/png',
    } as Express.Multer.File;

    const setCloudEnv = () => {
      process.env.CLOUDINARY_CLOUD_NAME = 'cn';
      process.env.CLOUDINARY_API_KEY = 'k';
      process.env.CLOUDINARY_API_SECRET = 's';
    };

    // Helper: builds a writable that completes via the cloudinary callback
    const stubUploadStream = (
      err: Error | null,
      result?: { secure_url: string },
    ) => {
      cloudinaryMock.uploader.upload_stream.mockImplementationOnce(
        (_opts, cb: (e: Error | null, r?: any) => void) => {
          const w = new Writable({
            write(_chunk, _enc, done) {
              done();
            },
          });
          w.on('finish', () => cb(err, result));
          return w;
        },
      );
    };

    it('throws BadRequest when user null', async () => {
      await expect(controller.uploadAvatar(null, file)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequest when file missing', async () => {
      await expect(controller.uploadAvatar(user, undefined)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequest when file buffer missing', async () => {
      await expect(
        controller.uploadAvatar(user, { buffer: undefined } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequest when cloudinary env not configured', async () => {
      delete process.env.CLOUDINARY_CLOUD_NAME;
      await expect(controller.uploadAvatar(user, file)).rejects.toThrow(
        /Cloudinary/,
      );
      expect(cloudinaryMock.uploader.upload_stream).not.toHaveBeenCalled();
    });

    it('uploads, configures cloudinary, then updates user with secure_url', async () => {
      setCloudEnv();
      stubUploadStream(null, { secure_url: 'https://cdn/a.png' });
      prisma.user.update.mockResolvedValueOnce({
        id: user.sub,
        avatarUrl: 'https://cdn/a.png',
      } as any);

      const result = await controller.uploadAvatar(user, file);

      expect(cloudinaryMock.config).toHaveBeenCalledWith({
        cloud_name: 'cn',
        api_key: 'k',
        api_secret: 's',
      });
      expect(cloudinaryMock.uploader.upload_stream).toHaveBeenCalledWith(
        expect.objectContaining({
          folder: 'mahatask/avatars',
          resource_type: 'image',
          overwrite: true,
        }),
        expect.any(Function),
      );
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: user.sub },
        data: { avatarUrl: 'https://cdn/a.png' },
        select: SELECT_FIELDS,
      });
      expect(result).toEqual({
        id: user.sub,
        avatarUrl: 'https://cdn/a.png',
      });
    });

    it('rejects with Error when cloudinary returns error', async () => {
      setCloudEnv();
      stubUploadStream(new Error('cloud down'));

      await expect(controller.uploadAvatar(user, file)).rejects.toThrow(
        'cloud down',
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects with default Error when cloudinary returns no result and no error', async () => {
      setCloudEnv();
      stubUploadStream(null, undefined);

      await expect(controller.uploadAvatar(user, file)).rejects.toThrow(
        'Upload gagal',
      );
    });
  });
});
