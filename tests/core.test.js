// Pruebas del núcleo. Ejecutar con: npm test  (o node --test tests/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry, decomposeAddress, ConfigError } from '../js/core/config.js';
import { VirtualMemorySystem } from '../js/core/mmu.js';
import { comparePolicies } from '../js/core/analysis.js';
import { parseNumber, parseHexByte, toHex } from '../js/core/bits.js';
import { PRACTICE_CONFIG, PRACTICE_ADDRESSES } from '../js/app/practice.js';

const RW = { r: true, w: true, e: false };

test('geometría de la configuración de la práctica (5.2)', () => {
  const g = buildGeometry(PRACTICE_CONFIG);
  assert.equal(g.vmSize, 1024);
  assert.equal(g.pages, 64);
  assert.equal(g.frames, 16);
  assert.equal(g.offsetBits, 4);
  assert.equal(g.vpnBits, 6);
  assert.equal(g.ppnBits, 4);
  assert.equal(g.tlbSets, 2);
  assert.equal(g.indexBits, 1);
  assert.equal(g.tagBits, 5);
});

test('capacidad de la memoria virtual (5.1.2)', () => {
  assert.equal(buildGeometry({ vaBits: 10 }).vmSize, 1024);
  assert.equal(buildGeometry({ vaBits: 12 }).vmSize, 4096);
  assert.equal(buildGeometry({ vaBits: 16 }).vmSize, 65536);
  assert.equal(buildGeometry({ vaBits: 10, pageSize: 32 }).pages, 32);
});

test('configuración inválida lanza ConfigError', () => {
  assert.throws(() => buildGeometry({ tlbSize: 4, tlbWays: 8 }), ConfigError);
  assert.throws(() => buildGeometry({ pageSize: 24 }), ConfigError);
});

test('descomposición de direcciones', () => {
  const g = buildGeometry(PRACTICE_CONFIG);
  assert.deepEqual(decomposeAddress(g, 80), { vpn: 5, offset: 0, index: 1, tag: 2 });
  assert.deepEqual(decomposeAddress(g, 712), { vpn: 44, offset: 8, index: 0, tag: 22 });
  assert.deepEqual(decomposeAddress(g, 1000), { vpn: 62, offset: 8, index: 0, tag: 31 });
});

test('parseo de números', () => {
  assert.equal(parseNumber('80'), 80);
  assert.equal(parseNumber('0x50'), 80);
  assert.ok(Number.isNaN(parseNumber('5x')));
  assert.equal(parseHexByte('ff'), 255);
  assert.equal(toHex(5, 6), '0x05');
});

test('acceso a página no asignada produce fallo de segmento', () => {
  const sys = new VirtualMemorySystem(buildGeometry(PRACTICE_CONFIG));
  const r = sys.execute(80);
  assert.equal(r.outcome, 'segfault');
  assert.equal(sys.state.stats.segFaults, 1);
});

test('asignación llena frames y luego usa swap', () => {
  const sys = new VirtualMemorySystem(buildGeometry(PRACTICE_CONFIG));
  for (let vpn = 0; vpn < 16; vpn++) assert.equal(sys.allocate(vpn, RW).location, 'frame');
  const r = sys.allocate(16, RW);
  assert.equal(r.location, 'swap');
  assert.deepEqual(sys.counts(), { allocated: 17, inMemory: 16, inSwap: 1, free: 47 });
});

test('fallo y luego acierto en TLB para la misma página', () => {
  const sys = new VirtualMemorySystem(buildGeometry(PRACTICE_CONFIG));
  sys.allocate(5, RW);
  const first = sys.execute(80);
  const second = sys.execute(85);
  assert.equal(first.tlb, 'miss');
  assert.equal(first.pt, 'hit');
  assert.equal(second.tlb, 'hit');
  assert.equal(second.ppn, first.ppn);
});

test('fallo de página con reemplazo FIFO expulsa la primera página cargada', () => {
  const sys = new VirtualMemorySystem(buildGeometry(PRACTICE_CONFIG), { pagePolicy: 'FIFO' });
  for (let vpn = 0; vpn < 17; vpn++) sys.allocate(vpn, RW); // VPN 16 queda en swap
  const r = sys.execute(16 * 16);
  assert.equal(r.pt, 'fault');
  assert.equal(r.replaced.vpn, 0);
  assert.equal(sys.state.pageTable[0].valid, false);
  assert.equal(sys.state.pageTable[16].valid, true);
});

test('LRU conserva la página usada recientemente', () => {
  const sys = new VirtualMemorySystem(buildGeometry(PRACTICE_CONFIG), { pagePolicy: 'LRU' });
  for (let vpn = 0; vpn < 17; vpn++) sys.allocate(vpn, RW);
  sys.execute(0); // usa la página 0
  const r = sys.execute(16 * 16);
  assert.equal(r.replaced.vpn, 1);
});

test('el reemplazo invalida la traducción en la TLB', () => {
  const sys = new VirtualMemorySystem(buildGeometry(PRACTICE_CONFIG), { pagePolicy: 'FIFO' });
  for (let vpn = 0; vpn < 17; vpn++) sys.allocate(vpn, RW);
  sys.execute(0); // VPN 0 entra a la TLB
  sys.execute(16 * 16); // expulsa la VPN 0
  const again = sys.execute(0);
  assert.equal(again.tlb, 'miss');
  assert.equal(again.pt, 'fault');
});

test('escritura en página protegida produce violación de protección', () => {
  const sys = new VirtualMemorySystem(buildGeometry(PRACTICE_CONFIG));
  sys.allocate(3, { r: true, w: false, e: false });
  const r = sys.execute(3 * 16 + 2, { type: 'write', value: 0xab });
  assert.equal(r.outcome, 'protection');
  assert.equal(sys.state.stats.protectionFaults, 1);
});

test('escritura permitida marca la página como sucia', () => {
  const sys = new VirtualMemorySystem(buildGeometry(PRACTICE_CONFIG));
  sys.allocate(3, RW);
  const w = sys.execute(50, { type: 'write', value: 0xab });
  const rd = sys.execute(50);
  assert.equal(w.outcome, 'ok');
  assert.equal(rd.value, 0xab);
  assert.equal(sys.state.pageTable[3].dirty, true);
});

test('comparar políticas no modifica el sistema original', () => {
  const sys = new VirtualMemorySystem(buildGeometry(PRACTICE_CONFIG), { protection: 'readWrite', seed: 7 });
  sys.allocateRandom();
  const before = JSON.stringify(sys.state.pageTable);
  const report = comparePolicies(sys, PRACTICE_ADDRESSES, ['LRU', 'FIFO', 'RANDOM']);
  assert.equal(JSON.stringify(sys.state.pageTable), before);
  assert.equal(report.runs.length, 3);
  for (const run of report.runs) {
    assert.equal(run.rows.length, PRACTICE_ADDRESSES.length);
    assert.equal(run.totals.replacements, run.rows.reduce((a, r) => a + r.replaced, 0));
  }
});

test('la misma semilla reproduce la misma asignación', () => {
  const g = buildGeometry(PRACTICE_CONFIG);
  const a = new VirtualMemorySystem(g, { seed: 42 });
  const b = new VirtualMemorySystem(g, { seed: 42 });
  a.allocateRandom(10);
  b.allocateRandom(10);
  assert.deepEqual(a.state.pageTable, b.state.pageTable);
});
