import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Inject,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { CreateScheduleUseCase } from '../application/use-cases/create-schedule.use-case';
import type { IScheduleRepository } from '../domain/schedule.repository.interface';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/user.decorator';
import { PrismaService } from '../../../../prisma/prisma.service';
import { Schedule, ScheduleType, ScheduleColor, ScheduleImportance } from '../domain/schedule.entity';

@Controller('schedules')
@UseGuards(JwtAuthGuard)
export class ScheduleController {
  constructor(
    private readonly createSchedule: CreateScheduleUseCase,
    @Inject('IScheduleRepository')
    private readonly scheduleRepo: IScheduleRepository,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async getAll(@CurrentUser() user: any) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    return await this.scheduleRepo.findByUserId(user.sub);
  }

  @Post('conflicts')
  async checkConflicts(
    @Body('startTime') startTime: string,
    @Body('endTime') endTime: string,
    @CurrentUser() user: any,
  ) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    if (!startTime || !endTime) {
      throw new BadRequestException('startTime dan endTime harus diisi');
    }
    const conflicts = await this.scheduleRepo.findInTimeRange(
      new Date(startTime),
      new Date(endTime),
      user.sub,
    );
    return { hasConflict: conflicts.length > 0, conflicts };
  }

  @Post()
  async create(@Body() dto: CreateScheduleDto, @CurrentUser() user: any) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    if (dto.groupId) {
      const member = await this.prisma.groupMember.findFirst({
        where: { groupId: dto.groupId, userId: user.sub },
      });
      if (!member) {
        throw new BadRequestException('Anda bukan anggota grup ini');
      }
      if (member.role !== 'ADMIN' && !member.canCreateSchedule) {
        throw new BadRequestException('Anda tidak memiliki akses membuat jadwal grup');
      }
    }
    const created = await this.createSchedule.execute(dto, user.sub);
    if (Array.isArray(dto.taskIds) && dto.taskIds.length > 0) {
      await this.prisma.task.updateMany({
        where: { id: { in: dto.taskIds }, userId: user.sub },
        data: { scheduleId: created.id },
      });
    }
    return created;
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateScheduleDto,
    @CurrentUser() user: any,
  ) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    const schedule = await this.scheduleRepo.findById(id);
    if (!schedule) {
      throw new BadRequestException('Schedule tidak ditemukan');
    }

    const isOwner = schedule.userId === user.sub;
    let canEdit = isOwner;
    if (!isOwner && schedule.groupId) {
      const member = await this.prisma.groupMember.findFirst({
        where: { groupId: schedule.groupId, userId: user.sub },
      });
      if (member && (member.role === 'ADMIN' || member.canCreateSchedule)) {
        canEdit = true;
      }
    }
    if (!canEdit) {
      throw new BadRequestException('Tidak memiliki akses ke schedule ini');
    }

    const updated = new Schedule(
      schedule.id,
      dto.title ?? schedule.title,
      dto.startTime ? new Date(dto.startTime) : schedule.startTime,
      dto.endTime ? new Date(dto.endTime) : schedule.endTime,
      (dto.type as ScheduleType) ?? schedule.type,
      (dto.color as ScheduleColor) ?? schedule.color,
      (dto.importance as ScheduleImportance) ?? (schedule as any).importance ?? ScheduleImportance.NORMAL,
      typeof dto.progress === 'number' ? dto.progress : (schedule as any).progress ?? 0,
      dto.description ?? schedule.description,
      schedule.userId,
      dto.groupId ?? schedule.groupId,
    );

    if (typeof dto.progress === 'number' && dto.progress >= 100) {
      await this.scheduleRepo.delete(updated.id);
      return { deleted: true };
    }

    const saved = await this.scheduleRepo.save(updated);

    if (Array.isArray(dto.taskIds)) {
      await this.prisma.task.updateMany({
        where: {
          scheduleId: saved.id,
          userId: user.sub,
          ...(dto.taskIds.length > 0 ? { id: { notIn: dto.taskIds } } : {}),
        },
        data: { scheduleId: null },
      });
      if (dto.taskIds.length > 0) {
        await this.prisma.task.updateMany({
          where: { id: { in: dto.taskIds }, userId: user.sub },
          data: { scheduleId: saved.id },
        });
      }
    }

    return saved;
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @CurrentUser() user: any) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    // Verify schedule belongs to user
    const schedule = await this.scheduleRepo.findById(id);
    if (!schedule) {
      throw new BadRequestException('Schedule tidak ditemukan');
    }
    if (schedule.userId !== user.sub) {
      throw new BadRequestException('Tidak memiliki akses ke schedule ini');
    }
    await this.scheduleRepo.delete(id);
    return { message: 'Schedule deleted successfully' };
  }
}
