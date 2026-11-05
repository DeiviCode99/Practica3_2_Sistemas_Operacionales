/**
 * Sesión de simulación: capa de aplicación entre el modelo (core) y las vistas (ui).
 * Mantiene el sistema actual, el historial, el acceso en curso (modo paso a paso)
 * y los elementos resaltados. Notifica cambios con eventos:
 *   - "change": el estado cambió, las vistas deben redibujarse.
 *   - "notice": mensaje breve para el usuario ({ text, tone }).
 * No toca el DOM.
 */
import { buildGeometry, DEFAULT_CONFIG } from '../core/config.js';
import { VirtualMemorySystem } from '../core/mmu.js';
import { comparePolicies } from '../core/analysis.js';
import { createFormatter } from '../core/format.js';

export class SimulationSession extends EventTarget {
  #system = null;
  #pending = null;
  #messageId = 0;

  constructor() {
    super();
    this.config = { ...DEFAULT_CONFIG };
    this.options = { pagePolicy: 'LRU', tlbPolicy: 'LRU', protection: 'random', seed: 351 };
    this.explain = true;
    this.messages = [];
    this.build(this.config);
  }

  /* ---------- lectura ---------- */

  get system() { return this.#system; }
  get geometry() { return this.#system.geometry; }
  get format() { return createFormatter(this.#system.geometry); }
  get busy() { return this.#pending !== null; }
  get pendingAccess() {
    return this.#pending ? { va: this.#pending.va, type: this.#pending.type } : null;
  }

  /* ---------- configuración ---------- */

  build(config = this.config) {
    this.#ensureIdle();
    const g = buildGeometry(config);
    this.config = { vaBits: g.vaBits, pageSize: g.pageSize, tlbSize: g.tlbSize, tlbWays: g.tlbWays, pmSize: g.pmSize };
    this.#system = new VirtualMemorySystem(g, this.options);
    this.history = [];
    this.steps = [];
    this.focus = new Set();
    this.lastResult = null;
    this.selectedVpn = null;
    this.comparison = null;
    this.messages = [];
    this.#log('info', 'Sistema generado',
      `Memoria virtual de ${g.vmSize} B (${g.pages} páginas de ${g.pageSize} B), memoria principal de ${g.pmSize} B ` +
      `(${g.frames} frames) y TLB de ${g.tlbSize} entradas en ${g.tlbSets} conjunto(s) de ${g.tlbWays} vía(s). ` +
      'Asigna páginas para empezar a hacer accesos.');
    this.#changed();
  }

  reset() {
    this.build(this.config);
    this.#notify('Sistema reiniciado con la misma configuración.');
  }

  clearMessages() {
    this.messages = this.messages.filter((m) => m.steps === this.steps && this.#pending);
    this.#changed();
  }

  setOption(name, value) {
    this.#ensureIdle();
    if (name === 'pagePolicy') this.#system.setPagePolicy(value);
    else if (name === 'tlbPolicy') this.#system.setTlbPolicy(value);
    else if (name === 'protection') this.#system.setProtectionMode(value);
    else if (name === 'seed') {
      if (!Number.isInteger(value) || value < 0) throw new RangeError('La semilla debe ser un entero positivo.');
    } else throw new RangeError(`Opción desconocida: ${name}`);
    this.options = { ...this.options, [name]: value };
    this.#changed();
  }

  setExplain(on) {
    this.explain = Boolean(on);
    this.#changed();
  }

  /* ---------- asignación y permisos ---------- */

  allocate(vpn) {
    this.#ensureIdle();
    const fx = this.format;
    const r = this.#system.allocate(vpn);
    this.selectedVpn = vpn;
    this.focus = new Set([`pt:${vpn}`, `vpage:${vpn}`, r.location === 'frame' ? `frame:${r.ppn}` : `swap:${r.ssn}`]);
    this.#notify(r.location === 'frame'
      ? `Página ${fx.vpn(vpn)} asignada al frame PPN ${fx.ppn(r.ppn)}.`
      : `Memoria principal llena: la página ${fx.vpn(vpn)} quedó en swap (SSN ${fx.ssn(r.ssn)}).`, 'ok');
    this.#changed();
  }

  allocateRandom(count) {
    this.#ensureIdle();
    const results = this.#system.allocateRandom(count);
    if (results.length === 0) throw new Error('No quedan páginas sin asignar.');
    this.focus = new Set(results.map((r) => `vpage:${r.vpn}`));
    const inSwap = results.filter((r) => r.location === 'swap').length;
    this.#notify(`${results.length} páginas asignadas en orden aleatorio${inSwap ? ` (${inSwap} quedaron en swap)` : ''}.`, 'ok');
    this.#changed();
  }

  togglePermission(vpn, bit) {
    this.#ensureIdle();
    const pte = this.#system.state.pageTable[vpn];
    this.#system.setPermission(vpn, bit, !pte[bit]);
    this.focus = new Set([`pt:${vpn}`]);
    this.#changed();
  }

  selectPage(vpn) {
    this.selectedVpn = vpn;
    this.#changed();
  }

  /* ---------- accesos ---------- */

  startAccess(va, type = 'read', value = 0) {
    this.#ensureIdle();
    const fx = this.format;
    this.steps = [];
    this.lastResult = null;
    this.focus = new Set();
    this.#pending = { it: this.#system.access(va, { type, value }), va, type };
    this.#log('info', `${type === 'read' ? 'Lectura' : 'Escritura'} en VA ${va} (${fx.va(va)})`, '', this.steps);
    if (this.explain) this.nextStep();
    else this.completeAccess();
  }

  nextStep() {
    if (!this.#pending) return;
    this.#advance();
    this.#changed();
  }

  completeAccess() {
    while (this.#pending) this.#advance();
    this.#changed();
  }

  /** Ejecuta varias lecturas seguidas sobre el sistema real (sin paso a paso). */
  runSequence(addresses, type = 'read') {
    this.#ensureIdle();
    addresses.forEach((va) => this.#assertAddress(va));
    let last = null;
    for (const va of addresses) {
      last = this.#system.execute(va, { type });
      this.#record(last);
    }
    this.lastResult = last;
    this.steps = [];
    this.focus = new Set();
    const added = this.history.slice(-addresses.length);
    const count = (pred) => added.filter(pred).length;
    this.#log('ok', `Secuencia de ${addresses.length} lecturas`,
      `Aciertos TLB: ${count((e) => e.tlb === 'hit')} · fallos de página: ${count((e) => e.pt === 'fault')} · ` +
      `reemplazos: ${count((e) => e.replaced)} · fallos de segmento: ${count((e) => e.outcome === 'segfault')}. ` +
      'El detalle de cada acceso está en el historial.');
    this.#toast(`Secuencia de ${addresses.length} lecturas ejecutada.`, 'ok');
    this.#changed();
  }

  /** Compara políticas desde el estado actual sin modificarlo. */
  compare(addresses, policies, type = 'read') {
    this.#ensureIdle();
    if (policies.length === 0) throw new Error('Selecciona al menos una política.');
    addresses.forEach((va) => this.#assertAddress(va));
    const data = comparePolicies(this.#system, addresses, policies, type);
    this.comparison = { id: Date.now(), data };
    const totals = data.runs.map((r) => `${r.policy}: ${r.totals.replacements}`).join(' · ');
    this.#log('info', 'Comparación de políticas', `${addresses.length} lecturas desde el estado actual. Reemplazos → ${totals}.`);
    this.#changed();
    return data;
  }

  clearHistory() {
    this.history = [];
    this.#changed();
  }

  /* ---------- internos ---------- */

  #advance() {
    const pending = this.#pending;
    let r;
    try {
      r = pending.it.next();
    } catch (err) {
      this.#pending = null;
      this.#changed();
      throw err;
    }
    if (r.done) {
      this.#finish(r.value);
      return;
    }
    this.steps.push(r.value);
    this.focus = new Set(r.value.focus);
    if (r.value.final) this.#finish(pending.it.next().value);
  }

  #finish(result) {
    this.#pending = null;
    const entry = this.messages.find((m) => m.steps === this.steps);
    if (entry) entry.tone = this.steps.at(-1)?.tone ?? 'info';
    this.lastResult = result;
    this.selectedVpn = result.vpn;
    this.#record(result);
  }

  #record(result) {
    this.history.push({ n: this.history.length + 1, ...result });
  }

  #assertAddress(va) {
    const { vmSize } = this.geometry;
    if (!Number.isInteger(va) || va < 0 || va >= vmSize) {
      throw new RangeError(`Dirección fuera de rango: ${va}. Debe estar entre 0 y ${vmSize - 1}.`);
    }
  }

  #ensureIdle() {
    if (this.#pending) throw new Error('Termina el acceso en curso (Siguiente paso o Completar) antes de continuar.');
  }

  #changed() {
    this.dispatchEvent(new Event('change'));
  }

  #log(tone, title, detail, steps = []) {
    this.messages.unshift({ id: ++this.#messageId, tone, title, detail, steps, at: new Date() });
    if (this.messages.length > 80) this.messages.length = 80;
  }

  #notify(text, tone = 'info') {
    this.#log(tone === 'bad' ? 'bad' : 'info', text, '');
    this.#toast(text, tone);
  }

  #toast(text, tone = 'info') {
    this.dispatchEvent(new CustomEvent('notice', { detail: { text, tone } }));
  }
}
