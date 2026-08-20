import { BadRequestException, Injectable } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class ReportsService {
  constructor(private readonly supabase: SupabaseService) {}

  private get client() {
    return this.supabase.getClient();
  }

  private throwIfError(error: PostgrestError | null) {
    if (error) {
      throw new BadRequestException(error.message);
    }
  }

  async obtenerUtilidades(fechaInicio?: string, fechaFin?: string) {
    let query = this.client
      .from('venta_items')
      .select('id, cantidad, precio_unitario, precio_compra, comision_casco, ventas!inner(estado, created_at, sucursales(nombre))');

    if (fechaInicio) {
      query = query.gte('ventas.created_at', fechaInicio);
    }
    if (fechaFin) {
      query = query.lte('ventas.created_at', fechaFin);
    }

    const { data, error } = await query;
    this.throwIfError(error);

    // Filtrar solo las activas
    const items = data.filter((item: any) => item.ventas.estado === 'activa');

    let totalVentas = 0;
    let totalCosto = 0;
    let totalUtilidad = 0;

    for (const item of items) {
      const cantidad = item.cantidad;
      const venta = (item.precio_unitario * cantidad) + (item.comision_casco ?? 0);
      const costo = (item.precio_compra * cantidad);
      
      totalVentas += venta;
      totalCosto += costo;
      totalUtilidad += (venta - costo);
    }

    return { totalVentas, totalCosto, totalUtilidad, items };
  }
}
