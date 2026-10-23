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
      // La app imprime la dirección y la leyenda (garantía) en el ticket.
      .select('id, nombre, es_matriz, direccion, leyenda_ticket')
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
        'id, modelo, descripcion, precio, precio_2, precio_3, precio_compra, comision_casco, requiere_casco, codigo_barras, codigo_barras_origen, activo, marcas(nombre), inventario(cantidad, cascos_disponibles, sucursal_id)',
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
      p_precio_2: dto.precio_2 ?? null,
      p_precio_3: dto.precio_3 ?? null,
      p_comision_casco: dto.comision_casco ?? null,
      p_precio_compra: dto.precio_compra ?? 0,
    });
    if (error) {
      throw new BadRequestException(this.mensajeRpc(error));
    }
    return data;
  }

  async actualizarProducto(id: string, dto: ActualizarProductoDto) {
    // Si viene cambio de precios, ejecutamos la actualización
    if (
      dto.precio !== undefined ||
      dto.precio_2 !== undefined ||
      dto.precio_3 !== undefined
    ) {
      // Obtenemos el producto actual si falta algún precio
      let precio1 = dto.precio;
      let precio2 = dto.precio_2;
      let precio3 = dto.precio_3;
      let comisionCasco = dto.comision_casco;
      let precioCompra = dto.precio_compra;

      if (precio1 === undefined) {
        const { data: prodActual } = await this.client
          .from('productos')
          .select('precio, precio_2, precio_3, comision_casco, precio_compra')
          .eq('id', id)
          .single();
        if (prodActual) {
          precio1 = prodActual.precio;
          if (precio2 === undefined) precio2 = prodActual.precio_2;
          if (precio3 === undefined) precio3 = prodActual.precio_3;
          if (comisionCasco === undefined) comisionCasco = prodActual.comision_casco;
          if (precioCompra === undefined) precioCompra = prodActual.precio_compra;
        }
      }

      if (precio1 !== undefined) {
        await this.actualizarPrecio(id, precio1, precio2, precio3, comisionCasco, precioCompra);
      }
    }

    const cambios: Record<string, unknown> = {};
    if (dto.modelo !== undefined) cambios.modelo = dto.modelo;
    if (dto.descripcion !== undefined) cambios.descripcion = dto.descripcion;
    if (dto.marca_id !== undefined) cambios.marca_id = dto.marca_id;
    if (dto.requiere_casco !== undefined)
      cambios.requiere_casco = dto.requiere_casco;
    if (dto.codigo_barras !== undefined && dto.codigo_barras.trim().length > 0)
      cambios.codigo_barras = dto.codigo_barras.trim();

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

  async actualizarPrecio(
    id: string,
    precio: number,
    precio2?: number,
    precio3?: number,
    comisionCasco?: number,
    precioCompra?: number,
  ) {
    const { data, error } = await this.rpc('actualizar_precio', {
      p_producto_id: id,
      p_precio: precio,
      p_precio_2: precio2 ?? null,
      p_precio_3: precio3 ?? null,
      p_comision_casco: comisionCasco ?? null,
      p_precio_compra: precioCompra ?? null,
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
