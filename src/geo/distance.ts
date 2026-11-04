/** [longitude, latitude], na mesma ordem do GeoJSON. */
export type LngLat = [number, number];

const RAIO_TERRA_M = 6371008.8;
const RAD = Math.PI / 180;

/** Distância em metros entre dois pontos (fórmula de haversine). */
export function distanciaMetros(a: LngLat, b: LngLat): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLon = (b[0] - a[0]) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * RAIO_TERRA_M * Math.asin(Math.sqrt(h));
}

export function distanciaDaLinha(coords: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += distanciaMetros(coords[i - 1], coords[i]);
  return total;
}
