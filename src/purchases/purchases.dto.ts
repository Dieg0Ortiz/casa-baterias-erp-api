import { IsArray, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CrearProveedorDto {
  @IsString({ message: 'El nombre del proveedor es obligatorio' })
  nombre!: string;

  @IsOptional()
  @IsString()
  contacto?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsString()
  email?: string;
}

export enum TipoItemCompra {
  Bateria = 'bateria',
  Casco = 'casco',
}

export class CompraItemDto {
  @IsUUID('4', { message: 'Producto inválido' })
  producto_id!: string;

  @IsEnum(TipoItemCompra)
  tipo_item!: TipoItemCompra;

  @IsNumber()
  @Min(1)
  cantidad!: number;

  @IsNumber()
  @Min(0)
  precio_unitario!: number;
}

export class RegistrarCompraDto {
  @IsUUID('4', { message: 'Sucursal inválida' })
  sucursal_id!: string;

  @IsOptional()
  @IsUUID('4', { message: 'Proveedor inválido' })
  proveedor_id?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompraItemDto)
  items!: CompraItemDto[];
}
