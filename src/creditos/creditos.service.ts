import { BadRequestException, Injectable } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { fechaMexico, rangoDiaMexico } from '../common/fechas';
import { redondear } from '../common/pagos';
import {
  marcaYModelo,
  primero,
  type ProductoConMarca,
  type Relacion,
} from '../common/relaciones';
import { todasLasPaginas } from '../common/consultas';
import { SupabaseService } from '../supabase/supabase.service';
import {
  CrearEmpresaCreditoDto,
  ActualizarEmpresaCreditoDto,
  EditarVentaCreditoDto,
  RegistrarAbonoCreditoDto,
  ReporteCreditosDiaDto,
} from './creditos.dto';

type Nombre = Relacion<{ nombre: string }>;
type NombreCompleto = Relacion<{ nombre_completo: string }>;

interface FilaCreditoDia {
  id: string;
  monto_total: number;
  saldo_pendiente: number;
  estado: string;
  folio_vale: string | null;
  recibido_por: string | null;
  vehiculo_placas: string | null;
  created_at: string;
  empresa: Nombre;
  sucursal: Nombre;
  venta: Relacion<{
    folio: string;
    usuario: NombreCompleto;
    venta_items: Array<{
      cantidad: number;
      precio_unitario: number;
      con_casco: boolean | null;
      producto: Relacion<ProductoConMarca>;
    }> | null;
  }>;
}

interface FilaEdicionCredito {
  id: string;
  credito_venta_id: string;
  motivo: string;
  antes: unknown;
  despues: unknown;
  total_anterior: number;
  total_nuevo: number;
  created_at: string;
  usuario: NombreCompleto;
}

interface FilaAbonoDia {
  id: string;
  monto: number;
  metodo_pago: string;
  referencia: string | null;
  created_at: string;
  empresa: Nombre;
  sucursal: Nombre;
  usuario: NombreCompleto;
}

interface FilaTraspasoDia {
  id: string;
  cantidad: number;
  nota: string | null;
  created_at: string;
  producto: Relacion<ProductoConMarca>;
  origen: Nombre;
  destino: Nombre;
  autorizo: NombreCompleto;
}

// Una venta a crédito sigue abierta mientras no esté pagada ni cancelada.
const ESTADOS_CERRADOS = ['pagado', 'cancelado'];

export interface RenglonCredito {
  cantidad: number;
  producto?: Relacion<{
    modelo: string | null;
    marcas?: Relacion<{ nombre: string | null }>;
  }>;
}

export interface PiezasDeModelo {
  marca: string | null;
  modelo: string | null;
  cantidad: number;
}

/**
 * Pilas que una empresa tiene a crédito, sumadas por marca y modelo, de la
 * que más piezas tiene a la que menos.
 */
export function piezasPorModelo(renglones: RenglonCredito[]): PiezasDeModelo[] {
  const porModelo = new Map<string, PiezasDeModelo>();
  for (const r of renglones) {
    const { marca, modelo } = marcaYModelo(r.producto);
    const clave = `${marca ?? ''}|${modelo ?? ''}`;
    const actual = porModelo.get(clave) ?? { marca, modelo, cantidad: 0 };
    actual.cantidad += Number(r.cantidad) || 0;
    porModelo.set(clave, actual);
  }
  return [...porModelo.values()].sort(
    (a, b) =>
      b.cantidad - a.cantidad ||
      `${a.marca} ${a.modelo}`.localeCompare(`${b.marca} ${b.modelo}`, 'es', {
        numeric: true,
      }),
  );
}

@Injectable()
export class CreditosService {
  constructor(private readonly supabase: SupabaseService) {}

  private get client() {
    return this.supabase.getClient();
  }

  // 1. Listar empresas con crédito y resumen de deuda acumulada
  async listarEmpresas(soloActivas: boolean = false) {
    let query = this.client
      .from('empresas_credito')
      .select(`
        *,
        creditos_ventas(
          id,
          monto_total,
          saldo_pendiente,
          estado,
          fecha_vencimiento,
          venta:ventas(
            id,
            folio,
            created_at,
            venta_items(
              id,
              cantidad,
              precio_unitario,
              con_casco,
              producto:productos(id, modelo, marcas(nombre))
            )
          )
        )
      `)
      .order('nombre', { ascending: true });

    if (soloActivas) {
      query = query.eq('activo', true);
    }

    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);

    const empresas = (data ?? []).map((emp: any) => {
      const ventas = emp.creditos_ventas || [];
      const ventasPendientes = ventas.filter(
        (v: any) => !ESTADOS_CERRADOS.includes(v.estado),
      );
      const saldoDeudor = ventasPendientes.reduce(
        (sum: number, v: any) => sum + Number(v.saldo_pendiente || 0),
        0,
      );
      const renglonesPendientes: RenglonCredito[] = ventasPendientes.flatMap(
        (v: any) => v.venta?.venta_items || [],
      );
      const bateriasPorModelo = piezasPorModelo(renglonesPendientes);
      const totalBateriasDebidas = bateriasPorModelo.reduce(
        (sum, m) => sum + m.cantidad,
        0,
      );

      const hoy = fechaMexico();
      const tieneVencidas = ventasPendientes.some(
        (v: any) => v.fecha_vencimiento && v.fecha_vencimiento < hoy,
      );

      return {
        id: emp.id,
        nombre: emp.nombre,
        rfc: emp.rfc,
        contacto_nombre: emp.contacto_nombre,
        telefono: emp.telefono,
        email: emp.email,
        direccion: emp.direccion,
        limite_credito: Number(emp.limite_credito || 0),
        dias_credito: emp.dias_credito,
        activo: emp.activo,
        saldo_deudor: Math.round(saldoDeudor * 100) / 100,
        total_baterias_debidas: totalBateriasDebidas,
        baterias_por_modelo: bateriasPorModelo,
        tiene_vencidas: tieneVencidas,
        ventas_pendientes_count: ventasPendientes.length,
        created_at: emp.created_at,
        updated_at: emp.updated_at,
      };
    });

    return empresas;
  }

  // 2. Crear empresa con crédito
  async crearEmpresa(dto: CrearEmpresaCreditoDto) {
    const { data, error } = await this.client
      .from('empresas_credito')
      .insert({
        nombre: dto.nombre,
        rfc: dto.rfc ?? null,
        contacto_nombre: dto.contacto_nombre ?? null,
        telefono: dto.telefono ?? null,
        email: dto.email ?? null,
        direccion: dto.direccion ?? null,
        limite_credito: dto.limite_credito ?? 0.0,
        dias_credito: dto.dias_credito ?? 30,
        activo: dto.activo ?? true,
      })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  // 3. Actualizar empresa con crédito
  async actualizarEmpresa(id: string, dto: ActualizarEmpresaCreditoDto) {
    const payload: any = { updated_at: new Date().toISOString() };
    if (dto.nombre !== undefined) payload.nombre = dto.nombre;
    if (dto.rfc !== undefined) payload.rfc = dto.rfc;
    if (dto.contacto_nombre !== undefined) payload.contacto_nombre = dto.contacto_nombre;
    if (dto.telefono !== undefined) payload.telefono = dto.telefono;
    if (dto.email !== undefined) payload.email = dto.email;
    if (dto.direccion !== undefined) payload.direccion = dto.direccion;
    if (dto.limite_credito !== undefined) payload.limite_credito = dto.limite_credito;
    if (dto.dias_credito !== undefined) payload.dias_credito = dto.dias_credito;
    if (dto.activo !== undefined) payload.activo = dto.activo;

    const { data, error } = await this.client
      .from('empresas_credito')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  // 4. Estado de Cuenta Detallado de una Empresa
  async obtenerEstadoCuenta(empresaId: string) {
    const { data: empresa, error: empErr } = await this.client
      .from('empresas_credito')
      .select('*')
      .eq('id', empresaId)
      .single();

    if (empErr || !empresa) throw new BadRequestException('Empresa no encontrada');

    // Ventas a crédito de la empresa
    const { data: ventasCredito, error: vErr } = await this.client
      .from('creditos_ventas')
      .select(`
        id,
        monto_total,
        saldo_pendiente,
        fecha_vencimiento,
        recibido_por,
        vehiculo_placas,
        folio_vale,
        estado,
        created_at,
        sucursal:sucursales(id, nombre),
        venta:ventas(
          id,
          folio,
          created_at,
          total,
          usuario:usuarios!usuario_id(id, nombre_completo),
          venta_items(
            id,
            cantidad,
            precio_unitario,
            con_casco,
            comision_casco,
            producto:productos(id, modelo, marcas(nombre), requiere_casco, comision_casco, precio)
          )
        )
      `)
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false });

    if (vErr) throw new BadRequestException(vErr.message);

    // Abonos realizados
    const { data: abonos, error: aErr } = await this.client
      .from('creditos_abonos')
      .select(`
        id,
        monto,
        metodo_pago,
        referencia,
        notas,
        created_at,
        usuario:usuarios!usuario_id(id, nombre_completo),
        sucursal:sucursales(id, nombre)
      `)
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false });

    if (aErr) throw new BadRequestException(aErr.message);

    const mappedVentas = (ventasCredito ?? []).map((v: any) => ({
      ...v,
      venta: v.venta
        ? {
            ...v.venta,
            usuario: v.venta.usuario
              ? {
                  id: v.venta.usuario.id,
                  nombre: v.venta.usuario.nombre_completo,
                }
              : null,
            venta_items: (v.venta.venta_items ?? []).map((vi: any) => ({
              ...vi,
              producto: vi.producto
                ? {
                    id: vi.producto.id,
                    modelo: vi.producto.modelo,
                    marca: vi.producto.marcas?.nombre || '',
                    requiere_casco: vi.producto.requiere_casco,
                    comision_casco: vi.producto.comision_casco,
                    precio: vi.producto.precio,
                  }
                : null,
            })),
          }
        : null,
    }));

    // Correcciones hechas a las ventas de la empresa, la más reciente primero.
    const creditoIds = mappedVentas.map((v: any) => v.id);
    const { data: ediciones, error: eErr } = creditoIds.length
      ? await this.client
          .from('ediciones_credito')
          .select(
            'id, credito_venta_id, motivo, antes, despues, total_anterior, total_nuevo, created_at, usuario:usuarios!usuario_id(nombre_completo)',
          )
          .in('credito_venta_id', creditoIds)
          .order('created_at', { ascending: false })
      : { data: [], error: null };
    if (eErr) throw new BadRequestException(eErr.message);

    const mappedAbonos = (abonos ?? []).map((a: any) => ({
      ...a,
      usuario: a.usuario
        ? {
            id: a.usuario.id,
            nombre: a.usuario.nombre_completo,
          }
        : null,
    }));

    // Sobre las filas crudas: piezasPorModelo lee la marca del embed `marcas`.
    const ventasAbiertas = (ventasCredito ?? []).filter(
      (v: any) => !ESTADOS_CERRADOS.includes(v.estado),
    );
    const saldoDeudor = ventasAbiertas.reduce(
      (sum: number, v: any) => sum + Number(v.saldo_pendiente || 0),
      0,
    );

    return {
      empresa,
      saldo_deudor: Math.round(saldoDeudor * 100) / 100,
      baterias_por_modelo: piezasPorModelo(
        ventasAbiertas.flatMap((v: any) => v.venta?.venta_items ?? []),
      ),
      ventas: mappedVentas,
      abonos: mappedAbonos,
      ediciones: ((ediciones ?? []) as unknown as FilaEdicionCredito[]).map(
        (e) => ({
          ...e,
          total_anterior: Number(e.total_anterior),
          total_nuevo: Number(e.total_nuevo),
          usuario: primero(e.usuario)?.nombre_completo ?? null,
        }),
      ),
    };
  }

  // 5. Reporte General de Todas las Cuentas por Cobrar (Ventas a Crédito)
  async listarVentasCredito(estado?: string, sucursalId?: string) {
    const armar = () => {
      let query = this.client
        .from('creditos_ventas')
        .select(`
          id,
          monto_total,
          saldo_pendiente,
          fecha_vencimiento,
          recibido_por,
          vehiculo_placas,
          folio_vale,
          estado,
          created_at,
          empresa:empresas_credito(id, nombre, rfc, telefono, dias_credito),
          sucursal:sucursales(id, nombre),
          venta:ventas(
            id,
            folio,
            created_at,
            total,
            usuario:usuarios!usuario_id(id, nombre_completo),
            venta_items(
              id,
              cantidad,
              precio_unitario,
              con_casco,
              comision_casco,
              producto:productos(id, modelo, marcas(nombre), requiere_casco, comision_casco, precio)
            )
          )
        `)
        .order('fecha_vencimiento', { ascending: true });

      if (estado) {
        query = query.eq('estado', estado);
      }
      if (sucursalId) {
        query = query.eq('sucursal_id', sucursalId);
      }
      return query;
    };
    const data = await todasLasPaginas<unknown>((desde, hasta) =>
      armar().order('id').range(desde, hasta),
    );

    const hoy = fechaMexico();
    const items = (data ?? []).map((item: any) => {
      const vencida =
        !ESTADOS_CERRADOS.includes(item.estado) && item.fecha_vencimiento < hoy;
      return {
        ...item,
        es_vencida: vencida,
        venta: item.venta
          ? {
              ...item.venta,
              usuario: item.venta.usuario
                ? {
                    id: item.venta.usuario.id,
                    nombre: item.venta.usuario.nombre_completo,
                  }
                : null,
              venta_items: (item.venta.venta_items ?? []).map((vi: any) => ({
                ...vi,
                producto: vi.producto
                  ? {
                      id: vi.producto.id,
                      modelo: vi.producto.modelo,
                      marca: vi.producto.marcas?.nombre || '',
                      requiere_casco: vi.producto.requiere_casco,
                      comision_casco: vi.producto.comision_casco,
                      precio: vi.producto.precio,
                    }
                  : null,
              })),
            }
          : null,
      };
    });

    return items;
  }

  // Corrige cantidades o modelos de una venta a crédito (migración 038).
  async editarVentaCredito(creditoVentaId: string, dto: EditarVentaCreditoDto) {
    const { data, error } = (await this.client.rpc('editar_venta_credito', {
      p_credito_venta_id: creditoVentaId,
      p_items: dto.items.map((i) => ({
        producto_id: i.producto_id,
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        con_casco: i.con_casco ?? null,
      })),
      p_motivo: dto.motivo.trim(),
    })) as { data: unknown; error: PostgrestError | null };
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  // Lo que pasó en un día para el PDF del panel: ventas a crédito, abonos y
  // traspasos de inventario entre sucursales.
  async reporteDelDia(dto: ReporteCreditosDiaDto) {
    const fecha = dto.fecha ?? fechaMexico();
    const { inicio, fin } = rangoDiaMexico(fecha);

    let creditosQuery = this.client
      .from('creditos_ventas')
      .select(
        `id, monto_total, saldo_pendiente, estado, folio_vale, recibido_por, vehiculo_placas, created_at,
         empresa:empresas_credito(nombre),
         sucursal:sucursales(nombre),
         venta:ventas(folio, usuario:usuarios!usuario_id(nombre_completo),
           venta_items(cantidad, precio_unitario, con_casco, producto:productos(modelo, marcas(nombre))))`,
      )
      .gte('created_at', inicio)
      .lte('created_at', fin)
      .neq('estado', 'cancelado')
      .order('created_at');
    let abonosQuery = this.client
      .from('creditos_abonos')
      .select(
        'id, monto, metodo_pago, referencia, created_at, empresa:empresas_credito(nombre), sucursal:sucursales(nombre), usuario:usuarios!usuario_id(nombre_completo)',
      )
      .gte('created_at', inicio)
      .lte('created_at', fin)
      .order('created_at');
    let traspasosQuery = this.client
      .from('transferencias')
      .select(
        'id, cantidad, nota, created_at, producto:productos(modelo, marcas(nombre)), origen:sucursales!transferencias_sucursal_origen_id_fkey(nombre), destino:sucursales!transferencias_sucursal_destino_id_fkey(nombre), autorizo:usuarios!transferencias_autorizado_por_fkey(nombre_completo)',
      )
      .gte('created_at', inicio)
      .lte('created_at', fin)
      .order('created_at');

    if (dto.sucursal_id) {
      creditosQuery = creditosQuery.eq('sucursal_id', dto.sucursal_id);
      abonosQuery = abonosQuery.eq('sucursal_id', dto.sucursal_id);
      traspasosQuery = traspasosQuery.or(
        `sucursal_origen_id.eq.${dto.sucursal_id},sucursal_destino_id.eq.${dto.sucursal_id}`,
      );
    }

    const [creditos, abonos, traspasos] = await Promise.all([
      creditosQuery,
      abonosQuery,
      traspasosQuery,
    ]);
    if (creditos.error) throw new BadRequestException(creditos.error.message);
    if (abonos.error) throw new BadRequestException(abonos.error.message);
    if (traspasos.error) throw new BadRequestException(traspasos.error.message);

    const filasCreditos = (creditos.data ?? []) as unknown as FilaCreditoDia[];
    const filasAbonos = (abonos.data ?? []) as unknown as FilaAbonoDia[];
    const filasTraspasos = (traspasos.data ?? []) as unknown as FilaTraspasoDia[];

    const listaCreditos = filasCreditos.map((c) => {
      const venta = primero(c.venta);
      const items = (venta?.venta_items ?? []).map((i) => ({
        ...marcaYModelo(i.producto),
        cantidad: i.cantidad,
        precio_unitario: Number(i.precio_unitario),
        con_casco: i.con_casco,
      }));
      return {
        id: c.id,
        folio: venta?.folio ?? null,
        empresa: primero(c.empresa)?.nombre ?? null,
        sucursal: primero(c.sucursal)?.nombre ?? null,
        atendio: primero(venta?.usuario)?.nombre_completo ?? null,
        folio_vale: c.folio_vale,
        recibido_por: c.recibido_por,
        vehiculo_placas: c.vehiculo_placas,
        total: Number(c.monto_total),
        saldo_pendiente: Number(c.saldo_pendiente),
        estado: c.estado,
        piezas: items.reduce((s, i) => s + i.cantidad, 0),
        items,
        created_at: c.created_at,
      };
    });

    const listaAbonos = filasAbonos.map((a) => ({
      id: a.id,
      empresa: primero(a.empresa)?.nombre ?? null,
      sucursal: primero(a.sucursal)?.nombre ?? null,
      usuario: primero(a.usuario)?.nombre_completo ?? null,
      monto: Number(a.monto),
      metodo_pago: a.metodo_pago,
      referencia: a.referencia,
      created_at: a.created_at,
    }));

    const listaTraspasos = filasTraspasos.map((t) => ({
      id: t.id,
      ...marcaYModelo(t.producto),
      cantidad: t.cantidad,
      origen: primero(t.origen)?.nombre ?? null,
      destino: primero(t.destino)?.nombre ?? null,
      autorizo: primero(t.autorizo)?.nombre_completo ?? null,
      nota: t.nota,
      created_at: t.created_at,
    }));

    return {
      fecha,
      creditos: listaCreditos,
      abonos: listaAbonos,
      traspasos: listaTraspasos,
      totales: {
        creditos: listaCreditos.length,
        monto_creditos: redondear(listaCreditos.reduce((s, c) => s + c.total, 0)),
        piezas_credito: listaCreditos.reduce((s, c) => s + c.piezas, 0),
        abonos: listaAbonos.length,
        monto_abonos: redondear(listaAbonos.reduce((s, a) => s + a.monto, 0)),
        traspasos: listaTraspasos.length,
        piezas_traspasadas: listaTraspasos.reduce((s, t) => s + t.cantidad, 0),
      },
    };
  }

  // 6. Registrar Abono / Pago de Crédito
  async registrarAbono(dto: RegistrarAbonoCreditoDto) {
    const { data, error } = await this.client.rpc('registrar_abono_credito', {
      p_empresa_id: dto.empresa_id,
      p_monto: dto.monto,
      p_metodo_pago: dto.metodo_pago ?? 'transferencia',
      p_credito_venta_id: dto.credito_venta_id ?? null,
      p_sucursal_id: dto.sucursal_id ?? null,
      p_referencia: dto.referencia ?? null,
      p_notas: dto.notas ?? null,
    });

    if (error) throw new BadRequestException(error.message);
    return data;
  }
}
