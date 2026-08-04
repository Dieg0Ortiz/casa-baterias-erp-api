import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class VentaItemDto {
  // El artículo se identifica por producto_id o por código de barras,
  // nunca ambos vacíos. El precio NO se acepta: siempre lo toma el
  // servidor del catálogo vigente (Sección 3.7).
  @ValidateIf((o: VentaItemDto) => !o.codigo_barras)
  @IsUUID('4', { message: 'Producto inválido' })
  producto_id?: string;

  @ValidateIf((o: VentaItemDto) => !o.producto_id)
  @IsString({ message: 'Código de barras inválido' })
  codigo_barras?: string;

  @IsInt({ message: 'Cantidad inválida' })
  @Min(1, { message: 'La cantidad debe ser al menos 1' })
  cantidad!: number;

  // Obligatorio cuando el producto requiere casco; el RPC lo valida y
  // devuelve el mensaje para que la app pregunte "¿con casco o sin
  // casco?" (Sección 3.3).
  @IsOptional()
  @IsBoolean()
  con_casco?: boolean;

  // true cuando la línea se agregó por búsqueda manual en catálogo
  // (Sección 3.7), visible para auditoría.
  @IsOptional()
  @IsBoolean()
  busqueda_manual?: boolean;
}

export class RegistrarVentaDto {
  @IsUUID('4', { message: 'Sucursal inválida' })
  sucursal_id!: string;

  @IsOptional()
  @IsUUID('4', { message: 'Corte de caja inválido' })
  corte_caja_id?: string;

  @IsArray({ message: 'La venta no puede estar vacía' })
  @ArrayMinSize(1, { message: 'La venta no puede estar vacía' })
  @ValidateNested({ each: true })
  @Type(() => VentaItemDto)
  items!: VentaItemDto[];
}
