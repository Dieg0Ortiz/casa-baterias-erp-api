import { Body, Controller, Get, Post } from '@nestjs/common';
import { SalesService } from './sales.service';
import { RegistrarVentaDto } from './sales.dto';

@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  registrar(@Body() dto: RegistrarVentaDto) {
    return this.salesService.registrarVenta(dto);
  }

  @Get()
  listar() {
    return this.salesService.listarVentas();
  }
}
