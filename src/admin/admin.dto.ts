import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

// Filtros del reporte de ventas del panel de administración (Fase 8).
// Las fechas se interpretan en la zona horaria de la empresa (México).
export class VentasReporteDto {
  @IsOptional()
  @IsUUID('4', { message: 'Sucursal inválida' })
  sucursal_id?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Fecha inicial inválida' })
  fecha_desde?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Fecha final inválida' })
  fecha_hasta?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Empleado inválido' })
  usuario_id?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Producto inválido' })
  producto_id?: string;
}

// DTO para resolver un casco pendiente (sistema de comisiones por casco).
export class ResolverCascoDto {
  @IsNumber({}, { message: 'Monto a devolver inválido' })
  @Min(0, { message: 'El monto no puede ser negativo' })
  monto_devuelto!: number;

  @IsOptional()
  @IsUUID('4', { message: 'Producto de casco inválido' })
  casco_producto_id?: string;

  @IsOptional()
  @IsString()
  notas?: string;
}
