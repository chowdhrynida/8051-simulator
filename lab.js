(() => {
  const { assemble, CPU, hex2, hex4 } = window.Sim;
  const $ = (id) => document.getElementById(id);

  const PRESETS = [
    {
      id: 'chase', name: 'LED chase on Port 1',
      src: `; One LED lights and moves along Port 1
        MOV A,#01H
LOOP:   MOV P1,A        ; show the pattern
        RL A            ; move the bit left
        MOV R7,#3
WAIT:   DJNZ R7,WAIT    ; short delay
        SJMP LOOP`,
    },
    {
      id: 'blink', name: 'Blink P1.0 (see it on the scope)',
      src: `; Toggle P1.0 with a delay. Watch CH1 on the scope.
START:  CPL P1.0
        MOV R7,#5
DELAY:  DJNZ R7,DELAY
        SJMP START`,
    },
    {
      id: 'count', name: 'Count 0-9 on the 7-segment display', ch: ['0:0', '0:1'],
      src: `; Look up each digit's segment pattern from a table
        MOV DPTR,#TABLE
        MOV R0,#0
NEXT:   MOV A,R0
        MOVC A,@A+DPTR  ; fetch pattern for digit R0
        MOV P0,A        ; drive the display
        MOV R7,#6
D1:     DJNZ R7,D1
        INC R0
        CJNE R0,#10,NEXT
        MOV R0,#0
        SJMP NEXT
TABLE:  DB 3FH,06H,5BH,4FH,66H,6DH,7DH,07H,7FH,6FH`,
    },
    {
      id: 'add', name: 'Add two numbers and see the flags',
      src: `; 0F0H + 20H overflows one byte, so CY is set
        MOV A,#0F0H
        ADD A,#20H      ; A = 10H, CY = 1
        MOV R0,A
        MOV P1,A        ; show the result on the LEDs
        MOV A,#38H
        ADD A,#45H      ; BCD add: 38 + 45
        DA A            ; A = 83H
        SJMP $`,
    },
    {
      id: 'two', name: 'Two square waves (CH1 and CH2)',
      src: `; CH2 (P1.1) toggles at half the rate of CH1 (P1.0)
LOOP:   CPL P1.0
        MOV R7,#4
D1:     DJNZ R7,D1
        INC R6
        MOV A,R6
        JB ACC.0,LOOP   ; odd count: skip CH2
        CPL P1.1
        SJMP LOOP`,
    },
    {
      id: 'uart', name: 'UART: send HELLO at 9600 baud', speed: '4',
      src: `; Send HELLO at 9600 baud (11.0592 MHz crystal)
        MOV TMOD,#20H   ; Timer 1, mode 2 (auto-reload)
        MOV TH1,#0FDH   ; reload value: 9600 baud
        SETB TR1        ; start the baud clock
        MOV SCON,#50H   ; 8-bit UART, receiver on
        MOV DPTR,#MSG
        MOV R0,#0
NEXT:   MOV A,R0
        MOVC A,@A+DPTR  ; next character
        JZ DONE         ; 0 marks the end
        MOV SBUF,A      ; start sending it
        JNB TI,$        ; wait until it is out
        CLR TI
        INC R0
        SJMP NEXT
DONE:   SJMP $
MSG:    DB 'HELLO',0`,
    },
  ];

  const cpu = new CPU();
  let prog = null;            // last successful assembly
  let running = false;
  let carry = 0, lastT = 0;
  const IPS = [2, 10, 50, 300, 3000];
  let trace = [];
  let traceDirty = true;
  let prevRam = new Uint8Array(256);
  const addrRow = new Map();
  const addrText = new Map();
  let activeRow = null;

  /* ---------- static UI ---------- */
  const preset = $('preset');
  PRESETS.forEach((p) => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; preset.appendChild(o); });

  const ledsEl = $('leds');
  for (let b = 7; b >= 0; b--) {
    const d = document.createElement('div');
    d.className = 'led'; d.id = 'led' + b;
    d.innerHTML = '<i></i><span>1.' + b + '</span>';
    ledsEl.appendChild(d);
  }

  const flagsEl = $('flags');
  const FLAGS = [['CY', 0x80], ['AC', 0x40], ['F0', 0x20], ['RS1', 0x10], ['RS0', 0x08], ['OV', 0x04], ['P', 0x01]];
  FLAGS.forEach(([n]) => { const s = document.createElement('span'); s.className = 'flag'; s.id = 'fl' + n; s.textContent = n; flagsEl.appendChild(s); });

  const rnEl = $('rn');
  for (let i = 0; i < 8; i++) { const d = document.createElement('div'); d.innerHTML = '<span>R' + i + '</span><b id="rn' + i + '">00</b>'; rnEl.appendChild(d); }

  const ramEl = $('ram');
  (() => {
    let h = '<tr><th></th>';
    for (let c = 0; c < 16; c++) h += '<th>' + c.toString(16).toUpperCase() + '</th>';
    h += '</tr>';
    for (let r = 0; r < 8; r++) {
      h += '<tr><th>' + hex2(r * 16) + '</th>';
      for (let c = 0; c < 16; c++) h += '<td id="m' + (r * 16 + c) + '">00</td>';
      h += '</tr>';
    }
    ramEl.innerHTML = h;
  })();

  [$('ch1'), $('ch2')].forEach((sel, k) => {
    for (let p = 0; p < 4; p++) {
      const g = document.createElement('optgroup'); g.label = 'Port ' + p;
      for (let b = 0; b < 8; b++) {
        const o = document.createElement('option');
        o.value = p + ':' + b; o.textContent = 'P' + p + '.' + b;
        g.appendChild(o);
      }
      sel.appendChild(g);
    }
    sel.value = k === 0 ? '1:0' : '1:1';
  });

  /* ---------- assemble ---------- */
  function setStatus(msg, bad) { const s = $('status'); s.textContent = msg; s.classList.toggle('bad', !!bad); }

  function assembleNow() {
    stopRun();
    const res = assemble($('src').value);
    const errs = $('errs');
    errs.innerHTML = '';
    if (res.errors.length) {
      res.errors.sort((a, b) => a.line - b.line).forEach((e) => {
        const li = document.createElement('li'); li.textContent = 'Line ' + e.line + ': ' + e.msg; errs.appendChild(li);
      });
      setStatus(res.errors.length + (res.errors.length === 1 ? ' error' : ' errors') + '. Fix and press Assemble.', true);
      return;
    }
    prog = res;
    cpu.load(res.rom);
    buildListing(res.listing);
    trace = []; traceDirty = true;
    prevRam = new Uint8Array(256);
    const total = res.listing.reduce((s, l) => s + l.bytes.length, 0);
    setStatus('Assembled ' + total + ' bytes. Ready.');
    render();
  }

  function buildListing(list) {
    const tb = $('listing').querySelector('tbody');
    tb.innerHTML = '';
    addrRow.clear(); addrText.clear(); activeRow = null;
    list.sort((a, b) => a.addr - b.addr).forEach((l) => {
      const tr = document.createElement('tr');
      const lbl = l.label ? '<span class="lbl">' + l.label + ':</span> ' : '';
      tr.innerHTML = '<td class="addr">' + hex4(l.addr) + '</td><td class="bytes">' + l.bytes.map(hex2).join(' ') + '</td><td>' + lbl + escapeHtml(l.text) + '</td>';
      tb.appendChild(tr);
      addrRow.set(l.addr, tr);
      addrText.set(l.addr, l.text);
    });
  }

  function escapeHtml(s) { return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  /* ---------- run control ---------- */
  function doStep() {
    if (!prog || cpu.halted) return false;
    const pc0 = cpu.pc;
    const ok = cpu.step();
    if (ok) {
      trace.unshift({ c: cpu.cycles, pc: pc0, t: addrText.get(pc0) || '?', a: cpu.acc, cy: cpu.cy });
      if (trace.length > 60) trace.length = 60;
      traceDirty = true;
    }
    return ok;
  }

  function finished() {
    if (cpu.halted) { setStatus(cpu.halted, true); return true; }
    if (cpu.idle) { setStatus('Program finished: it is looping on SJMP $ at ' + hex4(cpu.pc) + '.'); return true; }
    return false;
  }

  function stopRun() {
    running = false;
    $('runBtn').textContent = 'Run';
    $('runBtn').classList.remove('on');
    $('stepBtn').disabled = false;
  }

  function startRun() {
    if (!prog) return;
    if (cpu.halted || cpu.idle) { cpu.reset(); trace = []; traceDirty = true; }
    running = true; carry = 0; lastT = performance.now();
    $('runBtn').textContent = 'Pause';
    $('runBtn').classList.add('on');
    $('stepBtn').disabled = true;
    setStatus('Running...');
    requestAnimationFrame(frame);
  }

  function frame(t) {
    if (!running) return;
    const dt = Math.min(t - lastT, 100) / 1000;
    lastT = t;
    carry += dt * IPS[+$('speed').value];
    let n = Math.min(Math.floor(carry), 6000);
    carry -= Math.floor(carry);
    while (n-- > 0) {
      if (!doStep()) break;
      if (cpu.idle) break;
    }
    render();
    if (finished()) { stopRun(); return; }
    requestAnimationFrame(frame);
  }

  $('runBtn').addEventListener('click', () => {
    if (running) { stopRun(); setStatus('Paused at ' + hex4(cpu.pc) + '.'); render(); }
    else startRun();
  });
  $('stepBtn').addEventListener('click', () => {
    if (!prog) return;
    if (cpu.halted || cpu.idle) { cpu.reset(); trace = []; traceDirty = true; }
    doStep();
    render();
    if (!finished()) setStatus('Stepped. Next instruction at ' + hex4(cpu.pc) + '.');
  });
  $('resetBtn').addEventListener('click', () => {
    stopRun();
    cpu.reset(); trace = []; traceDirty = true; prevRam = new Uint8Array(256);
    setStatus('Reset. PC = 0000.');
    render();
  });
  $('asmBtn').addEventListener('click', assembleNow);
  $('src').addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); assembleNow(); }
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.target, s = ta.selectionStart;
      ta.value = ta.value.slice(0, s) + '    ' + ta.value.slice(ta.selectionEnd);
      ta.selectionStart = ta.selectionEnd = s + 4;
    }
  });
  preset.addEventListener('change', () => {
    const p = PRESETS.find((x) => x.id === preset.value);
    $('src').value = p.src;
    $('speed').value = p.speed || '2';
    $('ch1').value = (p.ch || ['1:0', '1:1'])[0];
    $('ch2').value = (p.ch || ['1:0', '1:1'])[1];
    assembleNow();
  });
  ['ch1', 'ch2', 'tdiv'].forEach((id) => $(id).addEventListener('change', drawScope));
  window.addEventListener('resize', () => { drawScope(); drawUart(); });

  /* ---------- rendering ---------- */
  function render() {
    $('rA').textContent = hex2(cpu.acc);
    $('rB').textContent = hex2(cpu.b);
    $('rPC').textContent = hex4(cpu.pc);
    $('rSP').textContent = hex2(cpu.sp);
    $('rDPTR').textContent = hex4(cpu.dptr);
    $('rCyc').textContent = cpu.cycles;

    const psw = cpu.psw;
    FLAGS.forEach(([n, m]) => $('fl' + n).classList.toggle('on', !!(psw & m)));
    $('bankNo').textContent = cpu.bank;
    for (let i = 0; i < 8; i++) $('rn' + i).textContent = hex2(cpu.R(i));

    const p0 = cpu.sfr[0x80], p1 = cpu.sfr[0x90], p2 = cpu.sfr[0xA0], p3 = cpu.sfr[0xB0];
    $('p0').textContent = hex2(p0); $('p1').textContent = hex2(p1);
    $('p2').textContent = hex2(p2); $('p3').textContent = hex2(p3);
    for (let b = 0; b < 8; b++) {
      $('led' + b).classList.toggle('on', !!((p1 >> b) & 1));
      $('s' + b).classList.toggle('on', !!((p0 >> b) & 1));
    }

    for (let i = 0; i < 128; i++) {
      const cell = $('m' + i);
      const v = cpu.iram[i];
      if (v !== prevRam[i]) {
        cell.textContent = hex2(v);
        cell.classList.remove('chg'); void cell.offsetWidth; cell.classList.add('chg');
        prevRam[i] = v;
      }
    }
    const bk = cpu.bank * 8;
    for (let i = 0; i < 128; i++) {
      const cell = $('m' + i);
      cell.classList.toggle('bank', i >= bk && i < bk + 8);
      cell.classList.toggle('sp', i === cpu.sp);
    }

    const row = addrRow.get(cpu.pc) || null;
    if (row !== activeRow) {
      if (activeRow) activeRow.classList.remove('pc');
      if (row) {
        row.classList.add('pc');
        const w = $('listingWrap');
        w.scrollTop = Math.max(0, row.offsetTop - w.clientHeight / 2 + row.clientHeight);
      }
      activeRow = row;
    }

    if (traceDirty) {
      const tb = $('trace').querySelector('tbody');
      tb.innerHTML = trace.map((r) => '<tr><td>' + r.c + '</td><td class="addr">' + hex4(r.pc) + '</td><td>' + escapeHtml(r.t) + '</td><td>' + hex2(r.a) + '</td><td>' + r.cy + '</td></tr>').join('');
      traceDirty = false;
    }

    drawScope();
    drawUart();
  }

  /* ---------- scope ---------- */
  function chan(id) { const [p, b] = $(id).value.split(':').map(Number); return { p, b }; }

  function valueAt(ev, ch) { return (ev.p[ch.p] >> ch.b) & 1; }

  function indexAtOrBefore(t) {
    const log = cpu.log;
    let lo = 0, hi = log.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (log[mid].t <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }

  function measure(ch) {
    const log = cpu.log, edges = [];
    for (let i = log.length - 1; i > 0 && edges.length < 2; i--) {
      if (valueAt(log[i - 1], ch) === 0 && valueAt(log[i], ch) === 1) edges.push(log[i].t);
    }
    if (edges.length < 2) return null;
    return edges[0] - edges[1];
  }

  function fmtFreq(cyc) {
    const f = (window.Sim.XTAL / 12) / cyc;
    return f >= 1000 ? (f / 1000).toFixed(2) + ' kHz' : f.toFixed(1) + ' Hz';
  }

  function drawScope() {
    const cv = $('scope');
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#030a07'; ctx.fillRect(0, 0, w, h);

    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      ctx.strokeStyle = i === 5 ? '#1f4a39' : '#10261d';
      ctx.beginPath(); ctx.moveTo(Math.round(i * w / 10) + .5, 0); ctx.lineTo(Math.round(i * w / 10) + .5, h); ctx.stroke();
    }
    for (let j = 0; j <= 8; j++) {
      ctx.strokeStyle = j === 4 ? '#1f4a39' : '#10261d';
      ctx.beginPath(); ctx.moveTo(0, Math.round(j * h / 8) + .5); ctx.lineTo(w, Math.round(j * h / 8) + .5); ctx.stroke();
    }

    const span = +$('tdiv').value * 10;
    const startT = Math.max(0, cpu.cycles - span);
    const lanes = [
      { ch: chan('ch1'), color: '#ffd54a', top: h * 0.09, bot: h * 0.40, tag: 'CH1' },
      { ch: chan('ch2'), color: '#58e2ff', top: h * 0.59, bot: h * 0.90, tag: 'CH2' },
    ];
    const log = cpu.log;
    const first = indexAtOrBefore(startT);
    const xOf = (t) => ((t - startT) / span) * w;
    const endX = Math.min(w, xOf(cpu.cycles));

    lanes.forEach((ln) => {
      const y = (v) => (v ? ln.top : ln.bot);
      ctx.strokeStyle = ln.color; ctx.lineWidth = 2; ctx.lineJoin = 'miter';
      ctx.shadowColor = ln.color; ctx.shadowBlur = 6;
      ctx.beginPath();
      let v = valueAt(log[first], ln.ch);
      ctx.moveTo(0, y(v));
      for (let i = first + 1; i < log.length; i++) {
        const e = log[i];
        if (e.t > startT + span) break;
        const x = xOf(e.t);
        ctx.lineTo(x, y(v));
        v = valueAt(e, ln.ch);
        ctx.lineTo(x, y(v));
      }
      ctx.lineTo(endX, y(v));
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = ln.color; ctx.font = '600 12px "IBM Plex Mono", monospace';
      ctx.fillText(ln.tag + ' P' + ln.ch.p + '.' + ln.ch.b, 8, ln.top - 6);
    });

    const parts = [];
    lanes.forEach((ln) => {
      const per = measure(ln.ch);
      if (per) parts.push(ln.tag + ': period ' + per + ' cycles, ' + fmtFreq(per));
    });
    $('freq').textContent = parts.length ? parts.join('   |   ') : 'Waiting for a channel to toggle.';
  }

  /* ---------- UART ---------- */
  const SLOT = ['IDL', 'STA', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'STO', 'IDL'];

  function drawUart() {
    const cv = $('uartWave');
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#030a07'; ctx.fillRect(0, 0, w, h);

    const t = cpu.tx.busy ? cpu.tx : (cpu.txLog.length ? cpu.txLog[cpu.txLog.length - 1] : null);
    let done = 0;
    if (t) done = (cpu.tx.busy && t.end === Infinity) ? 0 : (cpu.tx.busy ? Math.max(0, Math.min(10, Math.floor((cpu.cycles - t.start) / t.cpb))) : 10);
    const lv = t ? [1, 0].concat([0, 1, 2, 3, 4, 5, 6, 7].map((b) => (t.byte >> b) & 1), [1, 1]) : Array(12).fill(1);
    const sw = w / 12, hi = h * 0.18, lo = h * 0.55;
    const y = (v) => (v ? hi : lo);
    ctx.lineWidth = 2.5; ctx.lineJoin = 'miter';
    for (let s = 0; s < 12; s++) {
      const lit = !t || s <= done + 1;
      const x0 = s * sw, x1 = x0 + sw, prev = s ? lv[s - 1] : lv[0];
      ctx.strokeStyle = lit ? '#ffd54a' : '#1f4a39';
      ctx.setLineDash(lit ? [] : [4, 4]);
      ctx.beginPath(); ctx.moveTo(x0, y(prev)); ctx.lineTo(x0, y(lv[s])); ctx.lineTo(x1, y(lv[s])); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#a9c4b7'; ctx.font = '500 11px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText(SLOT[s], x0 + sw / 2, h - 30);
      if (t && s >= 2 && s <= 9 && s <= done + 1) { ctx.fillStyle = '#f4f1e6'; ctx.font = '700 13px "IBM Plex Mono", monospace'; ctx.fillText(lv[s], x0 + sw / 2, h - 10); }
    }
    ctx.textAlign = 'start';

    const sc = cpu.sfr[0x98], ti = (sc >> 1) & 1, ri = sc & 1, tr1 = (cpu.sfr[0x88] >> 6) & 1;
    let msg = 'Baud ' + Math.round(cpu.baud()) + ' (TH1 = ' + hex2(cpu.sfr[0x8D]) + 'H, ' + cpu.cyclesPerBit() + ' cycles per bit)   |   TI ' + ti + '   RI ' + ri;
    if (cpu.tx.busy && !tr1) msg = 'Waiting: Timer 1 is not running, so there is no baud clock. Add SETB TR1.';
    else if (t) msg += '   |   last byte ' + hex2(t.byte) + 'H';
    $('uartInfo').textContent = msg;
    const txt = cpu.txText.replace(/[^\x20-\x7E\n]/g, '.');
    $('uartTerm').textContent = txt || 'Nothing sent yet.';
  }

  $('rxBtn').addEventListener('click', () => {
    const ch = $('rxIn').value;
    if (!ch) return;
    if (cpu.receive(ch.charCodeAt(0))) setStatus('Received "' + ch + '" (' + hex2(ch.charCodeAt(0)) + 'H). RI is set, read it from SBUF.');
    else setStatus('Receiver is off. Set REN first, for example MOV SCON,#50H.', true);
    render();
  });

  /* ---------- start ---------- */
  $('src').value = PRESETS[0].src;
  assembleNow();
})();