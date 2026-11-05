/** Pequeñas utilidades de DOM compartidas por las vistas. */

/**
 * Crea un elemento: h('button', { class: 'btn', onclick: fn }, 'Texto').
 * Props especiales: class, dataset, text, on<evento>. Valores true crean
 * atributos booleanos; null/false se omiten.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'text') el.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

/** Une nombres de clase descartando los vacíos. */
export function cx(...names) {
  return names.filter(Boolean).join(' ');
}

/** Encabezado estándar de panel: título, texto secundario y acciones a la derecha. */
export function panelHead(title, meta, ...actions) {
  return h('header', { class: 'panel__head' },
    h('h2', { class: 'panel__title' }, title),
    meta ? (meta instanceof Node ? meta : h('p', { class: 'panel__meta' }, meta)) : null,
    actions);
}

/** Tarjeta interna con encabezado (sección dentro de un panel). */
export function card({ title, note, extra, className = '' }, ...children) {
  return h('section', { class: cx('card', className) },
    h('header', { class: 'card__head' }, h('h3', { class: 'card__title' }, title), extra ?? null),
    note ? h('p', { class: 'card__note' }, note) : null,
    children);
}

/** Campo con etiqueta arriba. */
export function field(control, label, help) {
  return h('label', { class: 'field', for: control.id },
    h('span', { class: 'field__label' }, label),
    control,
    help ? h('span', { class: 'field__help' }, help) : null);
}

/** Interruptor estilo "switch" sobre un checkbox. */
export function toggle(input, title, subtitle) {
  return h('label', { class: 'toggle', for: input.id },
    input, h('span', { class: 'toggle__track', 'aria-hidden': 'true' }),
    h('span', { class: 'toggle__text' }, title, subtitle ? h('small', {}, subtitle) : null));
}

/** Copia texto al portapapeles con respaldo para entornos sin Clipboard API. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = h('textarea', { class: 'visually-hidden', readonly: true });
    area.value = text;
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove();
    return ok;
  }
}

/** Celda de bit 0/1 para tablas. */
export function bitCell(value) {
  return h('td', { class: cx('bit', value ? 'bit--on' : 'bit--off') }, value ? '1' : '0');
}

/** Valor hexadecimal de un byte, sin prefijo. */
export function byteText(value) {
  return value.toString(16).toUpperCase().padStart(2, '0');
}
