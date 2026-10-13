import { BadRequestException, Injectable } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';
import { AbrirCajaDto, CerrarCajaDto } from './cash.dto';

export interface FilaCorte {
  id: string;
  sucursal_id: string;
  usuario_id: string;
  monto_inicial: number;
  monto_final_reportado: number | null;
  monto_calculado: number | null;
  diferencia: number | null;
  estado: 'abierto' | 'cerrado';
  abierto_en: string;
  cerrado_en: string | null;
}

@Injectable()
export class CashService {
  constructor(private readonly supabase: SupabaseService) {}

  private get client() {
    return this.supabase.getClient();
  }

  private throwIfError(error: PostgrestError | null) {
    if (error) {
      throw new BadRequestException(error.message);
    }
  }

  private async rpc(
    nombre: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: PostgrestError | null }> {
    return (await this.client.rpc(nombre, args)) as {
      data: unknown;
      error: PostgrestError | null;
    };
  }

  private mensajeRpc(error: PostgrestError): string {
    const detalle = (error.details ?? '').trim();
    return detalle.length > 0 ? detalle : error.message;
  }

  // Apertura de caja (Sección 7): la RPC `abrir_caja` valida que el
  // usuario esté activo y tenga sucursal asignada, y rechaza si ya hay
  // una caja abierta. El monto inicial es el efectivo reportado al abrir.
  async abrirCaja(userId: string, dto: AbrirCajaDto) {
    const { data, error } = await this.rpc('abrir_caja', {
      p_monto_inicial: dto.monto_inicial,
    });
    if (error) {
      throw new BadRequestException(this.mensajeRpc(error));
    }
    return data;
  }

  // Cierre de caja (Sección 7): la RPC `cerrar_caja` calcula el monto
  // esperado (inicial + ventas activas del turno) y entrega la diferencia
  // contra el monto final reportado por el cajero.
  async cerrarCaja(userId: string, dto: CerrarCajaDto) {
    const { data, error } = await this.rpc('cerrar_caja', {
      p_corte_id: dto.corte_id,
      p_monto_final: dto.monto_final,
    });
    if (error) {
      throw new BadRequestException(this.mensajeRpc(error));
    }
    return data;
  }

  // La caja es por sucursal (una sola abierta, compartida por todos sus
  // empleados), así que se busca por sucursal_id y no por quien la abrió.
  async cajaActiva(userId: string, sucursalId: string | null) {
    let consulta = this.client
      .from('cortes_caja')
      .select(
        'id, sucursal_id, usuario_id, monto_inicial, monto_final_reportado, monto_calculado, diferencia, estado, abierto_en, cerrado_en',
      )
      .eq('estado', 'abierto');
    consulta = sucursalId
      ? consulta.eq('sucursal_id', sucursalId)
      : consulta.eq('usuario_id', userId);
    const { data: cortes, error } = await consulta
      .order('abierto_en', { ascending: false })
      .limit(1);
    this.throwIfError(error);

    const corte: FilaCorte | null = cortes?.[0] ?? null;
    if (!corte) {
      return { corte: null, total_ventas: 0, monto_esperado: 0 };
    }

    const { data: ventas, error: errorVentas } = await this.client
      .from('ventas')
      .select('total')
      .eq('corte_caja_id', corte.id)
      .eq('estado', 'activa');
    this.throwIfError(errorVentas);

    const totalVentas =
      ((ventas ?? []) as Array<{ total: number }>).reduce(
        (acc, v) => acc + Number(v.total),
        0,
      ) ?? 0;
    const montoEsperado = Number(corte.monto_inicial) + totalVentas;

    return { corte, total_ventas: totalVentas, monto_esperado: montoEsperado };
  }

  // Historial de cortes del usuario (más reciente primero). RLS asegura
  // que el cajero solo vea sus propios cortes.
  async historial(userId: string) {
    const { data, error } = await this.client
      .from('cortes_caja')
      .select(
        'id, sucursal_id, usuario_id, monto_inicial, monto_final_reportado, monto_calculado, diferencia, estado, abierto_en, cerrado_en',
      )
      .eq('usuario_id', userId)
      .order('abierto_en', { ascending: false });
    this.throwIfError(error);
    return data ?? [];
  }
}
