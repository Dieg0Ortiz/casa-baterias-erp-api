import {
  IsDateString,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

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

// DTO para crear nuevos usuarios/trabajadores desde el panel admin.
export class CrearUsuarioDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido' })
  email!: string;

  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password!: string;

  @IsString({ message: 'El nombre es obligatorio' })
  @IsNotEmpty({ message: 'El nombre no puede estar vacío' })
  nombre!: string;

  @IsString({ message: 'El apellido es obligatorio' })
  @IsNotEmpty({ message: 'El apellido no puede estar vacío' })
  apellido!: string;

  @IsOptional()
  @IsIn(['administrador', 'trabajador'], {
    message: 'El rol debe ser administrador o trabajador',
  })
  rol?: 'administrador' | 'trabajador';

  @IsOptional()
  @IsUUID('4', { message: 'Sucursal inválida' })
  sucursal_id?: string;
}

// DTO para actualizar estado, rol o contraseña de un usuario existente.
export class ActualizarUsuarioDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  apellido?: string;

  @IsOptional()
  @IsIn(['administrador', 'trabajador'])
  rol?: 'administrador' | 'trabajador';

  @IsOptional()
  @IsUUID('4')
  sucursal_id?: string | null;

  @IsOptional()
  activo?: boolean;

  @IsOptional()
  @MinLength(6, { message: 'La nueva contraseña debe tener al menos 6 caracteres' })
  password?: string;
}
