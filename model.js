/* Hardware to software: one real program, run on the real engine, shown as chip and code twins. */
(() => {
  'use strict';
  const { assemble, CPU, hex2, hex4, cycleUs } = window.Sim;
  const $ = (id) => document.getElementById(id);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const SRC = ['MOV A,#0F5H', 'ADD A,#0CH', 'MOV R0,A', 'MOV 30H,R0', 'MOV P1,A', 'MOV TMOD,#20H', 'MOV TH1,#0FDH', 'SETB TR1', 'MOV SCON,#50H', "MOV SBUF,#'A'", 'JNB TI,$', 'CLR TI', 'SJMP $'].join('\n');
  const ROWS = [['rom', 'Code memory'], ['pc', 'Program counter'], ['acc', 'Accumulator'], ['alu', 'Flags (PSW)'], ['r0', 'Register R0 (RAM byte 00H)'], ['ram', 'RAM byte 30H'], ['p1', 'Port 1 and LEDs'], ['tmr', 'Timer 1 (baud clock)'], ['ser', 'Serial port (SCON, SBUF)'], ['txd', 'TXD pin (P3.1)']];
  const ST = [
    { s: 'rom', d: 'acc', chg: ['acc', 'pc', 'alu'], txt: 'The byte F5H is fetched from code memory and locked into the 8 flip-flops of the Accumulator.', py: 'cpu.acc = 0xF5' },
    { s: 'acc', d: 'alu', chg: ['acc', 'pc', 'alu'], txt: 'The ALU adds 0CH. The answer needs 9 bits but a register holds 8, so the extra 1 becomes the Carry flag. The parity gate recounts the 1s left in A.', math: '  11110101<br>+ 00001100<br>= <b>1</b> 00000001 &nbsp;&larr; the leading 1 becomes CY', py: 'r = cpu.acc + 0x0C\ncpu.cy = 1 if r > 0xFF else 0\ncpu.acc = r & 0xFF        # keep 8 bits' },
    { s: 'acc', d: 'r0', chg: ['r0', 'pc'], txt: 'R0 is not a separate chip. It is byte 00H of the internal RAM, picked by the bank-select bits. A is copied into it.', py: 'cpu.iram[cpu.bank * 8 + 0] = cpu.acc' },
    { s: 'r0', d: 'ram', chg: ['ram', 'pc'], txt: 'The address 30H goes to the RAM decoder, which opens one row of 8 memory cells and stores the byte from R0.', py: 'cpu.iram[0x30] = cpu.iram[0]' },
    { s: 'acc', d: 'p1', chg: ['p1', 'pc'], txt: 'Port 1 has a latch behind every pin. A 1 drives the pin high and the LED on that pin lights. This is where software touches the real world.', py: 'cpu.write(0x90, cpu.acc)    # the LED widget reads this' },
    { s: 'rom', d: 'tmr', chg: ['tmr', 'pc'], txt: 'TMOD decides how Timer 1 counts. 20H means Timer 1 in mode 2, an 8-bit counter that reloads itself. The UART borrows it as its baud-rate clock.', py: 'cpu.sfr[0x89] = 0x20        # TMOD' },
    { s: 'rom', d: 'tmr', chg: ['tmr', 'pc'], txt: 'TH1 is the reload value. One UART bit lasts 32 x (256 - TH1) machine cycles, so FDH gives 96 cycles per bit. With an 11.0592 MHz crystal that is exactly 9600 baud.', py: 'cycles_per_bit = 32 * (256 - th1)        # 96\nbaud = 11059200 / 12 / cycles_per_bit    # 9600' },
    { s: 'rom', d: 'tmr', chg: ['tmr', 'pc'], txt: 'TR1 is the run switch of Timer 1. Until it is set, the baud clock is stopped and the UART cannot send anything.', py: 'cpu.sfr[0x88] |= 0x40       # TCON.TR1 = 1' },
    { s: 'rom', d: 'ser', chg: ['ser', 'pc'], txt: 'SCON = 50H selects mode 1, an 8-bit UART (start bit, 8 data bits, stop bit), and switches the receiver on (REN).', py: 'cpu.sfr[0x98] = 0x50        # SCON' },
    { s: 'rom', d: 'ser', chg: ['ser', 'txd', 'pc'], txt: "Writing SBUF starts the transmitter. The byte 41H ('A') moves into a shift register and leaves on the TXD pin one bit at a time, lowest bit first. Watch the TXD row.", py: 'frame = [0] + bits_lsb_first(0x41) + [1]\n# start bit, D0..D7, stop bit = 10 bits' },
    { s: 'ser', d: 'txd', lbl: 'wait', chg: ['ser', 'txd', 'pc'], txt: null, py: 'while not cpu.ti:           # JNB TI,$\n    cpu.step()              # the CPU spins here' },
    { s: 'rom', d: 'ser', chg: ['ser', 'pc'], txt: 'Hardware sets TI when a byte is out, but only software can clear it. CLR TI makes the UART ready for the next byte.', py: 'cpu.sfr[0x98] &= ~0x02      # TI = 0' },
  ];
  const N = ST.length;
  let cpu, res, i, busy, anim, gen = 0, playing = false, wave = { byte: null, k: 12 };

  const stage = $('stage');
  ROWS.forEach(([k, t]) => {
    const d = document.createElement('div');
    d.className = 'tw-row'; d.id = 'r-' + k;
    d.innerHTML = '<div class="tw-box h"><b>' + t + '</b><div id="h-' + k + '"></div></div><div class="tw-box s"><div class="tw-py" id="p-' + k + '"></div></div>';
    stage.appendChild(d);
  });

  const bits = (v, labs) => '<div class="tw-bits">' + [7, 6, 5, 4, 3, 2, 1, 0].map((b) => '<div class="tw-bit' + ((v >> b) & 1 ? ' on' : '') + '">' + (labs ? labs[7 - b] : (v >> b) & 1) + '</div>').join('') + '</div>';
  const py = (n, v) => '<span>' + n + '</span> <i>=</i> <b>' + v + '</b>';

  function frameSVG(byte, k) {
    const W = 480, n = 12, w = W / n, y = (l) => (l ? 14 : 46);
    const lv = byte == null ? Array(12).fill(1) : [1, 0].concat([0, 1, 2, 3, 4, 5, 6, 7].map((b) => (byte >> b) & 1), [1, 1]);
    const lab = ['IDL', 'STA', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'STO', 'IDL'];
    let on = '', off = '', t = '';
    for (let s = 0; s < n; s++) {
      const prev = s ? lv[s - 1] : lv[0];
      const seg = 'M' + s * w + ',' + y(prev) + 'L' + s * w + ',' + y(lv[s]) + 'L' + (s + 1) * w + ',' + y(lv[s]);
      if (s < k) on += seg; else off += seg;
      t += '<text x="' + (s + .5) * w + '" y="66">' + lab[s] + '</text>';
      if (byte != null && s >= 2 && s <= 9 && s < k) t += '<text class="v" x="' + (s + .5) * w + '" y="82">' + lv[s] + '</text>';
    }
    return '<svg class="tw-wave" viewBox="0 0 480 90" role="img" aria-label="UART frame on the TXD pin"><path class="off" d="' + off + '"/><path class="on" d="' + on + '"/>' + t + '</svg>';
  }
  const drawWave = () => { $('h-txd').innerHTML = frameSVG(wave.byte, wave.k); };

  async function playFrame(byte) {
    const my = gen;
    wave = { byte, k: 1 };
    for (let k = 1; k <= 12; k++) {
      if (my !== gen) return;
      wave.k = k; drawWave();
      await sleep(reduce ? 0 : 230);
    }
  }

  function render() {
    const n = Math.min(i, N - 1), L = res.listing[n], sc = cpu.sfr[0x98], us = cpu.cycles * cycleUs;
    $('h-rom').innerHTML = i >= N ? '<span class="tw-hex">done</span>' : '<span class="tw-hex">' + L.bytes.map(hex2).join(' ') + '</span> <small>' + L.text.replace(/</g, '&lt;') + '</small>';
    $('p-rom').innerHTML = py('cpu.rom[pc]', i >= N ? '...' : '[' + L.bytes.map((b) => '0x' + hex2(b)).join(', ') + ']');
    $('h-pc').innerHTML = '<span class="tw-hex">' + hex4(cpu.pc) + 'H</span> <small>next address</small>';
    $('p-pc').innerHTML = py('cpu.pc', '0x' + hex4(cpu.pc));
    $('h-acc').innerHTML = bits(cpu.acc);
    $('p-acc').innerHTML = py('cpu.acc', '0x' + hex2(cpu.acc));
    $('h-alu').innerHTML = bits(cpu.psw, ['CY', 'AC', 'F0', 'RS1', 'RS0', 'OV', '-', 'P']);
    $('p-alu').innerHTML = py('cpu.cy', cpu.cy) + '<br>' + py('parity', cpu.psw & 1);
    $('h-r0').innerHTML = bits(cpu.R(0));
    $('p-r0').innerHTML = py('cpu.iram[0]', '0x' + hex2(cpu.R(0)));
    $('h-ram').innerHTML = bits(cpu.iram[0x30]);
    $('p-ram').innerHTML = py('cpu.iram[0x30]', '0x' + hex2(cpu.iram[0x30]));
    const p1 = cpu.sfr[0x90];
    $('h-p1').innerHTML = bits(p1) + '<div class="tw-leds">' + [7, 6, 5, 4, 3, 2, 1, 0].map((b) => '<div class="tw-led' + ((p1 >> b) & 1 ? ' on' : '') + '"></div>').join('') + '</div>';
    $('p-p1').innerHTML = py('cpu.sfr[P1]', '0x' + hex2(p1));
    const th1 = cpu.sfr[0x8D], tr1 = (cpu.sfr[0x88] >> 6) & 1;
    $('h-tmr').innerHTML = '<span class="tw-hex">TH1 ' + hex2(th1) + 'H</span> <small>TR1 ' + (tr1 ? 'running' : 'stopped') + '</small>';
    $('p-tmr').innerHTML = py('th1', '0x' + hex2(th1)) + '<br>' + py('baud', i >= 7 ? Math.round(cpu.baud()) : '?');
    $('h-ser').innerHTML = bits(sc, ['SM0', 'SM1', 'SM2', 'REN', 'TB8', 'RB8', 'TI', 'RI']);
    const sent = cpu.tx.busy ? String.fromCharCode(cpu.tx.byte) : cpu.txText.slice(-1);
    $('p-ser').innerHTML = py('scon', '0x' + hex2(sc)) + '<br>' + py('sbuf_tx', sent ? "'" + sent + "'" : '-');
    drawWave();
    $('p-txd').innerHTML = wave.byte == null ? py('frame', '[1, 1, 1 ...]  idle') : py('frame', '[0, ' + [0, 1, 2, 3, 4, 5, 6, 7].map((b) => (wave.byte >> b) & 1).join(', ') + ', 1]');
    $('cur').textContent = (i < N ? 'Next: ' + res.listing[i].text : 'Program finished') + '  |  ' + cpu.cycles + ' cycles, ' + us.toFixed(1) + ' \u00b5s';
    $('step').disabled = busy || i >= N;
    $('play').disabled = $('step').disabled && !playing;
    $('play').textContent = playing ? 'Pause' : 'Play all';
    $('reset').disabled = busy && !playing;
  }

  const mid = (k) => { const r = $('r-' + k); return r.offsetTop + r.offsetHeight / 2 - 11; };
  async function fly(a, b, label) {
    const pk = $('pk'), pl = $('pkl'), y0 = mid(a), y1 = mid(b);
    pk.style.transition = pl.style.transition = 'none';
    pk.style.top = y0 + 'px'; pl.style.top = y0 + 'px'; pl.textContent = label;
    pk.style.opacity = pl.style.opacity = 1;
    await sleep(40);
    pk.style.transition = pl.style.transition = '';
    pk.style.top = y1 + 'px'; pl.style.top = y1 + 'px';
    await sleep(reduce ? 50 : 850);
    pk.style.opacity = pl.style.opacity = 0;
  }

  async function step() {
    if (busy || i >= N) return;
    busy = true; render();
    const x = ST[i], L = res.listing[i], c0 = cpu.cycles;
    const label = x.lbl || (x.s === 'rom' ? hex2(L.bytes[L.bytes.length - 1]) : hex2(x.s === 'acc' ? cpu.acc : cpu.R(0)));
    $('cap').innerHTML = '<p><b>' + L.text.replace(/</g, '&lt;') + '</b> is running...</p>';
    await fly(x.s, x.d, label);
    let loops = 0;
    if (i === 10) {
      await anim;
      while (!(cpu.sfr[0x98] & 2) && loops < 50000) { cpu.step(); loops++; }
      cpu.step();
    } else cpu.step();
    if (i === 9) anim = playFrame(cpu.tx.byte);
    i++;
    busy = false; render();
    x.chg.forEach((k) => { const r = $('r-' + k); r.classList.add('flash'); setTimeout(() => r.classList.remove('flash'), 1400); });
    const dc = cpu.cycles - c0;
    const txt = x.txt || 'The CPU kept re-checking TI ' + loops + ' times. That took ' + dc + ' machine cycles, about ' + (dc * cycleUs).toFixed(0) + ' \u00b5s, which is exactly 10 bits at 9600 baud. Then the hardware set TI and the loop ended.';
    $('cap').innerHTML = '<p>' + txt + '</p>' + (x.math ? '<div class="tw-math">' + x.math + '</div>' : '') + '<pre>' + x.py + '</pre>';
  }

  function reset() {
    gen++; playing = false; busy = false; i = 0; anim = Promise.resolve(); wave = { byte: null, k: 12 };
    res = assemble(SRC); cpu = new CPU(); cpu.load(res.rom);
    $('cap').innerHTML = '<p>Press Step. Each row on the left is a real part of the chip, and its twin on the right is how the simulator stores it.</p>';
    render();
  }
  $('step').onclick = step;
  $('reset').onclick = reset;
  $('play').onclick = async () => {
    if (playing) { playing = false; render(); return; }
    if (i >= N) reset();
    playing = true; render();
    while (playing && i < N) { await step(); if (playing && i < N) await sleep(reduce ? 100 : 1600); }
    playing = false; render();
  };

  /* baud table: why 11.0592 MHz */
  const th = [[0xFD, 9600], [0xFA, 4800], [0xF4, 2400], [0xE8, 1200]];
  $('baudTbl').querySelector('tbody').innerHTML = [11.0592, 12].map((f) => '<tr><td>' + f + ' MHz</td>' + th.map(([t, b]) => {
    const a = f * 1e6 / (384 * (256 - t)), e = (a - b) / b * 100, ok = Math.abs(e) < .01;
    return '<td>' + a.toFixed(1) + '<br><small class="' + (ok ? 'okc' : 'badc') + '">' + (ok ? 'exact' : (e > 0 ? '+' : '') + e.toFixed(1) + '% off') + '</small></td>';
  }).join('') + '</tr>').join('');

  reset();
})();
