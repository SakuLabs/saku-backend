import { Injectable } from '@nestjs/common';
import { IScheduleRepository } from '../../domain/schedule.repository.interface';
import { Schedule, ScheduleType, ScheduleColor } from '../../domain/schedule.entity';
import { PrismaService } from '../../../../../prisma/prisma.service';

@Injectable()
export class PrismaScheduleRepository implements IScheduleRepository {
  constructor(private prisma: PrismaService) {}

  async save(schedule: Schedule): Promise<Schedule> {
    if (!schedule.userId) {
      throw new Error('userId is required for schedule');
    }
    
    const data = await this.prisma.schedule.upsert({
      where: { id: schedule.id },
      update: {
        title: schedule.title,
        description: schedule.description,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        type: schedule.type,
        color: schedule.color,
        importance: schedule.importance,
        progress: schedule.progress,
        userId: schedule.userId,
        groupId: schedule.groupId,
      },
      create: {
        id: schedule.id,
        title: schedule.title,
        description: schedule.description,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        type: schedule.type,
        color: schedule.color,
        importance: schedule.importance,
        progress: schedule.progress,
        userId: schedule.userId,
        groupId: schedule.groupId,
      },
    });

    return this.toDomain(data);
  }

  async findById(id: string): Promise<Schedule | null> {
    const data = await this.prisma.schedule.findUnique({ where: { id } });
    return data ? this.toDomain(data) : null;
  }

  async findByUserId(userId: string): Promise<Schedule[]> {
    const memberships = await this.prisma.groupMember.findMany({
      where: { userId },
      select: { groupId: true },
    });
    const groupIds = memberships.map((m) => m.groupId);
    const list = await this.prisma.schedule.findMany({
      where: {
        OR: [
          { userId },
          ...(groupIds.length > 0 ? [{ groupId: { in: groupIds } }] : []),
        ],
      },
      orderBy: { startTime: 'asc' },
    });
    return list.map((item) => this.toDomain(item));
  }

  async findInTimeRange(
    start: Date,
    end: Date,
    userId?: string,
  ): Promise<Schedule[]> {
    const where: any = {
      OR: [
        {
          startTime: { lte: end },
          endTime: { gte: start },
        },
      ],
    };

    if (userId) {
      where.userId = userId;
    }

    const list = await this.prisma.schedule.findMany({
      where,
      orderBy: { startTime: 'asc' },
    });

    return list.map((item) => this.toDomain(item));
  }

  async delete(id: string): Promise<void> {
    await this.prisma.schedule.delete({ where: { id } });
  }

  private toDomain(data: any): Schedule {
    return new Schedule(
      data.id,
      data.title,
      data.startTime,
      data.endTime,
      data.type as ScheduleType,
      data.color as ScheduleColor,
      data.importance as any,
      data.progress,
      data.description,
      data.userId,
      data.groupId,
    );
  }
}
