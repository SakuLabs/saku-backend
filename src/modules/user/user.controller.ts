import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  UseGuards,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { PrismaService } from '../../../prisma/prisma.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private prisma: PrismaService) {}

  private ensureCloudinaryConfigured() {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      throw new BadRequestException('Cloudinary belum dikonfigurasi di .env');
    }
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  @Get('me')
  async me(@CurrentUser() user: any) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    return await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { id: true, name: true, userCode: true, bio: true, avatarUrl: true, email: true },
    });
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() user: any,
    @Body('name') name?: string,
    @Body('bio') bio?: string,
    @Body('avatarUrl') avatarUrl?: string,
  ) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    const data: any = {};
    if (typeof name === 'string' && name.trim()) data.name = name.trim();
    if (typeof bio === 'string') data.bio = bio.trim();
    if (typeof avatarUrl === 'string') data.avatarUrl = avatarUrl.trim();
    return await this.prisma.user.update({
      where: { id: user.sub },
      data,
      select: { id: true, name: true, userCode: true, bio: true, avatarUrl: true, email: true },
    });
  }

  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadAvatar(@CurrentUser() user: any, @UploadedFile() file?: Express.Multer.File) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    if (!file?.buffer) {
      throw new BadRequestException('File avatar wajib diisi');
    }

    this.ensureCloudinaryConfigured();

    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'mahatask/avatars',
          resource_type: 'image',
          overwrite: true,
        },
        (error, uploaded) => {
          if (error || !uploaded) return reject(error || new Error('Upload gagal'));
          resolve(uploaded as { secure_url: string });
        },
      );
      Readable.from(file.buffer).pipe(uploadStream);
    });

    return await this.prisma.user.update({
      where: { id: user.sub },
      data: { avatarUrl: result.secure_url },
      select: { id: true, name: true, userCode: true, bio: true, avatarUrl: true, email: true },
    });
  }
}
