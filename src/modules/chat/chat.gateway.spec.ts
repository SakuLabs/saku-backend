import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

const makeSocket = (overrides: Partial<Socket> = {}) => {
  const sock = {
    handshake: { auth: {}, headers: {} },
    data: {},
    join: jest.fn(),
    disconnect: jest.fn(),
    emit: jest.fn(),
  };
  return Object.assign(sock, overrides) as unknown as Socket;
};

const makeServer = () => {
  const emit = jest.fn();
  const to = jest.fn().mockReturnValue({ emit });
  const fetchSockets = jest.fn();
  const inRoom = jest.fn().mockReturnValue({ fetchSockets });
  return { to, emit, in: inRoom, fetchSockets };
};

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let jwt: jest.Mocked<JwtService>;
  let chat: jest.Mocked<ChatService>;
  let server: ReturnType<typeof makeServer>;

  beforeEach(async () => {
    jwt = { verify: jest.fn() } as unknown as jest.Mocked<JwtService>;
    chat = {
      isGroupMember: jest.fn(),
      areFriends: jest.fn(),
      createGroupMessage: jest.fn(),
      createDirectMessage: jest.fn(),
      getGroupMemberIds: jest.fn().mockResolvedValue([]),
      getFriendIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ChatService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatGateway,
        { provide: JwtService, useValue: jwt },
        { provide: ChatService, useValue: chat },
      ],
    }).compile();

    gateway = module.get(ChatGateway);
    server = makeServer();
    (gateway as unknown as { server: typeof server }).server = server;
  });

  describe('handleConnection', () => {
    it('disconnects when no token', async () => {
      const client = makeSocket();
      gateway.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('verifies via auth.token, sets userId, joins personal room', async () => {
      const client = makeSocket({
        handshake: { auth: { token: 'abc' }, headers: {} } as any,
      });
      jwt.verify.mockReturnValue({ sub: 'u1' });
      gateway.handleConnection(client);
      expect(jwt.verify).toHaveBeenCalledWith('abc');
      expect(client.data.userId).toBe('u1');
      expect(client.join).toHaveBeenCalledWith('user:u1');
    });

    it('falls back to Authorization header', async () => {
      const client = makeSocket({
        handshake: {
          auth: {},
          headers: { authorization: 'Bearer xyz' },
        } as any,
      });
      jwt.verify.mockReturnValue({ sub: 'u2' });
      gateway.handleConnection(client);
      expect(jwt.verify).toHaveBeenCalledWith('xyz');
      expect(client.join).toHaveBeenCalledWith('user:u2');
    });

    it('disconnects on bad token', async () => {
      const client = makeSocket({
        handshake: { auth: { token: 'bad' }, headers: {} } as any,
      });
      jwt.verify.mockImplementation(() => {
        throw new Error('invalid');
      });
      gateway.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalled();
    });
  });

  describe('onJoinGroup', () => {
    it('noop when no userId on socket', async () => {
      const client = makeSocket();
      await gateway.onJoinGroup({ groupId: 'g1' }, client);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('noop when groupId missing', async () => {
      const client = makeSocket();
      client.data.userId = 'u1';
      await gateway.onJoinGroup({ groupId: '' }, client);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('joins group room when member', async () => {
      const client = makeSocket();
      client.data.userId = 'u1';
      chat.isGroupMember.mockResolvedValueOnce({ id: 'm' } as any);
      await gateway.onJoinGroup({ groupId: 'g1' }, client);
      expect(client.join).toHaveBeenCalledWith('group:g1');
    });

    it('does not join when not member', async () => {
      const client = makeSocket();
      client.data.userId = 'u1';
      chat.isGroupMember.mockResolvedValueOnce(null);
      await gateway.onJoinGroup({ groupId: 'g1' }, client);
      expect(client.join).not.toHaveBeenCalled();
    });
  });

  describe('onJoinDM', () => {
    it('noop without auth', async () => {
      await gateway.onJoinDM({ userId: 'u2' }, makeSocket());
    });

    it('joins sorted dm room when friends', async () => {
      const client = makeSocket();
      client.data.userId = 'u2';
      chat.areFriends.mockResolvedValueOnce(true);
      await gateway.onJoinDM({ userId: 'u1' }, client);
      expect(client.join).toHaveBeenCalledWith('dm:u1:u2');
    });

    it('does not join when not friends', async () => {
      const client = makeSocket();
      client.data.userId = 'u1';
      chat.areFriends.mockResolvedValueOnce(false);
      await gateway.onJoinDM({ userId: 'u2' }, client);
      expect(client.join).not.toHaveBeenCalled();
    });
  });

  describe('onSendGroupMessage', () => {
    const body = { groupId: 'g1', content: 'hi  ' };

    it('noop when content empty', async () => {
      const client = makeSocket();
      client.data.userId = 'u1';
      await gateway.onSendGroupMessage(
        { groupId: 'g1', content: '   ' },
        client,
      );
      expect(chat.createGroupMessage).not.toHaveBeenCalled();
    });

    it('noop when non-member', async () => {
      const client = makeSocket();
      client.data.userId = 'u1';
      chat.isGroupMember.mockResolvedValueOnce(null);
      await gateway.onSendGroupMessage(body, client);
      expect(chat.createGroupMessage).not.toHaveBeenCalled();
    });

    it('creates message and broadcasts to group room', async () => {
      const client = makeSocket();
      client.data.userId = 'u1';
      chat.isGroupMember.mockResolvedValueOnce({ id: 'm' } as any);
      const msg = { id: 'msg' };
      chat.createGroupMessage.mockResolvedValueOnce(msg as any);
      await gateway.onSendGroupMessage(body, client);
      expect(chat.createGroupMessage).toHaveBeenCalledWith('g1', 'u1', 'hi');
      expect(server.to).toHaveBeenCalledWith('group:g1');
      expect(server.emit).toHaveBeenCalledWith('receive_message', msg);
    });
  });

  describe('onSendDM', () => {
    const body = { recipientId: 'u2', content: 'yo' };

    it('noop when not friends', async () => {
      const client = makeSocket();
      client.data.userId = 'u1';
      chat.areFriends.mockResolvedValueOnce(false);
      await gateway.onSendDM(body, client);
      expect(chat.createDirectMessage).not.toHaveBeenCalled();
    });

    it('creates DM and broadcasts to sorted dm room', async () => {
      const client = makeSocket();
      client.data.userId = 'u1';
      chat.areFriends.mockResolvedValueOnce(true);
      const msg = { id: 'dm' };
      chat.createDirectMessage.mockResolvedValueOnce(msg as any);
      await gateway.onSendDM(body, client);
      expect(server.to).toHaveBeenCalledWith('dm:u1:u2');
      expect(server.emit).toHaveBeenCalledWith('receive_message', msg);
    });
  });

  describe('onSendMessage (unified)', () => {
    it('handles group type', async () => {
      const client = makeSocket();
      client.data.userId = 'u1';
      chat.isGroupMember.mockResolvedValueOnce({ id: 'm' } as any);
      chat.createGroupMessage.mockResolvedValueOnce({ id: 'msg' } as any);
      await gateway.onSendMessage(
        { type: 'group', groupId: 'g1', content: 'hi' },
        client,
      );
      expect(chat.createGroupMessage).toHaveBeenCalled();
      expect(server.to).toHaveBeenCalledWith('group:g1');
    });

    it('handles dm type', async () => {
      const client = makeSocket();
      client.data.userId = 'u1';
      chat.areFriends.mockResolvedValueOnce(true);
      chat.createDirectMessage.mockResolvedValueOnce({ id: 'dm' } as any);
      await gateway.onSendMessage(
        { type: 'dm', recipientId: 'u2', content: 'yo' },
        client,
      );
      expect(server.to).toHaveBeenCalledWith('dm:u1:u2');
    });

    it('noop on group type without groupId', async () => {
      const client = makeSocket();
      client.data.userId = 'u1';
      await gateway.onSendMessage({ type: 'group', content: 'hi' }, client);
      expect(chat.createGroupMessage).not.toHaveBeenCalled();
    });
  });

  describe('onTyping', () => {
    it('broadcasts group typing to member', async () => {
      const client = makeSocket();
      client.data.userId = 'u1';
      chat.isGroupMember.mockResolvedValueOnce({ id: 'm' } as any);
      await gateway.onTyping({ isTyping: true, groupId: 'g1' }, client);
      expect(server.to).toHaveBeenCalledWith('group:g1');
      expect(server.emit).toHaveBeenCalledWith(
        'typing',
        expect.objectContaining({
          userId: 'u1',
          isTyping: true,
          groupId: 'g1',
        }),
      );
    });

    it('broadcasts dm typing to friend', async () => {
      const client = makeSocket();
      client.data.userId = 'u1';
      chat.areFriends.mockResolvedValueOnce(true);
      await gateway.onTyping(
        { isTyping: false, directMessageUserId: 'u2' },
        client,
      );
      expect(server.to).toHaveBeenCalledWith('dm:u1:u2');
    });

    it('noop when non-member tries to type', async () => {
      const client = makeSocket();
      client.data.userId = 'u1';
      chat.isGroupMember.mockResolvedValueOnce(null);
      await gateway.onTyping({ isTyping: true, groupId: 'g1' }, client);
      expect(server.emit).not.toHaveBeenCalled();
    });
  });

  describe('onFriendRequest', () => {
    it('noop without userId or recipientId', async () => {
      await gateway.onFriendRequest({ recipientId: '' }, makeSocket());
      expect(server.in).not.toHaveBeenCalled();
    });

    it('emits friendRequest to all sockets in recipient personal room', async () => {
      const client = makeSocket();
      client.data.userId = 'u1';
      const sock1 = { emit: jest.fn() };
      const sock2 = { emit: jest.fn() };
      server.fetchSockets.mockResolvedValueOnce([sock1, sock2]);

      await gateway.onFriendRequest({ recipientId: 'u2' }, client);

      expect(server.in).toHaveBeenCalledWith('user:u2');
      expect(sock1.emit).toHaveBeenCalledWith('friendRequest', {
        senderId: 'u1',
        recipientId: 'u2',
      });
      expect(sock2.emit).toHaveBeenCalledWith('friendRequest', {
        senderId: 'u1',
        recipientId: 'u2',
      });
    });
  });

  describe('handleDisconnect', () => {
    it('is a no-op', () => {
      expect(() => gateway.handleDisconnect(makeSocket())).not.toThrow();
    });
  });
});
