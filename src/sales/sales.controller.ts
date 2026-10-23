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
import { Roles } from '../common/decorators/roles.decorator';
import type { UsuarioAutenticado } from '../common/guards/jwt-auth.guard';
import { SalesService } from './sales.service';
import {
  CancelarTicketDto,
  CancelarVentaDto,
  RegistrarVentaDto,
  ReimprimirTicketDto,
  VentasDelDiaDto,
} from './sales.dto';

@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  registrar(@Body() dto: RegistrarVentaDto) {
    return this.salesService.registrarVenta(dto);
  }

  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('reimpresiones')
  reimprimir(
    @CurrentUser() user: UsuarioAutenticado,
    @Body() dto: ReimprimirTicketDto,
  ) {
    return this.salesService.reimprimir(user, dto);
  }

  // Cancelación desde la caja, con la clave de un administrador.
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('cancelaciones')
  cancelarDesdeCaja(
    @CurrentUser() user: UsuarioAutenticado,
    @Body() dto: CancelarTicketDto,
  ) {
    return this.salesService.cancelarDesdeCaja(user, dto);
  }

  // Cancelación desde el panel.
  @Roles('administrador')
  @Post(':id/cancelar')
  cancelar(
    @CurrentUser() user: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelarVentaDto,
  ) {
    return this.salesService.cancelarPorAdministrador(user, id, dto);
  }

  // Ventas de hoy de la sucursal, para elegir cuál reimprimir.
  @Get('hoy')
  ventasDelDia(
    @CurrentUser() user: UsuarioAutenticado,
    @Query() consulta: VentasDelDiaDto,
  ) {
    return this.salesService.ventasDelDia(user.perfil, consulta.sucursal_id);
  }

  @Get()
  listar() {
    return this.salesService.listarVentas();
  }
}
