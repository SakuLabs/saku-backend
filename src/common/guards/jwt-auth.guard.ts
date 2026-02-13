import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      // Allow request to continue but set user as null
      request.user = null;
      return true;
    }

    try {
      const token = authHeader.replace('Bearer ', '');
      const payload = this.jwtService.verify(token);
      request.user = payload;
      return true;
    } catch (error) {
      request.user = null;
      return true; // Allow request but user will be null
    }
  }
}
