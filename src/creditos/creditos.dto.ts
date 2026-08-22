import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsIn,
  Min,
} from 'class-validator';

export class CrearEmpresaCreditoDto {
  @IsString({ message: 'El nombre de la empresa es obligatorio' })
  nombre!: string;

  @IsOptional()
  @IsString()
  rfc?: string;

  @IsOptional()
  @IsString()
  contacto_nombre?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Límite de crédito inválido' })
  @Min(0, { message: 'El límite de crédito no puede ser negativo' })
  limite_credito?: number;

  @IsOptional()
  @IsInt({ message: 'Días de crédito inválidos' })
  @Min(1, { message: 'Los días de crédito deben ser al menos 1' })
  dias_credito?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class ActualizarEmpresaCreditoDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  rfc?: string;

  @IsOptional()
  @IsString()
  contacto_nombre?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Límite de crédito inválido' })
  @Min(0, { message: 'El límite de crédito no puede ser negativo' })
  limite_credito?: number;

  @IsOptional()
  @IsInt({ message: 'Días de crédito inválidos' })
  @Min(1, { message: 'Los días de crédito deben ser al menos 1' })
  dias_credito?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class RegistrarAbonoCreditoDto {
  @IsUUID('4', { message: 'Empresa inválida' })
  empresa_id!: string;

  @IsNumber({}, { message: 'Monto de abono inválido' })
  @Min(0.01, { message: 'El monto de abono debe ser mayor a 0' })
  monto!: number;

  @IsOptional()
  @IsIn(['efectivo', 'transferencia', 'cheque', 'tarjeta'], {
    message: 'Método de pago debe ser efectivo, transferencia, cheque o tarjeta',
  })
  metodo_pago?: 'efectivo' | 'transferencia' | 'cheque' | 'tarjeta';

  @IsOptional()
  @IsUUID('4', { message: 'ID de venta a crédito inválido' })
  credito_venta_id?: string;

  @IsOptional()
  @IsUUID('4', { message: 'ID de sucursal inválido' })
  sucursal_id?: string;

  @IsOptional()
  @IsString()
  referencia?: string;

  @IsOptional()
  @IsString()
  notas?: string;
}
