/**
 * Tabla de páginas: VPN, V, D, R, W, E, PPN y SSN.
 * Los bits R/W/E se pueden cambiar con un clic (mejora sobre CS351, donde
 * los permisos se marcan al azar sin control del usuario).
 */
import { h, cx, bitCell } from './dom.js';

export class PageTableView {
  constructor(root, { session, guard }) {
    this.root = root;
    this.session = session;
    this.guard = guard;
    this.onlyAllocated = false;
  }

  mount() {
    this.meta = h('p', { class: 'panel__meta' });
    this.filter = h('input', {
      type: 'checkbox', id: 'pt-filter',
      onchange: (e) => { this.onlyAllocated = e.target.checked; this.render(); },
    });
    this.body = h('tbody');
    this.root.replaceChildren(
      h('header', { class: 'panel__head' },
        h('h2', { class: 'panel__title' }, 'Tabla de páginas'), this.meta,
        h('label', { class: 'check', for: this.filter.id }, this.filter, 'Solo asignadas')),
      h('div', { class: 'panel__body' },
        h('div', { class: 'table-wrap table-wrap--tall' },
          h('table', { class: 'grid-table' },
            h('thead', {}, h('tr', {},
              ['VPN', 'V', 'D', 'R', 'W', 'E', 'PPN', 'SSN', ''].map((c) => h('th', { scope: 'col' }, c)))),
            this.body)),
        h('p', { class: 'hint' }, 'Pulsa R, W o E en una página asignada para cambiar su permiso.')),
    );
    this.root.addEventListener('click', this.guard((e) => this.#onClick(e)));
  }

  render() {
    const s = this.session;
    const g = s.geometry;
    const fx = s.format;
    const focus = s.focus;
    const busy = s.busy;
    const c = s.system.counts();
    this.meta.textContent = `${g.pageTableEntries} entradas · ${c.allocated} asignadas`;

    const rows = [];
    for (const pte of s.system.state.pageTable) {
      if (this.onlyAllocated && !pte.allocated) continue;
      const v = pte.vpn;
      const cls = cx(
        !pte.allocated && 'is-empty',
        s.selectedVpn === v && 'is-selected',
        focus.has(`pt:${v}`) && 'is-focus');
      if (!pte.allocated) {
        rows.push(h('tr', { class: cls },
          h('th', { scope: 'row', class: 'mono' }, h('button', { class: 'link', dataset: { select: v } }, fx.vpn(v))),
          h('td', { colspan: 7, class: 'muted' }, 'sin asignar'),
          h('td', {}, h('button', { class: 'btn btn--tiny', dataset: { allocate: v }, disabled: busy }, 'Asignar'))));
        continue;
      }
      const perm = (bit) => h('td', {},
        h('button', {
          class: cx('bit-toggle', pte[bit] && 'is-on'),
          dataset: { toggle: bit, vpn: v },
          'aria-pressed': String(pte[bit]),
          'aria-label': `${bit.toUpperCase()} de la página ${fx.vpn(v)}`,
          disabled: busy,
        }, pte[bit] ? '1' : '0'));
      rows.push(h('tr', { class: cls },
        h('th', { scope: 'row', class: 'mono' }, h('button', { class: 'link', dataset: { select: v } }, fx.vpn(v))),
        bitCell(pte.valid), bitCell(pte.dirty), perm('r'), perm('w'), perm('e'),
        h('td', { class: 'mono field-ppn' }, pte.valid ? fx.ppn(pte.ppn) : '–'),
        h('td', { class: 'mono field-swap' }, pte.valid ? '–' : fx.ssn(pte.ssn)),
        h('td', {})));
    }
    this.body.replaceChildren(...rows);
    this.filter.checked = this.onlyAllocated;
  }

  #onClick(e) {
    const btn = e.target.closest('button');
    if (!btn || !this.root.contains(btn)) return;
    const s = this.session;
    if (btn.dataset.allocate) s.allocate(Number(btn.dataset.allocate));
    else if (btn.dataset.toggle) s.togglePermission(Number(btn.dataset.vpn), btn.dataset.toggle);
    else if (btn.dataset.select) s.selectPage(Number(btn.dataset.select));
  }
}
