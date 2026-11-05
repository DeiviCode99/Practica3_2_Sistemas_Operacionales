/**
 * Panel "Parámetros del sistema": configuración de memoria, políticas,
 * configuración rápida de la práctica y resumen calculado (5.1 y 5.2).
 */
import { h, panelHead, card, field } from './dom.js';
import { PARAMETER_OPTIONS } from '../core/config.js';
import { POLICIES } from '../core/policies.js';
import { PROTECTION_MODES } from '../core/mmu.js';
import { PRACTICE_CONFIG } from '../app/practice.js';

const PARAMS = [
  { key: 'vaBits', label: 'Bus de direcciones virtuales (n)', unit: 'bits' },
  { key: 'pageSize', label: 'Tamaño de página (P)', unit: 'bytes' },
  { key: 'tlbSize', label: 'Tamaño de la TLB', unit: 'entradas' },
  { key: 'tlbWays', label: 'Asociatividad de la TLB (E)', unit: 'vía(s)' },
  { key: 'pmSize', label: 'Memoria principal (M)', unit: 'bytes' },
];

export class ConfigPanel {
  constructor(root, { session, guard }) {
    this.root = root;
    this.session = session;
    this.guard = guard;
    this.inputs = {};
  }

  mount() {
    const s = this.session;

    const params = PARAMS.map((p) => {
      const select = h('select', { id: `cfg-${p.key}`, name: p.key },
        PARAMETER_OPTIONS[p.key].map((v) => h('option', { value: v }, `${v} ${p.unit}`)));
      this.inputs[p.key] = select;
      return field(select, p.label);
    });

    const select = (id, registry, option) => h('select', {
      id, onchange: this.guard((e) => s.setOption(option, e.target.value)),
    }, Object.values(registry).map((item) => h('option', { value: item.id }, item.label)));

    this.inputs.pagePolicy = select('cfg-page-policy', POLICIES, 'pagePolicy');
    this.inputs.tlbPolicy = select('cfg-tlb-policy', POLICIES, 'tlbPolicy');
    this.inputs.protection = select('cfg-protection', PROTECTION_MODES, 'protection');
    this.inputs.seed = h('input', {
      id: 'cfg-seed', type: 'number', min: 0, step: 1, inputmode: 'numeric', class: 'mono',
      onchange: this.guard((e) => s.setOption('seed', Number(e.target.value))),
    });

    this.summary = h('div', { class: 'summary-grid' });
    this.summaryBadge = h('span', { class: 'badge badge--ok' });

    this.generate = h('button', { class: 'btn btn--primary btn--block btn--lg', type: 'submit', id: 'btn-generate' }, '⚡ Generar sistema');

    const form = h('form', {
      class: 'panel__body',
      onsubmit: this.guard((e) => {
        e.preventDefault();
        s.build(this.#readConfig());
      }),
    },
      card({ title: 'Configuración de memoria', className: 'card--soft', note: 'Parámetros de la memoria virtual, la memoria principal y la TLB.' },
        h('div', { class: 'form-grid' }, params, field(this.inputs.seed, 'Semilla aleatoria'))),
      card({ title: 'Políticas y protección', note: 'Se aplican de inmediato, sin regenerar el sistema.' },
        h('div', { class: 'form-grid' },
          field(this.inputs.pagePolicy, 'Reemplazo de páginas', 'Memoria principal'),
          field(this.inputs.tlbPolicy, 'Reemplazo en la TLB', 'Dentro de cada conjunto'),
          field(this.inputs.protection, 'Permisos al asignar', 'Bits R / W / E de cada página'))),
      card({ title: 'Configuración rápida' },
        h('button', {
          class: 'btn btn--outline btn--block', type: 'button', id: 'btn-practice',
          onclick: this.guard(() => s.build(PRACTICE_CONFIG)),
        }, 'Práctica 5.2 – 5.6 (10 bits · 16 B · TLB 4×2 · 256 B)')),
      card({ title: 'Resumen del sistema', className: 'card--summary', extra: this.summaryBadge }, this.summary),
      this.generate);

    this.root.replaceChildren(panelHead('Parámetros del sistema'), form);
  }

  render() {
    const s = this.session;
    const g = s.geometry;
    for (const p of PARAMS) this.inputs[p.key].value = String(s.config[p.key]);
    this.inputs.pagePolicy.value = s.options.pagePolicy;
    this.inputs.tlbPolicy.value = s.options.tlbPolicy;
    this.inputs.protection.value = s.options.protection;
    if (document.activeElement !== this.inputs.seed) this.inputs.seed.value = String(s.options.seed);
    for (const el of this.root.querySelectorAll('select, input, button')) el.disabled = s.busy;

    this.summaryBadge.textContent = `${g.vaBits} bits · ${g.pageSize} B`;
    const tiles = [
      ['Memoria virtual', `${g.vmSize} B`, `2^${g.vaBits}`],
      ['Páginas', g.pages, `${g.vmSize}/${g.pageSize}`],
      ['Frames', g.frames, `${g.pmSize}/${g.pageSize}`],
      ['Bits VPN', g.vpnBits, `${g.vaBits}−${g.offsetBits}`],
      ['Bits offset', g.offsetBits, `log₂ ${g.pageSize}`],
      ['Bits PPN', g.ppnBits, `log₂ ${g.frames}`],
      ['Conjuntos TLB', g.tlbSets, `${g.tlbSize}/${g.tlbWays}`],
      ['Bits índice', g.indexBits, `log₂ ${g.tlbSets}`],
      ['Bits tag', g.tagBits, `${g.vpnBits}−${g.indexBits}`],
    ];
    this.summary.replaceChildren(...tiles.map(([label, value, formula]) => h('div', { class: 'summary-tile' },
      h('span', { class: 'summary-tile__label' }, label),
      h('span', { class: 'summary-tile__value' }, String(value)),
      h('span', { class: 'summary-tile__formula' }, formula))));
  }

  #readConfig() {
    return Object.fromEntries(PARAMS.map((p) => [p.key, Number(this.inputs[p.key].value)]));
  }
}
