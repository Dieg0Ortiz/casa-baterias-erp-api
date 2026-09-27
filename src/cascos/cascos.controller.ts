import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CascosService } from './cascos.service';
import { AjustarCascoBodegaDto, RegistrarIntercambioDto } from './cascos.dto';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('cascos/bodega')
export class CascosBodegaController {
  constructor(private readonly cascosService: CascosService) {}

  @Get('movimientos')
  @Roles('administrador')
  listarMovimientos() {
    return this.cascosService.listarMovimientos();
  }

  @Post()
  @Roles('administrador')
  ajustar(@Body() dto: AjustarCascoBodegaDto) {
    return this.cascosService.ajustarBodega(dto);
  }
}

@Controller('cascos/intercambios')
export class CascosController {
  constructor(private readonly cascosService: CascosService) {}

  @Get()
  @Roles('administrador', 'trabajador')
  listarIntercambios() {
    return this.cascosService.listarIntercambios();
  }

  @Get(':id')
  @Roles('administrador', 'trabajador')
  obtenerIntercambio(@Param('id') id: string) {
    return this.cascosService.obtenerIntercambio(id);
  }

  @Post()
  @Roles('administrador', 'trabajador')
  registrarIntercambio(@Body() dto: RegistrarIntercambioDto) {
    return this.cascosService.registrarIntercambio(dto);
  }
}
