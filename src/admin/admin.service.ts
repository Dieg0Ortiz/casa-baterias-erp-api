import { BadRequestException, Injectable } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';
import {
  ActualizarSucursalDto,
  ActualizarUsuarioDto,
  CrearSucursalDto,
  CrearUsuarioDto,
  ResolverCascoDto,
  AltasReporteDto,
  VentasReporteDto,
} from './admin.dto';
import { porLotes, todasLasPaginas } from '../common/consultas';
import { rangoDiaMexico } from '../common/fechas';
import { totalesPorGrupo } from '../common/pagos';
import { primero, type Relacion } from '../common/relaciones';

interface FilaSucursal {
  id: string;
  nombre: string;
  es_matriz: boolean;
}

interface FilaVenta {
  id: string;
  folio: string;
  sucursal_id: string;
  usuario_id: string;
  total: number;
  estado: string;
  created_at: string;
  metodo_pago?: string;
  desglose_pago?: Array<{ metodo: string; monto: number; referencia?: string }> | null;
}

function partesProducto(producto: FilaItemVenta['productos']): {
  marca: string | null;
  modelo: string | null;
  producto: string | null;
} {
  if (!producto) return { marca: null, modelo: null, producto: null };
  const marcas = producto.marcas;
  const marca =
    (Array.isArray(marcas) ? marcas[0]?.nombre : marcas?.nombre)?.trim() ||
    null;
  const modelo = producto.modelo?.trim() || null;
  const nombre =
    marca && modelo ? `${marca} ${modelo}` : modelo || marca || null;
  return { marca, modelo, producto: nombre };
}

const COLUMNAS_SUCURSAL =
  'id, nombre, clave, es_matriz, direccion, leyenda_ticket, created_at';

// La leyenda se imprime renglón por renglón: se respetan los saltos de
// línea y solo se quitan espacios sobrantes. Vacía queda en null.
function limpiarLeyenda(texto: string | undefined): string | null {
  if (texto === undefined) return null;
  const limpia = texto
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((renglon) => renglon.trimEnd())
    .join('\n')
    .trim();
  return limpia || null;
}

interface FilaItemVenta {
  venta_id: string;
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

interface ResumenCaja {
  efectivo?: { ventas?: number; esperado?: number };
  electronico?: {
    total?: number;
    total_tarjetas?: number;
    total_transferencias?: number;
  };
}

interface FilaCorte {
  id: string;
  sucursal_id: string;
  usuario_id: string;
  monto_inicial: number;
  abierto_en: string;
}

interface FilaInventario {
  sucursal_id: string;
  cantidad: number;
  cascos_disponibles: number;
  productos: { id: string; precio: number; modelo: string } | null;
}

// Vista consolidada del panel de administración (Fase 8): ventas de hoy,
// inventario por sucursal y estado de caja abierta, todo en una llamada.
@Injectable()
export class AdminService {
  constructor(private readonly supabase: SupabaseService) {}

  private get client() {
    return this.supabase.getClient();
  }

  private throwIfError(error: PostgrestError | null) {
    if (error) {
      throw new BadRequestException(error.message);
    }
  }

  private rangoDiaMexico(fecha?: string): { inicio: string; fin: string } {
    return rangoDiaMexico(fecha);
  }

  async dashboard() {
    const hoy = this.rangoDiaMexico();

    const [resSucursales, inventario, resVentasHoy, resCajas, resUsuarios] =
      await Promise.all([
        this.client
          .from('sucursales')
          .select('id, nombre, es_matriz')
          .order('nombre'),
        todasLasPaginas<FilaInventario>((desde, hasta) =>
          this.client
            .from('inventario')
            .select(
              'sucursal_id, cantidad, cascos_disponibles, productos(id, precio, modelo)',
            )
            .order('id')
            .range(desde, hasta),
        ),
        this.client
          .from('ventas')
          .select(
            'id, folio, sucursal_id, usuario_id, total, estado, created_at, metodo_pago',
          )
          .eq('estado', 'activa')
          .gte('created_at', hoy.inicio)
          .lte('created_at', hoy.fin),
        this.client
          .from('cortes_caja')
          .select('id, sucursal_id, usuario_id, monto_inicial, abierto_en')
          .eq('estado', 'abierto'),
        this.client.from('usuarios').select('id, nombre_completo'),
      ]);

    this.throwIfError(resSucursales.error);
    this.throwIfError(resVentasHoy.error);
    this.throwIfError(resCajas.error);
    this.throwIfError(resUsuarios.error);

    const sucursales = (resSucursales.data ?? []) as FilaSucursal[];
    const cortes = (resCajas.data ?? []) as FilaCorte[];
    const ventasHoy = (resVentasHoy.data ?? []) as FilaVenta[];
    const nombreUsuario = new Map(
      (
        (resUsuarios.data ?? []) as Array<{
          id: string;
          nombre_completo: string;
        }>
      ).map((u) => [u.id, u.nombre_completo]),
    );

    // Resumen de cada caja abierta: el efectivo esperado en el cajón va
    // separado de lo cobrado con tarjeta y transferencia (037).
    const resumenPorCorte = new Map<string, ResumenCaja>();
    await Promise.all(
      cortes.map(async (c) => {
        const { data, error } = await this.client.rpc('resumen_corte', {
          p_corte_id: c.id,
        });
        this.throwIfError(error);
        resumenPorCorte.set(c.id, data as ResumenCaja);
      }),
    );
    const cajaDe = (corteId: string) => {
      const r = resumenPorCorte.get(corteId);
      const efectivoVentas = Number(r?.efectivo?.ventas ?? 0);
      const electronico = Number(r?.electronico?.total ?? 0);
      return {
        total_ventas: efectivoVentas + electronico,
        efectivo_esperado: Number(r?.efectivo?.esperado ?? 0),
        total_tarjetas: Number(r?.electronico?.total_tarjetas ?? 0),
        total_transferencias: Number(r?.electronico?.total_transferencias ?? 0),
      };
    };

    // Agregación de inventario por sucursal (unidades y valor a precio vigente).
    const invPorSucursal = new Map<
      string,
      { unidades: number; valor: number }
    >();
    for (const fila of inventario) {
      const actual = invPorSucursal.get(fila.sucursal_id) ?? {
        unidades: 0,
        valor: 0,
      };
      actual.unidades += fila.cantidad;
      actual.valor += fila.cantidad * (fila.productos?.precio ?? 0);
      invPorSucursal.set(fila.sucursal_id, actual);
    }

    // Ventas de hoy por sucursal.
    const ventasHoyPorSucursal = new Map<
      string,
      { n: number; monto: number }
    >();
    for (const v of ventasHoy) {
      const actual = ventasHoyPorSucursal.get(v.sucursal_id) ?? {
        n: 0,
        monto: 0,
      };
      actual.n += 1;
      actual.monto += Number(v.total);
      ventasHoyPorSucursal.set(v.sucursal_id, actual);
    }

    const porSucursal = sucursales.map((s) => {
      const ventas = ventasHoyPorSucursal.get(s.id) ?? { n: 0, monto: 0 };
      const inv = invPorSucursal.get(s.id) ?? { unidades: 0, valor: 0 };
      const corte = cortes.find((c) => c.sucursal_id === s.id) ?? null;
      const caja = corte ? cajaDe(corte.id) : null;
      return {
        sucursal_id: s.id,
        nombre: s.nombre,
        es_matriz: s.es_matriz,
        ventas_hoy: ventas.n,
        monto_ventas_hoy: ventas.monto,
        unidades_inventario: inv.unidades,
        valor_inventario: inv.valor,
        caja:
          corte && caja
            ? {
                corte_id: corte.id,
                usuario_id: corte.usuario_id,
                monto_inicial: Number(corte.monto_inicial),
                total_ventas: caja.total_ventas,
                // Efectivo que debe haber en el cajón.
                monto_esperado: caja.efectivo_esperado,
                total_tarjetas: caja.total_tarjetas,
                total_transferencias: caja.total_transferencias,
              }
            : null,
      };
    });

    const resumen = {
      ventas_hoy: ventasHoy.length,
      monto_ventas_hoy: ventasHoy.reduce((s, v) => s + Number(v.total), 0),
      unidades_inventario: [...invPorSucursal.values()].reduce(
        (s, i) => s + i.unidades,
        0,
      ),
      valor_inventario: [...invPorSucursal.values()].reduce(
        (s, i) => s + i.valor,
        0,
      ),
      cajas_abiertas: cortes.length,
      valor_esperado_cajas: cortes.reduce(
        (s, c) => s + cajaDe(c.id).efectivo_esperado,
        0,
      ),
    };

    // Últimas 8 ventas activas (todas las sucursales) para el feed del panel.
    const { data: ultimasRes, error: ultimasError } = await this.client
      .from('ventas')
      .select(
        'id, folio, sucursal_id, usuario_id, total, estado, created_at, metodo_pago',
      )
      .eq('estado', 'activa')
      .order('created_at', { ascending: false })
      .limit(8);
    this.throwIfError(ultimasError);
    const nombreSucursal = new Map(sucursales.map((s) => [s.id, s.nombre]));
    const ultimasVentas = ((ultimasRes ?? []) as FilaVenta[]).map((v) => ({
      id: v.id,
      folio: v.folio,
      total: Number(v.total),
      sucursal: nombreSucursal.get(v.sucursal_id) ?? null,
      usuario: nombreUsuario.get(v.usuario_id) ?? null,
      created_at: v.created_at,
      metodo_pago: v.metodo_pago ?? null,
    }));

    return {
      fecha: hoy.inicio.slice(0, 10),
      resumen,
      por_sucursal: porSucursal,
      ultimas_ventas: ultimasVentas,
    };
  }

  async listarSucursales() {
    const [resSucursales, resUsuarios] = await Promise.all([
      this.client.from('sucursales').select(COLUMNAS_SUCURSAL).order('nombre'),
      this.client.from('usuarios').select('sucursal_id').eq('activo', true),
    ]);
    this.throwIfError(resSucursales.error);

    const usuarios = resUsuarios.data ?? [];
    const countPorSucursal = new Map<string, number>();
    for (const u of usuarios) {
      if (u.sucursal_id) {
        countPorSucursal.set(
          u.sucursal_id,
          (countPorSucursal.get(u.sucursal_id) ?? 0) + 1,
        );
      }
    }

    const sucursales = (resSucursales.data ?? []) as Array<{
      id: string;
      nombre: string;
      clave: string;
      es_matriz: boolean;
      direccion: string | null;
      leyenda_ticket: string | null;
      created_at: string;
    }>;

    return sucursales.map((s) => ({
      ...s,
      empleados_count: countPorSucursal.get(s.id) ?? 0,
    }));
  }

  async crearSucursal(dto: CrearSucursalDto) {
    const esMatriz = dto.es_matriz ?? false;

    // Si la nueva sucursal es matriz, desmarcar cualquier otra matriz
    if (esMatriz) {
      await this.client
        .from('sucursales')
        .update({ es_matriz: false })
        .eq('es_matriz', true);
    }

    const { data: sucursal, error } = await this.client
      .from('sucursales')
      .insert({
        nombre: dto.nombre.trim(),
        es_matriz: esMatriz,
        direccion: dto.direccion?.trim() || null,
        leyenda_ticket: limpiarLeyenda(dto.leyenda_ticket),
        // Sin clave, la base propone una a partir del nombre.
        ...(dto.clave ? { clave: dto.clave.trim().toUpperCase() } : {}),
      })
      .select(COLUMNAS_SUCURSAL)
      .single();

    this.throwIfError(error);

    // Inventario en 0 para los productos activos. Va por RPC: inventario no
    // admite INSERT directo (RLS solo permite escribir vía security definer),
    // así que sembrarlo con el cliente del usuario siempre se rechaza.
    const { error: errorInventario } = (await this.client.rpc(
      'inicializar_inventario_sucursal',
      { p_sucursal_id: sucursal.id },
    )) as { data: unknown; error: PostgrestError | null };
    this.throwIfError(errorInventario);

    return {
      ...sucursal,
      empleados_count: 0,
    };
  }

  async actualizarSucursal(id: string, dto: ActualizarSucursalDto) {
    const cambios: Record<string, unknown> = {};
    if (dto.nombre !== undefined) {
      cambios.nombre = dto.nombre.trim();
    }
    if (dto.direccion !== undefined) {
      cambios.direccion = dto.direccion.trim() || null;
    }
    if (dto.leyenda_ticket !== undefined) {
      cambios.leyenda_ticket = limpiarLeyenda(dto.leyenda_ticket);
    }
    // La base rechaza el cambio si la sucursal ya emitió folios con su clave.
    if (dto.clave !== undefined) {
      cambios.clave = dto.clave.trim().toUpperCase();
    }
    if (dto.es_matriz !== undefined) {
      cambios.es_matriz = dto.es_matriz;
      if (dto.es_matriz) {
        // Desmarcar matriz en las demás sucursales
        await this.client
          .from('sucursales')
          .update({ es_matriz: false })
          .neq('id', id)
          .eq('es_matriz', true);
      }
    }

    if (Object.keys(cambios).length === 0) {
      return { id, actualizado: true };
    }

    const { data, error } = await this.client
      .from('sucursales')
      .update(cambios)
      .eq('id', id)
      .select(COLUMNAS_SUCURSAL)
      .single();

    this.throwIfError(error);
    return data;
  }

  // Empleados/Usuarios del sistema. RLS permite al admin listar a todos los usuarios.
  async listarUsuarios() {
    const [resUsuarios, resSucursales] = await Promise.all([
      this.client
        .from('usuarios')
        .select('id, nombre_completo, rol, sucursal_id, activo, created_at')
        .order('nombre_completo'),
      this.client.from('sucursales').select('id, nombre'),
    ]);
    this.throwIfError(resUsuarios.error);

    const nombreSucursal = new Map(
      ((resSucursales.data ?? []) as Array<{ id: string; nombre: string }>).map(
        (s) => [s.id, s.nombre],
      ),
    );

    // Intentar obtener los correos desde Supabase Auth Admin
    const emailPorId = new Map<string, string>();
    try {
      const authAdmin = this.supabase.getServiceClient().auth.admin;
      const { data: authUsers } = await authAdmin.listUsers({ perPage: 1000 });
      if (authUsers?.users) {
        for (const u of authUsers.users) {
          if (u.email) emailPorId.set(u.id, u.email);
        }
      }
    } catch {
      // Si falla la lectura de auth admin, continuar con los datos del perfil
    }

    return (
      (resUsuarios.data ?? []) as Array<{
        id: string;
        nombre_completo: string;
        rol: string;
        sucursal_id: string | null;
        activo: boolean;
        created_at?: string;
      }>
    ).map((u) => ({
      id: u.id,
      email: emailPorId.get(u.id) ?? null,
      nombre_completo: u.nombre_completo,
      rol: u.rol,
      sucursal_id: u.sucursal_id,
      sucursal: u.sucursal_id
        ? (nombreSucursal.get(u.sucursal_id) ?? null)
        : null,
      activo: u.activo,
      created_at: u.created_at ?? null,
    }));
  }

  async crearUsuario(dto: CrearUsuarioDto) {
    const nombreCompleto = `${dto.nombre.trim()} ${dto.apellido.trim()}`.trim();
    const rol = dto.rol ?? 'trabajador';

    let serviceClient;
    try {
      serviceClient = this.supabase.getServiceClient();
    } catch {
      throw new BadRequestException(
        'El servidor no tiene configurada la clave de administración (SUPABASE_SERVICE_ROLE_KEY).',
      );
    }

    // 1. Crear usuario en Supabase Auth
    const { data: authData, error: authError } =
      await serviceClient.auth.admin.createUser({
        email: dto.email.trim().toLowerCase(),
        password: dto.password,
        email_confirm: true,
        user_metadata: {
          nombre_completo: nombreCompleto,
          rol,
        },
      });

    if (authError || !authData.user) {
      const msg =
        authError?.message ?? 'Error al crear usuario en autenticación';
      throw new BadRequestException(
        msg.includes('already registered') || msg.includes('already exists')
          ? 'Ya existe un usuario registrado con este correo electrónico.'
          : msg,
      );
    }

    const userId = authData.user.id;

    // 2. Insertar / Actualizar fila en la tabla pública `usuarios`
    const { error: perfilError } = await serviceClient.from('usuarios').upsert({
      id: userId,
      nombre_completo: nombreCompleto,
      rol,
      sucursal_id: dto.sucursal_id || null,
      activo: true,
    });

    if (perfilError) {
      // Revertir usuario de auth si falló la creación del perfil
      await serviceClient.auth.admin.deleteUser(userId).catch(() => {});
      throw new BadRequestException(
        `Error al registrar perfil de usuario: ${perfilError.message}`,
      );
    }

    return {
      id: userId,
      email: dto.email.trim().toLowerCase(),
      nombre_completo: nombreCompleto,
      rol,
      sucursal_id: dto.sucursal_id || null,
      activo: true,
    };
  }

  async actualizarUsuario(id: string, dto: ActualizarUsuarioDto) {
    const serviceClient = this.supabase.getServiceClient();

    const updates: Record<string, any> = {};
    if (dto.nombre !== undefined || dto.apellido !== undefined) {
      const nombreCompleto =
        `${dto.nombre?.trim() ?? ''} ${dto.apellido?.trim() ?? ''}`.trim();
      if (nombreCompleto) updates.nombre_completo = nombreCompleto;
    }
    if (dto.rol !== undefined) updates.rol = dto.rol;
    if (dto.sucursal_id !== undefined) updates.sucursal_id = dto.sucursal_id;
    if (dto.activo !== undefined) updates.activo = dto.activo;

    if (Object.keys(updates).length > 0) {
      const { error } = await serviceClient
        .from('usuarios')
        .update(updates)
        .eq('id', id);
      this.throwIfError(error);
    }

    // Actualizar contraseña si se envió
    if (dto.password) {
      const { error: pwdError } = await serviceClient.auth.admin.updateUserById(
        id,
        {
          password: dto.password,
        },
      );
      if (pwdError) {
        throw new BadRequestException(
          `Error al actualizar contraseña: ${pwdError.message}`,
        );
      }
    }

    return { success: true };
  }

  // Reporte de ventas filtrable (Fase 8): por sucursal, rango de fechas,
  // empleado y/o producto. RLS permite al admin leer todo.
  async reporteVentas(dto: VentasReporteDto) {
    const sinVentas = {
      ventas: [],
      totales: {
        ventas: 0,
        monto: 0,
        unidades: 0,
        por_grupo: totalesPorGrupo([]),
      },
    };

    // Los filtros se arman de nuevo para cada página y cada lote.
    const consultaVentas = () => {
      let query = this.client
        .from('ventas')
        .select(
          'id, folio, sucursal_id, usuario_id, total, estado, created_at, metodo_pago, desglose_pago',
        )
        .eq('estado', 'activa');
      if (dto.sucursal_id) {
        query = query.eq('sucursal_id', dto.sucursal_id);
      }
      if (dto.usuario_id) {
        query = query.eq('usuario_id', dto.usuario_id);
      }
      if (dto.fecha_desde) {
        query = query.gte(
          'created_at',
          this.rangoDiaMexico(dto.fecha_desde).inicio,
        );
      }
      if (dto.fecha_hasta) {
        query = query.lte(
          'created_at',
          this.rangoDiaMexico(dto.fecha_hasta).fin,
        );
      }
      return query;
    };

    let ventas: FilaVenta[];
    if (dto.producto_id) {
      const productoId = dto.producto_id;
      const items = await todasLasPaginas<{ venta_id: string }>(
        (desde, hasta) =>
          this.client
            .from('venta_items')
            .select('venta_id')
            .eq('producto_id', productoId)
            .order('id')
            .range(desde, hasta),
      );
      const ids = [...new Set(items.map((i) => i.venta_id))];
      if (ids.length === 0) return sinVentas;
      ventas = await porLotes<FilaVenta>(ids, (lote, desde, hasta) =>
        consultaVentas().in('id', lote).order('id').range(desde, hasta),
      );
    } else {
      ventas = await todasLasPaginas<FilaVenta>((desde, hasta) =>
        consultaVentas()
          .order('created_at', { ascending: false })
          .order('id')
          .range(desde, hasta),
      );
    }
    if (ventas.length === 0) return sinVentas;
    ventas.sort((a, b) => b.created_at.localeCompare(a.created_at));

    const ventaIds = ventas.map((v) => v.id);
    const [items, resSucursales, resUsuarios] = await Promise.all([
      porLotes<FilaItemVenta>(ventaIds, (lote, desde, hasta) =>
        this.client
          .from('venta_items')
          .select(
            'id, venta_id, cantidad, precio_unitario, tipo_precio, con_casco, comision_casco, productos(modelo, marcas(nombre))',
          )
          .in('venta_id', lote)
          .order('id')
          .range(desde, hasta),
      ),
      this.client.from('sucursales').select('id, nombre'),
      this.client.from('usuarios').select('id, nombre_completo'),
    ]);
    this.throwIfError(resSucursales.error);
    this.throwIfError(resUsuarios.error);

    const nombreSucursal = new Map(
      ((resSucursales.data ?? []) as Array<{ id: string; nombre: string }>).map(
        (s) => [s.id, s.nombre],
      ),
    );
    const nombreUsuario = new Map(
      (
        (resUsuarios.data ?? []) as Array<{
          id: string;
          nombre_completo: string;
        }>
      ).map((u) => [u.id, u.nombre_completo]),
    );

    const itemsPorVenta = new Map<string, FilaItemVenta[]>();
    for (const item of items) {
      const lista = itemsPorVenta.get(item.venta_id) ?? [];
      lista.push(item);
      itemsPorVenta.set(item.venta_id, lista);
    }

    let monto = 0;
    let unidades = 0;
    const detalle = ventas.map((v) => {
      const items = itemsPorVenta.get(v.id) ?? [];
      monto += Number(v.total);
      unidades += items.reduce((s, i) => s + i.cantidad, 0);
      return {
        id: v.id,
        folio: v.folio,
        total: Number(v.total),
        estado: v.estado,
        sucursal: nombreSucursal.get(v.sucursal_id) ?? null,
        usuario: nombreUsuario.get(v.usuario_id) ?? null,
        created_at: v.created_at,
        metodo_pago: v.metodo_pago ?? null,
        desglose_pago: v.desglose_pago ?? null,
        items: items.map((i) => ({
          ...partesProducto(i.productos),
          cantidad: i.cantidad,
          precio_unitario: Number(i.precio_unitario),
          tipo_precio: i.tipo_precio ?? 'default',
          con_casco: i.con_casco ?? null,
          comision_casco: Number(i.comision_casco ?? 0),
        })),
      };
    });

    // por_grupo separa lo cobrado (efectivo, tarjeta, transferencia; el pago
    // mixto repartido) de lo vendido a crédito, que no entra a ninguna caja.
    return {
      ventas: detalle,
      totales: {
        ventas: ventas.length,
        monto,
        unidades,
        por_grupo: totalesPorGrupo(ventas),
      },
    };
  }

  // ------------------------------------------------------------------
  // Cascos Pendientes (sistema de comisión por depósito de baterías)
  // ------------------------------------------------------------------

  async listarCascosPendientes() {
    const cascos = await todasLasPaginas<{
      id: string;
      venta_id: string;
      venta_item_id: string;
      producto_id: string;
      sucursal_id: string;
      comision_cobrada: number;
      fecha_limite: string;
      estado: string;
      monto_devuelto: number;
      casco_producto_id: string | null;
      nombre_cliente: string | null;
      telefono_cliente: string | null;
      notas: string | null;
      resuelto_por: string | null;
      resuelto_en: string | null;
      created_at: string;
    }>((desde, hasta) =>
      this.client
        .from('cascos_pendientes')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id')
        .range(desde, hasta),
    );

    if (cascos.length === 0) return [];

    // Obtener datos relacionados
    const ventaIds = [...new Set(cascos.map((c) => c.venta_id))];
    const productoIds = [
      ...new Set([
        ...cascos.map((c) => c.producto_id),
        ...cascos
          .map((c) => c.casco_producto_id)
          .filter((id): id is string => Boolean(id)),
      ]),
    ];
    const sucursalIds = [...new Set(cascos.map((c) => c.sucursal_id))];

    const [ventasCasco, productosCasco, resSucursales, resUsuarios] =
      await Promise.all([
        porLotes<{ id: string; folio: string }>(
          ventaIds,
          (lote, desde, hasta) =>
            this.client
              .from('ventas')
              .select('id, folio')
              .in('id', lote)
              .order('id')
              .range(desde, hasta),
        ),
        porLotes<{ id: string; modelo: string; comision_casco: number | null }>(
          productoIds,
          (lote, desde, hasta) =>
            this.client
              .from('productos')
              .select('id, modelo, comision_casco')
              .in('id', lote)
              .order('id')
              .range(desde, hasta),
        ),
        this.client
          .from('sucursales')
          .select('id, nombre')
          .in('id', sucursalIds),
        this.client.from('usuarios').select('id, nombre_completo'),
      ]);

    const folioVenta = new Map(ventasCasco.map((v) => [v.id, v.folio]));
    const nombreProducto = new Map(productosCasco.map((p) => [p.id, p.modelo]));
    const nombreSucursal = new Map(
      ((resSucursales.data ?? []) as Array<{ id: string; nombre: string }>).map(
        (s) => [s.id, s.nombre],
      ),
    );
    const nombreUsuario = new Map(
      (
        (resUsuarios.data ?? []) as Array<{
          id: string;
          nombre_completo: string;
        }>
      ).map((u) => [u.id, u.nombre_completo]),
    );

    return cascos.map((c) => ({
      id: c.id,
      folio: folioVenta.get(c.venta_id) ?? null,
      producto: nombreProducto.get(c.producto_id) ?? null,
      casco_producto_id: c.casco_producto_id ?? null,
      casco_recibido: c.casco_producto_id
        ? (nombreProducto.get(c.casco_producto_id) ?? null)
        : null,
      sucursal: nombreSucursal.get(c.sucursal_id) ?? null,
      comision_cobrada: Number(c.comision_cobrada),
      fecha_limite: c.fecha_limite,
      estado: c.estado,
      monto_devuelto: Number(c.monto_devuelto),
      nombre_cliente: c.nombre_cliente,
      telefono_cliente: c.telefono_cliente,
      notas: c.notas,
      resuelto_por: c.resuelto_por
        ? (nombreUsuario.get(c.resuelto_por) ?? null)
        : null,
      resuelto_en: c.resuelto_en,
      created_at: c.created_at,
    }));
  }

  async resolverCasco(cascoId: string, dto: ResolverCascoDto) {
    const { data, error } = (await this.client.rpc('resolver_casco_pendiente', {
      p_casco_id: cascoId,
      p_monto_devuelto: dto.monto_devuelto,
      p_casco_producto_id: dto.casco_producto_id ?? null,
      p_notas: dto.notas ?? null,
    })) as { data: unknown; error: PostgrestError | null };
    if (error) {
      const detalle = (error.details ?? '').trim();
      throw new BadRequestException(
        detalle.length > 0 ? detalle : error.message,
      );
    }
    return data;
  }

  async reporteAltas(dto: AltasReporteDto) {
    const armar = () => {
      let query = this.client
        .from('altas_inventario')
        .select(
          'folio, origen, modo, cantidad, existencia_anterior, existencia_nueva, nota, referencia, created_at, sucursales(nombre), usuarios(nombre_completo), productos(modelo, codigo_barras, marcas(nombre))',
        )
        .order('created_at', { ascending: false });

      if (dto.sucursal_id) query = query.eq('sucursal_id', dto.sucursal_id);
      if (dto.producto_id) query = query.eq('producto_id', dto.producto_id);
      if (dto.origen) query = query.eq('origen', dto.origen);
      if (dto.fecha_desde) {
        query = query.gte(
          'created_at',
          this.rangoDiaMexico(dto.fecha_desde).inicio,
        );
      }
      if (dto.fecha_hasta) {
        query = query.lte(
          'created_at',
          this.rangoDiaMexico(dto.fecha_hasta).fin,
        );
      }
      return query;
    };
    const data = await todasLasPaginas<FilaAltaInventario>((desde, hasta) =>
      armar().order('id').range(desde, hasta),
    );

    const filas = data;
    const folios = new Set<string>();
    let unidades = 0;
    const lineas = filas.map((fila) => {
      folios.add(fila.folio);
      unidades += fila.cantidad;
      const marcas = fila.productos?.marcas;
      const marca =
        (Array.isArray(marcas) ? marcas[0]?.nombre : marcas?.nombre)?.trim() ||
        null;
      const sucursal = fila.sucursales;
      const usuario = fila.usuarios;
      return {
        folio: fila.folio,
        origen: fila.origen,
        modo: fila.modo,
        cantidad: fila.cantidad,
        existencia_anterior: fila.existencia_anterior,
        existencia_nueva: fila.existencia_nueva,
        nota: fila.nota,
        referencia: fila.referencia,
        created_at: fila.created_at,
        sucursal:
          (Array.isArray(sucursal) ? sucursal[0]?.nombre : sucursal?.nombre) ??
          null,
        usuario:
          (Array.isArray(usuario)
            ? usuario[0]?.nombre_completo
            : usuario?.nombre_completo) ?? null,
        marca,
        modelo: fila.productos?.modelo ?? null,
        codigo_barras: fila.productos?.codigo_barras ?? null,
      };
    });

    return {
      lineas,
      totales: {
        operaciones: folios.size,
        lineas: lineas.length,
        unidades,
      },
    };
  }

  async reporteReimpresiones(dto: VentasReporteDto) {
    const armar = () => {
      let query = this.client
        .from('reimpresiones_ticket')
        .select(
          'id, folio, numero, motivo, created_at, sucursales(nombre), solicitante:usuarios!reimpresiones_ticket_solicitado_por_fkey(nombre_completo), autorizador:usuarios!reimpresiones_ticket_autorizado_por_fkey(nombre_completo), ventas(total, created_at)',
        )
        .order('created_at', { ascending: false });

      if (dto.fecha_desde) {
        query = query.gte(
          'created_at',
          this.rangoDiaMexico(dto.fecha_desde).inicio,
        );
      }
      if (dto.fecha_hasta) {
        query = query.lte(
          'created_at',
          this.rangoDiaMexico(dto.fecha_hasta).fin,
        );
      }
      if (dto.sucursal_id) query = query.eq('sucursal_id', dto.sucursal_id);
      return query;
    };
    const data = await todasLasPaginas<FilaReimpresion>((desde, hasta) =>
      armar().order('id').range(desde, hasta),
    );

    const filas = data;
    const reimpresiones = filas.map((fila) => {
      const sucursal = fila.sucursales;
      const solicito = fila.solicitante;
      const autorizo = fila.autorizador;
      const venta = fila.ventas;
      const ventaObj = Array.isArray(venta) ? venta[0] : venta;
      return {
        id: fila.id,
        folio: fila.folio,
        numero: fila.numero,
        motivo: fila.motivo,
        created_at: fila.created_at,
        sucursal:
          (Array.isArray(sucursal) ? sucursal[0]?.nombre : sucursal?.nombre) ??
          null,
        solicito:
          (Array.isArray(solicito)
            ? solicito[0]?.nombre_completo
            : solicito?.nombre_completo) ?? null,
        autorizo:
          (Array.isArray(autorizo)
            ? autorizo[0]?.nombre_completo
            : autorizo?.nombre_completo) ?? null,
        total: Number(ventaObj?.total ?? 0),
        vendida_en: ventaObj?.created_at ?? null,
      };
    });

    return {
      reimpresiones,
      totales: { reimpresiones: reimpresiones.length },
    };
  }

  // Tickets cancelados: quién la pidió, qué administrador la autorizó y por qué.
  async reporteCancelaciones(dto: VentasReporteDto) {
    const armar = () => {
      let query = this.client
        .from('ventas')
        .select(
          'id, folio, total, metodo_pago, created_at, cancelled_at, motivo_cancelacion, sucursales(nombre), solicitante:usuarios!ventas_cancelacion_solicitada_por_fkey(nombre_completo), autorizador:usuarios!ventas_cancelled_by_fkey(nombre_completo)',
        )
        .eq('estado', 'cancelada')
        .order('cancelled_at', { ascending: false });

      if (dto.fecha_desde) {
        query = query.gte(
          'cancelled_at',
          this.rangoDiaMexico(dto.fecha_desde).inicio,
        );
      }
      if (dto.fecha_hasta) {
        query = query.lte(
          'cancelled_at',
          this.rangoDiaMexico(dto.fecha_hasta).fin,
        );
      }
      if (dto.sucursal_id) query = query.eq('sucursal_id', dto.sucursal_id);
      return query;
    };
    const data = await todasLasPaginas<FilaCancelacion>((desde, hasta) =>
      armar().order('id').range(desde, hasta),
    );

    const cancelaciones = data.map((v) => ({
      id: v.id,
      folio: v.folio,
      total: Number(v.total),
      metodo_pago: v.metodo_pago ?? 'efectivo',
      vendida_en: v.created_at,
      cancelada_en: v.cancelled_at,
      motivo: v.motivo_cancelacion,
      sucursal: primero(v.sucursales)?.nombre ?? null,
      solicito: primero(v.solicitante)?.nombre_completo ?? null,
      autorizo: primero(v.autorizador)?.nombre_completo ?? null,
    }));

    return {
      cancelaciones,
      totales: {
        cancelaciones: cancelaciones.length,
        monto: cancelaciones.reduce((s, c) => s + c.total, 0),
      },
    };
  }
}

interface FilaCancelacion {
  id: string;
  folio: string;
  total: number;
  metodo_pago: string | null;
  created_at: string;
  cancelled_at: string | null;
  motivo_cancelacion: string | null;
  sucursales: Relacion<{ nombre: string }>;
  solicitante: Relacion<{ nombre_completo: string }>;
  autorizador: Relacion<{ nombre_completo: string }>;
}

interface FilaReimpresion {
  id: string;
  folio: string;
  numero: number;
  motivo: string;
  created_at: string;
  sucursales: { nombre: string } | { nombre: string }[] | null;
  solicitante:
    | { nombre_completo: string }
    | { nombre_completo: string }[]
    | null;
  autorizador:
    | { nombre_completo: string }
    | { nombre_completo: string }[]
    | null;
  ventas:
    | { total: number; created_at: string }
    | { total: number; created_at: string }[]
    | null;
}

interface FilaAltaInventario {
  folio: string;
  origen: string;
  modo: string;
  cantidad: number;
  existencia_anterior: number | null;
  existencia_nueva: number | null;
  nota: string | null;
  referencia: string | null;
  created_at: string;
  sucursales: { nombre: string } | { nombre: string }[] | null;
  usuarios: { nombre_completo: string } | { nombre_completo: string }[] | null;
  productos: {
    modelo: string;
    codigo_barras: string;
    marcas: { nombre: string } | { nombre: string }[] | null;
  } | null;
}
