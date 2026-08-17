import { BadRequestException, Injectable } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';
import { RegistrarVentaDto } from './sales.dto';

type RpcResult = {
  data: unknown;
  error: PostgrestError | null;
};

export interface Venta {
  id: string;
  folio: string;
  sucursal_id: string;
  usuario_id: string;
  total: number;
  estado: string;
  created_at: string;
  metodo_pago?: string;
  desglose_pago?: Array<{ metodo: string; monto: number; referencia?: string }>;
}

@Injectable()
export class SalesService {
  constructor(private readonly supabase: SupabaseService) {}

  private get client() {
    return this.supabase.getClient();
  }

  private async rpc(
    nombre: string,
    args: Record<string, unknown>,
  ): Promise<RpcResult> {
    return (await this.client.rpc(nombre, args)) as RpcResult;
  }

  private mensajeRpc(error: PostgrestError): string {
    // Las funciones RPC levantan excepciones con mensajes pensados para
    // el usuario final; PostgREST los entrega normalmente en `details`.
    const detalle = (error.details ?? '').trim();
    return detalle.length > 0 ? detalle : error.message;
  }

  private throwIfError(error: PostgrestError | null) {
    if (error) {
      throw new BadRequestException(error.message);
    }
  }

  // Registro atómico vía RPC registrar_venta: el servidor valida stock,
  // toma el precio vigente, descuenta inventario y aplica la regla de
  // casco (Sección 3.3) en una sola transacción.
  async registrarVenta(dto: RegistrarVentaDto): Promise<Venta> {
    const { data, error } = await this.rpc('registrar_venta', {
      p_sucursal_id: dto.sucursal_id,
      p_corte_caja_id: dto.corte_caja_id ?? null,
      p_items: dto.items,
      p_metodo_pago: dto.metodo_pago ?? 'efectivo',
      p_desglose_pago: dto.desglose_pago ?? null,
    });
    if (error) {
      throw new BadRequestException(this.mensajeRpc(error));
    }
    return data as Venta;
  }

  // Lista de ventas del ámbito del usuario (RLS): el trabajador solo ve
  // las de su sucursal; el administrador ve las de todas.
  async listarVentas(): Promise<Venta[] | null> {
    const { data, error } = await this.client
      .from('ventas')
      .select(
        'id, folio, sucursal_id, usuario_id, total, estado, created_at, metodo_pago, desglose_pago',
      )
      .order('created_at', { ascending: false });
    this.throwIfError(error);
    return data as Venta[];
  }
}
