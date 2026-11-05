/**
 * Formateadores hexadecimales con el ancho correcto para cada campo
 * según la geometría actual. Compartido por el núcleo y la interfaz.
 */
import { toHex } from './bits.js';

export function createFormatter(g) {
  return Object.freeze({
    va: (v) => toHex(v, g.vaBits),
    vpn: (v) => toHex(v, g.vpnBits),
    offset: (v) => toHex(v, g.offsetBits),
    tag: (v) => toHex(v, g.tagBits),
    index: (v) => toHex(v, g.indexBits),
    ppn: (v) => toHex(v, g.ppnBits),
    ssn: (v) => toHex(v, g.vpnBits),
    pa: (v) => toHex(v, g.paBits),
    byte: (v) => toHex(v, 8),
  });
}
