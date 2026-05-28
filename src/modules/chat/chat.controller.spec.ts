import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../../common/types/jwt-payload';

const me: JwtPayload = { sub: 'u1', email: 'a@b.com' };

describe('ChatController', () => {
  let controller: ChatController;
  let chat: jest.Mocked<ChatService>;

  beforeEach(async () => {
    chat = {
      isGroupMember: jest.fn(),
      getGroupMessages: jest.fn(),
      getDirectMessages: jest.fn(),
      areFriends: jest.fn(),
      createGroupMessage: jest.fn(),
      createDirectMessage: jest.fn(),
    } as unknown as jest.Mocked<ChatService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [{ provide: ChatService, useValue: chat }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ChatController);
  });

  describe('getGroupMessages', () => {
    it('throws when no user', async () => {
      await expect(controller.getGroupMessages('g1', null)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects non-members', async () => {
      chat.isGroupMember.mockResolvedValueOnce(null);
      await expect(controller.getGroupMessages('g1', me)).rejects.toThrow(
        /anggota/,
      );
      expect(chat.getGroupMessages).not.toHaveBeenCalled();
    });

    it('returns messages for member', async () => {
      chat.isGroupMember.mockResolvedValueOnce({ id: 'm' } as any);
      chat.getGroupMessages.mockResolvedValueOnce([{ id: 'msg' }] as any);
      const result = await controller.getGroupMessages('g1', me);
      expect(chat.getGroupMessages).toHaveBeenCalledWith('g1');
      expect(result).toEqual([{ id: 'msg' }]);
    });
  });

  describe('getDirectMessages', () => {
    it('throws when no user', async () => {
      await expect(controller.getDirectMessages('u2', null)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws when otherUserId missing', async () => {
      await expect(controller.getDirectMessages('', me)).rejects.toThrow(
        /userId/,
      );
    });

    it('rejects non-friends', async () => {
      chat.areFriends.mockResolvedValueOnce(false);
      await expect(controller.getDirectMessages('u2', me)).rejects.toThrow(
        /teman/,
      );
    });

    it('returns DM history for friends', async () => {
      chat.areFriends.mockResolvedValueOnce(true);
      chat.getDirectMessages.mockResolvedValueOnce([{ id: 'msg' }] as any);
      const result = await controller.getDirectMessages('u2', me);
      expect(chat.getDirectMessages).toHaveBeenCalledWith('u1', 'u2');
      expect(result).toEqual([{ id: 'msg' }]);
    });
  });

  describe('sendMessage', () => {
    it('throws when no user', async () => {
      await expect(
        controller.sendMessage({ content: 'hi' }, null),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when content empty/whitespace', async () => {
      await expect(
        controller.sendMessage({ content: '   ' }, me),
      ).rejects.toThrow(/kosong/);
    });

    it('throws when neither groupId nor directMessageUserId provided', async () => {
      await expect(
        controller.sendMessage({ content: 'hi' }, me),
      ).rejects.toThrow(/groupId/);
    });

    describe('group messages', () => {
      it('rejects non-members', async () => {
        chat.isGroupMember.mockResolvedValueOnce(null);
        await expect(
          controller.sendMessage({ content: 'hi', groupId: 'g1' }, me),
        ).rejects.toThrow(/anggota/);
      });

      it('sends to group with trimmed content', async () => {
        chat.isGroupMember.mockResolvedValueOnce({ id: 'm' } as any);
        chat.createGroupMessage.mockResolvedValueOnce({ id: 'msg' } as any);
        await controller.sendMessage(
          { content: '  hello  ', groupId: 'g1' },
          me,
        );
        expect(chat.createGroupMessage).toHaveBeenCalledWith(
          'g1',
          'u1',
          'hello',
        );
      });
    });

    describe('direct messages', () => {
      it('rejects non-friends', async () => {
        chat.areFriends.mockResolvedValueOnce(false);
        await expect(
          controller.sendMessage(
            { content: 'hi', directMessageUserId: 'u2' },
            me,
          ),
        ).rejects.toThrow(/teman/);
      });

      it('sends DM with trimmed content', async () => {
        chat.areFriends.mockResolvedValueOnce(true);
        chat.createDirectMessage.mockResolvedValueOnce({ id: 'dm' } as any);
        await controller.sendMessage(
          { content: '  yo  ', directMessageUserId: 'u2' },
          me,
        );
        expect(chat.createDirectMessage).toHaveBeenCalledWith('u1', 'u2', 'yo');
      });
    });
  });
});
