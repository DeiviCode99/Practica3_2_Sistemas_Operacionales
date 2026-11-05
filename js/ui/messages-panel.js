/**
 * Panel "Mensajes de simulación": bitácora de lo que hace el sistema.
 * Cada acceso agrupa sus pasos explicados; el más reciente queda arriba.
 */
import { h, cx, panelHead } from './dom.js';

const time = (date) => date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export class MessagesPanel {
  constructor(root, { session, guard }) {
    this.root = root;
    this.session = session;
    this.guard = guard;
  }

  mount() {
    this.list = h('ol', { class: 'messages', 'aria-live': 'polite' });
    this.root.replaceChildren(
      panelHead('Mensajes de simulación', null,
        h('button', { class: 'btn btn--light', type: 'button', id: 'btn-clear-messages', onclick: this.guard(() => this.session.clearMessages()) }, 'Limpiar')),
      h('div', { class: 'panel__body' }, this.list));
  }

  render() {
    const s = this.session;
    if (s.messages.length === 0) {
      this.list.replaceChildren(h('li', { class: 'empty' }, 'Sin mensajes. Haz un acceso para ver la explicación aquí.'));
      return;
    }
    this.list.replaceChildren(...s.messages.map((m) => {
      const live = s.busy && m.steps === s.steps;
      return h('li', { class: cx('message', `message--${m.tone}`, live && 'is-live') },
        h('div', { class: 'message__head' },
          h('span', { class: 'message__title' }, m.title),
          h('span', { class: 'message__time' }, time(m.at))),
        m.detail ? h('p', { class: 'message__detail' }, m.detail) : null,
        m.steps.length ? h('ol', { class: 'steps' }, m.steps.map((st, i) => h('li', {
          class: cx('step', `step--${st.tone}`, live && i === m.steps.length - 1 && 'is-current'),
        }, h('strong', {}, st.title), h('span', {}, st.detail)))) : null);
    }));
  }
}
