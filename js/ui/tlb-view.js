/** Vista de la TLB asociativa por conjuntos: campos V, D, R, W, E, T y PPN. */
import { h, cx, bitCell } from './dom.js';

export class TlbView {
  constructor(root, { session }) {
    this.root = root;
    this.session = session;
  }

  mount() {
    this.meta = h('p', { class: 'panel__meta' });
    this.body = h('tbody');
    this.root.replaceChildren(
      h('header', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, 'TLB'), this.meta),
      h('div', { class: 'panel__body' }, h('div', { class: 'table-wrap' },
        h('table', { class: 'grid-table' },
          h('thead', {}, h('tr', {},
            ['Conj.', 'Vía', 'V', 'D', 'R', 'W', 'E', 'T (tag)', 'PPN', 'VPN'].map((c) => h('th', { scope: 'col' }, c)))),
          this.body))));
  }

  render() {
    const s = this.session;
    const g = s.geometry;
    const fx = s.format;
    const focus = s.focus;
    this.meta.textContent = `${g.tlbSize} entradas · ${g.tlbWays} vía(s) · ${g.tlbSets} conjunto(s) · tag de ${g.tagBits} bits`;

    const rows = [];
    s.system.state.tlb.forEach((set, si) => {
      set.forEach((e, wi) => {
        rows.push(h('tr', {
          class: cx(
            wi === 0 && 'set-start',
            !e.valid && 'is-empty',
            focus.has(`tlbset:${si}`) && 'is-soft',
            focus.has(`tlb:${si}:${wi}`) && 'is-focus'),
        },
          wi === 0 ? h('th', { scope: 'row', rowspan: g.tlbWays, class: 'set-label' }, fx.index(si)) : null,
          h('td', { class: 'muted' }, String(wi)),
          bitCell(e.valid), bitCell(e.dirty), bitCell(e.r), bitCell(e.w), bitCell(e.e),
          h('td', { class: 'mono field-tag' }, e.valid ? fx.tag(e.tag) : '–'),
          h('td', { class: 'mono field-ppn' }, e.valid ? fx.ppn(e.ppn) : '–'),
          h('td', { class: 'mono muted' }, e.valid ? fx.vpn(e.vpn) : '–')));
      });
    });
    this.body.replaceChildren(...rows);
  }
}
