import { Controller, Get, Post, Patch, Delete, Body, Param, Inject, UseGuards, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger';
import { CreateTaskUseCase } from '../application/use-cases/create-task.use-case';
import type { ITaskRepository } from '../domain/task.repository.interface';
import { CreateTaskDto } from './dto/create-task.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/user.decorator';
import { PrismaService } from '../../../prisma/prisma.service';

class UpdateTaskStatusDto {
  status: 'IN_PROGRESS' | 'DONE';
}

class UpdateTaskProgressDto {
  progress: number;
}

@ApiTags('Tasks')
@ApiBearerAuth()
@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TaskController {
  constructor(
    private readonly createTask: CreateTaskUseCase,
    @Inject('ITaskRepository') private readonly repo: ITaskRepository,
    private readonly prisma: PrismaService,
  ) {}

  private toTaskResponse(task: any) {
    return {
      id: task.id,
      userId: task.userId,
      title: task.title,
      description: task.description,
      priority: task.priority === 1 ? 'LOW' : task.priority === 3 ? 'HIGH' : 'MEDIUM',
      status: task.status,
      progress: task.progress,
      dueDate: task.deadline,
      scheduleId: task.scheduleId,
      groupId: task.groupId,
      createdAt: task.createdAt,
      updatedAt: task.createdAt,
    };
  }

  // Handle date-only inputs from HTML <input type="date"> by setting end-of-day deadline.
  private parseDeadline(raw?: string): Date | null {
    if (!raw) return null;
    const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
    if (dateOnlyPattern.test(raw)) {
      return new Date(`${raw}T23:59:59.999`);
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;

    // If frontend sends ISO at midnight (common from date picker),
    // normalize it to end-of-day to avoid false "past deadline" from timezone shifts.
    const isMidnightUtc =
      parsed.getUTCHours() === 0 &&
      parsed.getUTCMinutes() === 0 &&
      parsed.getUTCSeconds() === 0 &&
      parsed.getUTCMilliseconds() === 0;
    if (isMidnightUtc) {
      return new Date(
        Date.UTC(
          parsed.getUTCFullYear(),
          parsed.getUTCMonth(),
          parsed.getUTCDate(),
          23,
          59,
          59,
          999,
        ),
      );
    }

    return parsed;
  }

  @Get()
  @ApiOperation({ summary: 'Get all tasks for current user' })
  @ApiResponse({ status: 200, description: 'Tasks retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAll(@CurrentUser() user: any) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    const tasks = await this.prisma.task.findMany({
      where: {
        OR: [
          { userId: user.sub },
          { group: { members: { some: { userId: user.sub } } } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    return tasks.map((task) => this.toTaskResponse(task));
  }

  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  @ApiResponse({ status: 201, description: 'Task created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiBody({
    type: CreateTaskDto,
    examples: {
      example1: {
        summary: 'Create a simple task',
        value: {
          title: 'Complete assignment',
          description: 'Finish the programming assignment',
          priority: 'HIGH'
        }
      },
      example2: {
        summary: 'Create a task with due date',
        value: {
          title: 'Study for exam',
          description: 'Review chapters 1-5',
          priority: 'MEDIUM',
          deadline: '2024-02-20T10:00:00Z'
        }
      }
    }
  })
  async create(@Body() dto: CreateTaskDto, @CurrentUser() user: any) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    const task = await this.createTask.execute(dto, user.sub);
    const created = await this.prisma.task.findUnique({ where: { id: task.id } });
    return created ? this.toTaskResponse(created) : task;
  }

  @Post('group/:groupId')
  @ApiOperation({ summary: 'Create a new group task (admin/moderator only)' })
  @ApiResponse({ status: 201, description: 'Group task created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiParam({ name: 'groupId', description: 'Group ID' })
  async createGroupTask(
    @Param('groupId') groupId: string,
    @Body() dto: CreateTaskDto,
    @CurrentUser() user: any,
  ) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }

    const member = await this.prisma.groupMember.findFirst({
      where: { groupId, userId: user.sub },
    });
    if (!member) {
      throw new ForbiddenException('Anda bukan anggota grup ini');
    }
    if (member.role !== 'ADMIN' && member.role !== 'MODERATOR') {
      throw new ForbiddenException('Hanya admin/moderator yang bisa membuat task grup');
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    const parsedDeadline = this.parseDeadline(dto.deadlineOrDueDate || dto.deadline || dto.dueDate);
    const deadline = parsedDeadline ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(deadline.getTime())) {
      throw new BadRequestException('Format deadline tidak valid');
    }
    // Small tolerance to avoid transient clock differences.
    if (deadline.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('Deadline tidak boleh di masa lalu');
    }

    const priority = dto.priority ?? 'MEDIUM';
    const priorityNumber = priority === 'LOW' ? 1 : priority === 'HIGH' ? 3 : 2;
    const created = await this.prisma.task.create({
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim() || '',
        startDate,
        deadline,
        priority: priorityNumber,
        progress: typeof dto.progress === 'number' ? dto.progress : 0,
        status: 'TODO',
        userId: user.sub,
        groupId,
      },
    });

    await this.prisma.message.create({
      data: {
        senderId: user.sub,
        groupId,
        content: `[GROUP_TASK] ${dto.title.trim()}`,
      },
    });

    return this.toTaskResponse(created);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update task status' })
  @ApiResponse({ status: 200, description: 'Task status updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @ApiParam({ name: 'id', description: 'Task ID' })
  @ApiBody({
    type: UpdateTaskStatusDto,
    examples: {
      example1: {
        summary: 'Mark task as in progress',
        value: {
          status: 'IN_PROGRESS'
        }
      },
      example2: {
        summary: 'Mark task as done',
        value: {
          status: 'DONE'
        }
      }
    }
  })
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @CurrentUser() user: any,
  ) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    if (!status) {
      throw new BadRequestException('Status harus diisi');
    }
    
    const task = await this.repo.findById(id);
    if (!task) {
      throw new BadRequestException("Task tidak ditemukan");
    }
    
    // Terapkan Business Rule dari Domain menggunakan method entity
    try {
      if (status === 'DONE') {
        task.complete();
      } else if (status === 'IN_PROGRESS') {
        task.start();
      } else {
        throw new BadRequestException("Status tidak valid. Gunakan 'DONE' atau 'IN_PROGRESS'");
      }
      
      return await this.repo.save(task, user.sub);
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Gagal mengupdate status task');
    }
  }

  @Patch(':id/progress')
  @ApiOperation({ summary: 'Update task progress' })
  @ApiResponse({ status: 200, description: 'Task progress updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @ApiParam({ name: 'id', description: 'Task ID' })
  @ApiBody({
    type: UpdateTaskProgressDto,
    examples: {
      example1: {
        summary: 'Update progress to 50%',
        value: {
          progress: 50
        }
      },
      example2: {
        summary: 'Update progress to 100%',
        value: {
          progress: 100
        }
      }
    }
  })
  async updateProgress(
    @Param('id') id: string,
    @Body('progress') progress: number,
    @CurrentUser() user: any,
  ) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    if (typeof progress !== 'number') {
      throw new BadRequestException('Progress harus angka');
    }
    const task = await this.repo.findById(id);
    if (!task) {
      throw new BadRequestException('Task tidak ditemukan');
    }
    try {
      task.updateProgress(progress);
      return await this.repo.save(task, user.sub);
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Gagal mengupdate progress');
    }
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a task' })
  @ApiResponse({ status: 200, description: 'Task deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @ApiParam({ name: 'id', description: 'Task ID' })
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    const task = await this.repo.findById(id);
    if (!task) {
      throw new BadRequestException('Task tidak ditemukan');
    }
    await this.repo.delete(id);
    return { message: 'Task deleted' };
  }
}
