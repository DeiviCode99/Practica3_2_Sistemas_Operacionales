// Genera dist/simvm.html: un solo archivo con el CSS y el JS embebidos que se
// abre con doble clic (sin servidor). Uso: node scripts/build.mjs
//
// Incluye un empaquetador mínimo sin dependencias: recorre los `import`
// relativos desde js/main.js y envuelve cada módulo en una función, de modo
// que cada archivo conserva su propio ámbito.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFile(path.join(root, p), 'utf8');

const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"];?\s*$/gm;
const EXPORT_DECL_RE = /^export\s+((?:async\s+)?function\*?|class|const|let)\s+([A-Za-z_$][\w$]*)/gm;

async function bundle(entry) {
  const modules = new Map();

  async function visit(file) {
    if (modules.has(file)) return;
    modules.set(file, null);
    let source = await read(file);
    const deps = [];
    const exports = [];

    source = source.replace(IMPORT_RE, (_, names, spec) => {
      const dep = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
      deps.push(dep);
      const bindings = names.split(',').map((n) => n.trim()).filter(Boolean)
        .map((n) => n.replace(/\s+as\s+/, ': ')).join(', ');
      return `const { ${bindings} } = __require(${JSON.stringify(dep)});`;
    });
    if (/^\s*(import|export)\b(?!\s+(?:async\s+)?(?:function|class|const|let)\b)/m.test(source)) {
      throw new Error(`${file}: forma de import/export no soportada por el empaquetador.`);
    }
    source = source.replace(EXPORT_DECL_RE, (_, kind, name) => {
      exports.push(name);
      return `${kind} ${name}`;
    });

    modules.set(file, { source, exports });
    for (const dep of deps) await visit(dep);
  }

  await visit(entry);

  const defs = [...modules].map(([file, { source, exports }]) =>
    `__define(${JSON.stringify(file)}, function (__require) {\n${source}\nreturn { ${exports.join(', ')} };\n});`);

  return `(() => {
'use strict';
const __factories = {};
const __cache = {};
function __define(id, factory) { __factories[id] = factory; }
function __require(id) {
  if (!(id in __cache)) __cache[id] = __factories[id](__require);
  return __cache[id];
}
${defs.join('\n\n')}
__require(${JSON.stringify(entry)});
})();`;
}

const html = await read('index.html');
const cssFiles = [...html.matchAll(/<link rel="stylesheet" href="(css\/[^"]+)">/g)].map((m) => m[1]);
const css = (await Promise.all(cssFiles.map(read))).join('\n');
const js = (await bundle('js/main.js')).replaceAll('</script', '<\\/script');

const output = html
  .replace(/<!-- build:css -->[\s\S]*?<!-- endbuild -->/, () => `<style>\n${css}\n</style>`)
  .replace(/<!-- build:js -->[\s\S]*?<!-- endbuild -->/, () => `<script>\n${js}\n</script>`);

await mkdir(path.join(root, 'dist'), { recursive: true });
await writeFile(path.join(root, 'dist', 'simvm.html'), output);
console.log(`dist/simvm.html (${(output.length / 1024).toFixed(1)} KB, ${cssFiles.length} hojas de estilo)`);
