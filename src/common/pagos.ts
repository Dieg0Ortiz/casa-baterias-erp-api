// Clasificación de cobros por forma de pago. Es la misma regla que usa la
// base en movimientos_corte (037): el efectivo va al corte de efectivo; las
// tarjetas y transferencias al corte electrónico; el crédito no se cobra en el
// momento y va aparte. El pago mixto se reparte según su desglose.

export type GrupoPago = 'efectivo' | 'tarjeta' | 'transferencia' | 'credito';

export interface ParteDePago {
  grupo: GrupoPago;
  metodo: string;
  monto: number;
}

export interface VentaConPago {
  total: number | string;
  metodo_pago?: string | null;
  desglose_pago?: Array<{ metodo: string; monto: number | string }> | null;
}

export function grupoDeMetodo(metodo: string | null | undefined): GrupoPago {
  switch ((metodo ?? 'efectivo').toLowerCase()) {
    case 'tarjeta':
    case 'tarjeta_debito':
    case 'tarjeta_credito':
      return 'tarjeta';
    case 'transferencia':
      return 'transferencia';
    case 'credito':
      return 'credito';
    default:
      return 'efectivo';
  }
}

/** Partes de una venta por forma de pago (una sola, salvo pago mixto). */
export function partesDePago(venta: VentaConPago): ParteDePago[] {
  const metodo = (venta.metodo_pago ?? 'efectivo').toLowerCase();
  if (metodo === 'mixto' && Array.isArray(venta.desglose_pago)) {
    return venta.desglose_pago.map((p) => ({
      grupo: grupoDeMetodo(p.metodo),
      metodo: p.metodo,
      monto: Number(p.monto),
    }));
  }
  return [{ grupo: grupoDeMetodo(metodo), metodo, monto: Number(venta.total) }];
}

export interface TotalesPorGrupo {
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  credito: number;
  /** Lo que sí se cobró: todo menos el crédito. */
  cobrado: number;
}

export function totalesPorGrupo(ventas: VentaConPago[]): TotalesPorGrupo {
  const t: TotalesPorGrupo = {
    efectivo: 0,
    tarjeta: 0,
    transferencia: 0,
    credito: 0,
    cobrado: 0,
  };
  for (const venta of ventas) {
    for (const parte of partesDePago(venta)) {
      t[parte.grupo] += parte.monto;
    }
  }
  for (const k of [
    'efectivo',
    'tarjeta',
    'transferencia',
    'credito',
  ] as const) {
    t[k] = redondear(t[k]);
  }
  t.cobrado = redondear(t.efectivo + t.tarjeta + t.transferencia);
  return t;
}

export function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}
