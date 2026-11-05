/** Diálogo de ayuda: qué hace cada parte y cómo resolver cada sección de la guía. */
import { h, panelHead } from './dom.js';

const GUIDE = [
  ['5.1 Configuración', 'Cambia los parámetros y pulsa "Generar sistema". El "Resumen del sistema" muestra la capacidad de la memoria virtual, el número de páginas y frames, y los bits de cada campo.'],
  ['5.2 Lectura y escritura', 'Usa "Práctica 5.2 – 5.6". En "Memoria virtual" pulsa la página 0x00 para asignarla y observa su PPN en la tabla de páginas.'],
  ['5.3 Mapeo completo', 'Pulsa "Asignar todas" y luego "Ejecutar secuencia". El historial tiene la tabla completa.'],
  ['5.4 Políticas de reemplazo', 'Con todas las páginas asignadas, pulsa "Comparar políticas". La tabla muestra los reemplazos de LRU, FIFO y aleatoria.'],
  ['5.5 Mapeo incompleto', 'Pulsa "Reiniciar", asigna 10 páginas al azar y ejecuta la secuencia. La columna "Seg. fault" indica SÍ/NO.'],
  ['5.6 Protección', 'Asigna todas las páginas y busca en la tabla de páginas las que tienen W = 0. Para escribir en la página VPN usa la dirección VPN × tamaño de página (VPN 0x07 → 0x70 con páginas de 16 B).'],
];

export class HelpDialog {
  constructor(dialog, opener) {
    this.dialog = dialog;
    this.opener = opener;
  }

  mount() {
    const close = h('button', { class: 'btn btn--light', type: 'button', onclick: () => this.dialog.close() }, 'Cerrar');
    this.dialog.replaceChildren(
      panelHead('Cómo usar el simulador', null, close),
      h('div', { class: 'help__body' },
        h('h3', {}, 'Flujo de un acceso'),
        h('ol', {},
          h('li', {}, 'La dirección virtual se divide en VPN y offset; la VPN, en tag e índice de la TLB.'),
          h('li', {}, 'Se busca el tag en el conjunto indicado por el índice. Si está, es un acierto en la TLB.'),
          h('li', {}, 'Si no, se consulta la tabla de páginas: página sin asignar → fallo de segmento; permiso insuficiente → violación de protección; V = 0 → fallo de página.'),
          h('li', {}, 'En un fallo de página la página se trae desde swap. Si no hay frames libres, la política elige una víctima que pasa a swap.'),
          h('li', {}, 'La traducción se guarda en la TLB y se lee o escribe el byte en la dirección física PPN | offset.')),
        h('h3', {}, 'Guía de la práctica'),
        h('ul', {}, GUIDE.map(([title, text]) => h('li', {}, h('strong', {}, `${title}: `), text))),
        h('h3', {}, 'Colores de los campos'),
        h('p', { class: 'hint' }, 'VPN en ámbar, tag en morado, índice en azul, offset en verde y PPN en cian, igual en la descomposición y en las tablas. El amarillo marca lo que se consulta en el paso actual.')));
    this.opener.addEventListener('click', () => this.dialog.showModal());
    this.dialog.addEventListener('click', (e) => { if (e.target === this.dialog) this.dialog.close(); });
  }

  render() {}
}
