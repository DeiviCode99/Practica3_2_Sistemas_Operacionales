/**
 * Políticas de reemplazo (patrón Strategy).
 * Cada política recibe candidatos { id, loadedAt, lastUsed } y devuelve la víctima.
 * Se usan tanto para frames de memoria principal como para las vías de la TLB.
 * Agregar una política nueva solo requiere registrarla en POLICIES.
 */

function minBy(items, key) {
  return items.reduce((best, item) => (key(item) < key(best) ? item : best));
}

const LRU = Object.freeze({
  id: 'LRU',
  label: 'LRU (menos reciente)',
  selectVictim: (candidates) => minBy(candidates, (c) => c.lastUsed),
});

const FIFO = Object.freeze({
  id: 'FIFO',
  label: 'FIFO (primera en entrar)',
  selectVictim: (candidates) => minBy(candidates, (c) => c.loadedAt),
});

const RANDOM = Object.freeze({
  id: 'RANDOM',
  label: 'Aleatoria (Random)',
  selectVictim: (candidates, rng) => rng.pick(candidates),
});

export const POLICIES = Object.freeze({ LRU, FIFO, RANDOM });

export function getPolicy(id) {
  const policy = POLICIES[id];
  if (!policy) throw new RangeError(`Política de reemplazo desconocida: ${id}`);
  return policy;
}
