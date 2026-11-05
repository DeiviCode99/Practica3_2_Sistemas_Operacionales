/** Mensajes breves (avisos y errores) en la parte inferior de la pantalla. */
export class Toast {
  #timer = null;

  constructor(element) {
    this.element = element;
  }

  show(text, tone = 'info') {
    this.element.textContent = text;
    this.element.dataset.tone = tone;
    this.element.hidden = false;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => { this.element.hidden = true; }, tone === 'bad' ? 6000 : 3800);
  }
}
