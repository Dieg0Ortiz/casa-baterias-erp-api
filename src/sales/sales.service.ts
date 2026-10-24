import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { AuthService } from '../auth/auth.service';
import { todasLasPaginas } from '../common/consultas';
import { rangoDiaMexico } from '../common/fechas';
import type {
  PerfilUsuario,
  UsuarioAutenticado,
} from '../common/guards/jwt-auth.guard';
import {
  marcaYModelo,
  primero,
  type ProductoConMarca,
  type Relacion,
} from '../common/relaciones';
import { SupabaseService } from '../supabase/supabase.service';
import {
  CancelarTicketDto,
  CancelarVentaDto,
  RegistrarVentaDto,
  ReimprimirTicketDto,
} from './sales.dto';

/** Los folios se imprimen en mayúsculas; el cajero puede teclearlos como sea. */
export function normalizarFolio(folio: string): string {
  return folio.trim().toUpperCase();
}

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
  constructor(
    private readonly supabase: SupabaseService,
    private readonly auth: AuthService,
  ) {}

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
      p_empresa_credito_id: dto.empresa_credito_id ?? null,
      p_recibido_por: dto.recibido_por ?? dto.credito_recibido_por ?? null,
      p_vehiculo_placas:
        dto.vehiculo_placas ?? dto.credito_vehiculo_placas ?? null,
      p_folio_vale: dto.folio_vale ?? dto.credito_folio_vale ?? null,
    });
    if (error) {
      throw new BadRequestException(this.mensajeRpc(error));
    }
    return data as Venta;
  }

  // Lista de ventas del ámbito del usuario (RLS): el trabajador solo ve
  // las de su sucursal; el administrador ve las de todas.
  async listarVentas(): Promise<Venta[]> {
    return todasLasPaginas<Venta>((desde, hasta) =>
      this.client
        .from('ventas')
        .select(
          'id, folio, sucursal_id, usuario_id, total, estado, created_at, metodo_pago, desglose_pago',
        )
        .order('created_at', { ascending: false })
        .order('id')
        .range(desde, hasta),
    );
  }

  // Ventas de hoy (hora de México), de la más reciente a la más vieja, con
  // lo necesario para reconocerlas en la caja: hora, total, forma de pago,
  // quién cobró y qué pilas llevó. Sirve para reimprimir un ticket perdido
  // sin conocer el folio. El trabajador ve las de su sucursal; el
  // administrador, las de la sucursal que pida o las de todas.
  async ventasDelDia(perfil: PerfilUsuario, sucursalPedida?: string) {
    const sucursalId =
      perfil.rol === 'administrador'
        ? (sucursalPedida ?? perfil.sucursal_id)
        : perfil.sucursal_id;
    if (!sucursalId && perfil.rol !== 'administrador') {
      throw new BadRequestException('Tu usuario no tiene sucursal asignada');
    }

    const { inicio, fin } = rangoDiaMexico();
    let consulta = this.client
      .from('ventas')
      .select(
        'id, folio, total, estado, created_at, metodo_pago, sucursales(nombre), cajero:usuarios!ventas_usuario_id_fkey(nombre_completo), venta_items(cantidad, productos(modelo, marcas(nombre)))',
      )
      .gte('created_at', inicio)
      .lte('created_at', fin)
      .order('created_at', { ascending: false });
    if (sucursalId) {
      consulta = consulta.eq('sucursal_id', sucursalId);
    }
    const { data, error } = await consulta;
    this.throwIfError(error);

    return ((data ?? []) as unknown as FilaVentaDelDia[]).map((venta) => ({
      id: venta.id,
      folio: venta.folio,
      total: Number(venta.total),
      estado: venta.estado,
      created_at: venta.created_at,
      metodo_pago: venta.metodo_pago ?? 'efectivo',
      sucursal: primero(venta.sucursales)?.nombre ?? null,
      cajero: primero(venta.cajero)?.nombre_completo ?? null,
      articulos: (venta.venta_items ?? []).map((item) => {
        const { marca, modelo } = marcaYModelo(item.productos);
        return {
          cantidad: Number(item.cantidad),
          producto: [marca, modelo].filter(Boolean).join(' ') || 'Producto',
        };
      }),
    }));
  }

  // Cancelación pedida desde la caja: el trabajador da el folio y un
  // administrador escribe su clave. La venta se busca con la sesión del
  // trabajador (RLS: solo su sucursal) y cancelar_venta corre con la del
  // administrador, que es quien la autoriza en la base.
  async cancelarDesdeCaja(
    solicitante: UsuarioAutenticado,
    dto: CancelarTicketDto,
  ) {
    const folio = normalizarFolio(dto.folio);
    const { data, error } = await this.client
      .from('ventas')
      .select('id')
      .eq('folio', folio)
      .maybeSingle();
    this.throwIfError(error);
    const venta: { id: string } | null = data;
    if (!venta) {
      throw new NotFoundException(
        'No hay una venta con ese folio en tu sucursal',
      );
    }

    return this.auth.conAdministrador(dto.email, dto.password, (admin) =>
      this.cancelar(
        venta.id,
        dto.motivo,
        solicitante.userId,
        admin.nombre_completo,
      ),
    );
  }

  // Cancelación desde el panel: el administrador ya está en sesión.
  cancelarPorAdministrador(
    administrador: UsuarioAutenticado,
    ventaId: string,
    dto: CancelarVentaDto,
  ) {
    return this.cancelar(
      ventaId,
      dto.motivo,
      administrador.userId,
      administrador.perfil.nombre_completo,
    );
  }

  private async cancelar(
    ventaId: string,
    motivo: string,
    solicitadoPor: string,
    autorizo: string,
  ) {
    const { data, error } = await this.rpc('cancelar_venta', {
      p_venta_id: ventaId,
      p_motivo: motivo.trim(),
      p_solicitado_por: solicitadoPor,
    });
    if (error) {
      throw new BadRequestException(this.mensajeRpc(error));
    }
    const venta = data as Venta & {
      motivo_cancelacion: string;
      cancelled_at: string;
    };
    return {
      id: venta.id,
      folio: venta.folio,
      total: Number(venta.total),
      estado: venta.estado,
      motivo: venta.motivo_cancelacion,
      cancelada_en: venta.cancelled_at,
      autorizo,
    };
  }

  // Reimprime un ticket ya cobrado. Exige la clave de un administrador,
  // deja el hecho registrado y devuelve los datos para un papel marcado
  // como reimpresión. No vuelve a cobrar ni mueve inventario.
  async reimprimir(solicitante: UsuarioAutenticado, dto: ReimprimirTicketDto) {
    const autorizador = await this.auth.verificarAdministrador(
      dto.email,
      dto.password,
    );
    const folio = normalizarFolio(dto.folio);

    const { data, error: errorVenta } = await this.client
      .from('ventas')
      .select('id, folio, sucursal_id, estado')
      .eq('folio', folio)
      .maybeSingle();
    this.throwIfError(errorVenta);
    const venta = data as {
      id: string;
      folio: string;
      sucursal_id: string;
      estado: string;
    } | null;
    if (!venta) {
      throw new NotFoundException(
        'No hay una venta con ese folio en tu sucursal',
      );
    }
    if (venta.estado === 'cancelada') {
      throw new BadRequestException('Esa venta está cancelada');
    }

    const servicio = this.supabase.getServiceClient();
    const { count, error: errorConteo } = await servicio
      .from('reimpresiones_ticket')
      .select('id', { count: 'exact', head: true })
      .eq('venta_id', venta.id);
    this.throwIfError(errorConteo);
    const numero = (count ?? 0) + 1;

    const { error: errorAlta } = await servicio
      .from('reimpresiones_ticket')
      .insert({
        venta_id: venta.id,
        folio: venta.folio,
        sucursal_id: venta.sucursal_id,
        solicitado_por: solicitante.userId,
        autorizado_por: autorizador.id,
        motivo: dto.motivo.trim(),
        numero,
      });
    this.throwIfError(errorAlta);

    return {
      numero,
      autorizo: autorizador.nombre_completo,
      motivo: dto.motivo.trim(),
      venta: await this.datosTicket(venta.id),
    };
  }

  // Lo que lleva el papel de una venta ya cobrada: encabezado de la
  // sucursal (con su garantía), cajero, forma de pago y renglones. Lo usan
  // la reimpresión con clave y la autorizada a distancia.
  async datosTicket(ventaId: string) {
    const { data, error: errorVenta } = await this.client
      .from('ventas')
      .select(
        'id, folio, sucursal_id, total, estado, created_at, metodo_pago, desglose_pago, usuario_id',
      )
      .eq('id', ventaId)
      .maybeSingle();
    this.throwIfError(errorVenta);
    const venta = data as FilaVentaTicket | null;
    if (!venta) {
      throw new NotFoundException('Venta no encontrada');
    }

    const [itemsRes, sucursalRes, cajeroRes] = await Promise.all([
      this.client
        .from('venta_items')
        .select(
          'cantidad, precio_unitario, tipo_precio, con_casco, comision_casco, productos(modelo, marcas(nombre))',
        )
        .eq('venta_id', venta.id),
      this.client
        .from('sucursales')
        .select('nombre, direccion, leyenda_ticket')
        .eq('id', venta.sucursal_id)
        .maybeSingle(),
      this.client
        .from('usuarios')
        .select('nombre_completo')
        .eq('id', venta.usuario_id)
        .maybeSingle(),
    ]);
    this.throwIfError(itemsRes.error);
    this.throwIfError(sucursalRes.error);
    this.throwIfError(cajeroRes.error);
    const sucursal = sucursalRes.data as {
      nombre: string | null;
      direccion: string | null;
      leyenda_ticket: string | null;
    } | null;
    const cajero = cajeroRes.data as { nombre_completo: string | null } | null;

    const lineas = (
      (itemsRes.data ?? []) as unknown as FilaItemReimpresion[]
    ).map((item) => {
      const { marca, modelo } = marcaYModelo(item.productos);
      const cantidad = Number(item.cantidad);
      // comision_casco se guarda por renglón; el ticket la quiere por pieza.
      const comisionLinea = Number(item.comision_casco ?? 0);
      return {
        marca,
        modelo,
        cantidad,
        precio_unitario: Number(item.precio_unitario),
        tipo_precio: item.tipo_precio ?? 'default',
        con_casco: item.con_casco ?? null,
        comision_casco: cantidad > 0 ? comisionLinea / cantidad : 0,
      };
    });

    return {
      folio: venta.folio,
      total: Number(venta.total),
      estado: venta.estado,
      created_at: venta.created_at,
      metodo_pago: venta.metodo_pago ?? 'efectivo',
      desglose_pago: venta.desglose_pago ?? null,
      sucursal: sucursal?.nombre ?? null,
      direccion: sucursal?.direccion ?? null,
      leyenda_ticket: sucursal?.leyenda_ticket ?? null,
      empleado: cajero?.nombre_completo ?? null,
      items: lineas,
    };
  }
}

interface FilaVentaTicket {
  id: string;
  folio: string;
  sucursal_id: string;
  total: number;
  estado: string;
  created_at: string;
  metodo_pago: string | null;
  desglose_pago: Venta['desglose_pago'] | null;
  usuario_id: string;
}

interface FilaVentaDelDia {
  id: string;
  folio: string;
  total: number;
  estado: string;
  created_at: string;
  metodo_pago: string | null;
  sucursales: Relacion<{ nombre: string | null }>;
  cajero: Relacion<{ nombre_completo: string | null }>;
  venta_items: Array<{
    cantidad: number;
    productos: Relacion<ProductoConMarca>;
  }> | null;
}

interface FilaItemReimpresion {
  cantidad: number;
  precio_unitario: number;
  tipo_precio?: string | null;
  con_casco?: boolean | null;
  comision_casco?: number | null;
  productos: {
    modelo: string;
    marcas: { nombre: string } | { nombre: string }[] | null;
  } | null;
}
