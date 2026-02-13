import { Controller, Get, Param, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { ChatService } from './chat.service';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('group/:groupId')
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
