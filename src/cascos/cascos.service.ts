import { BadRequestException, Injectable } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';
import { AjustarCascoBodegaDto, BajarCascosGrupoDto, RegistrarIntercambioDto } from './cascos.dto';

@Injectable()
export class CascosService {
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

  async listarIntercambios() {
    const { data, error } = await this.client
      .from('intercambios_cascos')
      .select(`
        id,
        folio,
        sucursal_id,
        usuario_id,
        monto_cobrado,
        metodo_pago,
        cliente_nombre,
        cliente_telefono,
        notas,
        estado,
        created_at,
        sucursales (id, nombre),
        usuarios (id, nombre_completo),
        intercambio_casco_items (
          id,
          cantidad,
          precio_unitario,
          casco_saliente:productos!casco_saliente_id (id, modelo, descripcion, marcas (nombre)),
          casco_entrante:productos!casco_entrante_id (id, modelo, descripcion, marcas (nombre))
        )
      `)
      .order('created_at', { ascending: false });

    this.throwIfError(error);
    return data;
  }

  async obtenerIntercambio(id: string) {
    const { data, error } = await this.client
      .from('intercambios_cascos')
      .select(`
        id,
        folio,
        sucursal_id,
        usuario_id,
        monto_cobrado,
        metodo_pago,
        cliente_nombre,
        cliente_telefono,
        notas,
        estado,
        created_at,
        sucursales (id, nombre),
        usuarios (id, nombre_completo),
        intercambio_casco_items (
          id,
          cantidad,
          precio_unitario,
          casco_saliente:productos!casco_saliente_id (id, modelo, descripcion, marcas (nombre)),
          casco_entrante:productos!casco_entrante_id (id, modelo, descripcion, marcas (nombre))
        )
      `)
      .eq('id', id)
      .single();

    this.throwIfError(error);
    return data;
  }

  async ajustarBodega(dto: AjustarCascoBodegaDto) {
    const { data, error } = await this.rpc('ajustar_cascos_bodega', {
      p_producto_id: dto.producto_id,
      p_sucursal_id: dto.sucursal_id,
      p_cantidad: dto.cantidad,
      p_tipo: dto.tipo,
      p_nota: dto.nota ?? null,
    });

    if (error) {
      throw new BadRequestException(this.mensajeRpc(error));
    }

    return data;
  }

  async bajarGrupo(dto: BajarCascosGrupoDto) {
    const { data, error } = await this.rpc('bajar_cascos_grupo', {
      p_sucursal_id: dto.sucursal_id,
      p_items: dto.items,
      p_nota: dto.nota ?? null,
    });

    if (error) {
      throw new BadRequestException(this.mensajeRpc(error));
    }

    return { piezas: data };
  }

  async listarMovimientos() {
    const { data, error } = await this.client
      .from('movimientos_cascos')
      .select(`
        id,
        sucursal_id,
        producto_id,
        tipo,
        cantidad,
        nota,
        created_at,
        sucursales (nombre),
        productos (modelo, marcas (nombre)),
        usuarios (nombre_completo)
      `)
      .order('created_at', { ascending: false })
      .limit(80);

    this.throwIfError(error);
    return data;
  }

  async registrarIntercambio(dto: RegistrarIntercambioDto) {
    const { data, error } = await this.rpc('registrar_intercambio_cascos', {
      p_sucursal_id: dto.sucursal_id,
      p_metodo_pago: dto.metodo_pago ?? 'efectivo',
      p_monto_cobrado: dto.monto_cobrado ?? 150.00,
      p_cliente_nombre: dto.cliente_nombre ?? null,
      p_cliente_telefono: dto.cliente_telefono ?? null,
      p_notas: dto.notas ?? null,
      p_items: dto.items,
    });

    if (error) {
      throw new BadRequestException(this.mensajeRpc(error));
    }

    return data;
  }
}
