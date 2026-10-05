import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { UsuarioAutenticado } from '../common/guards/jwt-auth.guard';
import { SalesService } from './sales.service';
import { RegistrarVentaDto, ReimprimirTicketDto } from './sales.dto';

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

  @Get()
  listar() {
    return this.salesService.listarVentas();
  }
}
