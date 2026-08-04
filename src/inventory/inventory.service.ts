import { BadRequestException, Injectable } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';

// Fila de la consulta de inventario (join inventario -> productos ->
// marcas). El precio y la existencia SIEMPRE vienen del servidor.
interface FilaInventario {
  sucursal_id: string;
  cantidad: number;
  cascos_disponibles: number;
  productos: {
    id: string;
    modelo: string;
    codigo_barras: string;
    precio: number;
    requiere_casco: boolean;
    marcas: { nombre: string } | null;
  } | null;
}

@Injectable()
export class InventoryService {
  constructor(private readonly supabase: SupabaseService) {}

  private get client() {
    return this.supabase.getClient();
  }

  private throwIfError(error: PostgrestError | null) {
    if (error) {
      throw new BadRequestException(error.message);
    }
  }

  // Vista de inventario por sucursal: cantidad, cascos disponibles y
  // precio vigente (Sección 3.7: el precio siempre se consulta en vivo).
  // RLS filtra por sucursal: el trabajador solo ve la suya; el
  // administrador ve todas. El filtro `sucursal_id` es opcional.
  async listarInventario(sucursalId?: string) {
    let query = this.client
      .from('inventario')
      .select(
        'sucursal_id, cantidad, cascos_disponibles, productos(id, modelo, codigo_barras, precio, requiere_casco, marcas(nombre))',
      );
    if (sucursalId) {
      query = query.eq('sucursal_id', sucursalId);
    }
    const { data, error } = await query;
    this.throwIfError(error);

    // PostgREST devuelve los embeds to-one como objeto (igual que `marcas`
    // en el catálogo); la inferencia de supabase-js sin schema los tipa
    // como array, por eso el cast pasa por `unknown`.
    const filas = (data ?? []) as unknown as FilaInventario[];
    return filas.map((fila) => ({
      sucursal_id: fila.sucursal_id,
      producto_id: fila.productos?.id ?? null,
      modelo: fila.productos?.modelo ?? null,
      codigo_barras: fila.productos?.codigo_barras ?? null,
      marca: fila.productos?.marcas?.nombre ?? null,
      precio: fila.productos?.precio ?? 0,
      requiere_casco: fila.productos?.requiere_casco ?? false,
      cantidad: fila.cantidad,
      cascos_disponibles: fila.cascos_disponibles,
    }));
  }
}
