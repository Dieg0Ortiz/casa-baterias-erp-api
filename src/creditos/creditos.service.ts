import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  CrearEmpresaCreditoDto,
  ActualizarEmpresaCreditoDto,
  RegistrarAbonoCreditoDto,
} from './creditos.dto';

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
              producto:productos(id, modelo, marca, linea)
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
      const ventasPendientes = ventas.filter((v: any) => v.estado !== 'pagado');
      const saldoDeudor = ventasPendientes.reduce(
        (sum: number, v: any) => sum + Number(v.saldo_pendiente || 0),
        0,
      );
      const totalBateriasDebidas = ventasPendientes.reduce((sum: number, v: any) => {
        const items = v.venta?.venta_items || [];
        return sum + items.reduce((iSum: number, item: any) => iSum + (item.cantidad || 0), 0);
      }, 0);

      const hoy = new Date().toISOString().split('T')[0];
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
          usuario:usuarios(id, nombre, email),
          venta_items(
            id,
            cantidad,
            precio_unitario,
            con_casco,
            producto:productos(id, modelo, marca, linea, requiere_casco)
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
        usuario:usuarios(id, nombre),
        sucursal:sucursales(id, nombre)
      `)
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false });

    if (aErr) throw new BadRequestException(aErr.message);

    const saldoDeudor = (ventasCredito ?? [])
      .filter((v: any) => v.estado !== 'pagado')
      .reduce((sum: number, v: any) => sum + Number(v.saldo_pendiente || 0), 0);

    return {
      empresa,
      saldo_deudor: Math.round(saldoDeudor * 100) / 100,
      ventas: ventasCredito ?? [],
      abonos: abonos ?? [],
    };
  }

  // 5. Reporte General de Todas las Cuentas por Cobrar (Ventas a Crédito)
  async listarVentasCredito(estado?: string, sucursalId?: string) {
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
          usuario:usuarios(id, nombre),
          venta_items(
            id,
            cantidad,
            precio_unitario,
            con_casco,
            producto:productos(id, modelo, marca, linea)
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

    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);

    const hoy = new Date().toISOString().split('T')[0];
    const items = (data ?? []).map((item: any) => {
      const vencida = item.estado !== 'pagado' && item.fecha_vencimiento < hoy;
      return {
        ...item,
        es_vencida: vencida,
      };
    });

    return items;
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
