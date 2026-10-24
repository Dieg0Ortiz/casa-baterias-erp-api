import { BadRequestException } from '@nestjs/common';
import {
  FILAS_POR_PAGINA,
  IDS_POR_LOTE,
  porLotes,
  todasLasPaginas,
} from './consultas';

// Simula PostgREST: corta cada respuesta en el rango pedido, como hace
// Supabase con su límite de filas.
function tabla(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `f${i}` }));
}

describe('todasLasPaginas', () => {
  it('sigue pidiendo mientras las páginas lleguen llenas', async () => {
    const filas = tabla(FILAS_POR_PAGINA * 2 + 5);
    const pedidas: Array<[number, number]> = [];

    const todas = await todasLasPaginas<{ id: string }>((desde, hasta) => {
      pedidas.push([desde, hasta]);
      return Promise.resolve({
        data: filas.slice(desde, hasta + 1),
        error: null,
      });
    });

    expect(todas).toHaveLength(filas.length);
    expect(pedidas).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('un error de la base se vuelve un 400 con su mensaje', async () => {
    await expect(
      todasLasPaginas(() =>
        Promise.resolve({
          data: null,
          error: {
            message: 'permiso denegado',
            details: '',
            hint: '',
            code: '42501',
            name: 'PostgrestError',
          },
        }),
      ),
    ).rejects.toThrow(new BadRequestException('permiso denegado'));
  });
});

describe('porLotes', () => {
  it('parte la lista de ids y junta todo', async () => {
    const ids = Array.from({ length: IDS_POR_LOTE * 2 + 1 }, (_, i) => `v${i}`);
    const lotes: number[] = [];

    const filas = await porLotes<{ id: string }>(ids, (lote, desde, hasta) => {
      if (desde === 0) lotes.push(lote.length);
      const respuesta = lote.map((id) => ({ id })).slice(desde, hasta + 1);
      return Promise.resolve({ data: respuesta, error: null });
    });

    expect(lotes).toEqual([IDS_POR_LOTE, IDS_POR_LOTE, 1]);
    expect(filas.map((f) => f.id)).toEqual(ids);
  });

  it('sin ids no consulta nada', async () => {
    const consulta = jest.fn();
    expect(await porLotes([], consulta)).toEqual([]);
    expect(consulta).not.toHaveBeenCalled();
  });
});
