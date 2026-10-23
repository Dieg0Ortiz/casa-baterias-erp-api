import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
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

export class AltasReporteDto {
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
  @IsUUID('4', { message: 'Producto inválido' })
  producto_id?: string;

  @IsOptional()
  @IsIn(['entrada', 'carga_masiva', 'compra', 'catalogo'], {
    message: 'Tipo de alta inválido',
  })
  origen?: 'entrada' | 'carga_masiva' | 'compra' | 'catalogo';
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

// Clave corta de la sucursal que va en sus folios (NV-MAT-000124). Si no se
// captura, la base propone una a partir del nombre.
const CLAVE_SUCURSAL = /^[A-Za-z0-9]{2,6}$/;
const MENSAJE_CLAVE = 'La clave debe tener de 2 a 6 letras o números';

// DTO para crear una nueva sucursal.
export class CrearSucursalDto {
  @IsString({ message: 'El nombre de la sucursal es obligatorio' })
  @IsNotEmpty({ message: 'El nombre no puede estar vacío' })
  nombre!: string;

  @IsOptional()
  @IsBoolean()
  es_matriz?: boolean;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @Matches(CLAVE_SUCURSAL, { message: MENSAJE_CLAVE })
  clave?: string;
}

// DTO para actualizar una sucursal existente.
export class ActualizarSucursalDto {
  @IsOptional()
  @IsString({ message: 'El nombre debe ser texto' })
  @IsNotEmpty({ message: 'El nombre no puede estar vacío' })
  nombre?: string;

  @IsOptional()
  @IsBoolean()
  es_matriz?: boolean;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @Matches(CLAVE_SUCURSAL, { message: MENSAJE_CLAVE })
  clave?: string;
}
