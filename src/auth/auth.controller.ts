import { Controller, Post, Body, Get, UseGuards } from '@nestjs/common';
import { IsEmail, IsString } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { UsuarioAutenticado } from '../common/guards/jwt-auth.guard';

class LoginDto {
  @IsEmail({}, { message: 'Correo inválido' })
  email!: string;

  @IsString()
  password!: string;
}

class RefreshDto {
  @IsString({ message: 'Refresh token inválido' })
  refresh_token!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  login(@Body() body: LoginDto) {
    return this.authService.login(body.email, body.password);
  }

  @Post('refresh')
  @Public()
  refresh(@Body() body: RefreshDto) {
    return this.authService.refresh(body.refresh_token);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: UsuarioAutenticado) {
    return user;
  }
}
