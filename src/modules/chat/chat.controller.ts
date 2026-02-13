import { Controller, Get, Param, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { ChatService } from './chat.service';

@ApiTags('Chat')
@ApiBearerAuth()
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

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
    return await this.chatService.getDirectMessages(user.sub, otherUserId);
  }
}
