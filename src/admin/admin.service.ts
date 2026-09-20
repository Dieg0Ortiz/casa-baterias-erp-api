import { BadRequestException, Injectable } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';
import {
  ActualizarSucursalDto,
  ActualizarUsuarioDto,
  CrearSucursalDto,
  CrearUsuarioDto,
  ResolverCascoDto,
  VentasReporteDto,
} from './admin.dto';

const TZ_MEXICO = 'America/Mexico_City';

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

interface FilaItemVenta {
  venta_id: string;
  cantidad: number;
  precio_unitario: number;
  tipo_precio?: string | null;
  con_casco?: boolean | null;
  comision_casco?: number | null;
  productos: { modelo: string } | null;
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

  // Rango de un día en México (UTC-6 fijo; México no usa horario de verano
  // desde 2022). Si `fecha` viene, se usa esa fecha (YYYY-MM-DD); si no,
  // el día de hoy en hora local de México.
  // 00:00:00 hora local CDMX = 06:00:00 UTC
  // 23:59:59.999 hora local CDMX = 05:59:59.999 UTC del día siguiente
  private rangoDiaMexico(fecha?: string): { inicio: string; fin: string } {
    let ymd: string;
    if (fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      ymd = fecha;
    } else {
      const base = fecha ? new Date(fecha) : new Date();
      const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ_MEXICO,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(base);
      const y = partes.find((p) => p.type === 'year')?.value;
      const m = partes.find((p) => p.type === 'month')?.value;
      const d = partes.find((p) => p.type === 'day')?.value;
      ymd = `${y}-${m}-${d}`;
    }
    const inicio = new Date(`${ymd}T06:00:00.000Z`);
    const fin = new Date(inicio.getTime() + 86_400_000 - 1);
    return { inicio: inicio.toISOString(), fin: fin.toISOString() };
  }

  async dashboard() {
    const hoy = this.rangoDiaMexico();

    const [resSucursales, resInventario, resVentasHoy, resCajas, resUsuarios] =
      await Promise.all([
        this.client
          .from('sucursales')
          .select('id, nombre, es_matriz')
          .order('nombre'),
        this.client
          .from('inventario')
          .select(
            'sucursal_id, cantidad, cascos_disponibles, productos(id, precio, modelo)',
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
    this.throwIfError(resInventario.error);
    this.throwIfError(resVentasHoy.error);
    this.throwIfError(resCajas.error);
    this.throwIfError(resUsuarios.error);

    const sucursales = (resSucursales.data ?? []) as FilaSucursal[];
    const cortes = (resCajas.data ?? []) as FilaCorte[];
    const inventario = (resInventario.data ??
      []) as unknown as FilaInventario[];
    const ventasHoy = (resVentasHoy.data ?? []) as FilaVenta[];
    const nombreUsuario = new Map(
      (
        (resUsuarios.data ?? []) as Array<{
          id: string;
          nombre_completo: string;
        }>
      ).map((u) => [u.id, u.nombre_completo]),
    );

    // Ventas activas ligadas a los cortes abiertos, para el monto esperado.
    const corteIds = cortes.map((c) => c.id);
    const ventasPorCorte = new Map<string, number>();
    if (corteIds.length > 0) {
      const { data, error } = await this.client
        .from('ventas')
        .select('corte_caja_id, total')
        .eq('estado', 'activa')
        .in('corte_caja_id', corteIds);
      this.throwIfError(error);
      for (const v of (data ?? []) as Array<{
        corte_caja_id: string;
        total: number;
      }>) {
        ventasPorCorte.set(
          v.corte_caja_id,
          (ventasPorCorte.get(v.corte_caja_id) ?? 0) + Number(v.total),
        );
      }
    }

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
      const totalCorte = corte ? (ventasPorCorte.get(corte.id) ?? 0) : 0;
      return {
        sucursal_id: s.id,
        nombre: s.nombre,
        es_matriz: s.es_matriz,
        ventas_hoy: ventas.n,
        monto_ventas_hoy: ventas.monto,
        unidades_inventario: inv.unidades,
        valor_inventario: inv.valor,
        caja: corte
          ? {
              corte_id: corte.id,
              usuario_id: corte.usuario_id,
              monto_inicial: Number(corte.monto_inicial),
              total_ventas: totalCorte,
              monto_esperado: Number(corte.monto_inicial) + totalCorte,
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
        (s, c) => s + Number(c.monto_inicial) + (ventasPorCorte.get(c.id) ?? 0),
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
      this.client
        .from('sucursales')
        .select('id, nombre, es_matriz, direccion, created_at')
        .order('nombre'),
      this.client
        .from('usuarios')
        .select('sucursal_id')
        .eq('activo', true),
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
      es_matriz: boolean;
      direccion: string | null;
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
      })
      .select('id, nombre, es_matriz, direccion, created_at')
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
      .select('id, nombre, es_matriz, direccion, created_at')
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
      sucursal: u.sucursal_id ? nombreSucursal.get(u.sucursal_id) ?? null : null,
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
      const msg = authError?.message ?? 'Error al crear usuario en autenticación';
      throw new BadRequestException(
        msg.includes('already registered') || msg.includes('already exists')
          ? 'Ya existe un usuario registrado con este correo electrónico.'
          : msg,
      );
    }

    const userId = authData.user.id;

    // 2. Insertar / Actualizar fila en la tabla pública `usuarios`
    const { error: perfilError } = await serviceClient
      .from('usuarios')
      .upsert({
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
      const nombreCompleto = `${dto.nombre?.trim() ?? ''} ${dto.apellido?.trim() ?? ''}`.trim();
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
      const { error: pwdError } =
        await serviceClient.auth.admin.updateUserById(id, {
          password: dto.password,
        });
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
    let query = this.client
      .from('ventas')
      .select(
        'id, folio, sucursal_id, usuario_id, total, estado, created_at, metodo_pago, desglose_pago',
      )
      .eq('estado', 'activa')
      .order('created_at', { ascending: false });

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
      query = query.lte('created_at', this.rangoDiaMexico(dto.fecha_hasta).fin);
    }
    if (dto.producto_id) {
      const { data: items, error } = await this.client
        .from('venta_items')
        .select('venta_id')
        .eq('producto_id', dto.producto_id);
      this.throwIfError(error);
      const ids = [
        ...new Set(
          ((items ?? []) as Array<{ venta_id: string }>).map((i) => i.venta_id),
        ),
      ];
      if (ids.length === 0) {
        return { ventas: [], totales: { ventas: 0, monto: 0, unidades: 0 } };
      }
      query = query.in('id', ids);
    }

    const { data, error } = await query;
    this.throwIfError(error);
    const ventas = (data ?? []) as FilaVenta[];

    if (ventas.length === 0) {
      return { ventas: [], totales: { ventas: 0, monto: 0, unidades: 0 } };
    }

    const ventaIds = ventas.map((v) => v.id);
    const [resItems, resSucursales, resUsuarios] = await Promise.all([
      this.client
        .from('venta_items')
        .select(
          'venta_id, cantidad, precio_unitario, tipo_precio, con_casco, comision_casco, productos(modelo)',
        )
        .in('venta_id', ventaIds),
      this.client.from('sucursales').select('id, nombre'),
      this.client.from('usuarios').select('id, nombre_completo'),
    ]);
    this.throwIfError(resItems.error);
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
    for (const item of (resItems.data ?? []) as unknown as FilaItemVenta[]) {
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
          producto: i.productos?.modelo ?? null,
          cantidad: i.cantidad,
          precio_unitario: Number(i.precio_unitario),
          tipo_precio: i.tipo_precio ?? 'default',
          con_casco: i.con_casco ?? null,
          comision_casco: Number(i.comision_casco ?? 0),
        })),
      };
    });

    return {
      ventas: detalle,
      totales: { ventas: ventas.length, monto, unidades },
    };
  }

  // ------------------------------------------------------------------
  // Cascos Pendientes (sistema de comisión por depósito de baterías)
  // ------------------------------------------------------------------

  async listarCascosPendientes() {
    const { data, error } = await this.client
      .from('cascos_pendientes')
      .select('*')
      .order('created_at', { ascending: false });
    this.throwIfError(error);

    const cascos = (data ?? []) as Array<{
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
    }>;

    if (cascos.length === 0) return [];

    // Obtener datos relacionados
    const ventaIds = [...new Set(cascos.map((c) => c.venta_id))];
    const productoIds = [
      ...new Set([
        ...cascos.map((c) => c.producto_id),
        ...cascos.map((c) => c.casco_producto_id).filter((id): id is string => Boolean(id)),
      ]),
    ];
    const sucursalIds = [...new Set(cascos.map((c) => c.sucursal_id))];

    const [resVentas, resProductos, resSucursales, resUsuarios] =
      await Promise.all([
        this.client
          .from('ventas')
          .select('id, folio')
          .in('id', ventaIds),
        this.client
          .from('productos')
          .select('id, modelo, comision_casco')
          .in('id', productoIds),
        this.client
          .from('sucursales')
          .select('id, nombre')
          .in('id', sucursalIds),
        this.client.from('usuarios').select('id, nombre_completo'),
      ]);

    const folioVenta = new Map(
      ((resVentas.data ?? []) as Array<{ id: string; folio: string }>).map(
        (v) => [v.id, v.folio],
      ),
    );
    const nombreProducto = new Map(
      (
        (resProductos.data ?? []) as Array<{
          id: string;
          modelo: string;
          comision_casco: number | null;
        }>
      ).map((p) => [p.id, p.modelo]),
    );
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
        ? nombreProducto.get(c.casco_producto_id) ?? null
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
        ? nombreUsuario.get(c.resuelto_por) ?? null
        : null,
      resuelto_en: c.resuelto_en,
      created_at: c.created_at,
    }));
  }

  async resolverCasco(cascoId: string, dto: ResolverCascoDto) {
    const { data, error } = (await this.client.rpc(
      'resolver_casco_pendiente',
      {
        p_casco_id: cascoId,
        p_monto_devuelto: dto.monto_devuelto,
        p_casco_producto_id: dto.casco_producto_id ?? null,
        p_notas: dto.notas ?? null,
      },
    )) as { data: unknown; error: PostgrestError | null };
    if (error) {
      const detalle = (error.details ?? '').trim();
      throw new BadRequestException(
        detalle.length > 0 ? detalle : error.message,
      );
    }
    return data;
  }
}
