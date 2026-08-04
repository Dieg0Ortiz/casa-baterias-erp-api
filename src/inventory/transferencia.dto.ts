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
