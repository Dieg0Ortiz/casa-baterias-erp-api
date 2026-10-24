import { Injectable } from '@nestjs/common';
import { todasLasPaginas } from '../common/consultas';
import { rangoDiaMexico } from '../common/fechas';
import { redondear } from '../common/pagos';
import { SupabaseService } from '../supabase/supabase.service';

interface FilaUtilidad {
  cantidad: number;
  precio_unitario: number;
  precio_compra: number | null;
  // Depósito de casco del renglón completo (no por pieza), desde 034.
  comision_casco: number | null;
}

@Injectable()
export class ReportsService {
  constructor(private readonly supabase: SupabaseService) {}

  private get client() {
    return this.supabase.getClient();
  }

  // Utilidad de las ventas activas y de los intercambios de cascos en un
  // rango de días (hora de México, ambos días incluidos).
  async obtenerUtilidades(fechaInicio?: string, fechaFin?: string) {
    const desde = fechaInicio ? rangoDiaMexico(fechaInicio).inicio : null;
    const hasta = fechaFin ? rangoDiaMexico(fechaFin).fin : null;

    const [items, intercambios] = await Promise.all([
      todasLasPaginas<FilaUtilidad>((inicio, fin) => {
        let query = this.client
          .from('venta_items')
          .select(
            'cantidad, precio_unitario, precio_compra, comision_casco, ventas!inner(estado, created_at)',
          )
          .eq('ventas.estado', 'activa');
        if (desde) query = query.gte('ventas.created_at', desde);
        if (hasta) query = query.lte('ventas.created_at', hasta);
        return query.order('id').range(inicio, fin);
      }),
      todasLasPaginas<{ monto_cobrado: number }>((inicio, fin) => {
        let query = this.client
          .from('intercambios_cascos')
          .select('monto_cobrado')
          .eq('estado', 'completado');
        if (desde) query = query.gte('created_at', desde);
        if (hasta) query = query.lte('created_at', hasta);
        return query.order('id').range(inicio, fin);
      }),
    ]);

    let totalVentas = 0;
    let totalCosto = 0;
    for (const item of items) {
      const cantidad = Number(item.cantidad);
      totalVentas +=
        Number(item.precio_unitario) * cantidad +
        Number(item.comision_casco ?? 0);
      totalCosto += Number(item.precio_compra ?? 0) * cantidad;
    }
    // El intercambio de cascos es un servicio: todo lo cobrado es utilidad.
    totalVentas += intercambios.reduce(
      (s, i) => s + (Number(i.monto_cobrado) || 0),
      0,
    );

    return {
      totalVentas: redondear(totalVentas),
      totalCosto: redondear(totalCosto),
      totalUtilidad: redondear(totalVentas - totalCosto),
    };
  }
}
