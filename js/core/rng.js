/**
 * Generador pseudoaleatorio con semilla (mulberry32).
 * Con la misma semilla se obtiene la misma secuencia, lo que permite repetir
 * un experimento y comparar políticas sobre exactamente el mismo estado.
 */
export class SeededRandom {
  constructor(seed = 351) {
    this.state = seed >>> 0;
  }

  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(maxExclusive) {
    return Math.floor(this.next() * maxExclusive);
  }

  pick(items) {
    return items[this.int(items.length)];
  }

  /** Devuelve una copia barajada (Fisher–Yates). */
  shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}
