# SimVM — Simulador de memoria virtual

Simulador interactivo de memoria virtual en HTML, CSS y JavaScript vanilla, inspirado en el
[CSE 351 VM Simulator](https://courses.cs.washington.edu/courses/cse351/vmsim/) y hecho para la
**Práctica 3-2 de Sistemas Operacionales (UIS)**.

## Interfaz

Tema claro con el mismo lenguaje visual del simulador de caché del grupo: encabezado con Ayuda y Reiniciar; arriba tres columnas (**Parámetros del sistema**, **Acceso manual a memoria**, **Mensajes de simulación**); luego TLB, tabla de páginas y memoria virtual; memoria principal y swap; estadísticas; e historial y comparación de políticas en pestañas.

## Cómo ejecutarlo

| Opción | Pasos |
|---|---|
| Archivo único | Abre `dist/simvm.html` con doble clic. No necesita servidor ni internet. |
| Código fuente (desarrollo) | Los módulos ES no cargan desde `file://`. Sirve la carpeta: `npm start`, `python -m http.server` o la extensión *Live Server* de VS Code, y abre `index.html`. |
| Pruebas | `npm test` (Node 18 o superior, sin dependencias). |
| Regenerar el archivo único | `npm run build` |

## Qué hace (y qué mejora frente a CS351)

- Mismos parámetros que CS351: bus virtual (10/12/16 bits), página (16/32 B), TLB (4–32 entradas, 1/2/4 vías) y memoria principal (128/256/512 B).
- Muestra TLB, tabla de páginas, memoria principal, memoria virtual y **swap**, con los campos V, D, R, W, E, T, PPN y SSN.
- **Explicar paso a paso** (Explain + Next): cada acceso avanza paso a paso y resalta la entrada de TLB, la fila de la tabla de páginas, el frame y el byte implicados.
- **Tres políticas de reemplazo** (LRU, FIFO y aleatoria), elegibles por separado para memoria principal y para la TLB. CS351 solo tiene una.
- **Permisos controlados**: los bits R/W/E se asignan al azar (como CS351), todos en lectura/escritura o solo lectura, y se pueden cambiar con un clic en la tabla de páginas.
- **Semilla aleatoria**: con la misma semilla se repite exactamente la misma asignación.
- **Comparación de políticas**: corre la lista de direcciones con LRU, FIFO y aleatoria desde copias del mismo estado y cuenta los reemplazos (tabla de 5.4).
- **Historial** con las columnas de las tablas de la guía (VPN, offset, tag, índice, PPN/SSN, fallo de segmento) y botón para copiarlo a Excel o Word.
- Detecta fallos de TLB, fallos de página, reemplazos, **fallos de segmento** y **violaciones de protección**.

## Cómo usarlo en cada sección de la guía

| Sección | Qué hacer en SimVM |
|---|---|
| 5.1 Configuración | Cambia los parámetros, pulsa **Generar sistema** y lee el **Resumen del sistema** (capacidad de MV, páginas, frames, bits de cada campo). |
| 5.2 Lectura y escritura | En **Configuración rápida** pulsa **Práctica 5.2 – 5.6**. En **Memoria virtual** pulsa la página `0x00` para asignarla y mira su PPN en la tabla de páginas. |
| 5.3 Mapeo directo completo | **Asignar todas** y luego, en **Secuencia de accesos**, **Ejecutar secuencia**. El **Historial de operaciones** tiene la tabla completa. |
| 5.4 Políticas de reemplazo | Con todas las páginas asignadas, en **Secuencia de accesos** pulsa **Comparar políticas**. El resultado aparece en la pestaña de comparación. |
| 5.5 Mapeo directo incompleto | **Reiniciar**, escribe 10 en *N páginas* y pulsa **Asignar N al azar**; ejecuta la secuencia. La columna *Seg. fault* indica SÍ/NO. |
| 5.6 Mecanismos de protección | Asigna todas las páginas y, en la tabla de páginas, busca las que tienen W = 0. Para escribir en la página VPN usa la dirección `VPN × tamaño de página` (por ejemplo VPN 0x07 → `0x70` con páginas de 16 B) en **Escritura de memoria**. |

## Arquitectura

```
index.html            Estructura de la página (contenedores vacíos)
css/
  tokens.css          Colores, tipografías y tema claro/oscuro
  base.css            Reset y layout general
  components.css      Paneles, campos, botones, tablas, pestañas
  views.css           Estilos propios de cada vista
js/
  core/               Modelo puro: sin DOM, probado con node:test
    bits.js           Operaciones con bits y parseo de números
    config.js         Parámetros, geometría derivada y descomposición de direcciones
    rng.js            Generador aleatorio con semilla
    policies.js       Políticas LRU / FIFO / aleatoria (patrón Strategy)
    format.js         Formato hexadecimal según el ancho de cada campo
    mmu.js            VirtualMemorySystem: TLB, tabla de páginas, frames y swap
    analysis.js       Comparación de políticas sobre copias del estado
  app/
    session.js        Capa de aplicación: estado de la sesión, historial, paso a paso
    practice.js       Configuración y direcciones de la práctica
  ui/                 Vistas: cada una con mount() y render()
    config-panel.js   Parámetros, políticas, configuración rápida y resumen
    access-panel.js   Lectura, escritura, asignación, descomposición y secuencias
    messages-panel.js Mensajes de simulación (pasos de cada acceso)
    tlb-view.js, page-table-view.js, memory-views.js   Estructuras de memoria
    stats-panel.js, tools-panel.js, help-dialog.js     Estadísticas, historial/comparación y ayuda
  main.js             Conecta sesión y vistas
tests/core.test.js    Pruebas unitarias del núcleo
scripts/build.mjs     Genera dist/simvm.html (empaquetador sin dependencias)
```

Principios aplicados:

- **Separación de responsabilidades**: `core` no conoce el DOM, `ui` no contiene lógica de memoria y `app/session.js` las coordina.
- **Flujo de datos en un solo sentido**: una vista llama a una acción de la sesión → la sesión emite `change` → todas las vistas se redibujan desde el estado.
- **Abierto a extensión** (Open/Closed): una política nueva se agrega registrándola en `POLICIES`, sin tocar la MMU.
- **Una sola fuente de verdad**: `buildGeometry()` calcula todos los tamaños y anchos de bits; ninguna vista los recalcula.
- **Pasos como generador**: `access()` es una función generadora que entrega un paso explicado en cada `yield`. El modo paso a paso y el modo rápido usan el mismo código.
- **Errores visibles**: las validaciones lanzan errores con mensajes en español y la interfaz los muestra en un aviso.
- **Determinismo**: el azar pasa por un generador con semilla, así que los experimentos se pueden repetir.

## Modelo simulado

1. La dirección virtual se divide en **VPN | offset**, y la VPN en **tag | índice** de la TLB.
2. Se busca en el conjunto `índice` de la TLB una entrada válida con ese tag.
3. Si falla la TLB se consulta la tabla de páginas:
   - página no asignada → **fallo de segmento**;
   - permiso insuficiente (R para leer, W para escribir) → **violación de protección**;
   - V = 0 → **fallo de página**: la página se trae desde swap. Si no hay frames libres, la política elige una víctima, que pasa al sector de swap liberado, y su traducción en la TLB se invalida.
4. La traducción se guarda en la TLB (con reemplazo en el conjunto si está lleno).
5. Se calcula la dirección física `PPN | offset` y se lee o escribe el byte. Al escribir, D = 1.

Al asignar una página (*Click to Allocate*) se usa un frame libre; si la memoria principal está llena, la página queda directamente en swap.
