/**
 * Configuración del sistema de memoria y geometría derivada.
 * buildGeometry() es la única fuente de verdad para tamaños y anchos de campo.
 */
import { isPowerOfTwo, log2Int, mask } from './bits.js';

export const PARAMETER_OPTIONS = Object.freeze({
  vaBits: Object.freeze([10, 12, 16]),
  pageSize: Object.freeze([16, 32]),
  tlbSize: Object.freeze([4, 8, 16, 32]),
  tlbWays: Object.freeze([1, 2, 4]),
  pmSize: Object.freeze([128, 256, 512]),
});

export const DEFAULT_CONFIG = Object.freeze({
  vaBits: 10,
  pageSize: 16,
  tlbSize: 4,
  tlbWays: 2,
  pmSize: 256,
});

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function buildGeometry(config = {}) {
  const { vaBits, pageSize, tlbSize, tlbWays, pmSize } = { ...DEFAULT_CONFIG, ...config };

  if (!Number.isInteger(vaBits) || vaBits < 4 || vaBits > 20) {
    throw new ConfigError('El bus de direcciones virtuales debe tener entre 4 y 20 bits.');
  }
  const powers = { 'Tamaño de página': pageSize, 'Tamaño de la TLB': tlbSize, 'Asociatividad': tlbWays, 'Memoria principal': pmSize };
  for (const [name, value] of Object.entries(powers)) {
    if (!isPowerOfTwo(value)) throw new ConfigError(`${name} debe ser potencia de 2 (recibido ${value}).`);
  }

  const vmSize = 2 ** vaBits;
  if (pageSize > pmSize) throw new ConfigError('La página no puede ser más grande que la memoria principal.');
  if (pmSize > vmSize) throw new ConfigError('La memoria principal no puede superar a la memoria virtual.');
  if (tlbWays > tlbSize) throw new ConfigError('La TLB no puede tener más vías que entradas.');

  const offsetBits = log2Int(pageSize);
  const vpnBits = vaBits - offsetBits;
  const pages = vmSize/pageSize;
  const frames = pmSize / pageSize;
  const tlbSets = tlbSize / tlbWays;
  const indexBits = log2Int(tlbSets);
  if (indexBits > vpnBits) throw new ConfigError('La TLB tiene más conjuntos que páginas virtuales.');

  return Object.freeze({
    vaBits, pageSize, tlbSize, tlbWays, pmSize,
    vmSize,
    offsetBits,
    vpnBits,
    pages,
    pageTableEntries: pages,
    frames,
    ppnBits: log2Int(frames),
    paBits: log2Int(pmSize),
    tlbSets,
    indexBits,
    tagBits: vpnBits - indexBits,
    swapSectors: pages,
  });
}

/** Divide una dirección virtual en VPN/offset y la VPN en tag/índice de TLB. */
export function decomposeAddress(g, va) {
  const vpn = Math.floor(va / g.pageSize);
  const offset = va & mask(g.offsetBits);
  const index = vpn & mask(g.indexBits);
  const tag = Math.floor(vpn / g.tlbSets);
  return { vpn, offset, index, tag };
}

export function physicalAddress(g, ppn, offset) {
  return ppn * g.pageSize + offset;
}

export function virtualAddressOf(g, vpn, offset = 0) {
  return vpn * g.pageSize + offset;
}
