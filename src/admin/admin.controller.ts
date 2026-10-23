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
import {
  ActualizarSucursalDto,
  ActualizarUsuarioDto,
  CrearSucursalDto,
  CrearUsuarioDto,
  ResolverCascoDto,
  AltasReporteDto,
  VentasReporteDto,
} from './admin.dto';
import { AdminService } from './admin.service';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // Dashboard consolidado del panel (Fase 8): ventas de hoy, inventario y
  // cajas abiertas de todas las sucursales. Solo administrador.
  @Roles('administrador')
  @Get('dashboard')
  dashboard() {
    return this.adminService.dashboard();
  }

  // Sucursales activas para asignación de trabajadores y administración.
  @Roles('administrador')
  @Get('sucursales')
  sucursales() {
    return this.adminService.listarSucursales();
  }

  // Crear nueva sucursal. Solo administrador.
  @Roles('administrador')
  @Post('sucursales')
  crearSucursal(@Body() dto: CrearSucursalDto) {
    return this.adminService.crearSucursal(dto);
  }

  // Actualizar sucursal existente. Solo administrador.
  @Roles('administrador')
  @Patch('sucursales/:id')
  actualizarSucursal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarSucursalDto,
  ) {
    return this.adminService.actualizarSucursal(id, dto);
  }

  // Reporte de ventas filtrable (Fase 8): sucursal, fechas, empleado y
  // producto. Solo administrador.
  @Roles('administrador')
  @Get('ventas')
  reporteVentas(@Query() dto: VentasReporteDto) {
    return this.adminService.reporteVentas(dto);
  }

  @Roles('administrador')
  @Get('reportes/ventas')
  reportesVentasAlias(@Query() dto: VentasReporteDto) {
    return this.adminService.reporteVentas(dto);
  }

  @Roles('administrador')
  @Get('reportes/altas')
  reporteAltas(@Query() dto: AltasReporteDto) {
    return this.adminService.reporteAltas(dto);
  }

  @Roles('administrador')
  @Get('reportes/reimpresiones')
  reporteReimpresiones(@Query() dto: VentasReporteDto) {
    return this.adminService.reporteReimpresiones(dto);
  }

  @Roles('administrador')
  @Get('reportes/cancelaciones')
  reporteCancelaciones(@Query() dto: VentasReporteDto) {
    return this.adminService.reporteCancelaciones(dto);
  }

  // Listado de usuarios/empleados del sistema. Solo administrador.
  @Roles('administrador')
  @Get('usuarios')
  usuarios() {
    return this.adminService.listarUsuarios();
  }

  // Crear nuevo usuario (trabajador / administrador). Solo administrador.
  @Roles('administrador')
  @Post('usuarios')
  crearUsuario(@Body() dto: CrearUsuarioDto) {
    return this.adminService.crearUsuario(dto);
  }

  // Actualizar usuario existente (estado activo/inactivo, rol, contraseña).
  @Roles('administrador')
  @Patch('usuarios/:id')
  actualizarUsuario(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarUsuarioDto,
  ) {
    return this.adminService.actualizarUsuario(id, dto);
  }

  // Lista de cascos pendientes con datos de venta, producto y sucursal.
  @Roles('administrador')
  @Get('cascos-pendientes')
  cascosPendientes() {
    return this.adminService.listarCascosPendientes();
  }

  // Resolver un casco pendiente: registrar devolución y cerrar caso.
  @Roles('administrador')
  @Post('cascos-pendientes/:id/resolver')
  resolverCasco(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolverCascoDto,
  ) {
    return this.adminService.resolverCasco(id, dto);
  }
}
