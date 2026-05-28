import {
  Schedule,
  ScheduleColor,
  ScheduleImportance,
  ScheduleType,
} from './schedule.entity';

const minutes = (n: number) => n * 60 * 1000;

const build = (
  overrides: Partial<{
    id: string;
    title: string;
    startTime: Date;
    endTime: Date;
    type: ScheduleType;
    color: ScheduleColor;
    importance: ScheduleImportance;
    progress: number;
    description?: string;
    userId?: string;
    groupId?: string;
  }> = {},
) => {
  const now = new Date();
  const m = {
    id: 'sch-1',
    title: 'Math class',
    startTime: now,
    endTime: new Date(now.getTime() + minutes(60)),
    type: ScheduleType.EVENT,
    color: ScheduleColor.PURPLE,
    importance: ScheduleImportance.NORMAL,
    progress: 0,
    ...overrides,
  };
  return new Schedule(
    m.id,
    m.title,
    m.startTime,
    m.endTime,
    m.type,
    m.color,
    m.importance,
    m.progress,
    m.description,
    m.userId,
    m.groupId,
  );
};

describe('Schedule entity', () => {
  describe('validate', () => {
    it('rejects start >= end', () => {
      const t = new Date();
      expect(() => build({ startTime: t, endTime: t })).toThrow(/Waktu/);
    });

    it('rejects title shorter than 3 chars', () => {
      expect(() => build({ title: 'no' })).toThrow(/Judul/);
    });

    it('rejects progress < 0', () => {
      expect(() => build({ progress: -1 })).toThrow(/Progress/);
    });

    it('rejects progress > 100', () => {
      expect(() => build({ progress: 101 })).toThrow(/Progress/);
    });

    it('accepts a valid schedule', () => {
      const s = build();
      expect(s.title).toBe('Math class');
    });
  });

  describe('hasConflict', () => {
    const baseStart = new Date('2026-01-01T10:00:00Z');
    const baseEnd = new Date('2026-01-01T11:00:00Z');

    const a = build({ id: 'a', startTime: baseStart, endTime: baseEnd });

    it('returns true on overlap', () => {
      const b = build({
        id: 'b',
        startTime: new Date('2026-01-01T10:30:00Z'),
        endTime: new Date('2026-01-01T11:30:00Z'),
      });
      expect(a.hasConflict(b)).toBe(true);
      expect(b.hasConflict(a)).toBe(true);
    });

    it('returns false when adjacent (no overlap)', () => {
      const b = build({
        id: 'b',
        startTime: new Date('2026-01-01T11:00:00Z'),
        endTime: new Date('2026-01-01T12:00:00Z'),
      });
      expect(a.hasConflict(b)).toBe(false);
    });

    it('returns false when comparing same id (treated as self)', () => {
      const b = build({ id: 'a' });
      expect(a.hasConflict(b)).toBe(false);
    });
  });

  describe('getDuration', () => {
    it('returns end-start in ms', () => {
      const start = new Date('2026-01-01T10:00:00Z');
      const end = new Date('2026-01-01T10:45:00Z');
      const s = build({ startTime: start, endTime: end });
      expect(s.getDuration()).toBe(45 * 60 * 1000);
    });
  });
});
