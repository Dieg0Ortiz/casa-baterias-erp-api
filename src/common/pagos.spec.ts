import { grupoDeMetodo, partesDePago, totalesPorGrupo } from './pagos';

describe('pagos', () => {
  it('agrupa las tarjetas y deja el crédito aparte', () => {
    expect(grupoDeMetodo('tarjeta_debito')).toBe('tarjeta');
    expect(grupoDeMetodo('tarjeta_credito')).toBe('tarjeta');
    expect(grupoDeMetodo('tarjeta')).toBe('tarjeta');
    expect(grupoDeMetodo('transferencia')).toBe('transferencia');
    expect(grupoDeMetodo('credito')).toBe('credito');
    expect(grupoDeMetodo('efectivo')).toBe('efectivo');
    // Ventas viejas sin método se registraron en efectivo.
    expect(grupoDeMetodo(null)).toBe('efectivo');
  });

  it('reparte el pago mixto según su desglose', () => {
    expect(
      partesDePago({
        total: '3000.00',
        metodo_pago: 'mixto',
        desglose_pago: [
          { metodo: 'efectivo', monto: 1000 },
          { metodo: 'tarjeta_credito', monto: '2000' },
        ],
      }),
    ).toEqual([
      { grupo: 'efectivo', metodo: 'efectivo', monto: 1000 },
      { grupo: 'tarjeta', metodo: 'tarjeta_credito', monto: 2000 },
    ]);
  });

  it('el crédito no cuenta como cobrado', () => {
    const t = totalesPorGrupo([
      { total: 3000, metodo_pago: 'efectivo' },
      { total: 3000, metodo_pago: 'tarjeta_debito' },
      { total: 6000, metodo_pago: 'transferencia' },
      { total: 4500.5, metodo_pago: 'credito' },
      {
        total: 3000,
        metodo_pago: 'mixto',
        desglose_pago: [
          { metodo: 'efectivo', monto: 1000.1 },
          { metodo: 'transferencia', monto: 1999.9 },
        ],
      },
    ]);
    expect(t).toEqual({
      efectivo: 4000.1,
      tarjeta: 3000,
      transferencia: 7999.9,
      credito: 4500.5,
      cobrado: 15000,
    });
  });
});
