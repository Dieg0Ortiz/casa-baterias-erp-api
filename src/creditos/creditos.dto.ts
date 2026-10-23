import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsIn,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class RenglonCreditoDto {
  @IsUUID('4', { message: 'Producto inválido' })
  producto_id!: string;

  @IsInt({ message: 'Cantidad inválida' })
  @Min(1, { message: 'La cantidad debe ser al menos 1' })
  cantidad!: number;

  @IsNumber({}, { message: 'Precio inválido' })
  @Min(0, { message: 'El precio no puede ser negativo' })
  precio_unitario!: number;

  // Obligatorio para los modelos que requieren casco; la base lo valida.
  @IsOptional()
  @IsBoolean()
  con_casco?: boolean;
}

// Lista completa y corregida de piezas de una venta a crédito.
export class EditarVentaCreditoDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'La venta debe conservar al menos una pieza' })
  @ValidateNested({ each: true })
  @Type(() => RenglonCreditoDto)
  items!: RenglonCreditoDto[];

  @IsString()
  @MinLength(4, { message: 'Escribe el motivo de la corrección' })
  @MaxLength(200)
  motivo!: string;
}

export class ReporteCreditosDiaDto {
  // YYYY-MM-DD en hora de México; por omisión, hoy.
  @IsOptional()
  @IsDateString({}, { message: 'Fecha inválida' })
  fecha?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Sucursal inválida' })
  sucursal_id?: string;
}

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
