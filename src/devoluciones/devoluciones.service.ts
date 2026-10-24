import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { AuthService } from '../auth/auth.service';
import { rangoDiaMexico } from '../common/fechas';
import type {
  PerfilUsuario,
  UsuarioAutenticado,
} from '../common/guards/jwt-auth.guard';
import { redondear } from '../common/pagos';
import {
  marcaYModelo,
  primero,
  type ProductoConMarca,
  type Relacion,
} from '../common/relaciones';
import { normalizarFolio } from '../sales/sales.service';
import { todasLasPaginas } from '../common/consultas';
import { SupabaseService } from '../supabase/supabase.service';
import {
  ConsultaDepositosDto,
  ConsultaDevolucionesDto,
  DevolverBateriaDto,
  DevolverDepositoDto,
} from './devoluciones.dto';

interface FilaDeposito {
  id: string;
  venta_id: string;
  sucursal_id: string;
  comision_cobrada: number;
  fecha_limite: string;
  nombre_cliente: string | null;
  telefono_cliente: string | null;
  notas: string | null;
  created_at: string;
  ventas: Relacion<{ folio: string; created_at: string; estado: string }>;
  productos: Relacion<ProductoConMarca>;
  venta_items: Relacion<{ cantidad: number }>;
}

interface FilaVentaDevolucion {
  id: string;
  folio: string;
  created_at: string;
  total: number;
  metodo_pago: string | null;
  estado: string;
}

interface FilaRenglonVenta {
  id: string;
  producto_id: string;
  cantidad: number;
  precio_unitario: number;
  con_casco: boolean | null;
  productos: Relacion<ProductoConMarca>;
}

interface FilaDevolucion {
  id: string;
  folio: string;
  tipo: 'deposito_casco' | 'bateria';
  monto: number;
  metodo_reembolso: string;
  motivo: string;
  cliente_nombre: string | null;
  created_at: string;
  sucursales: Relacion<{ nombre: string }>;
  ventas: Relacion<{ folio: string }>;
  solicitante: Relacion<{ nombre_completo: string }>;
  autorizador: Relacion<{ nombre_completo: string }>;
  devolucion_items: Array<{
    cantidad: number;
    monto: number;
    reingresa_inventario: boolean;
    productos: Relacion<ProductoConMarca>;
  }> | null;
}

@Injectable()
export class DevolucionesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly auth: AuthService,
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
    return data;
  }

  // Depósitos de casco que siguen pendientes. La tabla se puede leer desde
  // cualquier sucursal (010), así que aquí se limita a la del trabajador.
  async depositosPendientes(perfil: PerfilUsuario, dto: ConsultaDepositosDto) {
    let consulta = this.client
      .from('cascos_pendientes')
      .select(
        'id, venta_id, sucursal_id, comision_cobrada, fecha_limite, nombre_cliente, telefono_cliente, notas, created_at, ventas(folio, created_at, estado), productos!cascos_pendientes_producto_id_fkey(modelo, marcas(nombre)), venta_items(cantidad)',
      )
      .eq('estado', 'pendiente')
      .order('fecha_limite', { ascending: true })
      .limit(300);

    const sucursalId =
      perfil.rol === 'administrador' ? dto.sucursal_id : perfil.sucursal_id;
    if (sucursalId) consulta = consulta.eq('sucursal_id', sucursalId);

    if (dto.folio?.trim()) {
      const { data: venta, error } = await this.client
        .from('ventas')
        .select('id')
        .eq('folio', normalizarFolio(dto.folio))
        .maybeSingle();
      this.throwIfError(error);
      if (!venta) return [];
      consulta = consulta.eq('venta_id', venta.id);
    }

    const { data, error } = await consulta;
    this.throwIfError(error);

    const ahora = Date.now();
    return ((data ?? []) as unknown as FilaDeposito[]).map((d) => {
      const venta = primero(d.ventas);
      return {
        id: d.id,
        venta_id: d.venta_id,
        folio: venta?.folio ?? null,
        venta_fecha: venta?.created_at ?? null,
        ...marcaYModelo(d.productos),
        piezas: primero(d.venta_items)?.cantidad ?? 1,
        deposito: Number(d.comision_cobrada),
        fecha_limite: d.fecha_limite,
        vencido: new Date(d.fecha_limite).getTime() < ahora,
        cliente_nombre: d.nombre_cliente,
        cliente_telefono: d.telefono_cliente,
        notas: d.notas,
      };
    });
  }

  devolverDeposito(dto: DevolverDepositoDto) {
    return this.rpc('devolver_deposito_casco', {
      p_casco_id: dto.casco_id,
      p_monto: dto.monto,
      p_metodo: dto.metodo_reembolso ?? 'efectivo',
      p_casco_producto_id: dto.casco_producto_id ?? null,
      p_notas: dto.notas ?? null,
    });
  }

  // Venta con lo que todavía se puede devolver de cada renglón.
  async ventaParaDevolucion(folio: string) {
    const { data, error } = await this.client
      .from('ventas')
      .select('id, folio, created_at, total, metodo_pago, estado')
      .eq('folio', normalizarFolio(folio))
      .maybeSingle();
    this.throwIfError(error);
    const venta: FilaVentaDevolucion | null = data;
    if (!venta) {
      throw new NotFoundException(
        'No hay una venta con ese folio en tu sucursal',
      );
    }

    const { data: renglones, error: errorRenglones } = await this.client
      .from('venta_items')
      .select(
        'id, producto_id, cantidad, precio_unitario, con_casco, productos(modelo, marcas(nombre))',
      )
      .eq('venta_id', venta.id);
    this.throwIfError(errorRenglones);
    const filas = (renglones ?? []) as unknown as FilaRenglonVenta[];

    const { data: devueltos, error: errorDevueltos } = await this.client
      .from('devolucion_items')
      .select('venta_item_id, cantidad')
      .in(
        'venta_item_id',
        filas.map((r) => r.id),
      );
    this.throwIfError(errorDevueltos);

    const { data: depositos, error: errorDepositos } = await this.client
      .from('cascos_pendientes')
      .select('venta_item_id, comision_cobrada')
      .eq('venta_id', venta.id)
      .eq('estado', 'pendiente');
    this.throwIfError(errorDepositos);

    const yaDevueltas = new Map<string, number>();
    for (const d of (devueltos ?? []) as Array<{
      venta_item_id: string;
      cantidad: number;
    }>) {
      yaDevueltas.set(
        d.venta_item_id,
        (yaDevueltas.get(d.venta_item_id) ?? 0) + d.cantidad,
      );
    }
    const depositoPendiente = new Map<string, number>();
    for (const d of (depositos ?? []) as Array<{
      venta_item_id: string | null;
      comision_cobrada: number;
    }>) {
      if (d.venta_item_id)
        depositoPendiente.set(d.venta_item_id, Number(d.comision_cobrada));
    }

    return {
      id: venta.id,
      folio: venta.folio,
      created_at: venta.created_at,
      total: Number(venta.total),
      metodo_pago: venta.metodo_pago ?? 'efectivo',
      estado: venta.estado,
      es_credito: venta.metodo_pago === 'credito',
      items: filas.map((r) => {
        const devueltas = yaDevueltas.get(r.id) ?? 0;
        return {
          venta_item_id: r.id,
          producto_id: r.producto_id,
          ...marcaYModelo(r.productos),
          cantidad: r.cantidad,
          devueltas,
          por_devolver: Math.max(r.cantidad - devueltas, 0),
          precio_unitario: Number(r.precio_unitario),
          con_casco: r.con_casco,
          // Solo se puede sumar al reembolso si se devuelve todo el renglón.
          deposito_pendiente: depositoPendiente.get(r.id) ?? null,
        };
      }),
    };
  }

  devolverBateria(solicitante: UsuarioAutenticado, dto: DevolverBateriaDto) {
    return this.auth.conAdministrador(dto.email, dto.password, () =>
      this.rpc('devolver_bateria', {
        p_venta_id: dto.venta_id,
        p_items: dto.items.map((i) => ({
          venta_item_id: i.venta_item_id,
          cantidad: i.cantidad,
          monto: i.monto,
          reingresa_inventario: i.reingresa_inventario ?? true,
        })),
        p_motivo: dto.motivo.trim(),
        p_metodo: dto.metodo_reembolso ?? 'efectivo',
        p_cliente_nombre: dto.cliente_nombre?.trim() || null,
        p_solicitado_por: solicitante.userId,
      }),
    );
  }

  detalle(id: string) {
    return this.rpc('detalle_devolucion', { p_devolucion_id: id });
  }

  // Lista para el reporte. RLS limita al trabajador a su sucursal.
  async listar(dto: ConsultaDevolucionesDto) {
    const armar = () => {
      let consulta = this.client
        .from('devoluciones')
        .select(
          'id, folio, tipo, monto, metodo_reembolso, motivo, cliente_nombre, created_at, sucursales(nombre), ventas(folio), solicitante:usuarios!devoluciones_solicitado_por_fkey(nombre_completo), autorizador:usuarios!devoluciones_autorizado_por_fkey(nombre_completo), devolucion_items(cantidad, monto, reingresa_inventario, productos(modelo, marcas(nombre)))',
        )
        .order('created_at', { ascending: false });

      if (dto.sucursal_id)
        consulta = consulta.eq('sucursal_id', dto.sucursal_id);
      if (dto.tipo) consulta = consulta.eq('tipo', dto.tipo);
      if (dto.fecha_desde) {
        consulta = consulta.gte(
          'created_at',
          rangoDiaMexico(dto.fecha_desde).inicio,
        );
      }
      if (dto.fecha_hasta) {
        consulta = consulta.lte(
          'created_at',
          rangoDiaMexico(dto.fecha_hasta).fin,
        );
      }
      return consulta;
    };
    const data = await todasLasPaginas<FilaDevolucion>((desde, hasta) =>
      armar().order('id').range(desde, hasta),
    );

    const devoluciones = data.map((d) => ({
      id: d.id,
      folio: d.folio,
      tipo: d.tipo,
      monto: Number(d.monto),
      metodo_reembolso: d.metodo_reembolso,
      motivo: d.motivo,
      cliente_nombre: d.cliente_nombre,
      created_at: d.created_at,
      sucursal: primero(d.sucursales)?.nombre ?? null,
      venta_folio: primero(d.ventas)?.folio ?? null,
      atendio: primero(d.solicitante)?.nombre_completo ?? null,
      autorizo: primero(d.autorizador)?.nombre_completo ?? null,
      items: (d.devolucion_items ?? []).map((i) => ({
        ...marcaYModelo(i.productos),
        cantidad: i.cantidad,
        monto: Number(i.monto),
        reingresa_inventario: i.reingresa_inventario,
      })),
    }));

    const total = (tipo?: string) =>
      redondear(
        devoluciones
          .filter((d) => !tipo || d.tipo === tipo)
          .reduce((s, d) => s + d.monto, 0),
      );

    return {
      devoluciones,
      totales: {
        devoluciones: devoluciones.length,
        monto: total(),
        depositos: total('deposito_casco'),
        baterias: total('bateria'),
      },
    };
  }
}
