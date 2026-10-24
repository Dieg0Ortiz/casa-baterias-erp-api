import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { ReportsService } from './reports.service';

// Costos y utilidades: solo para el administrador.
@Roles('administrador')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('utilidades')
  obtenerUtilidades(
    @Query('fechaInicio') fechaInicio?: string,
    @Query('fechaFin') fechaFin?: string,
  ) {
    return this.reportsService.obtenerUtilidades(fechaInicio, fechaFin);
  }
}
