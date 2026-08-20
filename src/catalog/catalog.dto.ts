import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CrearMarcaDto {
  @IsString({ message: 'El nombre de la marca es obligatorio' })
  nombre!: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsString()
  ficha_tecnica_url?: string;
}

export class ActualizarMarcaDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsString()
  ficha_tecnica_url?: string;
}

export class CrearProductoDto {
  @IsUUID('4', { message: 'Marca inválida' })
  marca_id!: string;

  @IsString({ message: 'El modelo es obligatorio' })
  modelo!: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsNumber({}, { message: 'Precio inválido' })
  @Min(0, { message: 'El precio no puede ser negativo' })
  precio!: number;

  @IsOptional()
  @IsNumber({}, { message: 'Precio 2 inválido' })
  @Min(0, { message: 'El precio 2 no puede ser negativo' })
  precio_2?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Precio 3 inválido' })
  @Min(0, { message: 'El precio 3 no puede ser negativo' })
  precio_3?: number;

  @IsOptional()
  @IsBoolean()
  requiere_casco?: boolean;

  @IsOptional()
  @IsNumber({}, { message: 'Comisión de casco inválida' })
  @Min(0, { message: 'La comisión no puede ser negativa' })
  comision_casco?: number;

  @IsOptional()
  @IsString()
  codigo_barras_fabrica?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Sucursal inválida' })
  sucursal_id?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cantidad_inicial?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Precio de compra inválido' })
  @Min(0, { message: 'El precio de compra no puede ser negativo' })
  precio_compra?: number;
}

export class ActualizarProductoDto {
  @IsOptional()
  @IsUUID('4', { message: 'Marca inválida' })
  marca_id?: string;

  @IsOptional()
  @IsString({ message: 'El modelo es obligatorio' })
  modelo?: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Precio inválido' })
  @Min(0, { message: 'El precio no puede ser negativo' })
  precio?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Precio 2 inválido' })
  @Min(0, { message: 'El precio 2 no puede ser negativo' })
  precio_2?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Precio 3 inválido' })
  @Min(0, { message: 'El precio 3 no puede ser negativo' })
  precio_3?: number;

  @IsOptional()
  @IsBoolean()
  requiere_casco?: boolean;

  @IsOptional()
  @IsNumber({}, { message: 'Comisión de casco inválida' })
  @Min(0, { message: 'La comisión no puede ser negativa' })
  comision_casco?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Precio de compra inválido' })
  @Min(0, { message: 'El precio de compra no puede ser negativo' })
  precio_compra?: number;
}

export class ActualizarPrecioDto {
  @IsNumber({}, { message: 'Precio inválido' })
  @Min(0, { message: 'El precio no puede ser negativo' })
  precio!: number;

  @IsOptional()
  @IsNumber({}, { message: 'Precio 2 inválido' })
  @Min(0, { message: 'El precio 2 no puede ser negativo' })
  precio_2?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Precio 3 inválido' })
  @Min(0, { message: 'El precio 3 no puede ser negativo' })
  precio_3?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Comisión de casco inválida' })
  @Min(0, { message: 'La comisión no puede ser negativa' })
  comision_casco?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Precio de compra inválido' })
  @Min(0, { message: 'El precio de compra no puede ser negativo' })
  precio_compra?: number;
}
