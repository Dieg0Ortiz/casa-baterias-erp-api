import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { UsuarioAutenticado } from '../common/guards/jwt-auth.guard';
import { CashService } from './cash.service';
import { AbrirCajaDto, CerrarCajaDto, ConsultaCajaDto } from './cash.dto';

@Controller('cash')
export class CashController {
  constructor(private readonly cashService: CashService) {}

  // Caja abierta de la sucursal con el resumen del turno: corte de efectivo,
  // corte de tarjetas y transferencias, y créditos aparte.
  @Get('activa')
  cajaActiva(
    @CurrentUser() user: UsuarioAutenticado,
    @Query() consulta: ConsultaCajaDto,
  ) {
    return this.cashService.cajaActiva(user.perfil, consulta.sucursal_id);
  }

  // Historial de cortes de la sucursal (Sección 7).
  @Get()
  historial(
    @CurrentUser() user: UsuarioAutenticado,
    @Query() consulta: ConsultaCajaDto,
  ) {
    return this.cashService.historial(
      user.perfil,
      consulta.sucursal_id,
      consulta.limite,
    );
  }

  // Resumen de un corte (abierto o cerrado), para verlo o reimprimirlo.
  @Get(':id/resumen')
  resumen(@Param('id', ParseUUIDPipe) id: string) {
    return this.cashService.resumen(id);
  }

  @Post('abrir')
  abrir(@Body() dto: AbrirCajaDto) {
    return this.cashService.abrirCaja(dto);
  }

  @Post('cerrar')
  cerrar(@Body() dto: CerrarCajaDto) {
    return this.cashService.cerrarCaja(dto);
  }
}
