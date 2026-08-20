import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { CrearProveedorDto, RegistrarCompraDto } from './purchases.dto';

@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get('providers')
  listarProveedores() {
    return this.purchasesService.listarProveedores();
  }

  @Post('providers')
  crearProveedor(@Body() dto: CrearProveedorDto) {
    return this.purchasesService.crearProveedor(dto);
  }

  @Get()
  listarCompras() {
    return this.purchasesService.listarCompras();
  }

  @Get(':id')
  obtenerCompra(@Param('id') id: string) {
    return this.purchasesService.obtenerCompra(id);
  }

  @Post()
  registrarCompra(@Body() dto: RegistrarCompraDto) {
    return this.purchasesService.registrarCompra(dto);
  }
}
