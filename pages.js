(() => {
  const $ = (id) => document.getElementById(id);
  const page = document.body.dataset.page;

  const STEPS = [
    { id: 'chip', href: 'chip.html', title: 'The chip', short: 'Chip' },
    { id: 'blocks', href: 'blocks.html', title: 'Inside the chip', short: 'Blocks' },
    { id: 'memory', href: 'memory.html', title: 'Memory', short: 'Memory' },
    { id: 'cycle', href: 'cycle.html', title: 'One instruction', short: 'Instruction' },
    { id: 'code', href: 'code.html', title: 'Machine code', short: 'Code' },
    { id: 'model', href: 'model.html', title: 'Hardware to software', short: 'Software' },
    { id: 'lab', href: 'lab.html', title: 'Run it', short: 'Lab' },
    { id: 'app', href: 'app.html', title: 'The full app', short: 'App' },
  ];
  const idx = STEPS.findIndex((s) => s.id === page);

  /* ---------- journey bar and pager ---------- */
  (function journey() {
    const st = $('stepper');
    if (st && idx >= 0) {
      st.innerHTML = '<ol>' + STEPS.map((s, i) =>
        '<li><a href="' + s.href + '" title="' + s.title + '" class="' + (i < idx ? 'done' : '') + '"' + (i === idx ? ' aria-current="step"' : '') + '><i>' + (i + 1) + '</i><span>' + s.short + '</span></a></li>'
      ).join('') + '</ol>';
      const cur = st.querySelector('[aria-current]');
      if (cur && st.firstElementChild) st.firstElementChild.scrollLeft = Math.max(0, cur.offsetLeft - 40);
    }
    const pg = $('pager');
    if (pg && idx >= 0) {
      const prev = STEPS[idx - 1], next = STEPS[idx + 1];
      pg.innerHTML =
        (prev ? '<a class="back" href="' + prev.href + '">Back: ' + prev.title + '</a>' : '<a class="back" href="index.html">Back to start</a>') +
        (next ? '<a class="next" href="' + next.href + '">Next: ' + next.title + '</a>' : '<a class="next" href="index.html">Back to start</a>');
    }
  })();

  /* ---------- pin data (40-pin DIP) ---------- */
  const G = {
    p0: { c: '#58e2ff', n: 'Port 0' }, p1: { c: '#ffd54a', n: 'Port 1' },
    p2: { c: '#ff9f5a', n: 'Port 2' }, p3: { c: '#c79bff', n: 'Port 3' },
    ctl: { c: '#ff7a9a', n: 'Control' }, clk: { c: '#8be07a', n: 'Clock' }, pwr: { c: '#e8e2d0', n: 'Power' },
  };
  const PIN = {};
  for (let i = 0; i < 8; i++) {
    PIN[1 + i] = { name: 'P1.' + i, g: 'p1', text: 'Bit ' + i + ' of Port 1. General-purpose I/O with internal pull-ups, so it works as an input or an output without extra parts. Software reads and writes all eight bits together through the P1 register (address 90H).' };
  }
  const P3ALT = ['RXD', 'TXD', 'INT0', 'INT1', 'T0', 'T1', 'WR', 'RD'];
  const P3TXT = ['Serial data input (UART receive).', 'Serial data output (UART transmit).', 'External interrupt 0 input.', 'External interrupt 1 input.', 'Timer 0 external input, used in counter mode.', 'Timer 1 external input, used in counter mode.', 'Write strobe for external data memory.', 'Read strobe for external data memory.'];
  for (let i = 0; i < 8; i++) {
    PIN[10 + i] = { name: 'P3.' + i + '/' + P3ALT[i], g: 'p3', text: 'Bit ' + i + ' of Port 3. ' + P3TXT[i] + ' When the alternate function is not in use, it is an ordinary I/O pin. Register P3 is at B0H.' };
    PIN[21 + i] = { name: 'P2.' + i + '/A' + (8 + i), g: 'p2', text: 'Bit ' + i + ' of Port 2. General-purpose I/O with pull-ups. When external memory is used, Port 2 outputs the high address byte (A8 to A15). Register P2 is at A0H.' };
    PIN[39 - i] = { name: 'P0.' + i + '/AD' + i, g: 'p0', text: 'Bit ' + i + ' of Port 0. Its outputs are open-drain, so it needs external pull-up resistors to work as I/O. With external memory it becomes the multiplexed low address and data bus (AD0 to AD7). Register P0 is at 80H.' };
  }
  PIN[9] = { name: 'RST', g: 'ctl', text: 'Reset input. Hold it high for at least two machine cycles to reset the chip. That sets PC to 0000H, SP to 07H and every port latch to FFH.' };
  PIN[18] = { name: 'XTAL2', g: 'clk', text: 'Output of the on-chip oscillator amplifier. The crystal connects between XTAL1 and XTAL2.' };
  PIN[19] = { name: 'XTAL1', g: 'clk', text: 'Input of the on-chip oscillator amplifier. Connect a crystal here (11.0592 MHz is the usual choice when you need exact serial baud rates) or drive it from an external clock.' };
  PIN[20] = { name: 'GND', g: 'pwr', text: 'Ground, 0 V.' };
  PIN[29] = { name: 'PSEN', g: 'ctl', text: 'Program Store Enable. An active-low read strobe for external program memory.' };
  PIN[30] = { name: 'ALE', g: 'ctl', text: 'Address Latch Enable. With external memory it pulses to latch the low address byte that Port 0 puts out. The pulse rate is one sixth of the oscillator frequency.' };
  PIN[31] = { name: 'EA', g: 'ctl', text: 'External Access. Tie it to VCC to run from the on-chip ROM (the first 4 KB), with anything above coming from outside. Tie it to GND to fetch all code from external memory.' };
  PIN[40] = { name: 'VCC', g: 'pwr', text: 'Power supply, +5 V.' };

  function dipSVG(o) {
    o = o || {};
    let s = '<svg viewBox="0 0 560 740" role="img" aria-label="An 8051 in a 40-pin DIP package">';
    s += '<rect class="dip-body" x="200" y="20" width="160" height="700" rx="10"/>';
    s += '<path class="dip-notch" d="M260 20A20 20 0 0 0 300 20"/><circle class="dip-dot" cx="222" cy="46" r="6"/>';
    s += '<text class="dip-name" x="285" y="372" transform="rotate(-90 285 372)" text-anchor="middle">8051</text>';
    s += '<text class="dip-sub" x="330" y="372" transform="rotate(-90 330 372)" text-anchor="middle">MCS-51 family</text>';
    for (let i = 0; i < 20; i++) {
      const y = 50 + i * 34;
      [[i + 1, 'L'], [40 - i, 'R']].forEach(([n, side]) => {
        const p = PIN[n], c = G[p.g].c, x = side === 'L' ? 140 : 360;
        s += '<g class="pin" data-n="' + n + '" data-g="' + p.g + '"' + (o.labels ? ' tabindex="0" role="button" aria-label="Pin ' + n + ', ' + p.name + '"' : '') +
          ' style="--c:' + c + ';--d:' + (o.stagger ? (i * 60 + (side === 'R' ? 30 : 0)) : 0) + 'ms">' +
          '<rect x="' + x + '" y="' + (y - 9) + '" width="60" height="18" rx="3" fill="' + c + '"/>' +
          (o.labels
            ? '<text class="num" x="' + (x + 30) + '" y="' + (y + 5) + '" text-anchor="middle">' + n + '</text>' +
              '<text class="lbl" x="' + (side === 'L' ? 132 : 428) + '" y="' + (y + 5) + '" text-anchor="' + (side === 'L' ? 'end' : 'start') + '">' + p.name + '</text>'
            : '') +
          '</g>';
      });
    }
    return s + '</svg>';
  }

  /* ---------- landing ---------- */
  function landing() {
    const el = $('heroChip');
    if (el) el.innerHTML = dipSVG({ stagger: true });
  }

  /* ---------- 1. the chip ---------- */
  function chip() {
    const dip = $('dip');
    dip.innerHTML = dipSVG({ labels: true });
    const info = $('pinInfo');
    let sel = null;
    function show(n) {
      const p = PIN[n], g = G[p.g];
      info.innerHTML = '<p class="pin-no">Pin ' + n + '</p><h2>' + p.name + '</h2><p><span class="tag" style="--c:' + g.c + '">' + g.n + '</span></p><p>' + p.text + '</p>';
      if (sel) sel.classList.remove('sel');
      sel = dip.querySelector('.pin[data-n="' + n + '"]');
      if (sel) sel.classList.add('sel');
    }
    dip.addEventListener('mouseover', (e) => { const g = e.target.closest('.pin'); if (g) show(+g.dataset.n); });
    dip.addEventListener('click', (e) => { const g = e.target.closest('.pin'); if (g) show(+g.dataset.n); });
    dip.addEventListener('focusin', (e) => { const g = e.target.closest('.pin'); if (g) show(+g.dataset.n); });

    const counts = {};
    Object.keys(PIN).forEach((n) => { counts[PIN[n].g] = (counts[PIN[n].g] || 0) + 1; });
    const leg = $('legend');
    Object.keys(G).forEach((k) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'lg'; b.dataset.g = k;
      b.style.setProperty('--c', G[k].c);
      b.innerHTML = '<i></i>' + G[k].n + ' <span>' + counts[k] + '</span>';
      leg.appendChild(b);
    });
    let active = null;
    leg.addEventListener('click', (e) => {
      const b = e.target.closest('.lg'); if (!b) return;
      active = active === b.dataset.g ? null : b.dataset.g;
      leg.querySelectorAll('.lg').forEach((x) => x.classList.toggle('on', x.dataset.g === active));
      dip.querySelectorAll('.pin').forEach((p) => p.classList.toggle('dim', !!active && p.dataset.g !== active));
    });
    show(1);
  }

  /* ---------- 2. blocks ---------- */
  const BLOCKS = {
    cpu: {
      t: 'CPU',
      hw: 'The CPU fetches each opcode from program memory, decodes it and executes it. It holds the ALU, the accumulator A, register B, the program status word (PSW), the 16-bit program counter (PC), the stack pointer (SP), the 16-bit data pointer (DPTR) and the control logic.',
      sw: 'A step() function. It reads the opcode at PC, picks the action from a decode table, updates the registers and returns how many machine cycles the instruction took.',
      f: ['8-bit data path', '16-bit program counter, so up to 64 KB of code', 'Instructions take 1, 2 or 4 machine cycles'],
    },
    rom: {
      t: 'Program ROM',
      hw: 'The original 8051 has 4 KB of on-chip program memory (mask ROM; the 8751 used EPROM and the 89C51 uses Flash). Program and data memories are separate, which is called a Harvard design. External code memory can extend the space to 64 KB.',
      sw: 'A 64 KB byte array. The assembler writes machine code into it, and the CPU reads it using the PC.',
      f: ['4 KB on chip', 'Addresses 0000H to 0FFFH', 'Reset starts execution at 0000H'],
    },
    ram: {
      t: 'Internal RAM',
      hw: 'The chip has 128 bytes of on-chip data RAM. It holds four register banks, 16 bytes of bit-addressable space, general scratchpad memory and the stack.',
      sw: 'A 128-byte array. Register Rn is simply iram[bank * 8 + n], and the stack lives in the same array.',
      f: ['128 bytes, addresses 00H to 7FH', 'Four banks of R0 to R7', '128 individually addressable bits'],
    },
    sfr: {
      t: 'Special function registers',
      hw: 'The special function registers (SFRs) sit at addresses 80H to FFH. They are how software talks to the hardware: ports, timers, the serial buffer, interrupt enables, ACC, B, PSW and SP.',
      sw: 'A second array or dictionary of registers. Writing to P1 is not just storing a number, it must also update whatever is wired to the pins.',
      f: ['Direct addressing only', 'P0 80H, P1 90H, P2 A0H, P3 B0H', 'ACC E0H, B F0H, PSW D0H, SP 81H'],
    },
    osc: {
      t: 'Oscillator and timing',
      hw: 'An on-chip oscillator driven by a crystal, commonly 11.0592 MHz, on XTAL1 and XTAL2. One machine cycle is 12 oscillator periods, so at 11.0592 MHz it lasts about 1.085 microseconds.',
      sw: 'A cycle counter. Each executed instruction adds its machine cycles, and elapsed time is cycles x 12 / crystal frequency (11.0592 MHz in this simulator).',
      f: ['1 machine cycle = 12 clock periods', '11.0592 MHz crystal: 1.085 microseconds per cycle', 'ALE pulses at 1/6 of the clock'],
    },
    timers: {
      t: 'Timers / counters',
      hw: 'Two 16-bit timer/counters, Timer 0 and Timer 1, set up through TMOD and TCON. In timer mode they count machine cycles. In counter mode they count pulses on the T0 or T1 pin.',
      sw: 'Counters (TH:TL) that grow after each instruction by the cycles it used. When one overflows, the simulator sets its flag (TF0 or TF1).',
      f: ['Two 16-bit counters', 'Timer mode counts machine cycles', 'Overflow sets TF0 or TF1'],
    },
    int: {
      t: 'Interrupt control',
      hw: 'Five interrupt sources: external INT0 and INT1, Timer 0, Timer 1 and the serial port. Each has its own vector address (0003H, 000BH, 0013H, 001BH and 0023H), and two priority levels are available.',
      sw: 'After each instruction the simulator checks the interrupt flags. If one is enabled (EA and its bit in IE), it pushes PC onto the stack and jumps to the vector.',
      f: ['5 sources, 2 priority levels', 'Enabled through the IE register', 'Vectors start at 0003H'],
    },
    serial: {
      t: 'Serial port',
      hw: 'A full-duplex UART. Software sends and receives through the SBUF register (99H). Data leaves on TXD (P3.1) and arrives on RXD (P3.0), with flags TI and RI in SCON.',
      sw: 'A transmit shift register and a receive buffer. Writing SBUF starts a 10-bit frame whose length comes from TH1 (32 x (256 - TH1) cycles per bit). When the frame ends, the simulator sets TI. Try it on the Run it page.',
      f: ['Full duplex', 'SBUF at 99H, SCON at 98H', 'TXD is P3.1, RXD is P3.0'],
    },
    ports: {
      t: 'I/O ports',
      hw: 'Four 8-bit ports, P0 to P3, give 32 I/O lines. Each pin has a latch. Software writes the latch, and the pin driver puts that level on the leg of the chip.',
      sw: 'Four 8-bit values. When one changes, the interface redraws whatever is connected: an LED, a 7-segment display or a line on the oscilloscope.',
      f: ['32 I/O lines', 'All ports reset to FFH', 'Port 0 needs external pull-ups'],
    },
  };

  function blocks() {
    const info = $('blockInfo');
    let sel = null;
    function show(k) {
      const b = BLOCKS[k];
      info.innerHTML = '<h2>' + b.t + '</h2>' +
        '<h3 class="mini">In the hardware</h3><p>' + b.hw + '</p>' +
        '<h3 class="mini">In the simulator</h3><p>' + b.sw + '</p>' +
        '<ul class="facts">' + b.f.map((x) => '<li>' + x + '</li>').join('') + '</ul>';
      if (sel) sel.classList.remove('sel');
      sel = document.querySelector('.bk[data-b="' + k + '"]');
      if (sel) sel.classList.add('sel');
    }
    document.querySelectorAll('.bk').forEach((g) => {
      g.addEventListener('click', () => show(g.dataset.b));
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(g.dataset.b); } });
    });
    show('cpu');
  }

  /* ---------- 3. memory ---------- */
  const SFRNAMES = { 0x80: 'P0', 0x81: 'SP', 0x82: 'DPL', 0x83: 'DPH', 0x87: 'PCON', 0x88: 'TCON', 0x89: 'TMOD', 0x8A: 'TL0', 0x8B: 'TL1', 0x8C: 'TH0', 0x8D: 'TH1', 0x90: 'P1', 0x98: 'SCON', 0x99: 'SBUF', 0xA0: 'P2', 0xA8: 'IE', 0xB0: 'P3', 0xB8: 'IP', 0xD0: 'PSW', 0xE0: 'ACC', 0xF0: 'B' };
  const REGIONS = {
    banks: {
      t: 'Register banks (00H to 1FH)',
      text: 'Four banks of eight registers, R0 to R7. The RS1 and RS0 bits in PSW choose the active bank, and reset selects bank 0. Using Rn is short and fast because the register number is part of the opcode.',
      ex: 'MOV R3,#25H',
    },
    bits: {
      t: 'Bit-addressable RAM (20H to 2FH)',
      text: 'These 16 bytes are also 128 individual bits, with bit addresses 00H to 7FH. The 8051 can set, clear, test and toggle each bit with one instruction.',
      ex: 'SETB 20H.3',
    },
    scratch: {
      t: 'General RAM (30H to 7FH)',
      text: 'Free scratchpad space, and where the stack usually lives. After reset SP is 07H, and PUSH increments SP before storing, so the first push lands at 08H (inside bank 1). Programs that use the stack often start with MOV SP,#30H.',
      ex: 'MOV 30H,#0FFH',
    },
    sfr: {
      t: 'Special function registers (80H to FFH)',
      text: 'This is where software meets hardware. Ports, timers, the serial buffer, interrupt enables, ACC, B, PSW and SP live here. They can only be reached with direct addressing.',
      ex: 'MOV P1,#0AAH',
    },
    rom: {
      t: 'On-chip program memory (0000H to 0FFFH)',
      text: 'The 4 KB program space. Reset starts execution at 0000H. The interrupt vectors are fixed: 0003H for INT0, 000BH for Timer 0, 0013H for INT1, 001BH for Timer 1 and 0023H for the serial port. Programs normally start with a jump over this area.',
      ex: 'LJMP 0100H',
    },
    ext: {
      t: 'External program memory (1000H to FFFFH)',
      text: 'The code space can grow to 64 KB with external memory, read with the PSEN strobe. With EA tied low, all code is fetched externally. External data memory is a separate 64 KB space, reached with MOVX.',
      ex: 'MOVX A,@DPTR',
    },
  };

  function memory() {
    const info = $('regionInfo');
    let sel = null;
    function show(k) {
      const r = REGIONS[k];
      let extra = '';
      if (k === 'sfr') {
        extra = '<div class="sfrs">' + Object.keys(SFRNAMES).map((a) => '<span><b>' + SFRNAMES[a] + '</b> ' + (+a).toString(16).toUpperCase() + 'H</span>').join('') + '</div>';
      }
      info.innerHTML = '<h2>' + r.t + '</h2><p>' + r.text + '</p><p class="ex">Example: <code>' + r.ex + '</code></p>' + extra;
      if (sel) sel.classList.remove('sel');
      sel = document.querySelector('.mseg[data-r="' + k + '"]');
      if (sel) sel.classList.add('sel');
    }
    document.querySelectorAll('.mseg').forEach((b) => b.addEventListener('click', () => show(b.dataset.r)));
    show('banks');

    const inp = $('addr'), out = $('addrOut');
    function inspect() {
      const t = inp.value.trim().replace(/h$/i, '');
      if (!/^[0-9a-f]{1,2}$/i.test(t)) { out.textContent = 'Type a hex address from 00 to FF.'; return; }
      const a = parseInt(t, 16), hx = a.toString(16).toUpperCase().padStart(2, '0') + 'H';
      let msg;
      if (a < 0x20) msg = hx + ' is register R' + (a & 7) + ' of bank ' + (a >> 3) + '. Bank ' + (a >> 3) + ' is active when RS1:RS0 = ' + ((a >> 3) >> 1) + (((a >> 3) & 1)) + '.';
      else if (a < 0x30) msg = hx + ' is a bit-addressable byte. Its bits are bit addresses ' + ((a - 0x20) * 8).toString(16).toUpperCase().padStart(2, '0') + 'H to ' + ((a - 0x20) * 8 + 7).toString(16).toUpperCase().padStart(2, '0') + 'H.';
      else if (a < 0x80) msg = hx + ' is general-purpose RAM. It is also a valid stack location.';
      else if (SFRNAMES[a]) msg = hx + ' is the special function register ' + SFRNAMES[a] + '. Reach it with direct addressing.';
      else msg = hx + ' is in the SFR area, but no register is defined there on the 8051. On the 8052, indirect access to this address reaches 128 extra bytes of RAM.';
      out.textContent = msg;
    }
    inp.addEventListener('input', inspect);
    inspect();
  }

  /* ---------- 4. one instruction ---------- */
  function cycle() {
    const S = { step: 0, busy: false, playing: false, pc: 0, ir: null, mnem: '', a: 0, cycles: 0, operand: 0x05 };
    const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');
    const hex4 = (n) => n.toString(16).toUpperCase().padStart(4, '0');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const packet = $('packet'), packetTxt = $('packetTxt');
    const blocksIds = ['b-rom', 'b-dec', 'b-pc', 'b-acc'];

    const setActive = (ids) => blocksIds.forEach((b) => $(b).classList.toggle('active', ids.includes(b)));
    const setRows = (r0, r1) => { $('row0').classList.toggle('on', r0); $('row1').classList.toggle('on', r1); };
    const say = (t, x) => { $('cyTitle').textContent = t; $('cyText').textContent = x; };

    function render() {
      $('pcVal').textContent = hex4(S.pc);
      $('irVal').textContent = S.ir === null ? '--' : hex2(S.ir);
      $('mnem').textContent = S.mnem;
      $('aVal').textContent = hex2(S.a);
      $('row1txt').textContent = '0001   ' + hex2(S.operand);
      $('cyNo').textContent = 'Step ' + S.step + ' of 4';
      $('cyCycles').textContent = S.cycles ? '1 machine cycle = 1.085 \u00b5s at 11.0592 MHz' : '0 machine cycles';
      $('cyStep').textContent = S.step === 4 ? 'Run again' : 'Step';
      $('cyStep').disabled = S.busy;
      $('cyAuto').disabled = S.busy || S.step === 4;
      $('cyAuto').textContent = S.playing ? 'Pause' : 'Play all';
      if (S.playing) $('cyAuto').disabled = false;
      $('cyReset').disabled = S.busy && !S.playing;
    }

    async function fly(pathId, label, ms) {
      ms = ms || 800;
      const path = $(pathId), len = path.getTotalLength();
      packetTxt.textContent = label;
      path.classList.add('lit');
      packet.setAttribute('opacity', '1');
      const place = (d) => { const pt = path.getPointAtLength(d); packet.setAttribute('transform', 'translate(' + (pt.x - 30) + ' ' + (pt.y - 13) + ')'); };
      if (reduce) { place(len); await sleep(250); }
      else {
        await new Promise((res) => {
          const t0 = performance.now();
          const f = (t) => {
            const k = Math.min((t - t0) / ms, 1);
            const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
            place(len * e);
            if (k < 1) requestAnimationFrame(f); else res();
          };
          requestAnimationFrame(f);
        });
        await sleep(120);
      }
      packet.setAttribute('opacity', '0');
      path.classList.remove('lit');
    }

    const steps = [
      async () => {
        setActive(['b-pc', 'b-rom']); setRows(true, false);
        say('1. Fetch the opcode', 'The PC holds 0000, so it sends that address to program ROM. ROM answers with the byte 74, which lands in the decoder. The PC then moves on to 0001.');
        await fly('pcRom', '0000');
        setActive(['b-rom', 'b-dec']);
        await fly('romDec', '74');
        S.ir = 0x74; S.pc = 1;
      },
      async () => {
        setActive(['b-dec']); setRows(false, false);
        S.mnem = 'MOV A,#data'; render();
        say('2. Decode', '74 means MOV A,#data: load the accumulator with the very next byte. The decoder now knows it needs one more byte before it can finish.');
        await sleep(reduce ? 200 : 900);
      },
      async () => {
        setActive(['b-pc', 'b-rom']); setRows(false, true);
        say('3. Fetch the operand', 'The PC sends 0001 to ROM. The value ' + hex2(S.operand) + ' travels along the data bus and waits at the accumulator input.');
        await fly('pcRom', '0001');
        await fly('operand', hex2(S.operand), 1100);
        S.pc = 2;
      },
      async () => {
        setActive(['b-dec', 'b-acc']); setRows(false, false);
        say('4. Execute', 'The decoder tells the accumulator to load. ' + hex2(S.operand) + ' goes in, so A is now ' + hex2(S.operand) + 'H. The PC already points at 0002, ready for the next instruction.');
        await fly('decAcc', 'LOAD');
        await fly('busAcc', hex2(S.operand), 500);
        S.a = S.operand; S.cycles = 1;
      },
    ];

    function resetState() {
      const op = S.operand;
      Object.assign(S, { step: 0, busy: false, playing: false, pc: 0, ir: null, mnem: '', a: 0, cycles: 0, operand: op });
      setActive([]); setRows(false, false);
      packet.setAttribute('opacity', '0');
      document.querySelectorAll('#flow .wires path').forEach((p) => p.classList.remove('lit'));
      say('Ready. Nothing has run yet.', 'The program sits in ROM as two bytes: 74 (the opcode) and the value to load. The program counter, PC, points at address 0000.');
      render();
    }
    async function doStep() {
      if (S.busy) return;
      if (S.step === 4) resetState();
      S.busy = true; render();
      await steps[S.step]();
      S.step += 1; S.busy = false; render();
    }
    async function playAll() {
      if (S.playing) { S.playing = false; render(); return; }
      if (S.step === 4) resetState();
      S.playing = true; render();
      while (S.playing && S.step < 4) { await doStep(); if (S.playing && S.step < 4) await sleep(reduce ? 200 : 500); }
      S.playing = false; render();
    }
    $('cyStep').addEventListener('click', doStep);
    $('cyAuto').addEventListener('click', playAll);
    $('cyReset').addEventListener('click', () => { S.playing = false; resetState(); });
    const input = $('cyIn');
    input.addEventListener('input', () => {
      const clean = input.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 2).toUpperCase();
      input.value = clean;
      if (clean.length) { S.operand = parseInt(clean, 16); if (!S.busy) resetState(); }
    });
    input.addEventListener('blur', () => { if (!input.value) input.value = hex2(S.operand); });
    resetState();
  }

  /* ---------- 5. machine code ---------- */
  function code() {
    const { assemble, CPU, hex2, hex4 } = window.Sim;
    const SIZE = { '#d': 1, '#d16': 2, dir: 1, bit: 1, rel: 1, a16: 2 };
    const ROLE = { '#d': ['data'], '#d16': ['data high', 'data low'], dir: ['address'], bit: ['bit address'], rel: ['offset'], a16: ['address high', 'address low'] };
    const inp = $('asmIn'), out = $('asmOut');
    const EXAMPLES = ['MOV A,#05H', 'MOV R3,A', 'ADD A,#20H', 'SETB P1.0', 'CLR C', 'DJNZ R7,$', 'MOV DPTR,#1234H', 'MOV 30H,#0FFH', 'MOV 40H,30H', 'MUL AB', 'LJMP 0100H'];
    const ex = $('examples');
    EXAMPLES.forEach((t) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chipbtn'; b.textContent = t;
      b.addEventListener('click', () => { inp.value = t; run(); });
      ex.appendChild(b);
    });

    function run() {
      const src = inp.value.trim();
      if (!src) { out.innerHTML = '<p class="dim">Type an instruction above.</p>'; return; }
      const res = assemble(src);
      if (res.errors.length || !res.listing.length || !res.listing[0].types) {
        out.innerHTML = '<p class="bad">' + (res.errors.length ? res.errors[0].msg : 'Enter one instruction, for example MOV A,#05H.') + '</p>';
        return;
      }
      const l = res.listing[0], types = l.types, bytes = l.bytes;
      const roles = ['opcode'];
      const sized = types.filter((t) => SIZE[t]);
      sized.forEach((t) => roles.push(...ROLE[t]));
      if (bytes[0] === 0x85) { roles[1] = 'source address'; roles[2] = 'destination address'; }
      const cpu = new CPU(); cpu.load(res.rom);
      const ok = cpu.step();
      const cyc = ok ? cpu.cycles : null;

      let html = '<div class="bytes">' + bytes.map((b, i) =>
        '<div class="bytebox' + (i === 0 ? ' op' : '') + '"><small>' + (roles[i] || 'byte') + '</small><b>' + hex2(b) + '</b><span class="bin">' + b.toString(2).padStart(8, '0').replace(/(\d{4})(\d{4})/, '$1 $2') + '</span></div>'
      ).join('') + '</div>';
      html += '<p class="stat"><b>' + bytes.length + '</b> ' + (bytes.length === 1 ? 'byte' : 'bytes') + ' in program memory' + (cyc ? ' &nbsp;|&nbsp; <b>' + cyc + '</b> machine ' + (cyc === 1 ? 'cycle' : 'cycles') + ' (' + (cyc * window.Sim.cycleUs).toFixed(2) + ' \u00b5s at 11.0592 MHz)' : '') + '</p>';
      const notes = [];
      const reg = types.indexOf('Rn'), ind = types.indexOf('@Ri');
      if (reg >= 0 || ind >= 0) {
        const cl = res.listing[0];
        const base = bytes[0] & (reg >= 0 ? 0xF8 : 0xFE);
        const n = bytes[0] - base;
        notes.push('The register number is part of the opcode. ' + hex2(base) + 'H + ' + n + ' = ' + hex2(bytes[0]) + 'H, so the CPU knows the register without reading another byte.');
      }
      if (types.includes('rel')) notes.push('The offset is relative: it is added to the address of the next instruction. A jump can reach 128 bytes back or 127 forward.');
      if (bytes[0] === 0x85) notes.push('MOV between two direct addresses stores the source address first, then the destination, even though you write the destination first.');
      if (types.includes('#d') || types.includes('#d16')) notes.push('The value comes straight from program memory. That is called immediate addressing, and it is why the # sign is written.');
      out.innerHTML = html + notes.map((n) => '<p class="note">' + n + '</p>').join('');
    }
    inp.addEventListener('input', run);
    run();
  }

  /* ---------- 6. hardware to software ---------- */
  const TESTS = [
    { name: 'ADD with carry out', prog: 'MOV A,#0F0H\nADD A,#20H', exp: 'A = 10H, CY = 1', chk: (c) => c.acc === 0x10 && c.cy === 1, got: (c) => 'A = ' + h2(c.acc) + ', CY = ' + c.cy },
    { name: 'ADD wrapping to zero', prog: 'MOV A,#0FFH\nADD A,#01H', exp: 'A = 00H, CY = 1, AC = 1', chk: (c) => c.acc === 0 && c.cy === 1 && c.ac === 1, got: (c) => 'A = ' + h2(c.acc) + ', CY = ' + c.cy + ', AC = ' + c.ac },
    { name: 'BCD addition: 38 + 45', prog: 'MOV A,#38H\nADD A,#45H\nDA A', exp: 'A = 83H', chk: (c) => c.acc === 0x83, got: (c) => 'A = ' + h2(c.acc) },
    { name: 'MUL AB: 10 x 30', prog: 'MOV A,#10\nMOV B,#30\nMUL AB', exp: 'A = 2CH, B = 01H, OV = 1', chk: (c) => c.acc === 0x2C && c.b === 1 && c.ov === 1, got: (c) => 'A = ' + h2(c.acc) + ', B = ' + h2(c.b) + ', OV = ' + c.ov },
    { name: 'DIV AB: 100 / 7', prog: 'MOV A,#100\nMOV B,#7\nDIV AB', exp: 'A = 0EH, B = 02H', chk: (c) => c.acc === 14 && c.b === 2, got: (c) => 'A = ' + h2(c.acc) + ', B = ' + h2(c.b) },
    { name: 'Parity flag for 07H', prog: 'MOV A,#07H', exp: 'P = 1 (three ones)', chk: (c) => (c.psw & 1) === 1, got: (c) => 'P = ' + (c.psw & 1) },
    { name: 'PUSH moves SP up first', prog: 'MOV SP,#30H\nMOV A,#5AH\nPUSH ACC', exp: 'SP = 31H, RAM[31H] = 5AH', chk: (c) => c.sp === 0x31 && c.iram[0x31] === 0x5A, got: (c) => 'SP = ' + h2(c.sp) + ', RAM[31H] = ' + h2(c.iram[0x31]) },
    { name: 'UART frame at 9600 baud', prog: 'MOV TMOD,#20H\nMOV TH1,#0FDH\nSETB TR1\nMOV SCON,#50H\nMOV SBUF,#41H\nJNB TI,$', exp: 'sends 41H, 960 cycles (96 per bit)', max: 3000, chk: (c) => c.txLog.length === 1 && c.txLog[0].byte === 0x41 && c.txLog[0].cpb * 10 === 960 && ((c.sfr[0x98] >> 1) & 1) === 1, got: (c) => c.txLog.length ? h2(c.txLog[0].byte) + ', ' + c.txLog[0].cpb * 10 + ' cycles, ' + Math.round(c.baud()) + ' baud' : 'nothing sent' },
    { name: 'UART needs Timer 1 running', prog: 'MOV TH1,#0FDH\nMOV SCON,#50H\nMOV SBUF,#41H\nMOV R6,#8\nL: MOV R7,#255\nM: DJNZ R7,M\nDJNZ R6,L', exp: 'TI stays 0 (no baud clock)', max: 4000, chk: (c) => ((c.sfr[0x98] >> 1) & 1) === 0 && c.txLog.length === 0, got: (c) => 'TI = ' + ((c.sfr[0x98] >> 1) & 1) },
    { name: 'Delay loop timing', prog: 'MOV R7,#10\nDJNZ R7,$', exp: '1 + 10 x 2 = 21 cycles', chk: (c) => c.cycles === 21, got: (c) => c.cycles + ' cycles', noIdle: true },
  ];
  function h2(n) { return (n & 255).toString(16).toUpperCase().padStart(2, '0') + 'H'; }

  function model() {
    const { assemble, CPU } = window.Sim;

    const tb = $('tests').querySelector('tbody');
    let pass = 0;
    tb.innerHTML = TESTS.map((t) => {
      const r = assemble(t.prog + (t.noIdle ? '' : '\nSJMP $'));
      const c = new CPU(); c.load(r.rom);
      const cutoff = t.noIdle ? 2 : (t.max || 50);
      let n = 0;
      if (t.noIdle) { while (n < 50 && c.pc < r.listing[r.listing.length - 1].addr + r.listing[r.listing.length - 1].bytes.length && c.step()) { n++; if (c.cycles >= 21) break; } }
      else { while (n < cutoff && c.step() && !c.idle) n++; }
      const ok = t.chk(c);
      if (ok) pass++;
      return '<tr><td>' + t.name + '<br><code class="p">' + t.prog.replace(/\n/g, ' ; ') + '</code></td><td>' + t.exp + '</td><td>' + t.got(c) + '</td><td class="' + (ok ? 'okc' : 'badc') + '">' + (ok ? 'match' : 'differs') + '</td></tr>';
    }).join('');
    $('testSum').textContent = pass + ' of ' + TESTS.length + ' checks match.';
  }

  const inits = { landing, chip, blocks, memory, cycle, code, model };
  if (inits[page]) inits[page]();
})();