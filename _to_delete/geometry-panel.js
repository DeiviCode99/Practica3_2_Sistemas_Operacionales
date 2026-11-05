/** Valores calculados a partir de la configuración, con su fórmula (5.1 y 5.2). */
import { h, panelHead } from './dom.js';

export class GeometryPanel {
  constructor(root, { session }) {
    this.root = root;
    this.session = session;
  }

  mount() {
    this.list = h('dl', { class: 'calc' });
    this.root.replaceChildren(panelHead('Cálculos', 'Derivados de los parámetros'), this.list);
  }

  render() {
    const g = this.session.geometry;
    const rows = [
      ['Memoria virtual', `${g.vmSize.toLocaleString('es-CO')} B`, `2^${g.vaBits}`],
      ['Páginas virtuales', g.pages, `${g.vmSize} / ${g.pageSize}`],
      ['Frames físicos', g.frames, `${g.pmSize} / ${g.pageSize}`],
      ['Entradas tabla de páginas', g.pageTableEntries, '1 por página'],
      ['Bits de VPN', g.vpnBits, `${g.vaBits} − ${g.offsetBits}`],
      ['Bits de offset', g.offsetBits, `log₂ ${g.pageSize}`],
      ['Bits de PPN', g.ppnBits, `log₂ ${g.frames}`],
      ['Bits de dirección física', g.paBits, `log₂ ${g.pmSize}`],
      ['Conjuntos de la TLB', g.tlbSets, `${g.tlbSize} / ${g.tlbWays}`],
      ['Bits de índice TLB', g.indexBits, `log₂ ${g.tlbSets}`],
      ['Bits de tag TLB', g.tagBits, `${g.vpnBits} − ${g.indexBits}`],
    ];
    this.list.replaceChildren(...rows.map(([label, value, formula]) =>
      h('div', { class: 'calc__row' },
        h('dt', {}, label),
        h('dd', {}, h('span', { class: 'calc__value' }, String(value)), h('span', { class: 'calc__formula' }, formula)))));
  }
}
