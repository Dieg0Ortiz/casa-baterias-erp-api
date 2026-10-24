import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  METODOS_REEMBOLSO,
  RenglonDevolucionDto,
  type MetodoReembolso,
} from '../devoluciones/devoluciones.dto';

export const TIPOS_SOLICITUD = [
  'reimpresion',
  'cancelacion',
  'devolucion_bateria',
] as const;
export type TipoSolicitud = (typeof TIPOS_SOLICITUD)[number];

export const ESTADOS_SOLICITUD = [
  'pendiente',
  'aprobada',
  'rechazada',
  'retirada',
] as const;
export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];

// La caja pide que un administrador autorice desde el panel.
export class SolicitarAutorizacionDto {
  @IsIn(TIPOS_SOLICITUD, { message: 'Tipo de solicitud inválido' })
  tipo!: TipoSolicitud;

  @IsString()
  @MinLength(4, { message: 'Escribe el folio de la venta' })
  @MaxLength(40)
  folio!: string;

  @IsString()
  @MinLength(4, { message: 'Escribe el motivo' })
  @MaxLength(200)
  motivo!: string;

  // Solo en la devolución de batería.
  @ValidateIf((o: SolicitarAutorizacionDto) => o.tipo === 'devolucion_bateria')
  @IsArray()
  @ArrayMinSize(1, { message: 'Indica qué piezas se devuelven' })
  @ValidateNested({ each: true })
  @Type(() => RenglonDevolucionDto)
  items?: RenglonDevolucionDto[];

  @IsOptional()
  @IsIn(METODOS_REEMBOLSO, { message: 'Forma de reembolso inválida' })
  metodo_reembolso?: MetodoReembolso;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cliente_nombre?: string;
}

export class ConsultaAutorizacionesDto {
  @IsOptional()
  @IsIn(ESTADOS_SOLICITUD, { message: 'Estado inválido' })
  estado?: EstadoSolicitud;

  @IsOptional()
  @IsUUID('4', { message: 'Sucursal inválida' })
  sucursal_id?: string;
}

export class ResolverAutorizacionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nota?: string;
}
