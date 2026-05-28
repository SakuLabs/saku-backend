import { Test, TestingModule } from '@nestjs/testing';
import { CreateScheduleUseCase } from './create-schedule.use-case';
import {
  Schedule,
  ScheduleColor,
  ScheduleImportance,
  ScheduleType,
} from '../../domain/schedule.entity';
import type { IScheduleRepository } from '../../domain/schedule.repository.interface';
import { CreateScheduleDto } from '../../presentation/dto/create-schedule.dto';

describe('CreateScheduleUseCase', () => {
  let useCase: CreateScheduleUseCase;
  let repo: jest.Mocked<IScheduleRepository>;

  const baseDto = (
    overrides: Partial<CreateScheduleDto> = {},
  ): CreateScheduleDto => ({
    title: 'Math class',
    startTime: '2026-01-01T10:00:00Z',
    endTime: '2026-01-01T11:00:00Z',
    ...overrides,
  });

  beforeEach(async () => {
    repo = {
      save: jest.fn().mockImplementation((s: Schedule) => Promise.resolve(s)),
    } as unknown as jest.Mocked<IScheduleRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateScheduleUseCase,
        { provide: 'IScheduleRepository', useValue: repo },
      ],
    }).compile();

    useCase = module.get(CreateScheduleUseCase);
  });

  it('creates Schedule with provided values and defaults', async () => {
    const result = await useCase.execute(baseDto(), 'user-1');

    expect(result).toBeInstanceOf(Schedule);
    expect(result.title).toBe('Math class');
    expect(result.type).toBe(ScheduleType.EVENT);
    expect(result.color).toBe(ScheduleColor.PURPLE);
    expect(result.importance).toBe(ScheduleImportance.NORMAL);
    expect(result.progress).toBe(0);
    expect(result.userId).toBe('user-1');
    expect(repo.save).toHaveBeenCalledWith(result);
  });

  it('respects explicit overrides', async () => {
    const result = await useCase.execute(
      baseDto({
        type: ScheduleType.MEETING,
        color: ScheduleColor.RED,
        importance: ScheduleImportance.HIGH,
        progress: 25,
        description: 'detail',
        groupId: 'g-1',
      }),
      'user-1',
    );

    expect(result.type).toBe(ScheduleType.MEETING);
    expect(result.color).toBe(ScheduleColor.RED);
    expect(result.importance).toBe(ScheduleImportance.HIGH);
    expect(result.progress).toBe(25);
    expect(result.description).toBe('detail');
    expect(result.groupId).toBe('g-1');
  });

  it('treats non-number progress as 0', async () => {
    const result = await useCase.execute(
      baseDto({ progress: undefined }),
      'user-1',
    );
    expect(result.progress).toBe(0);
  });

  it('propagates domain validation errors (start >= end)', async () => {
    await expect(
      useCase.execute(
        baseDto({
          startTime: '2026-01-01T11:00:00Z',
          endTime: '2026-01-01T10:00:00Z',
        }),
        'user-1',
      ),
    ).rejects.toThrow();
  });
});
