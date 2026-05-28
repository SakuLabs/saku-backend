import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../src/prisma/prisma.service';

export type MockPrisma = DeepMockProxy<PrismaService>;

export const createPrismaMock = (): MockPrisma => mockDeep<PrismaService>();
