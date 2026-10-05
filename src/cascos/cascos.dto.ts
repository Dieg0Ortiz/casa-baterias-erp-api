import { ArrayMinSize, IsArray, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum MetodoPagoIntercambio {
  Efectivo = 'efectivo',
  Tarjeta = 'tarjeta',
  Transferencia = 'transferencia',
}

export class IntercambioItemDto {
  @IsUUID('4', { message: 'Casco saliente inválido' })
  casco_saliente_id!: string;

  @IsUUID('4', { message: 'Casco entrante inválido' })
  casco_entrante_id!: string;

  @IsNumber()
  @Min(1)
  cantidad!: number;

  @IsNumber()
  @Min(0)
  precio_unitario!: number;
}

export class AjustarCascoBodegaDto {
  @IsUUID('4', { message: 'Producto inválido' })
  producto_id!: string;

  @IsUUID('4', { message: 'Sucursal inválida' })
  sucursal_id!: string;

  @IsInt({ message: 'Cantidad inválida' })
  @Min(1, { message: 'La cantidad debe ser al menos 1' })
  cantidad!: number;

  @IsIn(['alta', 'baja_proveedor'], { message: 'Tipo inválido' })
  tipo!: 'alta' | 'baja_proveedor';

  @IsOptional()
  @IsString()
  nota?: string;
}

export class BajaGrupoItemDto {
  @IsUUID('4', { message: 'Producto inválido' })
  producto_id!: string;

  @IsInt({ message: 'Cantidad inválida' })
  @Min(1, { message: 'La cantidad debe ser al menos 1' })
  cantidad!: number;
}

export class BajarCascosGrupoDto {
  @IsUUID('4', { message: 'Sucursal inválida' })
  sucursal_id!: string;

  @IsArray({ message: 'No hay cascos que dar de baja' })
  @ArrayMinSize(1, { message: 'No hay cascos que dar de baja' })
  @ValidateNested({ each: true })
  @Type(() => BajaGrupoItemDto)
  items!: BajaGrupoItemDto[];

  @IsOptional()
  @IsString()
  nota?: string;
}

export class RegistrarIntercambioDto {
  @IsUUID('4', { message: 'Sucursal inválida' })
  sucursal_id!: string;

  @IsEnum(MetodoPagoIntercambio)
  @IsOptional()
  metodo_pago?: MetodoPagoIntercambio;

  @IsNumber()
  @Min(0)
  @IsOptional()
  monto_cobrado?: number;

  @IsString({ message: 'El nombre del cliente es obligatorio' })
  cliente_nombre!: string;

  @IsString({ message: 'El teléfono del cliente es obligatorio' })
  cliente_telefono!: string;

  @IsOptional()
  @IsString()
  notas?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IntercambioItemDto)
  items!: IntercambioItemDto[];
}
