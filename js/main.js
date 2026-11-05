/**
 * Punto de entrada: crea la sesión, monta las vistas y las conecta.
 * Flujo de datos en una sola dirección:
 *   vista → acción en SimulationSession → evento "change" → render() de todas las vistas.
 */
import { SimulationSession } from './app/session.js';
import { Toast } from './ui/toast.js';
import { ConfigPanel } from './ui/config-panel.js';
import { AccessPanel } from './ui/access-panel.js';
import { MessagesPanel } from './ui/messages-panel.js';
import { StatsPanel } from './ui/stats-panel.js';
import { TlbView } from './ui/tlb-view.js';
import { PageTableView } from './ui/page-table-view.js';
import { PhysicalMemoryView, VirtualMemoryView, SwapView } from './ui/memory-views.js';
import { ToolsPanel } from './ui/tools-panel.js';
import { HelpDialog } from './ui/help-dialog.js';

const byId = (id) => document.getElementById(id);

const session = new SimulationSession();
const toast = new Toast(byId('toast'));

/** Envuelve un manejador para mostrar los errores al usuario en lugar de perderlos en la consola. */
const guard = (fn) => (...args) => {
  try {
    const out = fn(...args);
    if (out instanceof Promise) out.catch((err) => toast.show(err.message, 'bad'));
    return out;
  } catch (err) {
    toast.show(err.message, 'bad');
    if (!(err instanceof RangeError) && err.name !== 'ConfigError') console.error(err);
    return undefined;
  }
};

const ctx = { session, guard, toast };

const views = [
  new ConfigPanel(byId('config-panel'), ctx),
  new AccessPanel(byId('access-panel'), ctx),
  new MessagesPanel(byId('messages-panel'), ctx),
  new TlbView(byId('tlb-view'), ctx),
  new PageTableView(byId('pt-view'), ctx),
  new VirtualMemoryView(byId('vm-view'), ctx),
  new PhysicalMemoryView(byId('pm-view'), ctx),
  new SwapView(byId('swap-view'), ctx),
  new StatsPanel(byId('stats-panel'), ctx),
  new ToolsPanel(byId('tools-panel'), ctx),
  new HelpDialog(byId('help-dialog'), byId('btn-help')),
];

views.forEach((v) => v.mount());
const renderAll = () => views.forEach((v) => v.render());

byId('btn-header-reset').addEventListener('click', guard(() => session.reset()));
session.addEventListener('change', renderAll);
session.addEventListener('notice', (e) => toast.show(e.detail.text, e.detail.tone));

renderAll();
