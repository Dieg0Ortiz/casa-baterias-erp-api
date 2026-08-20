import { BadRequestException, Injectable } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';
import { CrearProveedorDto, RegistrarCompraDto } from './purchases.dto';

@Injectable()
export class PurchasesService {
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

  // ------------------------------------------------------------------
  // Proveedores
  // ------------------------------------------------------------------

  async listarProveedores() {
    const { data, error } = await this.client
      .from('proveedores')
      .select('id, nombre, contacto, telefono, email')
      .eq('activo', true)
      .order('nombre');
    this.throwIfError(error);
    return data;
  }

  async crearProveedor(dto: CrearProveedorDto) {
    const { data, error } = await this.client
      .from('proveedores')
      .insert(dto)
      .select('id, nombre, contacto, telefono, email')
      .single();
    this.throwIfError(error);
    return data;
  }

  // ------------------------------------------------------------------
  // Compras
  // ------------------------------------------------------------------

  async listarCompras() {
    const { data, error } = await this.client
      .from('compras')
      .select(
        'id, folio, fecha:created_at, total, estado, proveedores(nombre), sucursales(nombre), usuarios!usuario_id(nombre_completo)'
      )
      .order('created_at', { ascending: false });
    this.throwIfError(error);
    return data;
  }

  async obtenerCompra(id: string) {
    const { data, error } = await this.client
      .from('compras')
      .select(
        '*, proveedores(nombre), sucursales(nombre), usuarios!usuario_id(nombre_completo), compra_items(id, tipo_item, cantidad, precio_unitario, productos(modelo, descripcion))'
      )
      .eq('id', id)
      .single();
    this.throwIfError(error);
    return data;
  }

  async registrarCompra(dto: RegistrarCompraDto) {
    const { data, error } = await this.rpc('registrar_compra', {
      p_sucursal_id: dto.sucursal_id,
      p_proveedor_id: dto.proveedor_id ?? null,
      p_items: dto.items,
    });
    if (error) {
      throw new BadRequestException(this.mensajeRpc(error));
    }
    return data;
  }
}
