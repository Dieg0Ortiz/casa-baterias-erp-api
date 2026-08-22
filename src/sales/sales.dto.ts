import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsIn,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class VentaItemDto {
  // El artículo se identifica por producto_id o por código de barras,
  // nunca ambos vacíos.
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

  // Opción de precio seleccionada ('default' | 'precio_2' | 'precio_3' | 'precio_especial')
  @IsOptional()
  @IsIn(['default', 'precio_2', 'precio_3', 'precio_especial'], {
    message: 'El tipo de precio debe ser default, precio_2, precio_3 o precio_especial',
  })
  tipo_precio?: 'default' | 'precio_2' | 'precio_3' | 'precio_especial';

  // Precio unitario personalizado capturado por el trabajador (solo cuando tipo_precio === 'precio_especial')
  @ValidateIf((o: VentaItemDto) => o.tipo_precio === 'precio_especial')
  @IsNumber({}, { message: 'El precio unitario es requerido para precio especial' })
  @Min(0, { message: 'El precio especial no puede ser negativo' })
  precio_unitario?: number;
}

export class PagoParcialDto {
  @IsIn(['efectivo', 'tarjeta', 'tarjeta_debito', 'tarjeta_credito', 'transferencia'], {
    message:
      'El método de pago parcial debe ser efectivo, tarjeta_debito, tarjeta_credito o transferencia',
  })
  metodo!: 'efectivo' | 'tarjeta' | 'tarjeta_debito' | 'tarjeta_credito' | 'transferencia';

  @IsNumber({}, { message: 'Monto inválido' })
  @Min(0.01, { message: 'El monto debe ser mayor a 0' })
  monto!: number;

  @IsOptional()
  @IsString()
  referencia?: string;
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

  // Método de pago: efectivo, tarjeta_debito, tarjeta_credito, transferencia o mixto
  @IsOptional()
  @IsIn(
    ['efectivo', 'tarjeta', 'tarjeta_debito', 'tarjeta_credito', 'transferencia', 'mixto', 'credito'],
    {
      message:
        'El método de pago debe ser efectivo, tarjeta_debito, tarjeta_credito, transferencia, mixto o credito',
    },
  )
  metodo_pago?:
    | 'efectivo'
    | 'tarjeta'
    | 'tarjeta_debito'
    | 'tarjeta_credito'
    | 'transferencia'
    | 'mixto'
    | 'credito';

  @IsOptional()
  @IsUUID('4', { message: 'Empresa de crédito inválida' })
  empresa_credito_id?: string;

  @IsOptional()
  @IsString()
  recibido_por?: string;

  @IsOptional()
  @IsString()
  vehiculo_placas?: string;

  @IsOptional()
  @IsString()
  folio_vale?: string;

  @IsOptional()
  @IsArray({ message: 'El desglose de pagos debe ser una lista' })
  @ValidateNested({ each: true })
  @Type(() => PagoParcialDto)
  desglose_pago?: PagoParcialDto[];
}
