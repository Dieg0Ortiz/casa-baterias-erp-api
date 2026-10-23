import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AutorizacionAdministradorDto } from '../sales/sales.dto';

export const METODOS_REEMBOLSO = [
  'efectivo',
  'transferencia',
  'tarjeta',
] as const;
export type MetodoReembolso = (typeof METODOS_REEMBOLSO)[number];

export class ConsultaDepositosDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  folio?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Sucursal inválida' })
  sucursal_id?: string;
}

export class DevolverDepositoDto {
  @IsUUID('4', { message: 'Depósito inválido' })
  casco_id!: string;

  @IsNumber({}, { message: 'Monto a devolver inválido' })
  @Min(0.01, { message: 'El monto a devolver debe ser mayor a cero' })
  monto!: number;

  @IsOptional()
  @IsIn(METODOS_REEMBOLSO, { message: 'Forma de reembolso inválida' })
  metodo_reembolso?: MetodoReembolso;

  // Modelo del casco que trajo el cliente, si no es el mismo que se vendió.
  @IsOptional()
  @IsUUID('4', { message: 'Modelo de casco inválido' })
  casco_producto_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  notas?: string;
}

export class RenglonDevolucionDto {
  @IsUUID('4', { message: 'Renglón de la venta inválido' })
  venta_item_id!: string;

  @IsInt({ message: 'Cantidad inválida' })
  @Min(1, { message: 'La cantidad debe ser al menos 1' })
  cantidad!: number;

  @IsNumber({}, { message: 'Monto inválido' })
  @Min(0, { message: 'El monto no puede ser negativo' })
  monto!: number;

  // false cuando la batería regresa dañada y no se puede volver a vender.
  @IsOptional()
  @IsBoolean()
  reingresa_inventario?: boolean;
}

export class DevolverBateriaDto extends AutorizacionAdministradorDto {
  @IsUUID('4', { message: 'Venta inválida' })
  venta_id!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Indica qué piezas se devuelven' })
  @ValidateNested({ each: true })
  @Type(() => RenglonDevolucionDto)
  items!: RenglonDevolucionDto[];

  @IsString()
  @MinLength(4, { message: 'Escribe el motivo de la devolución' })
  @MaxLength(200)
  motivo!: string;

  @IsOptional()
  @IsIn(METODOS_REEMBOLSO, { message: 'Forma de reembolso inválida' })
  metodo_reembolso?: MetodoReembolso;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cliente_nombre?: string;
}

export class ConsultaDevolucionesDto {
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
  @IsIn(['deposito_casco', 'bateria'], {
    message: 'Tipo de devolución inválido',
  })
  tipo?: 'deposito_casco' | 'bateria';
}
