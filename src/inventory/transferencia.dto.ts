import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class TransferirInventarioDto {
  @IsUUID('4', { message: 'Producto inválido' })
  producto_id!: string;

  @IsUUID('4', { message: 'Sucursal de origen inválida' })
  sucursal_origen_id!: string;

  @IsUUID('4', { message: 'Sucursal de destino inválida' })
  sucursal_destino_id!: string;

  @IsInt({ message: 'Cantidad inválida' })
  @Min(1, { message: 'La cantidad debe ser al menos 1' })
  cantidad!: number;

  @IsOptional()
  @IsString()
  nota?: string;
}

export class ReabastecerInventarioDto {
  @IsUUID('4', { message: 'Producto inválido' })
  producto_id!: string;

  @IsUUID('4', { message: 'Sucursal inválida' })
  sucursal_id!: string;

  @IsInt({ message: 'Cantidad inválida' })
  @Min(1, { message: 'La cantidad a ingresar debe ser al menos 1' })
  cantidad!: number;

  @IsOptional()
  @IsString()
  nota?: string;
}

// Corrección de sucursal: mueve TODA la existencia del producto de la
// sucursal equivocada a la correcta, SIN registrar una transferencia.
// Solo para el caso de alta en la sucursal incorrecta.
export class CorregirSucursalDto {
  @IsUUID('4', { message: 'Producto inválido' })
  producto_id!: string;

  @IsUUID('4', { message: 'Sucursal de origen inválida' })
  sucursal_origen_id!: string;

  @IsUUID('4', { message: 'Sucursal correcta inválida' })
  sucursal_destino_id!: string;
}

export class CargaMasivaItemDto {
  @ValidateIf((o: CargaMasivaItemDto) => !o.referencia)
  @IsString({ message: 'Escribe la marca y el modelo, o el código de barras' })
  @MinLength(1, { message: 'Escribe la marca y el modelo, o el código de barras' })
  codigo_barras?: string;

  @ValidateIf((o: CargaMasivaItemDto) => !o.codigo_barras)
  @IsString({ message: 'Escribe la marca y el modelo, o el código de barras' })
  @MinLength(1, { message: 'Escribe la marca y el modelo, o el código de barras' })
  referencia?: string;

  @IsInt({ message: 'Cantidad inválida' })
  @Min(0, { message: 'La cantidad no puede ser negativa' })
  cantidad!: number;
}

// Carga de existencias de una sucursal en una sola operación. Cada renglón
// se relaciona con el catálogo por código de barras o por marca y modelo
// (GONHER 47). `sumar` acumula; `reemplazar` deja la cantidad exacta.
export class CargarExistenciasMasivoDto {
  @IsUUID('4', { message: 'Sucursal inválida' })
  sucursal_id!: string;

  @IsOptional()
  @IsIn(['sumar', 'reemplazar'], { message: 'Modo inválido: usa sumar o reemplazar' })
  modo?: 'sumar' | 'reemplazar';

  @IsArray({ message: 'No hay renglones que cargar' })
  @ArrayMinSize(1, { message: 'No hay renglones que cargar' })
  @ValidateNested({ each: true })
  @Type(() => CargaMasivaItemDto)
  items!: CargaMasivaItemDto[];
}

// Eliminar o ajustar existencias de un producto en una sucursal específica.
export class EliminarExistenciaDto {
  @IsUUID('4', { message: 'Producto inválido' })
  producto_id!: string;

  @IsUUID('4', { message: 'Sucursal inválida' })
  sucursal_id!: string;

  @IsOptional()
  @IsInt({ message: 'Cantidad inválida' })
  @Min(1, { message: 'La cantidad a retirar debe ser al menos 1' })
  cantidad?: number;
}
