import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg'; // <-- Import Pool from the pg driver
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    // 1. Initialize the pg connection pool
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Optional: Set pool sizing depending on your Supabase limits
      // max: 10,
    });

    // 2. Pass the pool instance to the PrismaPg adapter
    const adapter = new PrismaPg(pool);

    // 3. Initialize Prisma Client with the adapter
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}