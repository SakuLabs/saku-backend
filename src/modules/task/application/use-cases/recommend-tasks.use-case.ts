import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { RecommendTasksDto } from '../../presentation/dto/recommend-tasks.dto';

type RecommendationItem = {
  id: string;
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  status: string;
  progress: number;
  dueDate: Date;
  groupId: string | null;
  score: number;
  urgencyScore: number;
  priorityScore: number;
  remainingWorkScore: number;
  estimatedMinutes: number;
};

@Injectable()
export class RecommendTasksUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(userId: string, query: RecommendTasksDto) {
    const algorithm = query.algorithm ?? 'auto';
    const limit = query.limit ?? 5;
    const now = new Date();

    const tasks = await this.prisma.task.findMany({
      where: {
        OR: [
          { userId },
          { group: { members: { some: { userId } } } },
        ],
        status: { notIn: ['DONE', 'EXPIRED'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    const scored = tasks
      .map((task) => this.toRecommendation(task, now))
      .sort((a, b) => b.score - a.score || a.dueDate.getTime() - b.dueDate.getTime());

    const algorithmUsed =
      algorithm === 'auto'
        ? query.availableMinutes && query.availableMinutes > 0
          ? 'knapsack'
          : 'weighted'
        : algorithm;

    if (algorithmUsed === 'knapsack') {
      const capacity = query.availableMinutes ?? 120;
      const selected = this.solveKnapsack(scored, capacity);
      return {
        algorithmUsed,
        generatedAt: now.toISOString(),
        availableMinutes: capacity,
        recommendations: selected.slice(0, limit).map(this.outputItem),
      };
    }

    return {
      algorithmUsed: 'weighted',
      generatedAt: now.toISOString(),
      recommendations: scored.slice(0, limit).map(this.outputItem),
    };
  }

  private toRecommendation(task: any, now: Date): RecommendationItem {
    const daysUntilDeadline = (task.deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    const urgencyScore = this.calculateUrgencyScore(daysUntilDeadline);
    const priorityScore = this.normalizePriority(task.priority);
    const remainingWorkScore = Math.max(0, Math.min(1, (100 - (task.progress ?? 0)) / 100));

    const score =
      urgencyScore * 0.5 +
      priorityScore * 0.35 +
      remainingWorkScore * 0.15;

    return {
      id: task.id,
      title: task.title,
      description: task.description ?? '',
      priority: task.priority === 1 ? 'LOW' : task.priority === 3 ? 'HIGH' : 'MEDIUM',
      status: task.status,
      progress: task.progress ?? 0,
      dueDate: task.deadline,
      groupId: task.groupId ?? null,
      score: Number(score.toFixed(4)),
      urgencyScore: Number(urgencyScore.toFixed(4)),
      priorityScore: Number(priorityScore.toFixed(4)),
      remainingWorkScore: Number(remainingWorkScore.toFixed(4)),
      estimatedMinutes: this.estimateTaskMinutes(task.priority, task.progress ?? 0),
    };
  }

  private calculateUrgencyScore(daysUntilDeadline: number): number {
    if (daysUntilDeadline <= 0) return 1;
    if (daysUntilDeadline <= 1) return 0.95;
    if (daysUntilDeadline <= 3) return 0.85;
    if (daysUntilDeadline <= 7) return 0.7;
    if (daysUntilDeadline <= 14) return 0.5;
    return 0.25;
  }

  private normalizePriority(priority: number): number {
    if (priority <= 1) return 0.34;
    if (priority >= 3) return 1;
    return 0.67;
  }

  private estimateTaskMinutes(priority: number, progress: number): number {
    const base = priority === 3 ? 120 : priority === 2 ? 90 : 60;
    const remainingRatio = Math.max(0.1, (100 - progress) / 100);
    return Math.max(15, Math.round(base * remainingRatio));
  }

  private solveKnapsack(items: RecommendationItem[], capacity: number): RecommendationItem[] {
    const n = items.length;
    const cap = Math.max(15, Math.min(1440, Math.floor(capacity)));
    if (n === 0) return [];

    const dp: number[][] = Array.from({ length: n + 1 }, () => Array(cap + 1).fill(0));

    for (let i = 1; i <= n; i++) {
      const weight = items[i - 1].estimatedMinutes;
      const value = Math.round(items[i - 1].score * 1000);
      for (let w = 0; w <= cap; w++) {
        dp[i][w] = dp[i - 1][w];
        if (weight <= w) {
          dp[i][w] = Math.max(dp[i][w], dp[i - 1][w - weight] + value);
        }
      }
    }

    const picked: RecommendationItem[] = [];
    let w = cap;
    for (let i = n; i > 0; i--) {
      if (dp[i][w] !== dp[i - 1][w]) {
        picked.push(items[i - 1]);
        w -= items[i - 1].estimatedMinutes;
      }
      if (w <= 0) break;
    }

    return picked.sort((a, b) => b.score - a.score || a.dueDate.getTime() - b.dueDate.getTime());
  }

  private outputItem = (item: RecommendationItem) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    priority: item.priority,
    status: item.status,
    progress: item.progress,
    dueDate: item.dueDate.toISOString(),
    groupId: item.groupId,
    score: item.score,
    scoreBreakdown: {
      urgency: item.urgencyScore,
      priority: item.priorityScore,
      remainingWork: item.remainingWorkScore,
    },
    estimatedMinutes: item.estimatedMinutes,
  });
}
