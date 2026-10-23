import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class AbrirCajaDto {
  @IsNumber({}, { message: 'Monto inicial inválido' })
  @Min(0, { message: 'El monto inicial no puede ser negativo' })
  monto_inicial!: number;

  // Solo la toma en cuenta un administrador (no tiene sucursal fija); al
  // trabajador siempre se le abre la de su sucursal.
  @IsOptional()
  @IsUUID('4', { message: 'Sucursal inválida' })
  sucursal_id?: string;
}

export class CerrarCajaDto {
  @IsUUID('4', { message: 'Corte inválido' })
  corte_id!: string;

  @IsNumber({}, { message: 'Monto final inválido' })
  @Min(0, { message: 'El monto final no puede ser negativo' })
  monto_final!: number;
}

export class ConsultaCajaDto {
  @IsOptional()
  @IsUUID('4', { message: 'Sucursal inválida' })
  sucursal_id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limite?: number;
}
