import { Controller, Get, Post, Param, Body, UseGuards, BadRequestException, UseInterceptors, UploadedFile } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { ChatService } from './chat.service';

interface SendMessageDto {
  content: string;
  groupId?: string;
  directMessageUserId?: string;
}

@ApiTags('Chat')
@ApiBearerAuth()
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

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

  @Get('dm/unread/counts')
  @ApiOperation({ summary: 'Get unread direct message counts grouped by senderId' })
  @ApiResponse({ status: 200, description: 'Unread counts retrieved successfully' })
  async getDirectUnreadCounts(@CurrentUser() user: any) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    return await this.chatService.getDirectUnreadCounts(user.sub);
  }

  @Get('group/:groupId')
  @ApiOperation({ summary: 'Get messages for a group' })
  @ApiResponse({ status: 200, description: 'Messages retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not a group member' })
  @ApiParam({ name: 'groupId', description: 'Group ID' })
  async getGroupMessages(
    @Param('groupId') groupId: string,
    @CurrentUser() user: any,
  ) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    const member = await this.chatService.isGroupMember(groupId, user.sub);
    if (!member) {
      throw new BadRequestException('Anda bukan anggota grup ini');
    }
    return await this.chatService.getGroupMessages(groupId);
  }

  @Get('dm/:userId')
  @ApiOperation({ summary: 'Get direct messages with a user' })
  @ApiResponse({ status: 200, description: 'Messages retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not friends' })
  @ApiParam({ name: 'userId', description: 'Other user ID' })
  async getDirectMessages(
    @Param('userId') otherUserId: string,
    @CurrentUser() user: any,
  ) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    if (!otherUserId) {
      throw new BadRequestException('userId harus diisi');
    }
    const ok = await this.chatService.areFriends(user.sub, otherUserId);
    if (!ok) {
      throw new BadRequestException('Hanya bisa DM teman');
    }
    await this.chatService.markDirectMessagesAsRead(user.sub, otherUserId);
    return await this.chatService.getDirectMessages(user.sub, otherUserId);
  }

  @Post('dm/:userId/read')
  @ApiOperation({ summary: 'Mark direct messages from a user as read' })
  @ApiResponse({ status: 200, description: 'Messages marked as read' })
  async markDirectMessagesAsRead(
    @Param('userId') otherUserId: string,
    @CurrentUser() user: any,
  ) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    if (!otherUserId) {
      throw new BadRequestException('userId harus diisi');
    }
    const ok = await this.chatService.areFriends(user.sub, otherUserId);
    if (!ok) {
      throw new BadRequestException('Hanya bisa DM teman');
    }
    await this.chatService.markDirectMessagesAsRead(user.sub, otherUserId);
    return { success: true };
  }

  @Post('messages')
  @ApiOperation({ summary: 'Send a message (group or direct)' })
  @ApiResponse({ status: 201, description: 'Message sent successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiBody({ type: Object, description: 'Message payload with content, groupId, or directMessageUserId' })
  async sendMessage(
    @Body() body: SendMessageDto,
    @CurrentUser() user: any,
  ) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    if (!body?.content?.trim()) {
      throw new BadRequestException('Content tidak boleh kosong');
    }

    // Send group message
    if (body.groupId) {
      const member = await this.chatService.isGroupMember(body.groupId, user.sub);
      if (!member) {
        throw new BadRequestException('Anda bukan anggota grup ini');
      }
      return await this.chatService.createGroupMessage(
        body.groupId,
        user.sub,
        body.content.trim(),
      );
    }

    // Send direct message
    if (body.directMessageUserId) {
      const ok = await this.chatService.areFriends(user.sub, body.directMessageUserId);
      if (!ok) {
        throw new BadRequestException('Hanya bisa DM teman');
      }
      return await this.chatService.createDirectMessage(
        user.sub,
        body.directMessageUserId,
        body.content.trim(),
      );
    }

    throw new BadRequestException('groupId atau directMessageUserId harus diisi');
  }

  @Post('attachments')
  @ApiOperation({ summary: 'Upload chat attachment to Cloudinary' })
  @ApiResponse({ status: 201, description: 'Attachment uploaded successfully' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 },
    }),
  )
  async uploadAttachment(@CurrentUser() user: any, @UploadedFile() file?: Express.Multer.File) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    if (!file?.buffer) {
      throw new BadRequestException('File wajib diisi');
    }
    if (file.size > 50 * 1024) {
      throw new BadRequestException('Ukuran file maksimal 50 KB');
    }

    this.ensureCloudinaryConfigured();

    const uploaded = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'mahatask/chat-attachments',
          resource_type: 'auto',
        },
        (error, result) => {
          if (error || !result) return reject(error || new Error('Upload gagal'));
          resolve(result as { secure_url: string });
        },
      );
      Readable.from(file.buffer).pipe(uploadStream);
    });

    return {
      url: uploaded.secure_url,
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    };
  }
}
