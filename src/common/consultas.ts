import { BadRequestException } from '@nestjs/common';
import type { PostgrestError } from '@supabase/supabase-js';

interface Respuesta {
  data: unknown[] | null;
  error: Pick<PostgrestError, 'message'> | null;
}

// PostgREST entrega como máximo 1000 filas por consulta (max-rows de
// Supabase) y corta sin avisar: un reporte de más de 1000 ventas salía
// incompleto. Se pide por páginas hasta que una llega incompleta.
export const FILAS_POR_PAGINA = 1000;

// Un filtro `in` viaja en la URL y cada uuid ocupa unos 37 caracteres:
// con miles de ventas la URL se vuelve enorme y la petición falla con
// "fetch failed". Se parte la lista en lotes.
export const IDS_POR_LOTE = 150;

/** Todas las filas de una consulta, página por página. */
export async function todasLasPaginas<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<Respuesta>,
): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += FILAS_POR_PAGINA) {
    const { data, error } = await pagina(desde, desde + FILAS_POR_PAGINA - 1);
    if (error) throw new BadRequestException(error.message);
    const recibidas = (data ?? []) as T[];
    filas.push(...recibidas);
    if (recibidas.length < FILAS_POR_PAGINA) return filas;
  }
}

/**
 * Todas las filas de una consulta filtrada por una lista de ids que puede
 * ser larga: un lote de ids a la vez y, dentro de cada lote, por páginas.
 */
export async function porLotes<T>(
  ids: readonly string[],
  consulta: (
    lote: string[],
    desde: number,
    hasta: number,
  ) => PromiseLike<Respuesta>,
): Promise<T[]> {
  const filas: T[] = [];
  for (let i = 0; i < ids.length; i += IDS_POR_LOTE) {
    const lote = ids.slice(i, i + IDS_POR_LOTE);
    filas.push(
      ...(await todasLasPaginas<T>((desde, hasta) =>
        consulta(lote, desde, hasta),
      )),
    );
  }
  return filas;
}
