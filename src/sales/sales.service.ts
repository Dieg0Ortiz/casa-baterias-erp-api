import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { AuthService } from '../auth/auth.service';
import type { UsuarioAutenticado } from '../common/guards/jwt-auth.guard';
import { SupabaseService } from '../supabase/supabase.service';
import { RegistrarVentaDto, ReimprimirTicketDto } from './sales.dto';

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

  // Reimprime un ticket ya cobrado. Exige la clave de un administrador,
  // deja el hecho registrado y devuelve los datos para un papel marcado
  // como reimpresión. No vuelve a cobrar ni mueve inventario.
  async reimprimir(solicitante: UsuarioAutenticado, dto: ReimprimirTicketDto) {
    const autorizador = await this.auth.verificarAdministrador(
      dto.email,
      dto.password,
    );
    const folio = dto.folio.trim();

    const { data: venta, error: errorVenta } = await this.client
      .from('ventas')
      .select(
        'id, folio, sucursal_id, total, estado, created_at, metodo_pago, usuario_id',
      )
      .eq('folio', folio)
      .maybeSingle();
    this.throwIfError(errorVenta);
    if (!venta) {
      throw new NotFoundException(
        'No hay una venta con ese folio en tu sucursal',
      );
    }
    if (venta.estado === 'cancelada') {
      throw new BadRequestException('Esa venta está cancelada');
    }

    const { data: items, error: errorItems } = await this.client
      .from('venta_items')
      .select(
        'cantidad, precio_unitario, tipo_precio, con_casco, comision_casco, productos(modelo, marcas(nombre))',
      )
      .eq('venta_id', venta.id);
    this.throwIfError(errorItems);

    const [sucursalRes, cajeroRes] = await Promise.all([
      this.client
        .from('sucursales')
        .select('nombre, direccion')
        .eq('id', venta.sucursal_id)
        .maybeSingle(),
      this.client
        .from('usuarios')
        .select('nombre_completo')
        .eq('id', venta.usuario_id)
        .maybeSingle(),
    ]);
    this.throwIfError(sucursalRes.error);
    this.throwIfError(cajeroRes.error);

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

    const lineas = ((items ?? []) as unknown as FilaItemReimpresion[]).map(
      (item) => {
        const marcas = item.productos?.marcas;
        const marca =
          (Array.isArray(marcas) ? marcas[0]?.nombre : marcas?.nombre)?.trim() ||
          null;
        const cantidad = Number(item.cantidad);
        const comisionLinea = Number(item.comision_casco ?? 0);
        return {
          marca,
          modelo: item.productos?.modelo ?? null,
          cantidad,
          precio_unitario: Number(item.precio_unitario),
          tipo_precio: item.tipo_precio ?? 'default',
          con_casco: item.con_casco ?? null,
          comision_casco: cantidad > 0 ? comisionLinea / cantidad : 0,
        };
      },
    );

    return {
      numero,
      autorizo: autorizador.nombre_completo,
      motivo: dto.motivo.trim(),
      venta: {
        folio: venta.folio,
        total: Number(venta.total),
        estado: venta.estado,
        created_at: venta.created_at,
        metodo_pago: venta.metodo_pago ?? 'efectivo',
        sucursal: sucursalRes.data?.nombre ?? null,
        direccion: sucursalRes.data?.direccion ?? null,
        empleado: cajeroRes.data?.nombre_completo ?? null,
        items: lineas,
      },
    };
  }
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
