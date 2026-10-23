import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CreditosService } from './creditos.service';
import {
  CrearEmpresaCreditoDto,
  ActualizarEmpresaCreditoDto,
  EditarVentaCreditoDto,
  RegistrarAbonoCreditoDto,
  ReporteCreditosDiaDto,
} from './creditos.dto';

@Controller('creditos')
export class CreditosController {
  constructor(private readonly creditosService: CreditosService) {}

  // Listar empresas con línea de crédito
  @Get('empresas')
  @Roles('administrador', 'trabajador')
  listarEmpresas(@Query('activas') activas?: string) {
    const soloActivas = activas === 'true';
    return this.creditosService.listarEmpresas(soloActivas);
  }

  // Registrar nueva empresa con crédito
  @Post('empresas')
  @Roles('administrador')
  crearEmpresa(@Body() dto: CrearEmpresaCreditoDto) {
    return this.creditosService.crearEmpresa(dto);
  }

  // Actualizar empresa con crédito
  @Patch('empresas/:id')
  @Roles('administrador')
  actualizarEmpresa(
    @Param('id') id: string,
    @Body() dto: ActualizarEmpresaCreditoDto,
  ) {
    return this.creditosService.actualizarEmpresa(id, dto);
  }

  // Estado de cuenta de una empresa
  @Get('empresas/:id/estado-cuenta')
  @Roles('administrador', 'trabajador')
  obtenerEstadoCuenta(@Param('id') id: string) {
    return this.creditosService.obtenerEstadoCuenta(id);
  }

  // Reporte general de ventas a crédito / cuentas por cobrar
  @Get('ventas')
  @Roles('administrador', 'trabajador')
  listarVentasCredito(
    @Query('estado') estado?: string,
    @Query('sucursal_id') sucursalId?: string,
  ) {
    return this.creditosService.listarVentasCredito(estado, sucursalId);
  }

  // Corregir cantidades o modelos de una venta a crédito
  @Patch('ventas/:id')
  @Roles('administrador')
  editarVentaCredito(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarVentaCreditoDto,
  ) {
    return this.creditosService.editarVentaCredito(id, dto);
  }

  // Créditos, abonos y traspasos de un día (PDF del panel)
  @Get('reporte-dia')
  @Roles('administrador')
  reporteDelDia(@Query() dto: ReporteCreditosDiaDto) {
    return this.creditosService.reporteDelDia(dto);
  }

  // Registrar abono o liquidación de crédito
  @Post('abonos')
  @Roles('administrador', 'trabajador')
  registrarAbono(@Body() dto: RegistrarAbonoCreditoDto) {
    return this.creditosService.registrarAbono(dto);
  }
}
