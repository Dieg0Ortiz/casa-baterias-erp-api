import { piezasPorModelo } from './creditos.service';

describe('piezasPorModelo', () => {
  const pila = (marca: string, modelo: string, cantidad: number) => ({
    cantidad,
    producto: { modelo, marcas: { nombre: marca } },
  });

  it('suma las piezas del mismo modelo de varias ventas', () => {
    expect(
      piezasPorModelo([
        pila('LTH', 'L-42', 2),
        pila('GONHER', '47', 1),
        pila('LTH', 'L-42', 3),
      ]),
    ).toEqual([
      { marca: 'LTH', modelo: 'L-42', cantidad: 5 },
      { marca: 'GONHER', modelo: '47', cantidad: 1 },
    ]);
  });

  it('distingue el mismo modelo de marcas distintas', () => {
    const r = piezasPorModelo([pila('LTH', '24', 1), pila('GONHER', '24', 1)]);
    expect(r).toHaveLength(2);
  });

  it('acepta los embeds como arreglo y sin producto', () => {
    expect(
      piezasPorModelo([
        {
          cantidad: 1,
          producto: [{ modelo: '65', marcas: [{ nombre: 'LTH' }] }],
        },
        { cantidad: 2, producto: null },
      ]),
    ).toEqual([
      { marca: null, modelo: null, cantidad: 2 },
      { marca: 'LTH', modelo: '65', cantidad: 1 },
    ]);
  });
});
