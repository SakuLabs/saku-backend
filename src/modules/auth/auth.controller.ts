import { Controller, Post, Body, BadRequestException, HttpException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { AuthService } from './auth.service';

class RegisterDto {
  email: string;
  password: string;
  name: string;
}

class LoginDto {
  email: string;
  password: string;
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User successfully registered' })
  @ApiResponse({ status: 400, description: 'Bad request - missing fields or user already exists' })
  @ApiBody({
    type: RegisterDto,
    examples: {
      example1: {
        summary: 'Register a new user',
        value: {
          email: 'user@example.com',
          password: 'SecurePassword123',
          name: 'John Doe'
        }
      }
    }
  })
  async register(@Body() body: any) {
    if (!body.email || !body.password || !body.name) {
      throw new BadRequestException('Email, password, dan name harus diisi');
    }
    try {
      return await this.authService.register(body);
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException(error?.message || 'Registrasi gagal');
    }
  }

  @Post('login')
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'User successfully logged in' })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid credentials' })
  @ApiBody({
    type: LoginDto,
    examples: {
      example1: {
        summary: 'Login with credentials',
        value: {
          email: 'user@example.com',
          password: 'SecurePassword123'
        }
      }
    }
  })
  async login(@Body() body: any) {
    if (!body.email || !body.password) {
      throw new BadRequestException('Email dan password harus diisi');
    }
    try {
      return await this.authService.login(body.email, body.password);
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException(error?.message || 'Login gagal');
    }
  }
}
