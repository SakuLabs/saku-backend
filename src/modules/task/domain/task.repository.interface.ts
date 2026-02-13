import { Task } from './task.entity';

export interface ITaskRepository {
  save(task: Task, userId?: string): Promise<Task>;
  findById(id: string): Promise<Task | null>;
  findAll(userId?: string): Promise<Task[]>;
  delete(id: string): Promise<void>;
}
