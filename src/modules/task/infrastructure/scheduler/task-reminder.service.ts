import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../../../prisma/prisma.service';

@Injectable()
export class TaskReminderService {
  private readonly logger = new Logger(TaskReminderService.name);

  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleDeadlineCheck() {
    const now = new Date();
    
    // 1. Update status ke EXPIRED jika sudah lewat deadline
    const expiredTasks = await this.prisma.task.updateMany({
      where: {
        deadline: { lt: now },
        status: { notIn: ['DONE', 'EXPIRED'] }
      },
      data: { status: 'EXPIRED' }
    });

    if (expiredTasks.count > 0) {
      this.logger.log(`${expiredTasks.count} task baru saja expired.`);
    }

    // 2. Logic Reminder (Contoh: Task yang deadline-nya < 1 jam lagi)
    const upcoming = await this.prisma.task.findMany({
      where: {
        deadline: {
          gt: now,
          lt: new Date(now.getTime() + 60 * 60 * 1000) // 1 jam ke depan
        },
        status: 'TODO'
      }
    });

    upcoming.forEach(task => {
      this.logger.warn(`REMINDER: Task "${task.title}" akan segera berakhir!`);
      // Di sini bisa integrasi WhatsApp/Email API
    });
  }
}