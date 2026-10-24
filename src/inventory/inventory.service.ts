import { BadRequestException, Injectable } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { todasLasPaginas } from '../common/consultas';
import { SupabaseService } from '../supabase/supabase.service';
import {
  CargarExistenciasMasivoDto,
  CorregirSucursalDto,
  EliminarExistenciaDto,
  ReabastecerInventarioDto,
  TransferirInventarioDto,
} from './transferencia.dto';

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
    precio_2: number | null;
    precio_3: number | null;
    comision_casco: number | null;
    requiere_casco: boolean;
    marcas: { nombre: string } | null;
  } | null;
}

interface FilaTransferencia {
  id: string;
  producto_id: string;
  sucursal_origen_id: string;
  sucursal_destino_id: string;
  cantidad: number;
  autorizado_por: string;
  nota: string | null;
  created_at: string;
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

  // Vista de inventario por sucursal: cantidad, cascos disponibles y
  // precio vigente (Sección 3.7: el precio siempre se consulta en vivo).
  // RLS filtra por sucursal: el trabajador solo ve la suya; el
  // administrador ve todas. El filtro `sucursal_id` es opcional.
  async listarInventario(sucursalId?: string) {
    const armar = () => {
      let query = this.client
        .from('inventario')
        .select(
          'sucursal_id, cantidad, cascos_disponibles, productos(id, modelo, codigo_barras, precio, precio_2, precio_3, comision_casco, requiere_casco, marcas(nombre))',
        );
      if (sucursalId) {
        query = query.eq('sucursal_id', sucursalId);
      }
      return query;
    };
    const data = await todasLasPaginas<FilaInventario>((desde, hasta) =>
      armar().order('id').range(desde, hasta),
    );

    // PostgREST devuelve los embeds to-one como objeto (igual que `marcas`
    // en el catálogo); la inferencia de supabase-js sin schema los tipa
    // como array, por eso el cast pasa por `unknown`.
    const filas = data;
    return filas.map((fila) => ({
      sucursal_id: fila.sucursal_id,
      producto_id: fila.productos?.id ?? null,
      modelo: fila.productos?.modelo ?? null,
      codigo_barras: fila.productos?.codigo_barras ?? null,
      marca: fila.productos?.marcas?.nombre ?? null,
      precio: fila.productos?.precio ?? 0,
      precio_2: fila.productos?.precio_2 ?? null,
      precio_3: fila.productos?.precio_3 ?? null,
      comision_casco: fila.productos?.comision_casco ?? null,
      requiere_casco: fila.productos?.requiere_casco ?? false,
      cantidad: fila.cantidad,
      cascos_disponibles: fila.cascos_disponibles,
    }));
  }

  // Transferencia atómica entre sucursales vía RPC (Sección 5): solo
  // administrador (lo valida el RPC y el guard de roles). La RPC mueve
  // cantidad de una sucursal a la otra y registra el historial en una
  // sola transacción.
  async transferir(dto: TransferirInventarioDto) {
    const { data, error } = await this.rpc('transferir_inventario', {
      p_producto_id: dto.producto_id,
      p_origen: dto.sucursal_origen_id,
      p_destino: dto.sucursal_destino_id,
      p_cantidad: dto.cantidad,
      p_nota: dto.nota ?? null,
    });
    if (error) {
      throw new BadRequestException(this.mensajeRpc(error));
    }
    return data;
  }

  // Corrección de sucursal (alta equivocada): mueve TODA la existencia
  // del producto de la sucursal de origen a la correcta sin registrar
  // una transferencia (RPC corregir_sucursal_producto).
  async corregirSucursal(dto: CorregirSucursalDto) {
    const { data, error } = await this.rpc('corregir_sucursal_producto', {
      p_producto_id: dto.producto_id,
      p_origen: dto.sucursal_origen_id,
      p_destino: dto.sucursal_destino_id,
    });
    if (error) {
      throw new BadRequestException(this.mensajeRpc(error));
    }
    return data;
  }

  // Reabastecimiento: una o varias pilas con el mismo folio de factura.
  async reabastecer(dto: ReabastecerInventarioDto) {
    const items =
      dto.items && dto.items.length > 0
        ? dto.items
        : dto.producto_id && dto.cantidad
          ? [{ producto_id: dto.producto_id, cantidad: dto.cantidad }]
          : [];
    if (items.length === 0) {
      throw new BadRequestException('Agrega al menos una pila');
    }

    const { data, error } = await this.rpc('reabastecer_inventario_lote', {
      p_sucursal_id: dto.sucursal_id,
      p_items: items,
      p_nota: dto.nota ?? null,
    });

    if (error) {
      throw new BadRequestException(this.mensajeRpc(error));
    }
    return data;
  }

  async cargarExistenciasMasivo(dto: CargarExistenciasMasivoDto) {
    const { data, error } = await this.rpc('cargar_existencias_masivo', {
      p_sucursal_id: dto.sucursal_id,
      p_items: dto.items.map((it) => ({
        referencia: (it.referencia ?? it.codigo_barras ?? '').trim(),
        cantidad: it.cantidad,
      })),
      p_modo: dto.modo ?? 'sumar',
      p_nota: dto.nota ?? null,
    });

    if (error) {
      throw new BadRequestException(this.mensajeRpc(error));
    }

    return data;
  }

  async eliminarExistencia(dto: EliminarExistenciaDto) {
    const { data, error } = await this.rpc('eliminar_existencia_inventario', {
      p_producto_id: dto.producto_id,
      p_sucursal_id: dto.sucursal_id,
      p_cantidad: dto.cantidad ?? null,
    });

    if (error) {
      throw new BadRequestException(this.mensajeRpc(error));
    }

    if (!data) {
      return { success: true, cantidad: 0 };
    }

    return data;
  }

  // Historial de transferencias (solo administrador). Se componen los
  // nombres de producto, sucursales y autorizador a partir de consultas
  // simples (RLS permite al admin leerlas) para evitar joins ambiguos
  // con dos llaves foráneas hacia la misma tabla. Los productos van todos,
  // también los dados de baja: un traspaso viejo sigue teniendo nombre.
  async listarTransferencias() {
    const [filasTransferencias, productos, sucursales, usuarios] =
      await Promise.all([
        todasLasPaginas<FilaTransferencia>((desde, hasta) =>
          this.client
            .from('transferencias')
            .select(
              'id, producto_id, sucursal_origen_id, sucursal_destino_id, cantidad, autorizado_por, nota, created_at',
            )
            .order('created_at', { ascending: false })
            .order('id')
            .range(desde, hasta),
        ),
        todasLasPaginas<{ id: string; modelo: string }>((desde, hasta) =>
          this.client
            .from('productos')
            .select('id, modelo')
            .order('id')
            .range(desde, hasta),
        ),
        this.client.from('sucursales').select('id, nombre'),
        this.client.from('usuarios').select('id, nombre_completo'),
      ]);

    this.throwIfError(sucursales.error);
    this.throwIfError(usuarios.error);

    const mapaProductos = new Map(productos.map((p) => [p.id, p.modelo]));
    const mapaSucursales = new Map(
      ((sucursales.data ?? []) as Array<{ id: string; nombre: string }>).map(
        (s) => [s.id, s.nombre],
      ),
    );
    const mapaUsuarios = new Map(
      (
        (usuarios.data ?? []) as Array<{
          id: string;
          nombre_completo: string;
        }>
      ).map((u) => [u.id, u.nombre_completo]),
    );

    return filasTransferencias.map((t) => ({
      id: t.id,
      producto: mapaProductos.get(t.producto_id) ?? null,
      sucursal_origen: mapaSucursales.get(t.sucursal_origen_id) ?? null,
      sucursal_destino: mapaSucursales.get(t.sucursal_destino_id) ?? null,
      cantidad: t.cantidad,
      autorizado_por: mapaUsuarios.get(t.autorizado_por) ?? null,
      nota: t.nota ?? null,
      created_at: t.created_at,
    }));
  }
}
