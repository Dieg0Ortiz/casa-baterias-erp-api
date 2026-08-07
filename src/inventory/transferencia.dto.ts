import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

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
