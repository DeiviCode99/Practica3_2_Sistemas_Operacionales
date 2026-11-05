/**
 * Utilidades puras para trabajar con bits y formatos numéricos.
 * No dependen del DOM, por lo que se pueden probar en Node.
 */

export function isPowerOfTwo(n) {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

export function log2Int(n) {
  if (!isPowerOfTwo(n)) throw new RangeError(`${n} no es potencia de 2`);
  return Math.log2(n);
}

/** Máscara con los `bits` menos significativos en 1. */
export function mask(bits) {
  return bits <= 0 ? 0 : (2 ** bits) - 1;
}

/** Número de dígitos hexadecimales necesarios para representar `bits` bits. */
export function hexDigitsFor(bits) {
  return Math.max(1, Math.ceil(bits / 4));
}

/** Formatea un entero como 0x.. con relleno según el ancho en bits. */
export function toHex(value, bits = 0) {
  if (value === null || value === undefined) return '—';
  return '0x' + value.toString(16).toUpperCase().padStart(hexDigitsFor(bits), '0');
}

export function toBinary(value, bits) {
  return bits <= 0 ? '' : value.toString(2).padStart(bits, '0');
}

/** Interpreta "80", "0x50" o "0X50". Devuelve NaN si el texto no es válido. */
export function parseNumber(text) {
  const s = String(text ?? '').trim().toLowerCase();
  if (/^0x[0-9a-f]+$/.test(s)) return parseInt(s.slice(2), 16);
  if (/^[0-9]+$/.test(s)) return parseInt(s, 10);
  return NaN;
}

/** Interpreta un byte escrito en hexadecimal ("AB", "0xab"). */
export function parseHexByte(text) {
  const s = String(text ?? '').trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{1,2}$/.test(s)) return NaN;
  return parseInt(s, 16);
}

/** Convierte una lista libre ("80, 124 0x1E0\n5") en números. */
export function parseNumberList(text) {
  return String(text ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((token) => ({ token, value: parseNumber(token) }));
}
