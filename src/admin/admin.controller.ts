import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { VentasReporteDto } from './admin.dto';
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

  // Reporte de ventas filtrable (Fase 8): sucursal, fechas, empleado y
  // producto. Solo administrador.
  @Roles('administrador')
  @Get('ventas')
  reporteVentas(@Query() dto: VentasReporteDto) {
    return this.adminService.reporteVentas(dto);
  }

  // Empleados para el filtro del reporte (Fase 8). Solo administrador.
  @Roles('administrador')
  @Get('usuarios')
  usuarios() {
    return this.adminService.listarUsuarios();
  }
}
