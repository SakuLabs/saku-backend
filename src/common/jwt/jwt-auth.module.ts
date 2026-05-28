import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

const expiresIn = (process.env.JWT_EXPIRES_IN ||
  '24h') as SignOptions['expiresIn'];

const jwtRegistration = JwtModule.register({
  secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  signOptions: { expiresIn },
});

@Global()
@Module({
  imports: [jwtRegistration],
  providers: [JwtAuthGuard],
  exports: [jwtRegistration, JwtAuthGuard],
})
export class JwtAuthModule {}
