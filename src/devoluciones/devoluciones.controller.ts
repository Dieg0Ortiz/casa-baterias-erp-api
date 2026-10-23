import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { UsuarioAutenticado } from '../common/guards/jwt-auth.guard';
import {
  ConsultaDepositosDto,
  ConsultaDevolucionesDto,
  DevolverBateriaDto,
  DevolverDepositoDto,
} from './devoluciones.dto';
import { DevolucionesService } from './devoluciones.service';

// Devoluciones de dinero con folio DEV (migración 035). Salen de la caja
// abierta de la sucursal y se restan de su corte.
@Controller('devoluciones')
export class DevolucionesController {
  constructor(private readonly devoluciones: DevolucionesService) {}

  @Get()
  listar(@Query() dto: ConsultaDevolucionesDto) {
    return this.devoluciones.listar(dto);
  }

  // Depósitos de casco pendientes de la sucursal (opcional: por folio).
  @Get('depositos')
  depositos(
    @CurrentUser() user: UsuarioAutenticado,
    @Query() dto: ConsultaDepositosDto,
  ) {
    return this.devoluciones.depositosPendientes(user.perfil, dto);
  }

  // El cliente trae el casco: se le devuelve el depósito.
  @Post('deposito')
  devolverDeposito(@Body() dto: DevolverDepositoDto) {
    return this.devoluciones.devolverDeposito(dto);
  }

  // Venta por folio con las piezas que todavía se pueden devolver.
  @Get('venta')
  venta(@Query('folio') folio = '') {
    return this.devoluciones.ventaParaDevolucion(folio);
  }

  // El cliente regresa una batería. Autoriza un administrador con su clave.
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('bateria')
  devolverBateria(
    @CurrentUser() user: UsuarioAutenticado,
    @Body() dto: DevolverBateriaDto,
  ) {
    return this.devoluciones.devolverBateria(user, dto);
  }

  @Get(':id')
  detalle(@Param('id', ParseUUIDPipe) id: string) {
    return this.devoluciones.detalle(id);
  }
}
