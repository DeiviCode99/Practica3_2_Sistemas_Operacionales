/**
 * Pestañas inferiores: historial de accesos (tablas de 5.3, 5.5 y 5.6)
 * y comparación de políticas de reemplazo (tabla de 5.4).
 */
import { h, cx, copyText } from './dom.js';

const PT_LABELS = { hit: 'Acierto', fault: 'Fallo de página', unallocated: 'No asignada' };
const OUTCOME_LABELS = { segfault: 'Fallo de segmento', protection: 'Violación de protección' };

/* ---------- formato de filas (compartido por tabla y copia TSV) ---------- */

function locationText(fx, e) {
  if (e.outcome === 'segfault') return '—';
  if (e.ppn === null) return e.ssnBefore !== null ? `SSN ${fx.ssn(e.ssnBefore)}` : '—';
  if (e.ssnBefore !== null) return `SSN ${fx.ssn(e.ssnBefore)} → PPN ${fx.ppn(e.ppn)}`;
  return `PPN ${fx.ppn(e.ppn)}`;
}

function outcomeText(fx, e) {
  if (e.outcome !== 'ok') return OUTCOME_LABELS[e.outcome];
  return e.type === 'read' ? `Leído ${fx.byte(e.value)}` : `Escrito ${fx.byte(e.value)}`;
}

function historyColumns(fx) {
  return [
    ['#', (e) => e.n],
    ['Op.', (e) => (e.type === 'read' ? 'Lectura' : 'Escritura')],
    ['VA (dec)', (e) => e.va],
    ['VA (hex)', (e) => fx.va(e.va)],
    ['VPN', (e) => fx.vpn(e.vpn)],
    ['Offset', (e) => fx.offset(e.offset)],
    ['TLB tag', (e) => fx.tag(e.tag)],
    ['TLB índice', (e) => fx.index(e.index)],
    ['TLB', (e) => (e.tlb === 'hit' ? 'Acierto' : 'Fallo')],
    ['Tabla', (e) => PT_LABELS[e.pt] ?? '—'],
    ['PPN/SSN', (e) => locationText(fx, e)],
    ['Reemplazo', (e) => (e.replaced ? `VPN ${fx.vpn(e.replaced.vpn)} → SSN ${fx.ssn(e.replaced.ssn)}` : '—')],
    ['Seg. fault', (e) => (e.outcome === 'segfault' ? 'SÍ' : 'NO')],
    ['Resultado', (e) => outcomeText(fx, e)],
  ];
}

function toTsv(header, rows) {
  return [header, ...rows].map((r) => r.join('\t')).join('\n');
}

/* ---------- Historial ---------- */

class HistoryTab {
  constructor({ session, guard, toast }) {
    this.session = session;
    this.guard = guard;
    this.toast = toast;
    this.element = h('div', { class: 'tab-panel panel__body' });
  }

  mount() {
    this.table = h('div', { class: 'table-wrap table-wrap--tall' });
    this.element.replaceChildren(
      h('div', { class: 'toolbar' },
        h('p', { class: 'muted' }, 'Cada acceso queda registrado con las columnas de las tablas de la práctica.'),
        h('div', { class: 'button-row' },
          h('button', { class: 'btn btn--light', type: 'button', onclick: () => this.#copy() }, '📥 Copiar tabla'),
          h('button', { class: 'btn btn--light', type: 'button', onclick: this.guard(() => this.session.clearHistory()) }, 'Limpiar'))),
      this.table);
  }

  render() {
    const s = this.session;
    if (s.history.length === 0) {
      this.table.replaceChildren(h('p', { class: 'empty' }, 'No hay operaciones registradas.'));
      return;
    }
    const cols = historyColumns(s.format);
    const rows = [...s.history].reverse().map((e) => h('tr', { class: cx(e.outcome !== 'ok' && 'is-fault') },
      cols.map(([, get], i) => h(i === 0 ? 'th' : 'td', { class: i > 1 ? 'mono' : '' }, String(get(e))))));
    this.table.replaceChildren(h('table', { class: 'grid-table history-table' },
      h('thead', {}, h('tr', {}, cols.map(([name]) => h('th', { scope: 'col' }, name)))),
      h('tbody', {}, rows)));
  }

  async #copy() {
    const s = this.session;
    const cols = historyColumns(s.format);
    const tsv = toTsv(cols.map(([n]) => n), s.history.map((e) => cols.map(([, get]) => get(e))));
    const ok = await copyText(tsv);
    this.toast.show(ok ? 'Tabla copiada. Pégala en Excel, Sheets o Word.' : 'No se pudo copiar automáticamente.', ok ? 'ok' : 'bad');
  }
}

/* ---------- Comparación de políticas ---------- */

class CompareTab {
  constructor({ session, toast }) {
    this.session = session;
    this.toast = toast;
    this.element = h('div', { class: 'tab-panel panel__body' });
  }

  mount() {}

  render() {
    const cmp = this.session.comparison;
    if (!cmp) {
      this.element.replaceChildren(h('p', { class: 'empty' },
        'Sin comparación todavía. En "Secuencia de accesos" pulsa "Comparar políticas". Para la tabla 5.4 asigna antes todas las páginas.'));
      return;
    }
    const fx = this.session.format;
    const { data } = cmp;
    const best = Math.min(...data.runs.map((r) => r.totals.replacements));

    const table = h('table', { class: 'grid-table compare-table' },
      h('thead', {},
        h('tr', {},
          h('th', { scope: 'col', rowspan: 2 }, 'Dirección virtual (dec)'),
          h('th', { scope: 'col', rowspan: 2 }, 'VPN'),
          data.runs.map((r) => h('th', { scope: 'colgroup', colspan: 2, class: 'group-head' }, r.policy))),
        h('tr', {}, data.runs.map(() => [h('th', { scope: 'col' }, 'PPN/SSN'), h('th', { scope: 'col' }, '# Reempl.')]))),
      h('tbody', {}, data.addresses.map((va, i) => h('tr', {},
        h('th', { scope: 'row', class: 'mono' }, String(va)),
        h('td', { class: 'mono' }, fx.vpn(data.runs[0].rows[i].vpn)),
        data.runs.map((r) => {
          const row = r.rows[i];
          return [
            h('td', { class: cx('mono', row.result.outcome === 'segfault' && 'is-bad') }, this.#cellText(row)),
            h('td', { class: cx('mono num', row.replaced && 'is-warn') }, String(row.replaced)),
          ];
        })))),
      h('tfoot', {}, h('tr', {},
        h('th', { scope: 'row', colspan: 2 }, 'TOTAL'),
        data.runs.map((r) => [
          h('td', {}, `${r.totals.pageFaults} fallos de página · ${r.totals.tlbHits} aciertos TLB`),
          h('td', { class: cx('mono num total', r.totals.replacements === best && 'is-best') }, String(r.totals.replacements)),
        ]))));

    this.element.replaceChildren(
      h('div', { class: 'toolbar' },
        h('p', { class: 'muted' }, `${data.addresses.length} lecturas desde el mismo estado inicial · en verde, la política con menos reemplazos`),
        h('button', { class: 'btn btn--light', type: 'button', onclick: () => this.#copy() }, 'Copiar tabla')),
      h('div', { class: 'table-wrap' }, table));
  }

  #cellText(row) {
    const fx = this.session.format;
    const r = row.result;
    if (r.outcome === 'segfault') return 'No asignada';
    const before = row.location.kind === 'swap' ? `SSN ${fx.ssn(row.location.ssn)} → ` : '';
    return `${before}PPN ${fx.ppn(r.ppn)}`;
  }

  async #copy() {
    const fx = this.session.format;
    const { data } = this.session.comparison;
    const header = ['VA (dec)', 'VPN', ...data.runs.flatMap((r) => [`PPN/SSN ${r.policy}`, `# Reempl. ${r.policy}`])];
    const rows = data.addresses.map((va, i) => [va, fx.vpn(data.runs[0].rows[i].vpn),
      ...data.runs.flatMap((r) => [this.#cellText(r.rows[i]), r.rows[i].replaced])]);
    rows.push(['TOTAL', '', ...data.runs.flatMap((r) => ['', r.totals.replacements])]);
    const ok = await copyText(toTsv(header, rows));
    this.toast.show(ok ? 'Tabla copiada. Pégala en Excel, Sheets o Word.' : 'No se pudo copiar automáticamente.', ok ? 'ok' : 'bad');
  }
}

/* ---------- Contenedor con pestañas ---------- */

export class ToolsPanel {
  constructor(root, ctx) {
    this.root = root;
    this.session = ctx.session;
    this.tabs = [
      { id: 'history', label: 'Historial de operaciones', view: new HistoryTab(ctx), count: () => this.session.history.length },
      { id: 'compare', label: 'Comparación de políticas de reemplazo', view: new CompareTab(ctx), count: () => this.session.comparison?.data.runs.length ?? 0 },
    ];
    this.active = 'history';
    this.lastComparison = null;
  }

  mount() {
    this.badges = this.tabs.map(() => h('span', { class: 'badge badge--neutral' }));
    this.buttons = this.tabs.map((t, i) => h('button', {
      class: 'tab', type: 'button', role: 'tab', id: `tab-${t.id}`, 'aria-controls': `tabpanel-${t.id}`,
      onclick: () => { this.active = t.id; this.render(); },
    }, t.label, this.badges[i]));
    this.tabs.forEach((t) => {
      t.view.mount();
      t.view.element.id = `tabpanel-${t.id}`;
      t.view.element.setAttribute('role', 'tabpanel');
      t.view.element.setAttribute('aria-labelledby', `tab-${t.id}`);
    });
    this.root.replaceChildren(
      h('div', { class: 'tabs', role: 'tablist' }, this.buttons),
      ...this.tabs.map((t) => t.view.element));
  }

  render() {
    const cmp = this.session.comparison;
    if (cmp && cmp.id !== this.lastComparison) this.active = 'compare';
    this.lastComparison = cmp?.id ?? null;
    this.tabs.forEach((t, i) => {
      const on = t.id === this.active;
      this.buttons[i].setAttribute('aria-selected', String(on));
      this.badges[i].textContent = String(t.count());
      t.view.element.hidden = !on;
      t.view.render();
    });
  }
}
