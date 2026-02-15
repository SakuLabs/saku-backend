import { Controller, Get, Post, Patch, Delete, Body, Param, Inject, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger';
import { CreateTaskUseCase } from '../application/use-cases/create-task.use-case';
import type { ITaskRepository } from '../domain/task.repository.interface';
import { CreateTaskDto } from './dto/create-task.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/user.decorator';

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
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all tasks for current user' })
  @ApiResponse({ status: 200, description: 'Tasks retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAll(@CurrentUser() user: any) {
    if (!user?.sub) {
      throw new BadRequestException('User tidak terautentikasi');
    }
    return await this.repo.findAll(user.sub);
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
    return await this.createTask.execute(dto, user.sub);
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
