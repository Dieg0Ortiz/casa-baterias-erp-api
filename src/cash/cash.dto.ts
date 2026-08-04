import { IsNumber, IsUUID, Min } from 'class-validator';

export class AbrirCajaDto {
  @IsNumber({}, { message: 'Monto inicial inválido' })
  @Min(0, { message: 'El monto inicial no puede ser negativo' })
  monto_inicial!: number;
}

export class CerrarCajaDto {
  @IsUUID('4', { message: 'Corte inválido' })
  corte_id!: string;

  @IsNumber({}, { message: 'Monto final inválido' })
  @Min(0, { message: 'El monto final no puede ser negativo' })
  monto_final!: number;
}
