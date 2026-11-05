/**
 * Panel "Acceso manual a memoria": lectura, escritura, asignación de páginas,
 * descomposición de la dirección con el modo paso a paso, y secuencias.
 */
import { h, cx, panelHead, card, field, toggle } from './dom.js';
import { decomposeAddress } from '../core/config.js';
import { parseNumber, parseHexByte, parseNumberList, toBinary } from '../core/bits.js';
import { POLICIES } from '../core/policies.js';
import { PRACTICE_ADDRESSES } from '../app/practice.js';

export class AccessPanel {
  constructor(root, { session, guard }) {
    this.root = root;
    this.session = session;
    this.guard = guard;
    this.preview = '80';
  }

  mount() {
    const body = h('div', { class: 'panel__body' },
      this.#readCard(),
      this.#writeCard(),
      this.#allocationCard(),
      this.#explainToggle(),
      this.#decompositionCard(),
      this.#sequenceCard());
    this.root.replaceChildren(panelHead('Acceso manual a memoria'), body);
  }

  render() {
    const s = this.session;
    const busy = s.busy;
    for (const el of this.root.querySelectorAll('[data-lock]')) el.disabled = busy;
    this.explain.checked = s.explain;

    const c = s.system.counts();
    const g = s.geometry;
    const item = (label, value, cls) => h('div', { class: cx('alloc-summary__item', cls) },
      h('span', { class: 'alloc-summary__value' }, String(value)), h('span', {}, label));
    this.allocSummary.replaceChildren(
      item('asignadas', `${c.allocated}/${g.pages}`), item('en memoria', c.inMemory, 'is-mm'), item('en swap', c.inSwap, 'is-swap'));
    this.allocAll.disabled = busy || c.free === 0;
    this.allocN.disabled = busy || c.free === 0;
    this.allocBadge.textContent = c.free === 0 ? 'Todas asignadas' : `${c.free} libres`;
    this.allocBadge.className = cx('badge', c.free === 0 ? 'badge--ok' : 'badge--neutral');

    this.stepper.hidden = !busy;
    if (busy) this.stepperLabel.textContent = `Paso ${s.steps.length}: ${s.steps.at(-1)?.title ?? ''}. Revisa el panel de mensajes y continúa.`;
    this.#renderDecomposition();
  }

  /* ---------- tarjetas ---------- */

  #readCard() {
    this.readAddr = this.#addressInput('acc-read-addr', '80');
    const form = h('form', {
      class: 'input-action',
      onsubmit: this.guard((e) => { e.preventDefault(); this.#run('read', this.readAddr.value); }),
    }, field(this.readAddr, 'Dirección virtual', 'Decimal (80) o hexadecimal (0x50)'),
    h('button', { class: 'btn btn--success', type: 'submit', id: 'btn-read', 'data-lock': true }, '📖 Leer'));
    return card({ title: 'Lectura de memoria' }, form);
  }

  #writeCard() {
    this.writeAddr = this.#addressInput('acc-write-addr', '0x50');
    this.byte = h('input', { id: 'acc-byte', type: 'text', class: 'mono', autocomplete: 'off', value: '0xFF', maxlength: 4, 'data-lock': true });
    const form = h('form', {
      class: 'input-action',
      onsubmit: this.guard((e) => { e.preventDefault(); this.#run('write', this.writeAddr.value); }),
    }, field(this.writeAddr, 'Dirección virtual'), field(this.byte, 'Valor del byte'),
    h('button', { class: 'btn btn--warning', type: 'submit', id: 'btn-write', 'data-lock': true }, '✏️ Escribir'));
    return card({ title: 'Escritura de memoria' }, form);
  }

  #allocationCard() {
    const s = this.session;
    this.allocSummary = h('div', { class: 'alloc-summary' });
    this.allocBadge = h('span', { class: 'badge' });
    this.allocCount = h('input', { id: 'alloc-count', type: 'number', min: 1, step: 1, value: 10, inputmode: 'numeric', class: 'mono', 'data-lock': true });
    this.allocN = h('button', {
      class: 'btn btn--outline', type: 'button', id: 'btn-alloc-n',
      onclick: this.guard(() => {
        const n = Number(this.allocCount.value);
        if (!Number.isInteger(n) || n < 1) throw new RangeError('Indica un número de páginas mayor que cero.');
        s.allocateRandom(n);
      }),
    }, 'Asignar N al azar');
    this.allocAll = h('button', {
      class: 'btn btn--primary', type: 'button', id: 'btn-alloc-all',
      onclick: this.guard(() => s.allocateRandom(Infinity)),
    }, 'Asignar todas');
    return card({
      title: 'Asignación de páginas (Click to Allocate)',
      extra: this.allocBadge,
      note: 'Pulsa una página libre en "Memoria virtual" o en la tabla de páginas, o asigna varias en orden aleatorio.',
    }, this.allocSummary, h('div', { class: 'alloc-row' }, field(this.allocCount, 'N páginas'), this.allocN, this.allocAll));
  }

  #explainToggle() {
    this.explain = h('input', { id: 'acc-explain', type: 'checkbox', onchange: (e) => this.session.setExplain(e.target.checked) });
    return h('div', { class: 'card card--soft' },
      toggle(this.explain, 'Explicar cada acceso paso a paso', 'Avanza con "Siguiente paso" y resalta cada estructura que se consulta'));
  }

  #decompositionCard() {
    const s = this.session;
    this.binary = h('div', { class: 'binary' });
    this.fieldCards = h('div', { class: 'field-cards' });
    this.decompBadge = h('span', { class: 'badge' });
    this.stepperLabel = h('span', { class: 'stepper__label' });
    this.stepper = h('div', { class: 'stepper', hidden: true },
      this.stepperLabel,
      h('button', { class: 'btn btn--primary', type: 'button', id: 'btn-next', onclick: this.guard(() => s.nextStep()) }, '▶ Siguiente paso'),
      h('button', { class: 'btn', type: 'button', id: 'btn-finish', onclick: this.guard(() => s.completeAccess()) }, '⏭ Completar'));
    return card({ title: 'Descomposición de dirección', extra: this.decompBadge }, this.binary, this.fieldCards, this.stepper);
  }

  #sequenceCard() {
    const s = this.session;
    this.sequence = h('textarea', { id: 'seq-addresses', rows: 3, spellcheck: 'false', 'data-lock': true });
    this.sequence.value = PRACTICE_ADDRESSES.join(', ');
    this.policyChecks = Object.values(POLICIES).map((p) => h('input', { type: 'checkbox', id: `cmp-${p.id}`, value: p.id, checked: true, 'data-lock': true }));
    return card({ title: 'Secuencia de accesos', note: 'Lecturas en orden. Viene cargada con las direcciones de las tablas 5.3 a 5.5.' },
      field(this.sequence, 'Direcciones separadas por comas o espacios'),
      h('div', { class: 'policy-checks' },
        h('span', { class: 'field__label' }, 'Comparar:'),
        this.policyChecks.map((c) => h('label', { class: 'check', for: c.id }, c, c.value))),
      h('div', { class: 'button-row' },
        h('button', {
          class: 'btn btn--primary', type: 'button', id: 'btn-seq-run', 'data-lock': true,
          onclick: this.guard(() => s.runSequence(this.#sequence())),
        }, '▶ Ejecutar secuencia'),
        h('button', {
          class: 'btn', type: 'button', id: 'btn-seq-compare', 'data-lock': true,
          onclick: this.guard(() => {
            s.compare(this.#sequence(), this.policyChecks.filter((c) => c.checked).map((c) => c.value));
            document.getElementById('tools-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }),
        }, 'Comparar políticas')),
      h('p', { class: 'hint' }, '"Ejecutar" aplica las lecturas al sistema con la política activa. "Comparar" las prueba con cada política sobre copias del estado actual, sin modificarlo (tabla 5.4).'));
  }

  /* ---------- acciones ---------- */

  #run(type, text) {
    const va = parseNumber(text);
    if (Number.isNaN(va)) throw new RangeError('Escribe la dirección en decimal (80) o en hexadecimal (0x50).');
    let value = 0;
    if (type === 'write') {
      value = parseHexByte(this.byte.value);
      if (Number.isNaN(value)) throw new RangeError('El byte debe ser hexadecimal entre 0x00 y 0xFF.');
    }
    this.preview = text;
    this.session.startAccess(va, type, value);
  }

  #sequence() {
    const parsed = parseNumberList(this.sequence.value);
    const bad = parsed.find((p) => Number.isNaN(p.value));
    if (bad) throw new RangeError(`"${bad.token}" no es una dirección válida.`);
    if (parsed.length === 0) throw new RangeError('Escribe al menos una dirección.');
    return parsed.map((p) => p.value);
  }

  #addressInput(id, value) {
    return h('input', {
      id, type: 'text', class: 'mono', autocomplete: 'off', spellcheck: 'false', value, 'data-lock': true,
      oninput: (e) => { this.preview = e.target.value; this.#renderDecomposition(); },
    });
  }

  /* ---------- descomposición ---------- */

  #renderDecomposition() {
    const s = this.session;
    const g = s.geometry;
    const fx = s.format;
    const pending = s.pendingAccess;
    let va = pending?.va ?? parseNumber(this.preview);
    if (Number.isNaN(va)) va = s.lastResult?.va ?? null;
    this.decompBadge.textContent = `Dirección: ${g.vaBits} bits`;

    if (va === null || va < 0 || va >= g.vmSize) {
      this.binary.replaceChildren(
        h('span', { class: 'binary__caption' }, 'Dirección en binario'),
        h('span', { class: 'binary__empty' }, 'Dirección no válida'),
        h('span', { class: 'binary__caption' }, `Rango permitido: 0 – ${g.vmSize - 1} (${fx.va(0)} – ${fx.va(g.vmSize - 1)})`));
      this.fieldCards.replaceChildren();
      return;
    }

    const f = decomposeAddress(g, va);
    const result = !pending && s.lastResult?.va === va ? s.lastResult : null;
    const span = (n, cls, label) => (n > 0
      ? h('span', { class: cx('bitlabel', cls), style: `grid-column: span ${n}`, title: label }, n < 3 ? label.split(' ').pop() : label)
      : null);

    const vaBits = toBinary(va, g.vaBits).split('').map((b, i) => {
      const pos = g.vaBits - 1 - i;
      const kind = pos < g.offsetBits ? 'off' : pos < g.offsetBits + g.indexBits ? 'idx' : 'tag';
      return h('span', { class: cx('bitbox', `bitbox--${kind}`), title: `bit ${pos}` }, b);
    });

    const hasPa = result?.pa !== null && result?.pa !== undefined;
    const paRow = hasPa
      ? h('div', { class: 'bitrow', style: `--cols:${g.paBits}` },
        toBinary(result.pa, g.paBits).split('').map((b, i) => h('span', {
          class: cx('bitbox', g.paBits - 1 - i < g.offsetBits ? 'bitbox--off' : 'bitbox--ppn'),
        }, b)),
        span(g.ppnBits, 'bitlabel--ppn', `PPN ${fx.ppn(result.ppn)}`),
        span(g.offsetBits, 'bitlabel--off', `Offset ${fx.offset(f.offset)}`))
      : null;

    this.binary.replaceChildren(...[
      h('span', { class: 'binary__caption' }, `Dirección virtual ${va} = ${fx.va(va)}`),
      h('div', { class: 'binary__bits' },
        h('div', { class: 'bitrow', style: `--cols:${g.vaBits}` },
          vaBits,
          span(g.vpnBits, 'bitlabel--vpn', `VPN ${fx.vpn(f.vpn)}`),
          span(g.offsetBits, 'bitlabel--off', `Offset ${fx.offset(f.offset)}`),
          span(g.tagBits, 'bitlabel--tag', `Tag ${fx.tag(f.tag)}`),
          span(g.indexBits, 'bitlabel--idx', `Índice ${fx.index(f.index)}`),
          span(g.offsetBits, 'bitlabel--blank', ''))),
      hasPa ? h('span', { class: 'binary__caption' }, `Dirección física ${result.pa} = ${fx.pa(result.pa)}`) : null,
      hasPa ? h('div', { class: 'binary__bits' }, paRow) : null,
    ].filter(Boolean));

    const fieldCard = (kind, name, value, bits, pending = false) => h('div', { class: cx('field-card', `field-card--${kind}`, pending && 'is-pending') },
      h('span', { class: 'field-card__name' }, name),
      h('span', { class: 'field-card__value' }, value),
      h('span', { class: 'field-card__bits' }, bits));
    this.fieldCards.replaceChildren(
      fieldCard('vpn', 'VPN', fx.vpn(f.vpn), `${g.vpnBits} bits`),
      fieldCard('tag', 'Tag TLB', fx.tag(f.tag), `${g.tagBits} bits`),
      fieldCard('idx', 'Índice TLB', fx.index(f.index), `${g.indexBits} bits`),
      fieldCard('off', 'Offset', fx.offset(f.offset), `${g.offsetBits} bits`),
      fieldCard('ppn', 'PPN', result?.ppn !== null && result?.ppn !== undefined ? fx.ppn(result.ppn) : 'Pendiente', `${g.ppnBits} bits`, !hasPa));
  }
}
