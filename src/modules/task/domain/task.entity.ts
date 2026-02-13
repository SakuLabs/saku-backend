export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
  EXPIRED = 'EXPIRED',
}

export class Task {
  constructor(
    public readonly id: string,
    public title: string,
    public startDate: Date,
    public deadline: Date,
    public priority: number, // 1: Low, 2: Medium, 3: High
    public progress: number,
    public status: TaskStatus,
    public createdAt: Date,
  ) {
    this.validate();
  }

  private validate() {
    if (this.progress < 0 || this.progress > 100) {
      throw new Error('Progress harus antara 0 - 100');
    }
    if (this.startDate > this.deadline) {
      throw new Error('Start date harus sebelum deadline');
    }
    if (this.deadline < new Date() && this.status !== TaskStatus.DONE) {
      this.status = TaskStatus.EXPIRED;
    }
    if (this.title.length < 3) throw new Error("Judul terlalu pendek");
  }

  // Business Logic: Task yang sudah selesai/expired tidak boleh diubah
  public canBeUpdated(): boolean {
    return this.status !== TaskStatus.DONE && this.status !== TaskStatus.EXPIRED;
  }

  public complete() {
    if (this.status === TaskStatus.EXPIRED) throw new Error("Task sudah expired!");
    this.status = TaskStatus.DONE;
    this.progress = 100;
  }

  public start() {
    if (!this.canBeUpdated()) {
      throw new Error("Task tidak dapat diubah statusnya");
    }
    this.status = TaskStatus.IN_PROGRESS;
  }

  public updateStatus(newStatus: TaskStatus) {
    if (!this.canBeUpdated()) {
      throw new Error("Task tidak dapat diubah statusnya");
    }
    if (newStatus === TaskStatus.EXPIRED || newStatus === TaskStatus.DONE) {
      throw new Error("Status tidak valid untuk update manual");
    }
    this.status = newStatus;
  }

  public updateProgress(value: number) {
    if (!this.canBeUpdated()) {
      throw new Error("Task tidak dapat diubah progress-nya");
    }
    if (value < 0 || value > 100) {
      throw new Error('Progress harus antara 0 - 100');
    }
    this.progress = value;
    if (this.progress === 100) {
      this.status = TaskStatus.DONE;
    } else if (this.progress > 0 && this.status === TaskStatus.TODO) {
      this.status = TaskStatus.IN_PROGRESS;
    }
  }
}
