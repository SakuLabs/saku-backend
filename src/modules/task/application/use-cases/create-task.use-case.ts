import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { Task, TaskStatus } from '../../domain/task.entity';
import type { ITaskRepository } from '../../domain/task.repository.interface';
import {
  CreateTaskDto,
  TaskPriority,
} from '../../presentation/dto/create-task.dto';

@Injectable()
export class CreateTaskUseCase {
  constructor(
    @Inject('ITaskRepository') private readonly taskRepo: ITaskRepository,
  ) {}

  private convertPriorityToNumber(priority: TaskPriority): number {
    switch (priority) {
      case TaskPriority.LOW:
        return 1;
      case TaskPriority.MEDIUM:
        return 2;
      case TaskPriority.HIGH:
        return 3;
      default:
        return 2; // Default to MEDIUM
    }
  }

  async execute(data: CreateTaskDto, userId: string): Promise<Task> {
    if (!userId) {
      throw new BadRequestException('User ID diperlukan');
    }

    const startDate = data.startDate ? new Date(data.startDate) : new Date();

    // Accept either 'deadline' or its 'dueDate' alias from the client.
    // If neither is provided, default to 7 days from now.
    const deadlineInput = data.deadline ?? data.dueDate;
    const deadline = deadlineInput
      ? new Date(deadlineInput)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    if (deadline < new Date()) {
      throw new BadRequestException('Deadline tidak boleh di masa lalu!');
    }

    const priorityNumber = this.convertPriorityToNumber(data.priority);

    const newTask = new Task(
      Math.random().toString(36).substr(2, 9), // Simple ID generator
      data.title,
      data.description || '',
      startDate,
      deadline,
      priorityNumber,
      typeof data.progress === 'number' ? data.progress : 0,
      TaskStatus.TODO,
      new Date(),
    );

    await this.taskRepo.save(newTask, userId);
    return newTask;
  }
}
