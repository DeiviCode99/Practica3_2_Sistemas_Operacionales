/** Asignación de páginas: individual (desde las vistas) o aleatoria en lote. */
import { h, panelHead } from './dom.js';

export class AllocationPanel {
  constructor(root, { session, guard }) {
    this.root = root;
    this.session = session;
    this.guard = guard;
  }

  mount() {
    const s = this.session;
    this.summary = h('div', { class: 'alloc-summary' });
    this.count = h('input', { id: 'alloc-count', type: 'number', min: 1, step: 1, value: 10, inputmode: 'numeric' });
    this.randomBtn = h('button', {
      class: 'btn', type: 'button', id: 'btn-alloc-n',
      onclick: this.guard(() => {
        const n = Number(this.count.value);
        if (!Number.isInteger(n) || n < 1) throw new RangeError('Indica un número de páginas mayor que cero.');
        s.allocateRandom(n);
      }),
    }, 'Asignar al azar');
    this.allBtn = h('button', {
      class: 'btn btn--primary btn--block', type: 'button', id: 'btn-alloc-all',
      onclick: this.guard(() => s.allocateRandom(Infinity)),
    }, 'Asignar todas (orden aleatorio)');

    this.root.replaceChildren(
      panelHead('Asignación de páginas', 'Click to Allocate'),
      this.summary,
      h('div', { class: 'inline-form' },
        h('label', { class: 'visually-hidden', for: this.count.id }, 'Número de páginas'),
        this.count, h('span', { class: 'muted' }, 'páginas'), this.randomBtn),
      this.allBtn,
      h('p', { class: 'hint' }, 'También puedes asignar una página concreta pulsándola en la memoria virtual o en la tabla de páginas.'),
    );
  }

  render() {
    const s = this.session;
    const c = s.system.counts();
    const g = s.geometry;
    const item = (label, value, cls) => h('div', { class: `alloc-summary__item ${cls}` },
      h('span', { class: 'alloc-summary__value' }, String(value)), h('span', {}, label));
    this.summary.replaceChildren(
      item('asignadas', `${c.allocated}/${g.pages}`, ''),
      item('en memoria', c.inMemory, 'is-mm'),
      item('en swap', c.inSwap, 'is-swap'),
    );
    const disabled = s.busy || c.free === 0;
    this.randomBtn.disabled = disabled;
    this.allBtn.disabled = disabled;
    this.count.disabled = disabled;
  }
}
