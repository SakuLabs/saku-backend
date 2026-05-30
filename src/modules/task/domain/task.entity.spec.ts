import { Task, TaskStatus } from './task.entity';

const future = (ms = 1000 * 60 * 60) => new Date(Date.now() + ms);
const past = (ms = 1000 * 60 * 60) => new Date(Date.now() - ms);

const build = (overrides: Partial<ConstructorParameters<typeof Task>> = {}) => {
  const defaults = {
    id: 'id-1',
    title: 'Valid title',
    description: '',
    startDate: new Date(),
    deadline: future(),
    priority: 2,
    progress: 0,
    status: TaskStatus.TODO,
    createdAt: new Date(),
  };
  const merged = { ...defaults, ...overrides };
  return new Task(
    merged.id,
    merged.title,
    merged.description,
    merged.startDate,
    merged.deadline,
    merged.priority,
    merged.progress,
    merged.status,
    merged.createdAt,
  );
};

describe('Task entity', () => {
  describe('constructor + validate', () => {
    it('builds a valid task with defaults', () => {
      const t = build();
      expect(t.status).toBe(TaskStatus.TODO);
    });

    it('rejects progress < 0', () => {
      expect(() => build({ progress: -1 })).toThrow(/Progress/);
    });

    it('rejects progress > 100', () => {
      expect(() => build({ progress: 101 })).toThrow(/Progress/);
    });

    it('rejects startDate after deadline', () => {
      expect(() =>
        build({ startDate: future(2 * 60 * 60 * 1000), deadline: future() }),
      ).toThrow(/Start date/);
    });

    it('rejects title shorter than 3 chars', () => {
      expect(() => build({ title: 'ab' })).toThrow(/Judul/);
    });

    it('auto-expires when deadline in past and status != DONE', () => {
      const t = build({
        startDate: past(2 * 60 * 60 * 1000),
        deadline: past(),
      });
      expect(t.status).toBe(TaskStatus.EXPIRED);
    });

    it('does not expire when deadline in past but status is DONE', () => {
      const t = build({
        startDate: past(2 * 60 * 60 * 1000),
        deadline: past(),
        status: TaskStatus.DONE,
      });
      expect(t.status).toBe(TaskStatus.DONE);
    });
  });

  describe('canBeUpdated', () => {
    it('returns true for TODO and IN_PROGRESS', () => {
      expect(build({ status: TaskStatus.TODO }).canBeUpdated()).toBe(true);
      expect(build({ status: TaskStatus.IN_PROGRESS }).canBeUpdated()).toBe(
        true,
      );
    });

    it('returns false for DONE and EXPIRED', () => {
      expect(build({ status: TaskStatus.DONE }).canBeUpdated()).toBe(false);
      const expired = build({
        startDate: past(2 * 60 * 60 * 1000),
        deadline: past(),
      });
      expect(expired.canBeUpdated()).toBe(false);
    });
  });

  describe('complete', () => {
    it('sets status DONE and progress 100', () => {
      const t = build();
      t.complete();
      expect(t.status).toBe(TaskStatus.DONE);
      expect(t.progress).toBe(100);
    });

    it('throws when already expired', () => {
      const t = build({
        startDate: past(2 * 60 * 60 * 1000),
        deadline: past(),
      });
      expect(() => t.complete()).toThrow(/expired/);
    });
  });

  describe('start', () => {
    it('moves TODO to IN_PROGRESS', () => {
      const t = build();
      t.start();
      expect(t.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('throws on DONE/EXPIRED', () => {
      const t = build({ status: TaskStatus.DONE, progress: 100 });
      expect(() => t.start()).toThrow();
    });
  });

  describe('reset', () => {
    it('moves IN_PROGRESS back to TODO', () => {
      const t = build({ status: TaskStatus.IN_PROGRESS });
      t.reset();
      expect(t.status).toBe(TaskStatus.TODO);
    });

    it('keeps TODO as TODO', () => {
      const t = build();
      t.reset();
      expect(t.status).toBe(TaskStatus.TODO);
    });

    it('throws on DONE/EXPIRED', () => {
      const t = build({ status: TaskStatus.DONE, progress: 100 });
      expect(() => t.reset()).toThrow();
    });
  });

  describe('updateStatus', () => {
    it('updates to IN_PROGRESS', () => {
      const t = build();
      t.updateStatus(TaskStatus.IN_PROGRESS);
      expect(t.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('rejects manual DONE', () => {
      const t = build();
      expect(() => t.updateStatus(TaskStatus.DONE)).toThrow(/Status/);
    });

    it('rejects manual EXPIRED', () => {
      const t = build();
      expect(() => t.updateStatus(TaskStatus.EXPIRED)).toThrow(/Status/);
    });

    it('throws when task not updatable', () => {
      const t = build({ status: TaskStatus.DONE, progress: 100 });
      expect(() => t.updateStatus(TaskStatus.TODO)).toThrow();
    });
  });

  describe('updateProgress', () => {
    it('sets progress and stays in TODO when below threshold? no — TODO -> IN_PROGRESS when > 0', () => {
      const t = build();
      t.updateProgress(50);
      expect(t.progress).toBe(50);
      expect(t.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('keeps IN_PROGRESS when progress > 0 and already IN_PROGRESS', () => {
      const t = build({ status: TaskStatus.IN_PROGRESS });
      t.updateProgress(40);
      expect(t.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('does not flip TODO to IN_PROGRESS when value=0', () => {
      const t = build();
      t.updateProgress(0);
      expect(t.status).toBe(TaskStatus.TODO);
    });

    it('completes at 100', () => {
      const t = build();
      t.updateProgress(100);
      expect(t.status).toBe(TaskStatus.DONE);
      expect(t.progress).toBe(100);
    });

    it('rejects out-of-range values', () => {
      const t = build();
      expect(() => t.updateProgress(-1)).toThrow(/Progress/);
      expect(() => t.updateProgress(101)).toThrow(/Progress/);
    });

    it('throws when task not updatable', () => {
      const t = build({ status: TaskStatus.DONE, progress: 100 });
      expect(() => t.updateProgress(50)).toThrow();
    });
  });
});
