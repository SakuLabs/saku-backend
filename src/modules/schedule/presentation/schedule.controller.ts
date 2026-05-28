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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { CreateScheduleUseCase } from '../application/use-cases/create-schedule.use-case';
import type { IScheduleRepository } from '../domain/schedule.repository.interface';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/user.decorator';
import type { JwtPayload } from '../../../common/types/jwt-payload';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  Schedule,
  ScheduleType,
  ScheduleColor,
  ScheduleImportance,
} from '../domain/schedule.entity';

class CheckConflictsDto {
  startTime: string;
  endTime: string;
}

@ApiTags('Schedules')
@ApiBearerAuth()
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
  @ApiOperation({ summary: 'Get all schedules for current user' })
  @ApiResponse({ status: 200, description: 'Schedules retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAll(@CurrentUser() user: JwtPayload | null) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    return await this.scheduleRepo.findByUserId(user.sub);
  }

  @Post('conflicts')
  @ApiOperation({ summary: 'Check for schedule conflicts' })
  @ApiResponse({ status: 200, description: 'Conflict check completed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({
    type: CheckConflictsDto,
    examples: {
      example1: {
        summary: 'Check conflicts for a 2-hour slot',
        value: {
          startTime: '2024-02-20T10:00:00Z',
          endTime: '2024-02-20T12:00:00Z',
        },
      },
    },
  })
  async checkConflicts(
    @Body('startTime') startTime: string,
    @Body('endTime') endTime: string,
    @CurrentUser() user: JwtPayload | null,
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
  @ApiOperation({ summary: 'Create a new schedule' })
  @ApiResponse({ status: 201, description: 'Schedule created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - no access to group' })
  @ApiBody({
    type: CreateScheduleDto,
    examples: {
      example1: {
        summary: 'Create a personal schedule',
        value: {
          title: 'Study Session',
          startTime: '2024-02-20T10:00:00Z',
          endTime: '2024-02-20T12:00:00Z',
          type: 'STUDY',
          color: 'BLUE',
          importance: 'HIGH',
          description: 'Study for mathematics exam',
          taskIds: [],
        },
      },
      example2: {
        summary: 'Create a group schedule',
        value: {
          title: 'Group Meeting',
          startTime: '2024-02-20T14:00:00Z',
          endTime: '2024-02-20T15:00:00Z',
          type: 'MEETING',
          color: 'GREEN',
          importance: 'NORMAL',
          description: 'Weekly project sync',
          groupId: 'group-id-here',
          taskIds: [],
        },
      },
    },
  })
  async create(
    @Body() dto: CreateScheduleDto,
    @CurrentUser() user: JwtPayload | null,
  ) {
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
        throw new BadRequestException(
          'Anda tidak memiliki akses membuat jadwal grup',
        );
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
  @ApiOperation({ summary: 'Update a schedule' })
  @ApiResponse({ status: 200, description: 'Schedule updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - no access to schedule',
  })
  @ApiResponse({ status: 404, description: 'Schedule not found' })
  @ApiParam({ name: 'id', description: 'Schedule ID' })
  @ApiBody({
    type: UpdateScheduleDto,
    examples: {
      example1: {
        summary: 'Update schedule title and time',
        value: {
          title: 'Updated Study Session',
          startTime: '2024-02-20T11:00:00Z',
          endTime: '2024-02-20T13:00:00Z',
        },
      },
      example2: {
        summary: 'Update schedule progress',
        value: {
          progress: 75,
        },
      },
    },
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateScheduleDto,
    @CurrentUser() user: JwtPayload | null,
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
      (dto.importance as ScheduleImportance) ??
        (schedule as any).importance ??
        ScheduleImportance.NORMAL,
      typeof dto.progress === 'number'
        ? dto.progress
        : ((schedule as any).progress ?? 0),
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
  @ApiOperation({ summary: 'Delete a schedule' })
  @ApiResponse({ status: 200, description: 'Schedule deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Schedule not found' })
  @ApiParam({ name: 'id', description: 'Schedule ID' })
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload | null,
  ) {
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
