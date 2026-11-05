/**
 * Análisis por lotes: ejecuta la misma secuencia de direcciones con varias
 * políticas de reemplazo, partiendo de copias idénticas del estado actual.
 * No modifica el sistema original.
 */
import { decomposeAddress } from './config.js';

function locationOf(pte) {
  if (!pte.allocated) return { kind: 'none' };
  return pte.valid ? { kind: 'frame', ppn: pte.ppn } : { kind: 'swap', ssn: pte.ssn };
}

export function comparePolicies(system, addresses, policyIds, type = 'read') {
  const g = system.geometry;
  const runs = policyIds.map((policy) => {
    const sim = system.clone({ pagePolicy: policy });
    const before = { ...sim.state.stats };
    const rows = addresses.map((va) => {
      const { vpn } = decomposeAddress(g, va);
      const location = locationOf(sim.state.pageTable[vpn]);
      const result = sim.execute(va, { type });
      return { va, vpn, location, result, replaced: result.replaced ? 1 : 0 };
    });
    const after = sim.state.stats;
    const delta = Object.fromEntries(Object.keys(after).map((k) => [k, after[k] - before[k]]));
    return { policy, rows, totals: delta };
  });
  return { type, addresses: [...addresses], runs };
}
