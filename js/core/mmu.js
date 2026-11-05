/**
 * Modelo del sistema de memoria virtual: TLB asociativa por conjuntos,
 * tabla de páginas, memoria principal (frames) y espacio de swap.
 *
 * access() es un generador: cada `yield` entrega un paso explicado del
 * proceso de traducción. La interfaz lo usa para el modo paso a paso
 * (Explain/Next) y execute() lo consume de una vez para el modo rápido.
 */
import { mask } from './bits.js';
import { decomposeAddress, physicalAddress } from './config.js';
import { createFormatter } from './format.js';
import { getPolicy } from './policies.js';
import { SeededRandom } from './rng.js';

export const PROTECTION_MODES = Object.freeze({
  random: Object.freeze({
    id: 'random',
    label: 'Aleatoria (como CS351)',
    make: (rng) => ({ r: true, w: rng.next() < 0.5, e: rng.next() < 0.5 }),
  }),
  readWrite: Object.freeze({
    id: 'readWrite',
    label: 'Lectura y escritura',
    make: () => ({ r: true, w: true, e: false }),
  }),
  readOnly: Object.freeze({
    id: 'readOnly',
    label: 'Solo lectura',
    make: () => ({ r: true, w: false, e: false }),
  }),
});

export const PERMISSION_BITS = Object.freeze(['r', 'w', 'e']);

function emptyStats() {
  return {
    reads: 0, writes: 0,
    tlbHits: 0, tlbMisses: 0,
    ptHits: 0, pageFaults: 0,
    replacements: 0, segFaults: 0, protectionFaults: 0,
  };
}

function emptyTlbEntry() {
  return { valid: false, dirty: false, r: false, w: false, e: false, tag: null, ppn: null, vpn: null, loadedAt: 0, lastUsed: 0 };
}

function createState(g) {
  return {
    clock: 0,
    pageTable: Array.from({ length: g.pages }, (_, vpn) => ({
      vpn, allocated: false, valid: false, dirty: false, r: false, w: false, e: false, ppn: null, ssn: null,
    })),
    tlb: Array.from({ length: g.tlbSets }, () => Array.from({ length: g.tlbWays }, emptyTlbEntry)),
    frames: Array(g.frames).fill(null),
    memory: new Uint8Array(g.pmSize),
    swap: Array(g.swapSectors).fill(null),
    stats: emptyStats(),
  };
}

function step(tone, title, detail, focus = [], final = false) {
  return { tone, title, detail, focus, final };
}

function finalStep(tone, title, detail, focus = []) {
  return step(tone, title, detail, focus, true);
}

export class VirtualMemorySystem {
  #pagePolicy;
  #tlbPolicy;
  #protection;
  #fmt;

  constructor(geometry, options = {}) {
    const { pagePolicy = 'LRU', tlbPolicy = 'LRU', protection = 'random', seed = 351 } = options;
    this.geometry = geometry;
    this.seed = seed;
    this.rng = new SeededRandom(seed);
    this.state = createState(geometry);
    this.#fmt = createFormatter(geometry);
    this.setPagePolicy(pagePolicy);
    this.setTlbPolicy(tlbPolicy);
    this.setProtectionMode(protection);
  }

  /* ---------- configuración ---------- */

  get pagePolicy() { return this.#pagePolicy; }
  get tlbPolicy() { return this.#tlbPolicy; }
  get protectionMode() { return this.#protection; }

  get options() {
    return {
      pagePolicy: this.#pagePolicy.id,
      tlbPolicy: this.#tlbPolicy.id,
      protection: this.#protection.id,
      seed: this.seed,
    };
  }

  setPagePolicy(id) { this.#pagePolicy = getPolicy(id); }
  setTlbPolicy(id) { this.#tlbPolicy = getPolicy(id); }

  setProtectionMode(id) {
    const mode = PROTECTION_MODES[id];
    if (!mode) throw new RangeError(`Modo de protección desconocido: ${id}`);
    this.#protection = mode;
  }

  /* ---------- instantáneas ---------- */

  snapshot() {
    return structuredClone({ state: this.state, rng: this.rng.state });
  }

  restore(snapshot) {
    const copy = structuredClone(snapshot);
    this.state = copy.state;
    this.rng.state = copy.rng;
  }

  /** Copia independiente del sistema, opcionalmente con otras políticas. */
  clone(overrides = {}) {
    const copy = new VirtualMemorySystem(this.geometry, { ...this.options, ...overrides });
    copy.restore(this.snapshot());
    return copy;
  }

  /* ---------- consultas ---------- */

  counts() {
    let allocated = 0, inMemory = 0, inSwap = 0;
    for (const pte of this.state.pageTable) {
      if (!pte.allocated) continue;
      allocated++;
      if (pte.valid) inMemory++; else inSwap++;
    }
    return { allocated, inMemory, inSwap, free: this.geometry.pages - allocated };
  }

  /** Bytes actuales de una página virtual (desde su frame o su sector de swap). */
  readPage(vpn) {
    this.#assertVpn(vpn);
    const pte = this.state.pageTable[vpn];
    if (!pte.allocated) return null;
    const { pageSize } = this.geometry;
    if (pte.valid) return this.state.memory.slice(pte.ppn * pageSize, (pte.ppn + 1) * pageSize);
    return this.state.swap[pte.ssn].data.slice();
  }

  /* ---------- asignación (Click to Allocate) ---------- */

  allocate(vpn, permissions) {
    this.#assertVpn(vpn);
    const g = this.geometry;
    const pte = this.state.pageTable[vpn];
    if (pte.allocated) throw new Error(`La página ${this.#fmt.vpn(vpn)} ya está asignada.`);

    const perms = permissions ?? this.#protection.make(this.rng);
    const data = new Uint8Array(g.pageSize);
    for (let i = 0; i < data.length; i++) data[i] = this.rng.int(256);
    Object.assign(pte, { allocated: true, dirty: false, r: !!perms.r, w: !!perms.w, e: !!perms.e });

    const ppn = this.#freeFrame();
    if (ppn !== -1) {
      this.#placeInFrame(vpn, ppn, data, this.#tick());
      return { vpn, location: 'frame', ppn };
    }
    const ssn = this.#freeSector();
    this.state.swap[ssn] = { vpn, data };
    Object.assign(pte, { valid: false, ppn: null, ssn });
    return { vpn, location: 'swap', ssn };
  }

  /** Asigna `count` páginas libres en orden aleatorio (Infinity = todas). */
  allocateRandom(count = Infinity) {
    const free = this.state.pageTable.filter((p) => !p.allocated).map((p) => p.vpn);
    const order = this.rng.shuffle(free).slice(0, Math.min(count, free.length));
    return order.map((vpn) => this.allocate(vpn));
  }

  setPermission(vpn, bit, value) {
    this.#assertVpn(vpn);
    if (!PERMISSION_BITS.includes(bit)) throw new RangeError(`Bit de permiso desconocido: ${bit}`);
    const pte = this.state.pageTable[vpn];
    if (!pte.allocated) throw new Error(`La página ${this.#fmt.vpn(vpn)} no está asignada.`);
    pte[bit] = !!value;
    const cached = this.#findTlbByVpn(vpn);
    if (cached) this.state.tlb[cached.set][cached.way][bit] = !!value; // la TLB refleja la tabla
  }

  /* ---------- accesos ---------- */

  /** Ejecuta un acceso completo y devuelve el resultado. */
  execute(va, options) {
    const it = this.access(va, options);
    let r = it.next();
    while (!r.done) r = it.next();
    return r.value;
  }

  /** Generador del acceso: produce pasos explicados y retorna el resultado. */
  *access(va, { type = 'read', value = 0 } = {}) {
    this.#assertAddress(va);
    if (type !== 'read' && type !== 'write') throw new TypeError(`Tipo de acceso desconocido: ${type}`);
    if (type === 'write' && !(Number.isInteger(value) && value >= 0 && value <= 255)) {
      throw new RangeError('El byte a escribir debe estar entre 0x00 y 0xFF.');
    }

    const g = this.geometry;
    const s = this.state;
    const fx = this.#fmt;
    const now = this.#tick();
    const f = decomposeAddress(g, va);
    const result = {
      type, va, ...f,
      tlb: null, pt: null, ppn: null, ssnBefore: null, pa: null,
      value: null, replaced: null, tlbEvicted: null, outcome: 'ok',
    };
    s.stats[type === 'read' ? 'reads' : 'writes']++;

    yield step('info', 'Descomposición de la dirección virtual',
      `VA ${va} = ${fx.va(va)} → VPN ${fx.vpn(f.vpn)} y offset ${fx.offset(f.offset)}. ` +
      `La VPN se divide en tag ${fx.tag(f.tag)} e índice de conjunto ${fx.index(f.index)} para buscar en la TLB.`,
      ['addr', `tlbset:${f.index}`]);

    const pte = s.pageTable[f.vpn];
    const way = this.#findTlbWay(f.index, f.tag);
    let tlbEntry;

    if (way !== -1) {
      tlbEntry = s.tlb[f.index][way];
      tlbEntry.lastUsed = now;
      s.stats.tlbHits++;
      result.tlb = 'hit';
      result.ppn = tlbEntry.ppn;
      yield step('ok', 'Acierto en la TLB',
        `El conjunto ${fx.index(f.index)} tiene una entrada válida con tag ${fx.tag(f.tag)} (vía ${way}). ` +
        `PPN = ${fx.ppn(tlbEntry.ppn)}; no hace falta consultar la tabla de páginas.`,
        [`tlb:${f.index}:${way}`]);
      if (!this.#allows(tlbEntry, type)) {
        return yield* this.#protectionFault(result, [`tlb:${f.index}:${way}`, `pt:${f.vpn}`]);
      }
    } else {
      s.stats.tlbMisses++;
      result.tlb = 'miss';
      yield step('warn', 'Fallo en la TLB',
        `Ninguna vía del conjunto ${fx.index(f.index)} tiene el tag ${fx.tag(f.tag)} válido. ` +
        `Se consulta la tabla de páginas en la entrada VPN ${fx.vpn(f.vpn)}.`,
        [`tlbset:${f.index}`, `pt:${f.vpn}`]);

      if (!pte.allocated) {
        s.stats.segFaults++;
        result.pt = 'unallocated';
        result.outcome = 'segfault';
        yield finalStep('bad', 'Fallo de segmento',
          `La página ${fx.vpn(f.vpn)} no fue asignada al proceso: no tiene frame ni sector de swap. El acceso se aborta.`,
          [`pt:${f.vpn}`, `vpage:${f.vpn}`]);
        return result;
      }

      if (!this.#allows(pte, type)) {
        result.ppn = pte.ppn;
        result.ssnBefore = pte.ssn;
        return yield* this.#protectionFault(result, [`pt:${f.vpn}`]);
      }

      if (pte.valid) {
        s.stats.ptHits++;
        result.pt = 'hit';
        yield step('ok', 'Acierto en la tabla de páginas',
          `V = 1: la página está en memoria principal, en el frame PPN ${fx.ppn(pte.ppn)}.`,
          [`pt:${f.vpn}`, `frame:${pte.ppn}`]);
      } else {
        s.stats.pageFaults++;
        result.pt = 'fault';
        result.ssnBefore = pte.ssn;
        yield step('warn', 'Fallo de página',
          `V = 0: la página está en swap, sector SSN ${fx.ssn(pte.ssn)}. Hay que traerla a memoria principal.`,
          [`pt:${f.vpn}`, `swap:${pte.ssn}`]);
        yield* this.#bringIntoMemory(f.vpn, now, result);
      }

      result.ppn = pte.ppn;
      const fill = this.#fillTlb(f, pte, now);
      result.tlbEvicted = fill.evicted;
      tlbEntry = s.tlb[f.index][fill.way];
      const evictedText = fill.evicted === null
        ? ' Había una vía libre.'
        : ` La vía estaba ocupada por la VPN ${fx.vpn(fill.evicted)}; se reemplaza con ${this.#tlbPolicy.id}.`;
      yield step('info', 'TLB actualizada',
        `Se guarda la traducción VPN ${fx.vpn(f.vpn)} → PPN ${fx.ppn(pte.ppn)} en el conjunto ${fx.index(f.index)}, vía ${fill.way}, con tag ${fx.tag(f.tag)}.${evictedText}`,
        [`tlb:${f.index}:${fill.way}`]);
    }

    const pa = physicalAddress(g, result.ppn, f.offset);
    result.pa = pa;
    s.frames[result.ppn].lastUsed = now;
    const where = `PA = PPN ${fx.ppn(result.ppn)} | offset ${fx.offset(f.offset)} = ${fx.pa(pa)}.`;

    if (type === 'read') {
      result.value = s.memory[pa];
      yield finalStep('ok', 'Lectura completada', `${where} Byte leído: ${fx.byte(result.value)}.`,
        [`frame:${result.ppn}`, `byte:${pa}`, `pt:${f.vpn}`]);
    } else {
      s.memory[pa] = value;
      pte.dirty = true;
      tlbEntry.dirty = true;
      result.value = value;
      yield finalStep('ok', 'Escritura completada',
        `${where} Se escribe ${fx.byte(value)} y el bit D (dirty) pasa a 1 en la tabla de páginas y en la TLB.`,
        [`frame:${result.ppn}`, `byte:${pa}`, `pt:${f.vpn}`, `tlb:${f.index}:${s.tlb[f.index].indexOf(tlbEntry)}`]);
    }
    return result;
  }

  /* ---------- internos ---------- */

  *#protectionFault(result, focus) {
    this.state.stats.protectionFaults++;
    result.outcome = 'protection';
    const reason = result.type === 'write'
      ? 'tiene W = 0 (protegida contra escritura)'
      : 'tiene R = 0 (sin permiso de lectura)';
    yield finalStep('bad', 'Violación de protección',
      `La página ${this.#fmt.vpn(result.vpn)} ${reason}. La MMU genera una excepción y el acceso no se realiza.`,
      focus);
    return result;
  }

  *#bringIntoMemory(vpn, now, result) {
    const g = this.geometry;
    const s = this.state;
    const fx = this.#fmt;
    const pte = s.pageTable[vpn];
    const sector = pte.ssn;
    const incoming = s.swap[sector];
    let ppn = this.#freeFrame();

    if (ppn === -1) {
      const candidates = s.frames.map((frame, id) => ({ id, vpn: frame.vpn, loadedAt: frame.loadedAt, lastUsed: frame.lastUsed }));
      const victim = this.#pagePolicy.selectVictim(candidates, this.rng);
      ppn = victim.id;
      const victimPte = s.pageTable[victim.vpn];
      const dirtyText = victimPte.dirty
        ? 'Está sucia (D = 1), así que su contenido se escribe en swap.'
        : 'Está limpia (D = 0).';
      yield step('warn', `Reemplazo de página (${this.#pagePolicy.id})`,
        `No hay frames libres. La política ${this.#pagePolicy.id} elige el frame ${fx.ppn(ppn)}, que contiene la página ${fx.vpn(victim.vpn)}. ${dirtyText}`,
        [`frame:${ppn}`, `pt:${victim.vpn}`]);

      const victimData = s.memory.slice(ppn * g.pageSize, (ppn + 1) * g.pageSize);
      s.swap[sector] = { vpn: victim.vpn, data: victimData };
      Object.assign(victimPte, { valid: false, dirty: false, ppn: null, ssn: sector });
      s.frames[ppn] = null;
      const invalidated = this.#invalidateTlb(victim.vpn);
      s.stats.replacements++;
      result.replaced = { vpn: victim.vpn, ppn, ssn: sector };

      const focus = [`swap:${sector}`, `pt:${victim.vpn}`];
      if (invalidated) focus.push(`tlb:${invalidated.set}:${invalidated.way}`);
      yield step('info', 'Página víctima enviada a swap',
        `La página ${fx.vpn(victim.vpn)} pasa al sector SSN ${fx.ssn(sector)} (V = 0).` +
        (invalidated ? ' Su traducción en la TLB queda invalidada.' : ''),
        focus);
    } else {
      s.swap[sector] = null;
    }

    this.#placeInFrame(vpn, ppn, incoming.data, now);
    yield step('info', 'Página cargada en memoria principal',
      `La página ${fx.vpn(vpn)} se copia desde SSN ${fx.ssn(sector)} al frame ${fx.ppn(ppn)}. La tabla de páginas queda con V = 1 y PPN = ${fx.ppn(ppn)}.`,
      [`frame:${ppn}`, `pt:${vpn}`]);
  }

  #fillTlb(f, pte, now) {
    const set = this.state.tlb[f.index];
    let way = set.findIndex((e) => !e.valid);
    let evicted = null;
    if (way === -1) {
      const candidates = set.map((e, id) => ({ id, loadedAt: e.loadedAt, lastUsed: e.lastUsed }));
      way = this.#tlbPolicy.selectVictim(candidates, this.rng).id;
      evicted = set[way].vpn;
    }
    set[way] = {
      valid: true, dirty: pte.dirty, r: pte.r, w: pte.w, e: pte.e,
      tag: f.tag, ppn: pte.ppn, vpn: f.vpn, loadedAt: now, lastUsed: now,
    };
    return { way, evicted };
  }

  #placeInFrame(vpn, ppn, data, time) {
    this.state.memory.set(data, ppn * this.geometry.pageSize);
    this.state.frames[ppn] = { vpn, loadedAt: time, lastUsed: time };
    Object.assign(this.state.pageTable[vpn], { valid: true, ppn, ssn: null });
  }

  #findTlbWay(index, tag) {
    return this.state.tlb[index].findIndex((e) => e.valid && e.tag === tag);
  }

  #findTlbByVpn(vpn) {
    const set = vpn & mask(this.geometry.indexBits);
    const way = this.state.tlb[set].findIndex((e) => e.valid && e.vpn === vpn);
    return way === -1 ? null : { set, way };
  }

  #invalidateTlb(vpn) {
    const loc = this.#findTlbByVpn(vpn);
    if (loc) this.state.tlb[loc.set][loc.way] = emptyTlbEntry();
    return loc;
  }

  #allows(entry, type) {
    return type === 'read' ? entry.r : entry.w;
  }

  #freeFrame() { return this.state.frames.indexOf(null); }

  #freeSector() {
    const ssn = this.state.swap.indexOf(null);
    if (ssn === -1) throw new Error('El espacio de swap está lleno.');
    return ssn;
  }

  #tick() { return ++this.state.clock; }

  #assertVpn(vpn) {
    if (!Number.isInteger(vpn) || vpn < 0 || vpn >= this.geometry.pages) {
      throw new RangeError(`VPN fuera de rango: ${vpn}`);
    }
  }

  #assertAddress(va) {
    const { vmSize } = this.geometry;
    if (!Number.isInteger(va) || va < 0 || va >= vmSize) {
      throw new RangeError(`La dirección debe estar entre 0 y ${vmSize - 1} (${this.#fmt.va(vmSize - 1)}).`);
    }
  }
}
