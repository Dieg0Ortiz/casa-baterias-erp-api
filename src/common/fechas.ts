export const TZ_MEXICO = 'America/Mexico_City';

/** Fecha de hoy (o de `base`) en hora de México, como YYYY-MM-DD. */
export function fechaMexico(base: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_MEXICO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(base);
  const y = partes.find((p) => p.type === 'year')?.value;
  const m = partes.find((p) => p.type === 'month')?.value;
  const d = partes.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

// Rango de un día en México (UTC-6 fijo; México no usa horario de verano
// desde 2022). Si `fecha` viene, se usa esa fecha (YYYY-MM-DD); si no,
// el día de hoy en hora local de México.
// 00:00:00 hora local CDMX = 06:00:00 UTC
// 23:59:59.999 hora local CDMX = 05:59:59.999 UTC del día siguiente
export function rangoDiaMexico(fecha?: string): {
  inicio: string;
  fin: string;
} {
  const ymd =
    fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)
      ? fecha
      : fechaMexico(fecha ? new Date(fecha) : new Date());
  const inicio = new Date(`${ymd}T06:00:00.000Z`);
  const fin = new Date(inicio.getTime() + 86_400_000 - 1);
  return { inicio: inicio.toISOString(), fin: fin.toISOString() };
}
