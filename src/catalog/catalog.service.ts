import { BadRequestException, Injectable } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';
import {
  ActualizarMarcaDto,
  ActualizarProductoDto,
  CrearMarcaDto,
  CrearProductoDto,
} from './catalog.dto';

@Injectable()
export class CatalogService {
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

  // ------------------------------------------------------------------
  // Sucursales
  // ------------------------------------------------------------------

  async listarSucursales() {
    const { data, error } = await this.client
      .from('sucursales')
      .select('id, nombre, es_matriz')
      .order('nombre');
    this.throwIfError(error);
    return data;
  }

  // ------------------------------------------------------------------
  // Marcas
  // ------------------------------------------------------------------

  async listarMarcas() {
    const { data, error } = await this.client
      .from('marcas')
      .select('id, nombre, descripcion, ficha_tecnica_url')
      .order('nombre');
    this.throwIfError(error);
    return data;
  }

  async crearMarca(dto: CrearMarcaDto) {
    const { data, error } = await this.client
      .from('marcas')
      .insert({
        nombre: dto.nombre,
        descripcion: dto.descripcion ?? null,
        ficha_tecnica_url: dto.ficha_tecnica_url ?? null,
      })
      .select('id, nombre, descripcion, ficha_tecnica_url')
      .single();
    this.throwIfError(error);
    return data;
  }

  async actualizarMarca(id: string, dto: ActualizarMarcaDto) {
    const cambios: Record<string, unknown> = {};
    if (dto.nombre !== undefined) cambios.nombre = dto.nombre;
    if (dto.descripcion !== undefined) cambios.descripcion = dto.descripcion;
    if (dto.ficha_tecnica_url !== undefined) {
      cambios.ficha_tecnica_url = dto.ficha_tecnica_url;
    }

    const { data, error } = await this.client
      .from('marcas')
      .update(cambios)
      .eq('id', id)
      .select('id, nombre, descripcion, ficha_tecnica_url')
      .single();
    this.throwIfError(error);
    return data;
  }

  async eliminarMarca(id: string) {
    const { error } = await this.client.from('marcas').delete().eq('id', id);
    this.throwIfError(error);
    return { eliminado: true };
  }

  // ------------------------------------------------------------------
  // Productos
  // ------------------------------------------------------------------

  async listarProductos() {
    // La lectura de inventario aplica RLS: el trabajador solo ve la
    // existencia de su sucursal; el administrador ve todas.
    const { data, error } = await this.client
      .from('productos')
      .select(
        'id, modelo, descripcion, precio, requiere_casco, codigo_barras, codigo_barras_origen, activo, marcas(nombre), inventario(cantidad, cascos_disponibles, sucursal_id)',
      )
      .order('modelo');
    this.throwIfError(error);
    return data;
  }

  async crearProducto(dto: CrearProductoDto) {
    const { data, error } = await this.rpc('crear_producto', {
      p_marca_id: dto.marca_id,
      p_modelo: dto.modelo,
      p_descripcion: dto.descripcion ?? null,
      p_precio: dto.precio,
      p_requiere_casco: dto.requiere_casco ?? false,
      p_codigo_barras_fabrica: dto.codigo_barras_fabrica ?? '',
      p_sucursal_id: dto.sucursal_id ?? null,
      p_cantidad_inicial: dto.cantidad_inicial ?? 0,
    });
    if (error) {
      throw new BadRequestException(this.mensajeRpc(error));
    }
    return data;
  }

  async actualizarProducto(id: string, dto: ActualizarProductoDto) {
    // Si viene cambio de precio, ejecutamos la RPC de precio
    if (dto.precio !== undefined) {
      await this.actualizarPrecio(id, dto.precio);
    }

    const cambios: Record<string, unknown> = {};
    if (dto.modelo !== undefined) cambios.modelo = dto.modelo;
    if (dto.descripcion !== undefined) cambios.descripcion = dto.descripcion;
    if (dto.marca_id !== undefined) cambios.marca_id = dto.marca_id;
    if (dto.requiere_casco !== undefined) cambios.requiere_casco = dto.requiere_casco;

    if (Object.keys(cambios).length > 0) {
      const { data, error } = await this.client
        .from('productos')
        .update(cambios)
        .eq('id', id)
        .select()
        .single();
      this.throwIfError(error);
      return data;
    }

    return { id, actualizado: true };
  }

  async actualizarPrecio(id: string, precio: number) {
    const { data, error } = await this.rpc('actualizar_precio', {
      p_producto_id: id,
      p_precio: precio,
    });
    if (error) {
      throw new BadRequestException(this.mensajeRpc(error));
    }
    return data;
  }

  async darDeBaja(id: string) {
    const { data, error } = await this.rpc('dar_de_baja_producto', {
      p_producto_id: id,
    });
    if (error) {
      throw new BadRequestException(this.mensajeRpc(error));
    }
    return data;
  }

  private mensajeRpc(error: PostgrestError): string {
    const detalle = (error.details ?? '').trim();
    return detalle.length > 0 ? detalle : error.message;
  }
}
