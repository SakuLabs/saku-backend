// ─────────────────────────────────────────────────────────────────────────────
// video-call.interface.ts
// Central type definitions — single source of truth for the entire module
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_PARTICIPANTS = 8;
export const SOCKET_NAMESPACE = '/video';

// ── Domain Entities ──────────────────────────────────────────────────────────

export interface Participant {
  socketId: string;
  userId: string;
  joinedAt: number; // epoch ms — faster than Date obj for comparisons
}

export interface Room {
  roomId: string;
  participants: Map<string, Participant>; // socketId -> Participant
  createdAt: number;
}

// ── Client → Server Payloads ─────────────────────────────────────────────────

export interface JoinRoomPayload {
  roomId: string;
  userId: string;
}

export interface SendSignalPayload {
  to: string;      // target socketId
  signal: unknown; // WebRTC SDP offer/answer or ICE candidate blob
}

// ── Server → Client Events ───────────────────────────────────────────────────

export interface UserJoinedEvent {
  socketId: string;
  userId: string;
  existingParticipants: Pick<Participant, 'socketId' | 'userId'>[];
}

export interface ReturnSignalEvent {
  from: string;    // sender socketId
  signal: unknown;
}

export interface UserLeftEvent {
  socketId: string;
  userId: string;
}

export interface RoomFullEvent {
  roomId: string;
  maxParticipants: number;
}

// ── Internal Service Results ─────────────────────────────────────────────────

export type JoinResult =
  | { ok: true; room: Room; newcomer: Participant }
  | { ok: false; reason: 'room-full' | 'already-joined' };

export type LeaveResult =
  | { ok: true; room: Room | null; leftParticipant: Participant }
  | { ok: false; reason: 'not-found' };