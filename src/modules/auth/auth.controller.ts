import { Controller, Post, Body, BadRequestException, HttpException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
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
