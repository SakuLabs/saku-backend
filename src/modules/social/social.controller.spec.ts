import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SocialController } from './social.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { createPrismaMock, MockPrisma } from '../../../test/utils/prisma-mock';
import type { JwtPayload } from '../../common/types/jwt-payload';

const me: JwtPayload = { sub: 'u1', email: 'a@b.com' };

describe('SocialController', () => {
  let controller: SocialController;
  let prisma: MockPrisma;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SocialController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(SocialController);
  });

  // ============== FRIENDS ==============

  describe('getFriends', () => {
    it('throws when no user', async () => {
      await expect(controller.getFriends(null)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns mapped friend profiles', async () => {
      prisma.userFriend.findMany.mockResolvedValueOnce([
        { friend: { id: 'f1', name: 'Bob' } },
      ] as any);
      const result = await controller.getFriends(me);
      expect(result).toEqual([{ id: 'f1', name: 'Bob' }]);
    });
  });

  describe('searchUsers (by email)', () => {
    it('throws when email missing', async () => {
      await expect(controller.searchUsers('', me)).rejects.toThrow(/Email/);
    });

    it('excludes self + existing friends', async () => {
      prisma.userFriend.findMany.mockResolvedValueOnce([
        { friendId: 'f1' },
      ] as any);
      prisma.user.findMany.mockResolvedValueOnce([] as any);
      await controller.searchUsers('john', me);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            email: { contains: 'john', mode: 'insensitive' },
            id: { notIn: ['u1', 'f1'] },
          }),
          take: 50,
        }),
      );
    });
  });

  describe('searchUsersByName', () => {
    it('throws when name blank/whitespace', async () => {
      await expect(controller.searchUsersByName('   ', me)).rejects.toThrow(
        /Nama/,
      );
    });

    it('queries OR(name,userCode) and excludes self+friends', async () => {
      prisma.userFriend.findMany.mockResolvedValueOnce([] as any);
      prisma.user.findMany.mockResolvedValueOnce([] as any);
      await controller.searchUsersByName('  bob  ', me);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: 'bob', mode: 'insensitive' } },
              { userCode: { contains: 'bob', mode: 'insensitive' } },
            ],
            id: { notIn: ['u1'] },
          }),
        }),
      );
    });
  });

  describe('searchUsersById', () => {
    it('throws when id missing', async () => {
      await expect(controller.searchUsersById('', me)).rejects.toThrow(/ID/);
    });

    it('returns [] when not found', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      expect(await controller.searchUsersById('x', me)).toEqual([]);
    });

    it('returns [] when found user is self', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1' } as any);
      expect(await controller.searchUsersById('u1', me)).toEqual([]);
    });

    it('returns [] when already friend', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'u2' } as any);
      prisma.userFriend.findFirst.mockResolvedValueOnce({ id: 'f' } as any);
      expect(await controller.searchUsersById('u2', me)).toEqual([]);
    });

    it('returns array with profile when fresh user', async () => {
      const target = { id: 'u2', name: 'Bob' };
      prisma.user.findUnique.mockResolvedValueOnce(target as any);
      prisma.userFriend.findFirst.mockResolvedValueOnce(null);
      expect(await controller.searchUsersById('u2', me)).toEqual([target]);
    });
  });

  describe('requestFriend', () => {
    it('throws when neither identifier present', async () => {
      await expect(controller.requestFriend('', '', me)).rejects.toThrow(
        /userCode/,
      );
    });

    it('throws when target not found', async () => {
      prisma.user.findFirst.mockResolvedValueOnce(null);
      await expect(controller.requestFriend('CODE', '', me)).rejects.toThrow(
        /tidak ditemukan/,
      );
    });

    it('throws when targeting self', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'u1' } as any);
      await expect(controller.requestFriend('CODE', '', me)).rejects.toThrow(
        /diri/,
      );
    });

    it('throws when already friend', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'u2' } as any);
      prisma.userFriend.findFirst.mockResolvedValueOnce({ id: 'f' } as any);
      await expect(controller.requestFriend('CODE', '', me)).rejects.toThrow(
        /teman/,
      );
    });

    it('auto-accepts when reverse pending request exists', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'u2' } as any);
      prisma.userFriend.findFirst.mockResolvedValueOnce(null);
      prisma.friendRequest.findFirst.mockResolvedValueOnce({ id: 'rr' } as any); // reverseRequest
      prisma.friendRequest.update.mockResolvedValueOnce({} as any);
      prisma.userFriend.upsert.mockResolvedValue({} as any);

      const result = await controller.requestFriend('CODE', '', me);

      expect(prisma.friendRequest.update).toHaveBeenCalledWith({
        where: { id: 'rr' },
        data: { status: 'ACCEPTED' },
      });
      expect(prisma.userFriend.upsert).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ ok: true, autoAccepted: true });
    });

    it('throws when existing outbound pending request', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({ id: 'u2' } as any);
      prisma.userFriend.findFirst.mockResolvedValueOnce(null);
      prisma.friendRequest.findFirst
        .mockResolvedValueOnce(null) // no reverse
        .mockResolvedValueOnce({ id: 'fr' } as any); // existing outbound

      await expect(controller.requestFriend('CODE', '', me)).rejects.toThrow(
        /dikirim/,
      );
    });

    it('creates new friend request when none exists', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'u2' } as any);
      prisma.userFriend.findFirst.mockResolvedValueOnce(null);
      prisma.friendRequest.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prisma.friendRequest.create.mockResolvedValueOnce({
        id: 'fr-new',
      } as any);

      const result = await controller.requestFriend('', 'u2', me);

      expect(prisma.friendRequest.create).toHaveBeenCalledWith({
        data: { senderId: 'u1', receiverId: 'u2' },
        include: expect.any(Object),
      });
      expect(result).toEqual({ id: 'fr-new' });
    });
  });

  describe('getFriendRequests / getSentFriendRequests', () => {
    it('returns received requests', async () => {
      prisma.friendRequest.findMany.mockResolvedValueOnce([
        { id: 'r1' },
      ] as any);
      const result = await controller.getFriendRequests(me);
      expect(prisma.friendRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { receiverId: 'u1', status: 'PENDING' },
        }),
      );
      expect(result).toEqual([{ id: 'r1' }]);
    });

    it('returns sent requests', async () => {
      prisma.friendRequest.findMany.mockResolvedValueOnce([] as any);
      await controller.getSentFriendRequests(me);
      expect(prisma.friendRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { senderId: 'u1', status: 'PENDING' },
        }),
      );
    });
  });

  describe('acceptFriendRequest', () => {
    it('throws when request not found or wrong receiver', async () => {
      prisma.friendRequest.findUnique.mockResolvedValueOnce(null);
      await expect(controller.acceptFriendRequest('r1', me)).rejects.toThrow(
        /tidak ditemukan/,
      );

      prisma.friendRequest.findUnique.mockResolvedValueOnce({
        id: 'r1',
        receiverId: 'other',
      } as any);
      await expect(controller.acceptFriendRequest('r1', me)).rejects.toThrow(
        /tidak ditemukan/,
      );
    });

    it('updates status + upserts both friendship rows', async () => {
      prisma.friendRequest.findUnique.mockResolvedValueOnce({
        id: 'r1',
        senderId: 'u2',
        receiverId: 'u1',
      } as any);
      prisma.friendRequest.update.mockResolvedValueOnce({} as any);
      prisma.userFriend.upsert.mockResolvedValue({} as any);

      const result = await controller.acceptFriendRequest('r1', me);
      expect(prisma.userFriend.upsert).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ ok: true });
    });
  });

  describe('rejectFriendRequest', () => {
    it('throws when not found', async () => {
      prisma.friendRequest.findUnique.mockResolvedValueOnce(null);
      await expect(controller.rejectFriendRequest('r1', me)).rejects.toThrow();
    });

    it('updates status to REJECTED', async () => {
      prisma.friendRequest.findUnique.mockResolvedValueOnce({
        id: 'r1',
        receiverId: 'u1',
      } as any);
      prisma.friendRequest.update.mockResolvedValueOnce({} as any);

      const result = await controller.rejectFriendRequest('r1', me);
      expect(prisma.friendRequest.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { status: 'REJECTED' },
      });
      expect(result).toEqual({ ok: true });
    });
  });

  describe('removeFriend', () => {
    it('deletes both directions of friendship', async () => {
      prisma.userFriend.deleteMany.mockResolvedValue({ count: 1 } as any);
      const result = await controller.removeFriend('u2', me);
      expect(prisma.userFriend.deleteMany).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ message: 'Friend removed' });
    });
  });

  // ============== GROUPS ==============

  describe('getGroups', () => {
    it('maps groups + members', async () => {
      prisma.group.findMany.mockResolvedValueOnce([
        {
          id: 'g1',
          name: 'Squad',
          createdAt: new Date(),
          members: [
            {
              user: {
                id: 'u1',
                name: 'A',
                email: 'a@b',
                avatarUrl: null,
                bio: null,
              },
              role: 'ADMIN',
              canCreateSchedule: true,
            },
          ],
        },
      ] as any);

      const result = await controller.getGroups(me);
      expect(result[0]?.members[0]?.role).toBe('ADMIN');
    });
  });

  describe('createGroup', () => {
    it('throws when name missing', async () => {
      await expect(controller.createGroup('', me)).rejects.toThrow(/Nama/);
    });

    it('creates group + admin membership', async () => {
      prisma.group.create.mockResolvedValueOnce({
        id: 'g1',
        name: 'Squad',
        createdAt: new Date(),
      } as any);
      prisma.groupMember.create.mockResolvedValueOnce({} as any);
      prisma.groupMember.findMany.mockResolvedValueOnce([
        {
          user: { id: 'u1', name: 'A', email: 'a@b' },
          role: 'ADMIN',
          canCreateSchedule: true,
        },
      ] as any);

      const result = await controller.createGroup('Squad', me);
      expect(prisma.groupMember.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          role: 'ADMIN',
          canCreateSchedule: true,
        }),
      });
      expect(result.members[0]?.role).toBe('ADMIN');
    });
  });

  describe('addMemberToGroup', () => {
    it('throws when no memberId', async () => {
      await expect(
        controller.addMemberToGroup('g1', '', false, me),
      ).rejects.toThrow(/userId/);
    });

    it('forbids non-admin/moderator', async () => {
      prisma.groupMember.findFirst.mockResolvedValueOnce({
        role: 'MEMBER',
      } as any);
      await expect(
        controller.addMemberToGroup('g1', 'u2', false, me),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws when target user missing', async () => {
      prisma.groupMember.findFirst.mockResolvedValueOnce({
        role: 'ADMIN',
      } as any);
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(
        controller.addMemberToGroup('g1', 'u2', false, me),
      ).rejects.toThrow(/ditemukan/);
    });

    it('upserts member then returns group payload', async () => {
      prisma.groupMember.findFirst.mockResolvedValueOnce({
        role: 'ADMIN',
      } as any);
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'u2' } as any);
      prisma.groupMember.upsert.mockResolvedValueOnce({} as any);
      prisma.group.findUnique.mockResolvedValueOnce({
        id: 'g1',
        name: 'Squad',
        createdAt: new Date(),
        members: [],
      } as any);

      const result = await controller.addMemberToGroup('g1', 'u2', true, me);
      expect(prisma.groupMember.upsert).toHaveBeenCalled();
      expect(result.id).toBe('g1');
    });
  });

  describe('inviteToGroup', () => {
    it('forbids non-admin', async () => {
      prisma.groupMember.findFirst.mockResolvedValueOnce({
        role: 'MODERATOR',
      } as any);
      await expect(controller.inviteToGroup('g1', 'u2', me)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws when invitee not friend', async () => {
      prisma.groupMember.findFirst.mockResolvedValueOnce({
        role: 'ADMIN',
      } as any);
      prisma.userFriend.findFirst.mockResolvedValueOnce(null);
      await expect(controller.inviteToGroup('g1', 'u2', me)).rejects.toThrow(
        /teman/,
      );
    });

    it('throws when already member', async () => {
      prisma.groupMember.findFirst
        .mockResolvedValueOnce({ role: 'ADMIN' } as any) // admin check
        .mockResolvedValueOnce({ id: 'm' } as any); // already member
      prisma.userFriend.findFirst.mockResolvedValueOnce({ id: 'f' } as any);
      await expect(controller.inviteToGroup('g1', 'u2', me)).rejects.toThrow(
        /anggota/,
      );
    });

    it('upserts invite', async () => {
      prisma.groupMember.findFirst
        .mockResolvedValueOnce({ role: 'ADMIN' } as any)
        .mockResolvedValueOnce(null);
      prisma.userFriend.findFirst.mockResolvedValueOnce({ id: 'f' } as any);
      prisma.groupInvite.upsert.mockResolvedValueOnce({ id: 'inv' } as any);

      const result = await controller.inviteToGroup('g1', 'u2', me);
      expect(result).toEqual({ id: 'inv' });
    });
  });

  describe('getGroupInvites', () => {
    it('returns pending invites', async () => {
      prisma.groupInvite.findMany.mockResolvedValueOnce([] as any);
      await controller.getGroupInvites(me);
      expect(prisma.groupInvite.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { inviteeId: 'u1', status: 'PENDING' },
        }),
      );
    });
  });

  describe('acceptGroupInvite', () => {
    it('throws when not found', async () => {
      prisma.groupInvite.findUnique.mockResolvedValueOnce(null);
      await expect(controller.acceptGroupInvite('i1', me)).rejects.toThrow();
    });

    it('throws when invitee mismatch', async () => {
      prisma.groupInvite.findUnique.mockResolvedValueOnce({
        inviteeId: 'other',
      } as any);
      await expect(controller.acceptGroupInvite('i1', me)).rejects.toThrow();
    });

    it('accepts invite + upserts membership', async () => {
      prisma.groupInvite.findUnique.mockResolvedValueOnce({
        id: 'i1',
        inviteeId: 'u1',
        groupId: 'g1',
      } as any);
      prisma.groupInvite.update.mockResolvedValueOnce({} as any);
      prisma.groupMember.upsert.mockResolvedValueOnce({} as any);

      const result = await controller.acceptGroupInvite('i1', me);
      expect(result).toEqual({ ok: true });
    });
  });

  describe('rejectGroupInvite', () => {
    it('rejects', async () => {
      prisma.groupInvite.findUnique.mockResolvedValueOnce({
        inviteeId: 'u1',
      } as any);
      prisma.groupInvite.update.mockResolvedValueOnce({} as any);
      const result = await controller.rejectGroupInvite('i1', me);
      expect(prisma.groupInvite.update).toHaveBeenCalledWith({
        where: { id: 'i1' },
        data: { status: 'REJECTED' },
      });
      expect(result).toEqual({ ok: true });
    });
  });

  // ============== USER PROFILE ==============

  describe('getUserProfile', () => {
    it('throws when target missing', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(controller.getUserProfile('t1', me)).rejects.toThrow();
    });

    it('returns FRIEND relationship', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 't1' } as any);
      prisma.userFriend.findFirst.mockResolvedValueOnce({ id: 'f' } as any);
      prisma.friendRequest.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await controller.getUserProfile('t1', me);
      expect(result.relationship).toBe('FRIEND');
    });

    it('returns PENDING_SENT', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 't1' } as any);
      prisma.userFriend.findFirst.mockResolvedValueOnce(null);
      prisma.friendRequest.findFirst
        .mockResolvedValueOnce({ id: 'r' } as any)
        .mockResolvedValueOnce(null);
      const result = await controller.getUserProfile('t1', me);
      expect(result.relationship).toBe('PENDING_SENT');
    });

    it('returns PENDING_RECEIVED', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 't1' } as any);
      prisma.userFriend.findFirst.mockResolvedValueOnce(null);
      prisma.friendRequest.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'r' } as any);
      const result = await controller.getUserProfile('t1', me);
      expect(result.relationship).toBe('PENDING_RECEIVED');
    });

    it('returns NONE when no relationship', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 't1' } as any);
      prisma.userFriend.findFirst.mockResolvedValueOnce(null);
      prisma.friendRequest.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      const result = await controller.getUserProfile('t1', me);
      expect(result.relationship).toBe('NONE');
    });

    it('includes groupInfo when groupId provided and member', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 't1' } as any);
      prisma.userFriend.findFirst.mockResolvedValueOnce(null);
      prisma.friendRequest.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      const createdAt = new Date();
      prisma.groupMember.findFirst.mockResolvedValueOnce({
        role: 'MEMBER',
        createdAt,
      } as any);

      const result = await controller.getUserProfile('t1', me, 'g1');
      expect(result.groupInfo).toEqual({ role: 'MEMBER', joinedAt: createdAt });
    });

    it('groupInfo is null when not a group member', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 't1' } as any);
      prisma.userFriend.findFirst.mockResolvedValueOnce(null);
      prisma.friendRequest.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prisma.groupMember.findFirst.mockResolvedValueOnce(null);

      const result = await controller.getUserProfile('t1', me, 'g1');
      expect(result.groupInfo).toBeNull();
    });
  });

  // ============== GROUP MGMT ==============

  describe('updateGroupName', () => {
    it('throws when name blank', async () => {
      await expect(controller.updateGroupName('g1', '', me)).rejects.toThrow();
    });

    it('forbids non-admin/moderator', async () => {
      prisma.groupMember.findFirst.mockResolvedValueOnce({
        role: 'MEMBER',
      } as any);
      await expect(controller.updateGroupName('g1', 'X', me)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('updates name when admin', async () => {
      prisma.groupMember.findFirst.mockResolvedValueOnce({
        role: 'ADMIN',
      } as any);
      prisma.group.update.mockResolvedValueOnce({ id: 'g1', name: 'X' } as any);
      const result = await controller.updateGroupName('g1', 'X', me);
      expect(result).toEqual({ id: 'g1', name: 'X' });
    });
  });

  describe('removeGroupMember', () => {
    it('forbids non-admin', async () => {
      prisma.groupMember.findFirst.mockResolvedValueOnce({
        role: 'MODERATOR',
      } as any);
      await expect(
        controller.removeGroupMember('g1', 'u2', me),
      ).rejects.toThrow(ForbiddenException);
    });

    it('removes when admin', async () => {
      prisma.groupMember.findFirst.mockResolvedValueOnce({
        role: 'ADMIN',
      } as any);
      prisma.groupMember.deleteMany.mockResolvedValueOnce({ count: 1 } as any);
      const result = await controller.removeGroupMember('g1', 'u2', me);
      expect(prisma.groupMember.deleteMany).toHaveBeenCalledWith({
        where: { groupId: 'g1', userId: 'u2' },
      });
      expect(result).toEqual({ ok: true });
    });
  });

  describe('promoteToModerator / demoteToMember', () => {
    it('promote forbids non-admin', async () => {
      prisma.groupMember.findFirst.mockResolvedValueOnce({
        role: 'MEMBER',
      } as any);
      await expect(
        controller.promoteToModerator('g1', 'u2', me),
      ).rejects.toThrow(ForbiddenException);
    });

    it('promotes when admin', async () => {
      prisma.groupMember.findFirst.mockResolvedValueOnce({
        role: 'ADMIN',
      } as any);
      prisma.groupMember.updateMany.mockResolvedValueOnce({ count: 1 } as any);
      await controller.promoteToModerator('g1', 'u2', me);
      expect(prisma.groupMember.updateMany).toHaveBeenCalledWith({
        where: { groupId: 'g1', userId: 'u2' },
        data: { role: 'MODERATOR' },
      });
    });

    it('demote forbids non-admin', async () => {
      prisma.groupMember.findFirst.mockResolvedValueOnce({
        role: 'MEMBER',
      } as any);
      await expect(controller.demoteToMember('g1', 'u2', me)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('demotes when admin', async () => {
      prisma.groupMember.findFirst.mockResolvedValueOnce({
        role: 'ADMIN',
      } as any);
      prisma.groupMember.updateMany.mockResolvedValueOnce({ count: 1 } as any);
      await controller.demoteToMember('g1', 'u2', me);
      expect(prisma.groupMember.updateMany).toHaveBeenCalledWith({
        where: { groupId: 'g1', userId: 'u2' },
        data: { role: 'MEMBER' },
      });
    });
  });

  describe('transferAdmin', () => {
    it('throws when targetUserId missing', async () => {
      await expect(controller.transferAdmin('g1', '', me)).rejects.toThrow();
    });

    it('forbids non-admin', async () => {
      prisma.groupMember.findFirst.mockResolvedValueOnce(null);
      await expect(controller.transferAdmin('g1', 'u2', me)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws when target not member', async () => {
      prisma.groupMember.findFirst
        .mockResolvedValueOnce({ role: 'ADMIN' } as any) // current admin
        .mockResolvedValueOnce(null); // target
      await expect(controller.transferAdmin('g1', 'u2', me)).rejects.toThrow(
        /anggota/,
      );
    });

    it('demotes current admin + promotes target', async () => {
      prisma.groupMember.findFirst
        .mockResolvedValueOnce({ role: 'ADMIN' } as any)
        .mockResolvedValueOnce({ id: 'm' } as any);
      prisma.groupMember.updateMany.mockResolvedValue({ count: 1 } as any);

      const result = await controller.transferAdmin('g1', 'u2', me);

      expect(prisma.groupMember.updateMany).toHaveBeenNthCalledWith(1, {
        where: { groupId: 'g1', role: 'ADMIN' },
        data: { role: 'MODERATOR' },
      });
      expect(prisma.groupMember.updateMany).toHaveBeenNthCalledWith(2, {
        where: { groupId: 'g1', userId: 'u2' },
        data: { role: 'ADMIN' },
      });
      expect(result).toEqual({ ok: true });
    });
  });

  // ============== AUTH GATE (sample) ==============

  describe('auth gate', () => {
    it.each([
      ['getFriends', () => controller.getFriends(null)],
      ['searchUsers', () => controller.searchUsers('x', null)],
      ['createGroup', () => controller.createGroup('x', null)],
      ['getGroups', () => controller.getGroups(null)],
      ['getGroupInvites', () => controller.getGroupInvites(null)],
      ['acceptGroupInvite', () => controller.acceptGroupInvite('x', null)],
      ['removeFriend', () => controller.removeFriend('x', null)],
      ['transferAdmin', () => controller.transferAdmin('g', 't', null)],
    ])('%s throws BadRequest without auth', async (_name, fn) => {
      await expect(fn()).rejects.toThrow(BadRequestException);
    });
  });
});
