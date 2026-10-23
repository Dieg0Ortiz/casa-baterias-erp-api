import { BadRequestException, Injectable } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import type { PerfilUsuario } from '../common/guards/jwt-auth.guard';
import { SupabaseService } from '../supabase/supabase.service';
import { AbrirCajaDto, CerrarCajaDto } from './cash.dto';

const COLUMNAS_CORTE =
  'id, sucursal_id, usuario_id, monto_inicial, monto_final_reportado, monto_calculado, diferencia, total_tarjetas, total_transferencias, estado, abierto_en, cerrado_en, cerrado_por';

export interface FilaCorte {
  id: string;
  sucursal_id: string;
  usuario_id: string;
  monto_inicial: number;
  monto_final_reportado: number | null;
  monto_calculado: number | null;
  diferencia: number | null;
  total_tarjetas: number | null;
  total_transferencias: number | null;
  estado: 'abierto' | 'cerrado';
  abierto_en: string;
  cerrado_en: string | null;
  cerrado_por: string | null;
}

// Forma del resumen que arma resumen_corte (migración 037). Solo se tipan los
// campos que lee el API; el resto pasa tal cual a las apps.
export interface ResumenCorte {
  efectivo: { esperado: number; ventas: number };
  electronico: { total: number };
  [campo: string]: unknown;
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

  /** La sucursal del trabajador; la que pida el administrador. */
  private sucursalDe(perfil: PerfilUsuario, pedida?: string): string | null {
    if (perfil.rol === 'administrador') {
      return pedida ?? perfil.sucursal_id ?? null;
    }
    return perfil.sucursal_id ?? null;
  }

  // Apertura de caja (Sección 7): la RPC `abrir_caja` valida que el
  // usuario esté activo y rechaza si la sucursal ya tiene una caja abierta.
  async abrirCaja(dto: AbrirCajaDto) {
    const { data, error } = await this.rpc('abrir_caja', {
      p_monto_inicial: dto.monto_inicial,
      p_sucursal_id: dto.sucursal_id ?? null,
    });
    if (error) {
      throw new BadRequestException(this.mensajeRpc(error));
    }
    return data;
  }

  // Cierre de caja: la RPC compara el efectivo contado contra el corte de
  // efectivo y guarda en el corte el resumen completo (efectivo, tarjetas y
  // transferencias, créditos aparte).
  async cerrarCaja(dto: CerrarCajaDto) {
    const { data, error } = await this.rpc('cerrar_caja', {
      p_corte_id: dto.corte_id,
      p_monto_final: dto.monto_final,
    });
    if (error) {
      throw new BadRequestException(this.mensajeRpc(error));
    }
    return data;
  }

  async resumen(corteId: string): Promise<ResumenCorte> {
    const { data, error } = await this.rpc('resumen_corte', {
      p_corte_id: corteId,
    });
    if (error) {
      throw new BadRequestException(this.mensajeRpc(error));
    }
    return data as ResumenCorte;
  }

  // La caja es por sucursal (una sola abierta, compartida por todos sus
  // empleados). `total_ventas` y `monto_esperado` se conservan para las
  // versiones de la app que aún no leen `resumen`: monto_esperado es ahora el
  // efectivo que debe haber en el cajón, sin tarjetas ni transferencias.
  async cajaActiva(perfil: PerfilUsuario, sucursalPedida?: string) {
    const sucursalId = this.sucursalDe(perfil, sucursalPedida);
    if (!sucursalId) {
      return { corte: null, resumen: null, total_ventas: 0, monto_esperado: 0 };
    }

    const { data: cortes, error } = await this.client
      .from('cortes_caja')
      .select(COLUMNAS_CORTE)
      .eq('estado', 'abierto')
      .eq('sucursal_id', sucursalId)
      .limit(1);
    this.throwIfError(error);

    const corte: FilaCorte | null = cortes?.[0] ?? null;
    if (!corte) {
      return { corte: null, resumen: null, total_ventas: 0, monto_esperado: 0 };
    }

    const resumen = await this.resumen(corte.id);
    return {
      corte,
      resumen,
      total_ventas:
        Number(resumen.efectivo.ventas) + Number(resumen.electronico.total),
      monto_esperado: Number(resumen.efectivo.esperado),
    };
  }

  // Cortes de la sucursal, el más reciente primero. RLS limita al trabajador
  // a los de su sucursal; el administrador puede filtrar por cualquiera.
  async historial(perfil: PerfilUsuario, sucursalPedida?: string, limite = 60) {
    let consulta = this.client
      .from('cortes_caja')
      .select(COLUMNAS_CORTE)
      .order('abierto_en', { ascending: false })
      .limit(limite);
    const sucursalId = this.sucursalDe(perfil, sucursalPedida);
    if (sucursalId) {
      consulta = consulta.eq('sucursal_id', sucursalId);
    }
    const { data, error } = await consulta;
    this.throwIfError(error);
    return data ?? [];
  }
}
