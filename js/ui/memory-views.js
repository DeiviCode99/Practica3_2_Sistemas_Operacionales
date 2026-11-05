/** Vistas de memoria principal, memoria virtual y swap. */
import { h, cx, byteText } from './dom.js';
import { virtualAddressOf } from '../core/config.js';

function offsetHeader(pageSize) {
  return Array.from({ length: pageSize }, (_, i) => h('th', { scope: 'col', class: 'byte-head' }, i.toString(16).toUpperCase()));
}

/* ---------------- Memoria principal ---------------- */

export class PhysicalMemoryView {
  constructor(root, { session }) {
    this.root = root;
    this.session = session;
  }

  mount() {
    this.meta = h('p', { class: 'panel__meta' });
    this.table = h('table', { class: 'grid-table bytes-table' });
    this.root.replaceChildren(
      h('header', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, 'Memoria principal (RAM)'), this.meta),
      h('div', { class: 'panel__body' }, h('div', { class: 'table-wrap table-wrap--tall' }, this.table)));
  }

  render() {
    const s = this.session;
    const g = s.geometry;
    const fx = s.format;
    const st = s.system.state;
    const focus = s.focus;
    const used = st.frames.filter(Boolean).length;
    this.meta.textContent = `${g.pmSize} B · ${g.frames} frames de ${g.pageSize} B · ${used} ocupados`;

    const rows = st.frames.map((frame, ppn) => {
      const base = ppn * g.pageSize;
      const bytes = Array.from({ length: g.pageSize }, (_, i) => h('td', {
        class: cx('byte', focus.has(`byte:${base + i}`) && 'is-focus'),
        title: `PA ${fx.pa(base + i)}`,
      }, frame ? byteText(st.memory[base + i]) : '··'));
      return h('tr', { class: cx(!frame && 'is-empty', focus.has(`frame:${ppn}`) && 'is-soft') },
        h('th', { scope: 'row', class: 'mono field-ppn' }, fx.ppn(ppn)),
        h('td', { class: 'mono' }, frame ? fx.vpn(frame.vpn) : 'libre'),
        bytes);
    });
    this.table.replaceChildren(
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'PPN'), h('th', { scope: 'col' }, 'VPN'), offsetHeader(g.pageSize))),
      h('tbody', {}, rows));
  }
}

/* ---------------- Memoria virtual ---------------- */

export class VirtualMemoryView {
  constructor(root, { session, guard }) {
    this.root = root;
    this.session = session;
    this.guard = guard;
  }

  mount() {
    this.meta = h('p', { class: 'panel__meta' });
    this.map = h('div', { class: 'page-map', role: 'list' });
    this.detail = h('div', { class: 'page-detail' });
    this.root.replaceChildren(
      h('header', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, 'Memoria virtual'), this.meta),
      h('div', { class: 'panel__body' },
        h('div', { class: 'legend' },
          h('span', { class: 'legend__item legend__item--free' }, 'Sin asignar (clic para asignar)'),
          h('span', { class: 'legend__item legend__item--mm' }, 'En memoria principal'),
          h('span', { class: 'legend__item legend__item--swap' }, 'En swap')),
        h('div', { class: 'page-map-wrap' }, this.map),
        this.detail));
    this.map.addEventListener('click', this.guard((e) => {
      const tile = e.target.closest('[data-vpn]');
      if (!tile) return;
      const vpn = Number(tile.dataset.vpn);
      if (this.session.system.state.pageTable[vpn].allocated) this.session.selectPage(vpn);
      else this.session.allocate(vpn);
    }));
  }

  render() {
    const s = this.session;
    const g = s.geometry;
    const fx = s.format;
    const focus = s.focus;
    this.meta.textContent = `${g.vmSize.toLocaleString('es-CO')} B · ${g.pages} páginas de ${g.pageSize} B`;

    const tiles = s.system.state.pageTable.map((pte) => {
      const v = pte.vpn;
      const state = !pte.allocated ? 'free' : pte.valid ? 'mm' : 'swap';
      const where = state === 'free' ? 'libre' : state === 'mm' ? `PPN ${fx.ppn(pte.ppn)}` : `SSN ${fx.ssn(pte.ssn)}`;
      const start = virtualAddressOf(g, v);
      return h('button', {
        class: cx('tile', `tile--${state}`, s.selectedVpn === v && 'is-selected', (focus.has(`vpage:${v}`) || focus.has(`pt:${v}`)) && 'is-focus'),
        dataset: { vpn: v },
        role: 'listitem',
        title: `VA ${fx.va(start)}–${fx.va(start + g.pageSize - 1)} · ${where}`,
        disabled: s.busy && state === 'free',
      }, h('span', { class: 'tile__vpn' }, fx.vpn(v)), h('span', { class: 'tile__where' }, where));
    });
    this.map.replaceChildren(...tiles);
    this.#renderDetail();
  }

  #renderDetail() {
    const s = this.session;
    const g = s.geometry;
    const fx = s.format;
    const vpn = s.selectedVpn;
    if (vpn === null || vpn >= g.pages) {
      this.detail.replaceChildren(h('p', { class: 'hint' }, 'Selecciona una página asignada para ver su contenido.'));
      return;
    }
    const pte = s.system.state.pageTable[vpn];
    const start = virtualAddressOf(g, vpn);
    const title = h('h3', { class: 'card__title' }, `Página ${fx.vpn(vpn)} · VA ${fx.va(start)} – ${fx.va(start + g.pageSize - 1)}`);
    if (!pte.allocated) {
      this.detail.replaceChildren(title, h('p', { class: 'hint' }, 'Página sin asignar: un acceso aquí produce fallo de segmento.'));
      return;
    }
    const data = s.system.readPage(vpn);
    const perms = ['r', 'w', 'e'].map((b) => `${b.toUpperCase()}=${pte[b] ? 1 : 0}`).join(' ');
    const where = pte.valid ? `en el frame ${fx.ppn(pte.ppn)}` : `en swap, sector ${fx.ssn(pte.ssn)}`;
    this.detail.replaceChildren(
      title,
      h('p', { class: 'muted' }, `Está ${where} · ${perms} · D=${pte.dirty ? 1 : 0}`),
      h('div', { class: 'table-wrap' },
        h('table', { class: 'grid-table bytes-table' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Offset'), offsetHeader(g.pageSize))),
          h('tbody', {}, h('tr', {}, h('th', { scope: 'row' }, 'Byte'),
            Array.from(data, (b) => h('td', { class: 'byte' }, byteText(b))))))));
  }
}

/* ---------------- Swap ---------------- */

export class SwapView {
  constructor(root, { session }) {
    this.root = root;
    this.session = session;
  }

  mount() {
    this.meta = h('p', { class: 'panel__meta' });
    this.content = h('div', { class: 'table-wrap table-wrap--tall' });
    this.root.replaceChildren(
      h('header', { class: 'panel__head' }, h('h2', { class: 'panel__title' }, 'Swap (disco)'), this.meta),
      h('div', { class: 'panel__body' }, this.content));
  }

  render() {
    const s = this.session;
    const g = s.geometry;
    const fx = s.format;
    const focus = s.focus;
    const sectors = s.system.state.swap
      .map((entry, ssn) => ({ entry, ssn }))
      .filter(({ entry, ssn }) => entry || focus.has(`swap:${ssn}`));
    this.meta.textContent = `${sectors.filter((x) => x.entry).length} sectores ocupados de ${g.swapSectors}`;

    if (sectors.length === 0) {
      this.content.replaceChildren(h('p', { class: 'empty' },
        'Sin páginas en swap. Se usa cuando asignas más páginas que frames disponibles.'));
      return;
    }
    const rows = sectors.map(({ entry, ssn }) => h('tr', { class: cx(!entry && 'is-empty', focus.has(`swap:${ssn}`) && 'is-focus') },
      h('th', { scope: 'row', class: 'mono field-swap' }, fx.ssn(ssn)),
      h('td', { class: 'mono' }, entry ? fx.vpn(entry.vpn) : 'libre'),
      entry ? Array.from(entry.data, (b) => h('td', { class: 'byte' }, byteText(b)))
        : h('td', { colspan: g.pageSize, class: 'muted' }, 'sector liberado')));
    this.content.replaceChildren(h('table', { class: 'grid-table bytes-table' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'SSN'), h('th', { scope: 'col' }, 'VPN'), offsetHeader(g.pageSize))),
      h('tbody', {}, rows)));
  }
}
