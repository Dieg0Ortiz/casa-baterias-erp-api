// PostgREST entrega los embeds to-one como objeto, pero la inferencia de
// supabase-js sin esquema los tipa como arreglo; esto acepta las dos formas.
export type Relacion<T> = T | T[] | null | undefined;

export function primero<T>(relacion: Relacion<T>): T | null {
  if (Array.isArray(relacion)) return relacion[0] ?? null;
  return relacion ?? null;
}

export interface ProductoConMarca {
  modelo: string | null;
  marcas?: Relacion<{ nombre: string | null }>;
}

export function marcaYModelo(producto: Relacion<ProductoConMarca>): {
  marca: string | null;
  modelo: string | null;
} {
  const p = primero(producto);
  return {
    marca: primero(p?.marcas)?.nombre?.trim() || null,
    modelo: p?.modelo?.trim() || null,
  };
}
