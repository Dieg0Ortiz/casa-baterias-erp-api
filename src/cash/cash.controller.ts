import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { UsuarioAutenticado } from '../common/guards/jwt-auth.guard';
import { CashService } from './cash.service';
import { AbrirCajaDto, CerrarCajaDto } from './cash.dto';

@Controller('cash')
export class CashController {
  constructor(private readonly cashService: CashService) {}

  // Caja abierta del cajero con el acumulado del turno (Sección 7).
  @Get('activa')
  cajaActiva(@CurrentUser() user: UsuarioAutenticado) {
    return this.cashService.cajaActiva(user.userId);
  }

  // Historial de cortes del cajero (Sección 7).
  @Get()
  historial(@CurrentUser() user: UsuarioAutenticado) {
    return this.cashService.historial(user.userId);
  }

  @Post('abrir')
  abrir(@CurrentUser() user: UsuarioAutenticado, @Body() dto: AbrirCajaDto) {
    return this.cashService.abrirCaja(user.userId, dto);
  }

  @Post('cerrar')
  cerrar(@CurrentUser() user: UsuarioAutenticado, @Body() dto: CerrarCajaDto) {
    return this.cashService.cerrarCaja(user.userId, dto);
  }
}
