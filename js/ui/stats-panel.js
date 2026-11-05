/** Panel "Estadísticas y rendimiento". */
import { h, cx, panelHead } from './dom.js';

export class StatsPanel {
  constructor(root, { session }) {
    this.root = root;
    this.session = session;
  }

  mount() {
    this.grid = h('div', { class: 'stats-grid' });
    this.root.replaceChildren(panelHead('Estadísticas y rendimiento'), h('div', { class: 'panel__body' }, this.grid));
  }

  render() {
    const st = this.session.system.state.stats;
    const accesses = st.reads + st.writes;
    const lookups = st.tlbHits + st.tlbMisses;
    const ptLookups = st.ptHits + st.pageFaults;
    const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '0%');
    const tiles = [
      ['Accesos', accesses, '', `${st.reads} lecturas · ${st.writes} escrituras`],
      ['Aciertos TLB', st.tlbHits, 'ok'],
      ['Fallos TLB', st.tlbMisses, 'bad'],
      ['Tasa de acierto TLB', pct(st.tlbHits, lookups), 'ok'],
      ['Aciertos tabla de páginas', st.ptHits, 'ok'],
      ['Fallos de página', st.pageFaults, 'bad', ptLookups ? `${pct(st.pageFaults, ptLookups)} de las consultas` : ''],
      ['Reemplazos', st.replacements, ''],
      ['Fallos de segmento', st.segFaults, 'warn'],
      ['Violaciones de protección', st.protectionFaults, 'warn'],
    ];
    this.grid.replaceChildren(...tiles.map(([label, value, tone, note]) => h('div', { class: cx('stat', tone && `stat--${tone}`) },
      h('span', { class: 'stat__label' }, label),
      h('span', { class: 'stat__value' }, String(value)),
      note ? h('span', { class: 'stat__note' }, note) : null)));
  }
}
