import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { rangoDiaMexico } from '../common/fechas';
import type { PerfilUsuario } from '../common/guards/jwt-auth.guard';
import { redondear } from '../common/pagos';
import {
  marcaYModelo,
  primero,
  type ProductoConMarca,
  type Relacion,
} from '../common/relaciones';
import { SalesService } from '../sales/sales.service';
import { SupabaseService } from '../supabase/supabase.service';
import {
  ConsultaAutorizacionesDto,
  SolicitarAutorizacionDto,
  type EstadoSolicitud,
  type TipoSolicitud,
} from './autorizaciones.dto';

const COLUMNAS = `id, tipo, estado, folio, motivo, datos, created_at, expira_en,
  resuelto_en, nota_resolucion, resultado, impresa_en, venta_id,
  sucursales(nombre),
  solicitante:usuarios!solicitudes_autorizacion_solicitado_por_fkey(nombre_completo),
  autorizador:usuarios!solicitudes_autorizacion_resuelto_por_fkey(nombre_completo),
  ventas(total, metodo_pago, created_at,
    venta_items(id, cantidad, precio_unitario, productos(modelo, marcas(nombre))))`;

interface RenglonPedido {
  venta_item_id?: string;
  cantidad?: number;
  monto?: number;
  reingresa_inventario?: boolean;
}

interface FilaSolicitud {
  id: string;
  tipo: TipoSolicitud;
  estado: EstadoSolicitud;
  folio: string;
  motivo: string;
  datos: {
    items?: RenglonPedido[];
    metodo?: string;
    cliente_nombre?: string | null;
  } | null;
  created_at: string;
  expira_en: string;
  resuelto_en: string | null;
  nota_resolucion: string | null;
  resultado: Record<string, unknown> | null;
  impresa_en: string | null;
  venta_id: string;
  sucursales: Relacion<{ nombre: string }>;
  solicitante: Relacion<{ nombre_completo: string }>;
  autorizador: Relacion<{ nombre_completo: string }>;
  ventas: Relacion<{
    total: number;
    metodo_pago: string | null;
    created_at: string;
    venta_items: Array<{
      id: string;
      cantidad: number;
      precio_unitario: number;
      productos: Relacion<ProductoConMarca>;
    }> | null;
  }>;
}

function nombreProducto(producto: Relacion<ProductoConMarca>): string {
  const { marca, modelo } = marcaYModelo(producto);
  return [marca, modelo].filter(Boolean).join(' ') || 'Producto';
}

// Autorización a distancia (migración 040): la caja pide reimprimir,
// cancelar o devolver una batería y un administrador lo aprueba desde el
// panel. Aprobar ejecuta la acción en la base con la sesión del
// administrador; aquí solo se arma lo que cada pantalla necesita ver.
@Injectable()
export class AutorizacionesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly ventas: SalesService,
  ) {}

  private get client() {
    return this.supabase.getClient();
  }

  private throwIfError(error: PostgrestError | null) {
    if (error) {
      throw new BadRequestException(error.message);
    }
  }

  private async rpc(nombre: string, args: Record<string, unknown>) {
    const { data, error } = (await this.client.rpc(nombre, args)) as {
      data: unknown;
      error: PostgrestError | null;
    };
    if (error) {
      const detalle = (error.details ?? '').trim();
      throw new BadRequestException(
        detalle.length > 0 ? detalle : error.message,
      );
    }
    return data as { id: string };
  }

  async solicitar(dto: SolicitarAutorizacionDto) {
    const datos =
      dto.tipo === 'devolucion_bateria'
        ? {
            items: (dto.items ?? []).map((i) => ({
              venta_item_id: i.venta_item_id,
              cantidad: i.cantidad,
              monto: i.monto,
              reingresa_inventario: i.reingresa_inventario ?? true,
            })),
            metodo: dto.metodo_reembolso ?? 'efectivo',
            cliente_nombre: dto.cliente_nombre?.trim() || null,
          }
        : {};
    const solicitud = await this.rpc('solicitar_autorizacion', {
      p_tipo: dto.tipo,
      p_folio: dto.folio,
      p_motivo: dto.motivo.trim(),
      p_datos: datos,
    });
    return this.detalle(solicitud.id);
  }

  // Pendientes: todas las que siguen esperando (el panel). Sin estado o
  // con otro: las de hoy (la caja revisa cómo van las suyas).
  async listar(perfil: PerfilUsuario, dto: ConsultaAutorizacionesDto) {
    let consulta = this.client
      .from('solicitudes_autorizacion')
      .select(COLUMNAS)
      .order('created_at', { ascending: false })
      .limit(200);

    if (dto.estado === 'pendiente') {
      consulta = consulta
        .eq('estado', 'pendiente')
        .gt('expira_en', new Date().toISOString());
    } else {
      const { inicio, fin } = rangoDiaMexico();
      consulta = consulta.gte('created_at', inicio).lte('created_at', fin);
      if (dto.estado) consulta = consulta.eq('estado', dto.estado);
    }

    const sucursalId =
      perfil.rol === 'administrador' ? dto.sucursal_id : perfil.sucursal_id;
    if (sucursalId) consulta = consulta.eq('sucursal_id', sucursalId);

    const { data, error } = await consulta;
    this.throwIfError(error);
    return ((data ?? []) as unknown as FilaSolicitud[]).map((fila) =>
      this.formatear(fila),
    );
  }

  async pendientes() {
    const { count, error } = await this.client
      .from('solicitudes_autorizacion')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'pendiente')
      .gt('expira_en', new Date().toISOString());
    this.throwIfError(error);
    return { total: count ?? 0 };
  }

  // Una solicitud. Si es una reimpresión aprobada que todavía no se
  // imprime, trae el ticket con la misma forma que la reimpresión con clave.
  async detalle(id: string) {
    const { data, error } = await this.client
      .from('solicitudes_autorizacion')
      .select(COLUMNAS)
      .eq('id', id)
      .maybeSingle();
    this.throwIfError(error);
    if (!data) {
      throw new NotFoundException('Solicitud no encontrada');
    }
    const fila = data as unknown as FilaSolicitud;
    const solicitud = this.formatear(fila);

    if (
      fila.tipo === 'reimpresion' &&
      fila.estado === 'aprobada' &&
      !fila.impresa_en
    ) {
      return {
        ...solicitud,
        ticket: {
          numero: Number(fila.resultado?.numero ?? 1),
          autorizo: solicitud.autorizador,
          motivo: fila.motivo,
          venta: await this.ventas.datosTicket(fila.venta_id),
        },
      };
    }
    return solicitud;
  }

  async resolver(id: string, aprobar: boolean, nota?: string) {
    await this.rpc('resolver_solicitud', {
      p_solicitud_id: id,
      p_aprobar: aprobar,
      p_nota: nota?.trim() || null,
    });
    return this.detalle(id);
  }

  async retirar(id: string) {
    await this.rpc('retirar_solicitud', { p_solicitud_id: id });
    return this.detalle(id);
  }

  async marcarImpresa(id: string) {
    await this.rpc('marcar_solicitud_impresa', { p_solicitud_id: id });
    return this.detalle(id);
  }

  private formatear(fila: FilaSolicitud) {
    const venta = primero(fila.ventas);
    const renglones = venta?.venta_items ?? [];
    const porId = new Map(renglones.map((r) => [r.id, r]));

    let devolucion: {
      metodo: string;
      cliente_nombre: string | null;
      total: number;
      piezas: Array<{
        cantidad: number;
        producto: string;
        monto: number;
        reingresa_inventario: boolean;
      }>;
    } | null = null;
    if (fila.tipo === 'devolucion_bateria') {
      const piezas = (fila.datos?.items ?? []).map((i) => ({
        cantidad: Number(i.cantidad ?? 0),
        producto: nombreProducto(
          porId.get(i.venta_item_id ?? '')?.productos ?? null,
        ),
        monto: Number(i.monto ?? 0),
        reingresa_inventario: i.reingresa_inventario !== false,
      }));
      devolucion = {
        metodo: fila.datos?.metodo ?? 'efectivo',
        cliente_nombre: fila.datos?.cliente_nombre ?? null,
        total: redondear(piezas.reduce((s, p) => s + p.monto, 0)),
        piezas,
      };
    }

    return {
      id: fila.id,
      tipo: fila.tipo,
      estado: fila.estado,
      folio: fila.folio,
      motivo: fila.motivo,
      created_at: fila.created_at,
      expira_en: fila.expira_en,
      resuelto_en: fila.resuelto_en,
      nota_resolucion: fila.nota_resolucion,
      impresa_en: fila.impresa_en,
      sucursal: primero(fila.sucursales)?.nombre ?? null,
      solicitante: primero(fila.solicitante)?.nombre_completo ?? null,
      autorizador: primero(fila.autorizador)?.nombre_completo ?? null,
      venta: venta
        ? {
            total: Number(venta.total),
            metodo_pago: venta.metodo_pago ?? 'efectivo',
            created_at: venta.created_at,
            articulos: renglones.map((r) => ({
              cantidad: Number(r.cantidad),
              producto: nombreProducto(r.productos),
              precio_unitario: Number(r.precio_unitario),
            })),
          }
        : null,
      devolucion,
      resultado: fila.resultado,
    };
  }
}
