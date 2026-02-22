import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody, ApiQuery } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';

class SearchUsersByEmailDto {
  email: string;
}

class SearchUsersByNameDto {
  name: string;
}

class SearchUsersByIdDto {
  id: string;
}

class RequestFriendDto {
  userCode?: string;
  friendId?: string;
}

class CreateGroupDto {
  name: string;
}

class AddMemberToGroupDto {
  userId: string;
  userCode?: string;
  canCreateSchedule?: boolean;
}

class InviteToGroupDto {
  userId: string;
}

class UpdateGroupNameDto {
  name: string;
}

class TransferAdminDto {
  targetUserId: string;
}

@ApiTags('Social')
@ApiBearerAuth()
@Controller('social')
@UseGuards(JwtAuthGuard)
export class SocialController {
  constructor(private prisma: PrismaService) {}

  @Get('friends')
  @ApiOperation({ summary: 'Get all friends' })
  @ApiResponse({ status: 200, description: 'Friends retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getFriends(@CurrentUser() user: any) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    const friends = await this.prisma.userFriend.findMany({
      where: { userId: user.sub },
      include: { friend: { select: { id: true, name: true, userCode: true, bio: true, avatarUrl: true } } },
    });
    return friends.map((f) => f.friend);
  }

  @Post('friends/search')
  @ApiOperation({ summary: 'Search users by email' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({
    type: SearchUsersByEmailDto,
    examples: {
      example1: {
        summary: 'Search for users by email',
        value: {
          email: 'john@example.com'
        }
      }
    }
  })
  async searchUsers(@Body('email') email: string, @CurrentUser() user: any) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    if (!email) {
      throw new BadRequestException('Email harus diisi');
    }
    const friendIds = await this.prisma.userFriend.findMany({
      where: { userId: user.sub },
      select: { friendId: true },
    });
    const excludeIds = [user.sub, ...friendIds.map((f) => f.friendId)];
    const users = await this.prisma.user.findMany({
      where: {
        email: { contains: email, mode: 'insensitive' },
        id: { notIn: excludeIds },
      },
      select: { id: true, name: true, userCode: true, bio: true, avatarUrl: true },
      take: 50,
    });
    return users;
  }

  @Post('friends/search-name')
  @ApiOperation({ summary: 'Search users by name or user code' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({
    type: SearchUsersByNameDto,
    examples: {
      example1: {
        summary: 'Search for users by name',
        value: {
          name: 'John'
        }
      },
      example2: {
        summary: 'Search for users by user code',
        value: {
          name: 'JD123'
        }
      }
    }
  })
  async searchUsersByName(@Body('name') name: string, @CurrentUser() user: any) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    const q = (name || '').trim();
    if (!q) {
      throw new BadRequestException('Nama harus diisi');
    }
    const friendIds = await this.prisma.userFriend.findMany({
      where: { userId: user.sub },
      select: { friendId: true },
    });
    const excludeIds = [user.sub, ...friendIds.map((f) => f.friendId)];
    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { userCode: { contains: q, mode: 'insensitive' } },
        ],
        id: { notIn: excludeIds },
      },
      select: { id: true, name: true, userCode: true, bio: true, avatarUrl: true },
      take: 50,
    });
    return users;
  }

  @Post('friends/search-id')
  @ApiOperation({ summary: 'Search user by ID' })
  @ApiResponse({ status: 200, description: 'User retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({
    type: SearchUsersByIdDto,
    examples: {
      example1: {
        summary: 'Search for user by ID',
        value: {
          id: 'user-id-here'
        }
      }
    }
  })
  async searchUsersById(@Body('id') id: string, @CurrentUser() user: any) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    if (!id) {
      throw new BadRequestException('ID harus diisi');
    }
    const userFound = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, userCode: true, bio: true, avatarUrl: true },
    });
    if (!userFound || userFound.id === user.sub) {
      return [];
    }
    const alreadyFriend = await this.prisma.userFriend.findFirst({
      where: { userId: user.sub, friendId: userFound.id },
    });
    if (alreadyFriend) {
      return [];
    }
    return [userFound];
  }

  @Post('friends/request')
  @ApiOperation({ summary: 'Send friend request' })
  @ApiResponse({ status: 201, description: 'Friend request sent' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiBody({
    type: RequestFriendDto,
    examples: {
      example1: {
        summary: 'Send friend request by user code',
        value: {
          userCode: 'JD123'
        }
      },
      example2: {
        summary: 'Send friend request by user ID',
        value: {
          friendId: 'user-id-here'
        }
      }
    }
  })
  async requestFriend(
    @Body('userCode') userCode: string,
    @Body('friendId') friendId: string,
    @CurrentUser() user: any,
  ) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    if (!userCode && !friendId) {
      throw new BadRequestException('userCode atau friendId harus diisi');
    }
    const code = userCode ? userCode.trim().toUpperCase() : '';
    const target = code
      ? await this.prisma.user.findFirst({ where: { userCode: { equals: code, mode: 'insensitive' } } })
      : await this.prisma.user.findUnique({ where: { id: friendId } });
    if (!target) {
      throw new BadRequestException('User tidak ditemukan');
    }
    if (user.sub === target.id) {
      throw new BadRequestException('Tidak bisa menambah diri sendiri sebagai teman');
    }

    const alreadyFriend = await this.prisma.userFriend.findFirst({
      where: { userId: user.sub, friendId: target.id },
    });
    if (alreadyFriend) {
      throw new BadRequestException('Sudah menjadi teman');
    }

    const reverseRequest = await this.prisma.friendRequest.findFirst({
      where: {
        senderId: target.id,
        receiverId: user.sub,
        status: 'PENDING',
      },
    });
    if (reverseRequest) {
      await this.prisma.friendRequest.update({
        where: { id: reverseRequest.id },
        data: { status: 'ACCEPTED' },
      });
      await this.prisma.userFriend.upsert({
        where: { userId_friendId: { userId: target.id, friendId: user.sub } },
        update: {},
        create: { userId: target.id, friendId: user.sub },
      });
      await this.prisma.userFriend.upsert({
        where: { userId_friendId: { userId: user.sub, friendId: target.id } },
        update: {},
        create: { userId: user.sub, friendId: target.id },
      });
      return { ok: true, autoAccepted: true };
    }

    const existingRequest = await this.prisma.friendRequest.findFirst({
      where: {
        senderId: user.sub,
        receiverId: target.id,
        status: 'PENDING',
      },
    });
    if (existingRequest) {
      throw new BadRequestException('Permintaan sudah dikirim');
    }

    return await this.prisma.friendRequest.create({
      data: { senderId: user.sub, receiverId: target.id },
      include: {
        receiver: { select: { id: true, name: true, userCode: true, bio: true, avatarUrl: true } },
      },
    });
  }

  @Get('friends/requests')
  @ApiOperation({ summary: 'Get received friend requests' })
  @ApiResponse({ status: 200, description: 'Friend requests retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getFriendRequests(@CurrentUser() user: any) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    return await this.prisma.friendRequest.findMany({
      where: { receiverId: user.sub, status: 'PENDING' },
      include: { sender: { select: { id: true, name: true, userCode: true, bio: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get('friends/requests/sent')
  @ApiOperation({ summary: 'Get sent friend requests' })
  @ApiResponse({ status: 200, description: 'Sent requests retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getSentFriendRequests(@CurrentUser() user: any) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    return await this.prisma.friendRequest.findMany({
      where: { senderId: user.sub, status: 'PENDING' },
      include: { receiver: { select: { id: true, name: true, userCode: true, bio: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('friends/requests/:id/accept')
  @ApiOperation({ summary: 'Accept friend request' })
  @ApiResponse({ status: 200, description: 'Friend request accepted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  @ApiParam({ name: 'id', description: 'Request ID' })
  async acceptFriendRequest(@Param('id') id: string, @CurrentUser() user: any) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    const request = await this.prisma.friendRequest.findUnique({ where: { id } });
    if (!request || request.receiverId !== user.sub) {
      throw new BadRequestException('Request tidak ditemukan');
    }
    await this.prisma.friendRequest.update({
      where: { id },
      data: { status: 'ACCEPTED' },
    });
    await this.prisma.userFriend.upsert({
      where: { userId_friendId: { userId: request.senderId, friendId: request.receiverId } },
      update: {},
      create: { userId: request.senderId, friendId: request.receiverId },
    });
    await this.prisma.userFriend.upsert({
      where: { userId_friendId: { userId: request.receiverId, friendId: request.senderId } },
      update: {},
      create: { userId: request.receiverId, friendId: request.senderId },
    });
    return { ok: true };
  }

  @Post('friends/requests/:id/reject')
  @ApiOperation({ summary: 'Reject friend request' })
  @ApiResponse({ status: 200, description: 'Friend request rejected' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Request not found' })
  @ApiParam({ name: 'id', description: 'Request ID' })
  async rejectFriendRequest(@Param('id') id: string, @CurrentUser() user: any) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    const request = await this.prisma.friendRequest.findUnique({ where: { id } });
    if (!request || request.receiverId !== user.sub) {
      throw new BadRequestException('Request tidak ditemukan');
    }
    await this.prisma.friendRequest.update({
      where: { id },
      data: { status: 'REJECTED' },
    });
    return { ok: true };
  }

  @Delete('friends/:friendId')
  @ApiOperation({ summary: 'Remove friend' })
  @ApiResponse({ status: 200, description: 'Friend removed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiParam({ name: 'friendId', description: 'Friend ID' })
  async removeFriend(@Param('friendId') friendId: string, @CurrentUser() user: any) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    await this.prisma.userFriend.deleteMany({
      where: { userId: user.sub, friendId },
    });
    await this.prisma.userFriend.deleteMany({
      where: { userId: friendId, friendId: user.sub },
    });
    return { message: 'Friend removed' };
  }

  @Get('groups')
  @ApiOperation({ summary: 'Get all groups' })
  @ApiResponse({ status: 200, description: 'Groups retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getGroups(@CurrentUser() user: any) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    const groups = await this.prisma.group.findMany({
      where: { members: { some: { userId: user.sub } } },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, bio: true } } },
        },
      },
    });
    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      createdAt: g.createdAt,
      members: g.members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        avatarUrl: m.user.avatarUrl,
        bio: m.user.bio,
        role: m.role,
        canCreateSchedule: m.canCreateSchedule,
      })),
    }));
  }

  @Post('groups')
  @ApiOperation({ summary: 'Create a new group' })
  @ApiResponse({ status: 201, description: 'Group created' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({
    type: CreateGroupDto,
    examples: {
      example1: {
        summary: 'Create a new group',
        value: {
          name: 'Study Group'
        }
      }
    }
  })
  async createGroup(@Body('name') name: string, @CurrentUser() user: any) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    if (!name) {
      throw new BadRequestException('Nama grup harus diisi');
    }
    const group = await this.prisma.group.create({
      data: { name },
    });
    await this.prisma.groupMember.create({
      data: {
        groupId: group.id,
        userId: user.sub,
        role: 'ADMIN',
        canCreateSchedule: true,
      },
    });
    const members = await this.prisma.groupMember.findMany({
      where: { groupId: group.id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return {
      id: group.id,
      name: group.name,
      createdAt: group.createdAt,
      members: members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        canCreateSchedule: m.canCreateSchedule,
      })),
    };
  }

  @Post('groups/:groupId/members')
  @ApiOperation({ summary: 'Add member to group' })
  @ApiResponse({ status: 200, description: 'Member added' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiParam({ name: 'groupId', description: 'Group ID' })
  @ApiBody({
    type: AddMemberToGroupDto,
    examples: {
      example1: {
        summary: 'Add member with schedule permission',
        value: {
          userId: 'user-id-here',
          canCreateSchedule: true
        }
      },
      example2: {
        summary: 'Add member without schedule permission',
        value: {
          userId: 'user-id-here',
          canCreateSchedule: false
        }
      }
    }
  })
  async addMemberToGroup(
    @Param('groupId') groupId: string,
    @Body('userId') memberId: string,
    @Body('userCode') userCode: string,
    @Body('canCreateSchedule') canCreateSchedule: boolean,
    @CurrentUser() user: any,
  ) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    if (!memberId && !userCode) {
      throw new BadRequestException('userId atau userCode harus diisi');
    }

    // Verify group exists and current user is admin
    const adminMember = await this.prisma.groupMember.findFirst({
      where: { groupId, userId: user.sub },
    });

    if (!adminMember || (adminMember.role !== 'ADMIN' && adminMember.role !== 'MODERATOR')) {
      throw new ForbiddenException('Tidak memiliki akses menambah anggota');
    }

    // Resolve target by userId or userCode
    const normalizedCode = (userCode || '').trim().toUpperCase();
    const targetUser = memberId
      ? await this.prisma.user.findUnique({ where: { id: memberId } })
      : await this.prisma.user.findFirst({
          where: { userCode: { equals: normalizedCode, mode: 'insensitive' } },
        });
    if (!targetUser) {
      throw new BadRequestException('User tidak ditemukan');
    }
    if (targetUser.id === user.sub) {
      throw new BadRequestException('Tidak bisa menambahkan diri sendiri');
    }

    const isFriend = await this.prisma.userFriend.findFirst({
      where: { userId: user.sub, friendId: targetUser.id },
    });
    if (!isFriend) {
      throw new BadRequestException('Hanya bisa menambahkan user dari friendlist');
    }

    const alreadyMember = await this.prisma.groupMember.findFirst({
      where: { groupId, userId: targetUser.id },
    });
    if (alreadyMember) {
      throw new BadRequestException('User sudah menjadi anggota grup');
    }

    await this.prisma.groupMember.upsert({
      where: { userId_groupId: { userId: targetUser.id, groupId } },
      update: {
        canCreateSchedule: !!canCreateSchedule,
      },
      create: {
        userId: targetUser.id,
        groupId,
        role: 'MEMBER',
        canCreateSchedule: !!canCreateSchedule,
      },
    });

    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });
    if (!group) {
      throw new BadRequestException('Grup tidak ditemukan');
    }

    return {
      id: group.id,
      name: group.name,
      createdAt: group.createdAt,
      members: group.members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        canCreateSchedule: m.canCreateSchedule,
      })),
    };
  }

  @Post('groups/:groupId/invites')
  @ApiOperation({ summary: 'Invite user to group' })
  @ApiResponse({ status: 201, description: 'Invite sent' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiParam({ name: 'groupId', description: 'Group ID' })
  @ApiBody({
    type: InviteToGroupDto,
    examples: {
      example1: {
        summary: 'Invite a friend to group',
        value: {
          userId: 'user-id-here'
        }
      }
    }
  })
  async inviteToGroup(
    @Param('groupId') groupId: string,
    @Body('userId') inviteeId: string,
    @CurrentUser() user: any,
  ) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    if (!inviteeId) {
      throw new BadRequestException('userId harus diisi');
    }

    const adminMember = await this.prisma.groupMember.findFirst({
      where: { groupId, userId: user.sub },
    });
    if (!adminMember || adminMember.role !== 'ADMIN') {
      throw new ForbiddenException('Hanya admin yang bisa mengundang');
    }

    const isFriend = await this.prisma.userFriend.findFirst({
      where: { userId: user.sub, friendId: inviteeId },
    });
    if (!isFriend) {
      throw new BadRequestException('Hanya bisa mengundang teman');
    }

    const alreadyMember = await this.prisma.groupMember.findFirst({
      where: { groupId, userId: inviteeId },
    });
    if (alreadyMember) {
      throw new BadRequestException('User sudah menjadi anggota grup');
    }

    const invite = await this.prisma.groupInvite.upsert({
      where: { groupId_inviteeId: { groupId, inviteeId } },
      update: { status: 'PENDING', inviterId: user.sub },
      create: { groupId, inviteeId, inviterId: user.sub },
      include: {
        group: { select: { id: true, name: true } },
        inviter: { select: { id: true, name: true } },
        invitee: { select: { id: true, name: true } },
      },
    });

    return invite;
  }

  @Get('groups/invites')
  @ApiOperation({ summary: 'Get group invites' })
  @ApiResponse({ status: 200, description: 'Invites retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getGroupInvites(@CurrentUser() user: any) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    return await this.prisma.groupInvite.findMany({
      where: { inviteeId: user.sub, status: 'PENDING' },
      include: {
        group: { select: { id: true, name: true } },
        inviter: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('groups/invites/:id/accept')
  @ApiOperation({ summary: 'Accept group invite' })
  @ApiResponse({ status: 200, description: 'Invite accepted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Invite not found' })
  @ApiParam({ name: 'id', description: 'Invite ID' })
  async acceptGroupInvite(@Param('id') id: string, @CurrentUser() user: any) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    const invite = await this.prisma.groupInvite.findUnique({ where: { id } });
    if (!invite || invite.inviteeId !== user.sub) {
      throw new BadRequestException('Invite tidak ditemukan');
    }

    await this.prisma.groupInvite.update({
      where: { id },
      data: { status: 'ACCEPTED' },
    });

    await this.prisma.groupMember.upsert({
      where: { userId_groupId: { userId: user.sub, groupId: invite.groupId } },
      update: {},
      create: {
        userId: user.sub,
        groupId: invite.groupId,
        role: 'MEMBER',
        canCreateSchedule: false,
      },
    });

    return { ok: true };
  }

  @Post('groups/invites/:id/reject')
  @ApiOperation({ summary: 'Reject group invite' })
  @ApiResponse({ status: 200, description: 'Invite rejected' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Invite not found' })
  @ApiParam({ name: 'id', description: 'Invite ID' })
  async rejectGroupInvite(@Param('id') id: string, @CurrentUser() user: any) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    const invite = await this.prisma.groupInvite.findUnique({ where: { id } });
    if (!invite || invite.inviteeId !== user.sub) {
      throw new BadRequestException('Invite tidak ditemukan');
    }
    await this.prisma.groupInvite.update({
      where: { id },
      data: { status: 'REJECTED' },
    });
    return { ok: true };
  }

  @Get('users/:id/profile')
  @ApiOperation({ summary: 'Get user profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiQuery({ name: 'groupId', required: false, description: 'Group ID (optional)' })
  async getUserProfile(
    @Param('id') targetId: string,
    @CurrentUser() user: any,
    @Query('groupId') groupId?: string,
  ) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, name: true, bio: true, avatarUrl: true, createdAt: true },
    });
    if (!target) {
      throw new BadRequestException('User tidak ditemukan');
    }

    const isFriend = await this.prisma.userFriend.findFirst({
      where: { userId: user.sub, friendId: targetId },
    });
    const pendingSent = await this.prisma.friendRequest.findFirst({
      where: { senderId: user.sub, receiverId: targetId, status: 'PENDING' },
    });
    const pendingReceived = await this.prisma.friendRequest.findFirst({
      where: { senderId: targetId, receiverId: user.sub, status: 'PENDING' },
    });

    let relationship = 'NONE';
    if (isFriend) relationship = 'FRIEND';
    else if (pendingSent) relationship = 'PENDING_SENT';
    else if (pendingReceived) relationship = 'PENDING_RECEIVED';

    let groupInfo = null as any;
    if (groupId) {
      const member = await this.prisma.groupMember.findFirst({
        where: { groupId, userId: targetId },
      });
      if (member) {
        groupInfo = {
          role: member.role,
          joinedAt: member.createdAt,
        };
      }
    }

    return {
      user: target,
      relationship,
      groupInfo,
      blocked: false,
    };
  }

  @Patch('groups/:groupId')
  @ApiOperation({ summary: 'Update group name' })
  @ApiResponse({ status: 200, description: 'Group updated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiParam({ name: 'groupId', description: 'Group ID' })
  @ApiBody({
    type: UpdateGroupNameDto,
    examples: {
      example1: {
        summary: 'Update group name',
        value: {
          name: 'Updated Study Group'
        }
      }
    }
  })
  async updateGroupName(
    @Param('groupId') groupId: string,
    @Body('name') name: string,
    @CurrentUser() user: any,
  ) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    if (!name) {
      throw new BadRequestException('Nama grup harus diisi');
    }
    const member = await this.prisma.groupMember.findFirst({
      where: { groupId, userId: user.sub },
    });
    if (!member || (member.role !== 'ADMIN' && member.role !== 'MODERATOR')) {
      throw new ForbiddenException('Tidak memiliki akses');
    }
    return await this.prisma.group.update({
      where: { id: groupId },
      data: { name },
    });
  }

  @Post('groups/:groupId/members/:memberId/remove')
  @ApiOperation({ summary: 'Remove member from group' })
  @ApiResponse({ status: 200, description: 'Member removed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiParam({ name: 'groupId', description: 'Group ID' })
  @ApiParam({ name: 'memberId', description: 'Member ID' })
  async removeGroupMember(
    @Param('groupId') groupId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: any,
  ) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    const actor = await this.prisma.groupMember.findFirst({
      where: { groupId, userId: user.sub },
    });
    if (!actor || (actor.role !== 'ADMIN' && actor.role !== 'MODERATOR')) {
      throw new ForbiddenException('Hanya admin/moderator yang bisa kick anggota');
    }
    if (memberId === user.sub) {
      throw new BadRequestException('Gunakan endpoint leave untuk keluar grup');
    }

    const target = await this.prisma.groupMember.findFirst({
      where: { groupId, userId: memberId },
    });
    if (!target) {
      throw new BadRequestException('Target bukan anggota grup');
    }

    if (actor.role === 'MODERATOR' && target.role !== 'MEMBER') {
      throw new ForbiddenException('Moderator hanya bisa kick member');
    }
    if (target.role === 'ADMIN') {
      throw new ForbiddenException('Admin tidak bisa di-kick');
    }

    await this.prisma.groupMember.deleteMany({
      where: { groupId, userId: memberId },
    });
    return { ok: true };
  }

  @Post('groups/:groupId/leave')
  @ApiOperation({ summary: 'Leave group' })
  @ApiResponse({ status: 200, description: 'Left group successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiParam({ name: 'groupId', description: 'Group ID' })
  async leaveGroup(
    @Param('groupId') groupId: string,
    @CurrentUser() user: any,
  ) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }

    const me = await this.prisma.groupMember.findFirst({
      where: { groupId, userId: user.sub },
    });
    if (!me) {
      throw new BadRequestException('Anda bukan anggota grup ini');
    }

    if (me.role === 'ADMIN') {
      const memberCount = await this.prisma.groupMember.count({ where: { groupId } });
      if (memberCount > 1) {
        throw new ForbiddenException('Admin harus transfer admin dulu sebelum leave');
      }
      // Last member/admin leaving: remove membership and group cleanup.
      await this.prisma.groupMember.deleteMany({ where: { groupId, userId: user.sub } });
      await this.prisma.group.deleteMany({ where: { id: groupId } });
      return { ok: true, deletedGroup: true };
    }

    await this.prisma.groupMember.deleteMany({
      where: { groupId, userId: user.sub },
    });
    return { ok: true };
  }

  @Post('groups/:groupId/members/:memberId/promote')
  @ApiOperation({ summary: 'Promote member to moderator' })
  @ApiResponse({ status: 200, description: 'Member promoted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiParam({ name: 'groupId', description: 'Group ID' })
  @ApiParam({ name: 'memberId', description: 'Member ID' })
  async promoteToModerator(
    @Param('groupId') groupId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: any,
  ) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    const member = await this.prisma.groupMember.findFirst({
      where: { groupId, userId: user.sub },
    });
    if (!member || member.role !== 'ADMIN') {
      throw new ForbiddenException('Hanya admin yang bisa promote');
    }
    const targetMember = await this.prisma.groupMember.findFirst({
      where: { groupId, userId: memberId },
    });
    if (!targetMember) {
      throw new BadRequestException('Target bukan anggota grup');
    }
    if (targetMember.role === 'ADMIN') {
      throw new BadRequestException('Admin tidak bisa dipromote menjadi moderator');
    }
    if (targetMember.role === 'MODERATOR') {
      return { ok: true, message: 'User sudah menjadi moderator' };
    }

    await this.prisma.groupMember.updateMany({
      where: { groupId, userId: memberId, role: 'MEMBER' },
      data: { role: 'MODERATOR' },
    });
    return { ok: true };
  }

  @Post('groups/:groupId/members/:memberId/demote')
  @ApiOperation({ summary: 'Demote moderator to member' })
  @ApiResponse({ status: 200, description: 'Member demoted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiParam({ name: 'groupId', description: 'Group ID' })
  @ApiParam({ name: 'memberId', description: 'Member ID' })
  async demoteToMember(
    @Param('groupId') groupId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: any,
  ) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    const member = await this.prisma.groupMember.findFirst({
      where: { groupId, userId: user.sub },
    });
    if (!member || member.role !== 'ADMIN') {
      throw new ForbiddenException('Hanya admin yang bisa demote');
    }
    const targetMember = await this.prisma.groupMember.findFirst({
      where: { groupId, userId: memberId },
    });
    if (!targetMember) {
      throw new BadRequestException('Target bukan anggota grup');
    }
    if (targetMember.role === 'ADMIN') {
      throw new BadRequestException('Admin tidak bisa didemote lewat endpoint ini');
    }
    if (targetMember.role === 'MEMBER') {
      return { ok: true, message: 'User sudah menjadi member' };
    }

    await this.prisma.groupMember.updateMany({
      where: { groupId, userId: memberId, role: 'MODERATOR' },
      data: { role: 'MEMBER' },
    });
    return { ok: true };
  }

  @Post('groups/:groupId/transfer-admin')
  @ApiOperation({ summary: 'Transfer admin role' })
  @ApiResponse({ status: 200, description: 'Admin transferred' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiParam({ name: 'groupId', description: 'Group ID' })
  @ApiBody({
    type: TransferAdminDto,
    examples: {
      example1: {
        summary: 'Transfer admin to another member',
        value: {
          targetUserId: 'user-id-here'
        }
      }
    }
  })
  async transferAdmin(
    @Param('groupId') groupId: string,
    @Body('targetUserId') targetUserId: string,
    @CurrentUser() user: any,
  ) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    if (!targetUserId) {
      throw new BadRequestException('targetUserId harus diisi');
    }
    const currentAdmin = await this.prisma.groupMember.findFirst({
      where: { groupId, userId: user.sub, role: 'ADMIN' },
    });
    if (!currentAdmin) {
      throw new ForbiddenException('Hanya admin yang bisa transfer');
    }
    const targetMember = await this.prisma.groupMember.findFirst({
      where: { groupId, userId: targetUserId },
    });
    if (!targetMember) {
      throw new BadRequestException('Target bukan anggota grup');
    }
    if (targetUserId === user.sub) {
      return { ok: true, message: 'Anda sudah menjadi admin' };
    }

    await this.prisma.$transaction([
      this.prisma.groupMember.updateMany({
        where: { groupId, role: 'ADMIN' },
        data: { role: 'MODERATOR' },
      }),
      this.prisma.groupMember.updateMany({
        where: { groupId, userId: targetUserId },
        data: { role: 'ADMIN' },
      }),
    ]);
    return { ok: true };
  }
}
