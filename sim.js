/* 8051 assembler + CPU core. Plain JS, no dependencies. */
(function (root) {
  'use strict';

  const hex2 = (n) => (n & 255).toString(16).toUpperCase().padStart(2, '0');
  const hex4 = (n) => (n & 65535).toString(16).toUpperCase().padStart(4, '0');
  const XTAL = 11059200;            /* crystal in Hz: the usual choice for exact UART baud rates */
  const CYCLE_US = 12e6 / XTAL;     /* one machine cycle = 12 oscillator periods = 1.0851 us */

  const SFR = {
    P0: 0x80, SP: 0x81, DPL: 0x82, DPH: 0x83, PCON: 0x87, TCON: 0x88, TMOD: 0x89,
    TL0: 0x8A, TL1: 0x8B, TH0: 0x8C, TH1: 0x8D, P1: 0x90, SCON: 0x98, SBUF: 0x99,
    P2: 0xA0, IE: 0xA8, P3: 0xB0, IP: 0xB8, PSW: 0xD0, ACC: 0xE0, B: 0xF0,
  };
  const BITSFR = { P0: 0x80, TCON: 0x88, P1: 0x90, SCON: 0x98, P2: 0xA0, IE: 0xA8, P3: 0xB0, IP: 0xB8, PSW: 0xD0, ACC: 0xE0, A: 0xE0, B: 0xF0 };
  const BITNAMES = {
    CY: 0xD7, AC: 0xD6, F0: 0xD5, RS1: 0xD4, RS0: 0xD3, OV: 0xD2, P: 0xD0,
    EA: 0xAF, ES: 0xAC, ET1: 0xAB, EX1: 0xAA, ET0: 0xA9, EX0: 0xA8,
    TF1: 0x8F, TR1: 0x8E, TF0: 0x8D, TR0: 0x8C, IE1: 0x8B, IT1: 0x8A, IE0: 0x89, IT0: 0x88,
    RI: 0x98, TI: 0x99,
  };

  /* mnemonic, operand types, base opcode.
     Rn / @Ri types add the register number to the opcode. */
  const T = [
    ['NOP', [], 0x00],
    ['MOV', ['A', '#d'], 0x74], ['MOV', ['A', 'Rn'], 0xE8], ['MOV', ['A', '@Ri'], 0xE6], ['MOV', ['A', 'dir'], 0xE5],
    ['MOV', ['Rn', '#d'], 0x78], ['MOV', ['Rn', 'A'], 0xF8], ['MOV', ['Rn', 'dir'], 0xA8],
    ['MOV', ['dir', 'A'], 0xF5], ['MOV', ['dir', 'Rn'], 0x88], ['MOV', ['dir', '@Ri'], 0x86],
    ['MOV', ['dir', '#d'], 0x75], ['MOV', ['dir', 'dir'], 0x85],
    ['MOV', ['@Ri', 'A'], 0xF6], ['MOV', ['@Ri', '#d'], 0x76], ['MOV', ['@Ri', 'dir'], 0xA6],
    ['MOV', ['DPTR', '#d16'], 0x90], ['MOV', ['C', 'bit'], 0xA2], ['MOV', ['bit', 'C'], 0x92],
    ['MOVC', ['A', '@A+DPTR'], 0x93],
    ['INC', ['A'], 0x04], ['INC', ['Rn'], 0x08], ['INC', ['dir'], 0x05], ['INC', ['@Ri'], 0x06], ['INC', ['DPTR'], 0xA3],
    ['DEC', ['A'], 0x14], ['DEC', ['Rn'], 0x18], ['DEC', ['dir'], 0x15], ['DEC', ['@Ri'], 0x16],
    ['ADD', ['A', '#d'], 0x24], ['ADD', ['A', 'Rn'], 0x28], ['ADD', ['A', 'dir'], 0x25], ['ADD', ['A', '@Ri'], 0x26],
    ['ADDC', ['A', '#d'], 0x34], ['ADDC', ['A', 'Rn'], 0x38], ['ADDC', ['A', 'dir'], 0x35], ['ADDC', ['A', '@Ri'], 0x36],
    ['SUBB', ['A', '#d'], 0x94], ['SUBB', ['A', 'Rn'], 0x98], ['SUBB', ['A', 'dir'], 0x95], ['SUBB', ['A', '@Ri'], 0x96],
    ['ANL', ['A', '#d'], 0x54], ['ANL', ['A', 'Rn'], 0x58], ['ANL', ['A', 'dir'], 0x55], ['ANL', ['A', '@Ri'], 0x56],
    ['ANL', ['dir', 'A'], 0x52], ['ANL', ['dir', '#d'], 0x53], ['ANL', ['C', 'bit'], 0x82],
    ['ORL', ['A', '#d'], 0x44], ['ORL', ['A', 'Rn'], 0x48], ['ORL', ['A', 'dir'], 0x45], ['ORL', ['A', '@Ri'], 0x46],
    ['ORL', ['dir', 'A'], 0x42], ['ORL', ['dir', '#d'], 0x43], ['ORL', ['C', 'bit'], 0x72],
    ['XRL', ['A', '#d'], 0x64], ['XRL', ['A', 'Rn'], 0x68], ['XRL', ['A', 'dir'], 0x65], ['XRL', ['A', '@Ri'], 0x66],
    ['XRL', ['dir', 'A'], 0x62], ['XRL', ['dir', '#d'], 0x63],
    ['CLR', ['A'], 0xE4], ['CLR', ['C'], 0xC3], ['CLR', ['bit'], 0xC2],
    ['SETB', ['C'], 0xD3], ['SETB', ['bit'], 0xD2],
    ['CPL', ['A'], 0xF4], ['CPL', ['C'], 0xB3], ['CPL', ['bit'], 0xB2],
    ['RL', ['A'], 0x23], ['RR', ['A'], 0x03], ['RLC', ['A'], 0x33], ['RRC', ['A'], 0x13],
    ['SWAP', ['A'], 0xC4], ['DA', ['A'], 0xD4],
    ['XCH', ['A', 'Rn'], 0xC8], ['XCH', ['A', 'dir'], 0xC5], ['XCH', ['A', '@Ri'], 0xC6],
    ['MUL', ['AB'], 0xA4], ['DIV', ['AB'], 0x84],
    ['PUSH', ['dir'], 0xC0], ['POP', ['dir'], 0xD0],
    ['SJMP', ['rel'], 0x80], ['LJMP', ['a16'], 0x02],
    ['JZ', ['rel'], 0x60], ['JNZ', ['rel'], 0x70], ['JC', ['rel'], 0x40], ['JNC', ['rel'], 0x50],
    ['JB', ['bit', 'rel'], 0x20], ['JNB', ['bit', 'rel'], 0x30], ['JBC', ['bit', 'rel'], 0x10],
    ['DJNZ', ['Rn', 'rel'], 0xD8], ['DJNZ', ['dir', 'rel'], 0xD5],
    ['CJNE', ['A', '#d', 'rel'], 0xB4], ['CJNE', ['A', 'dir', 'rel'], 0xB5],
    ['CJNE', ['Rn', '#d', 'rel'], 0xB8], ['CJNE', ['@Ri', '#d', 'rel'], 0xB6],
    ['LCALL', ['a16'], 0x12], ['RET', [], 0x22], ['RETI', [], 0x32],
  ];

  const SIZE = { '#d': 1, '#d16': 2, dir: 1, bit: 1, rel: 1, a16: 2 };

  /* ---------- expressions ---------- */
  function numTok(tok, syms, pc) {
    const t = tok.trim();
    if (!t) return undefined;
    if (t === '$') return pc;
    let m = /^'(.)'$/.exec(t);
    if (m) return m[1].charCodeAt(0);
    if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t, 16);
    if (/^[0-9][0-9a-f]*h$/i.test(t)) return parseInt(t, 16);
    if (/^[01]+b$/i.test(t)) return parseInt(t, 2);
    if (/^[0-9]+d?$/i.test(t)) return parseInt(t, 10);
    const u = t.toUpperCase();
    if (u in syms) return syms[u];
    if (u in SFR) return SFR[u];
    return undefined;
  }

  function evalExpr(s, syms, pc) {
    const toks = s.trim().match(/[+-]|[^+-]+/g);
    if (!toks) return undefined;
    let total = 0, sign = 1;
    for (const tk of toks) {
      if (tk === '+') { sign = 1; continue; }
      if (tk === '-') { sign = -1; continue; }
      const v = numTok(tk, syms, pc);
      if (v === undefined) return undefined;
      total += sign * v;
      sign = 1;
    }
    return total;
  }

  function bitAddr(s, syms, pc) {
    const t = s.trim();
    const u = t.toUpperCase();
    if (u in BITNAMES) return BITNAMES[u];
    const m = /^([A-Za-z0-9_$]+)\.([0-7])$/.exec(t);
    if (m) {
      const bn = m[1].toUpperCase();
      const base = bn in BITSFR ? BITSFR[bn] : evalExpr(m[1], syms, pc);
      if (base === undefined) return undefined;
      const b = +m[2];
      if (base >= 0x20 && base <= 0x2F) return (base - 0x20) * 8 + b;
      if (base >= 0x80 && (base & 7) === 0) return base + b;
      throw new Error('"' + m[1] + '" is not bit-addressable');
    }
    return evalExpr(t, syms, pc);
  }

  function splitOps(s) {
    const out = [];
    let cur = '', q = null;
    for (const ch of s) {
      if (q) { cur += ch; if (ch === q) q = null; }
      else if (ch === "'" || ch === '"') { q = ch; cur += ch; }
      else if (ch === ',') { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    if (cur.trim() !== '' || out.length) out.push(cur.trim());
    return out;
  }

  function classify(tok) {
    const t = tok.trim();
    const u = t.toUpperCase().replace(/\s+/g, '');
    if (u === 'A') return { k: 'A' };
    if (u === 'C' || u === 'CY') return { k: 'C' };
    if (u === 'AB') return { k: 'AB' };
    if (u === 'DPTR') return { k: 'DPTR' };
    if (u === '@A+DPTR') return { k: '@A+DPTR' };
    let m = /^R([0-7])$/.exec(u);
    if (m) return { k: 'Rn', n: +m[1] };
    m = /^@R([01])$/.exec(u);
    if (m) return { k: '@Ri', n: +m[1] };
    if (t[0] === '#') return { k: '#', e: t.slice(1) };
    return { k: 'x', e: t };
  }

  function need(type, c) {
    switch (type) {
      case 'A': case 'C': case 'AB': case 'DPTR': case 'Rn': case '@Ri': case '@A+DPTR': return c.k === type;
      case '#d': case '#d16': return c.k === '#';
      default: return c.k === 'x';
    }
  }

  function findEntry(mn, cls) {
    for (const e of T) {
      if (e[0] !== mn || e[1].length !== cls.length) continue;
      if (e[1].every((t, i) => need(t, cls[i]))) return e;
    }
    return null;
  }

  /* ---------- assembler ---------- */
  function assemble(src) {
    const errors = [];
    const syms = Object.create(null);
    const items = [];
    const rom = new Uint8Array(65536);

    src.split(/\r?\n/).forEach((raw, i) => {
      let line = raw.replace(/;.*$/, '').trim();
      if (!line) return;
      const ln = i + 1;
      let label = null;
      let m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line);
      if (m) { label = m[1].toUpperCase(); line = m[2].trim(); }
      m = /^([A-Za-z_][A-Za-z0-9_]*)\s+EQU\s+(.+)$/i.exec(line);
      if (m) { items.push({ ln, equ: m[1].toUpperCase(), val: m[2] }); return; }
      items.push({ ln, label, text: line });
    });

    /* pass 1: sizes and addresses */
    let pc = 0;
    for (const it of items) {
      try {
        if (it.equ) {
          const v = evalExpr(it.val, syms, pc);
          if (v === undefined) throw new Error('Cannot evaluate "' + it.val + '"');
          syms[it.equ] = v;
          continue;
        }
        if (it.label) {
          if (it.label in syms) throw new Error('Label "' + it.label + '" is defined twice');
          syms[it.label] = pc;
        }
        if (!it.text) continue;
        const m = /^([A-Za-z]+)\s*(.*)$/.exec(it.text);
        if (!m) throw new Error('Cannot read "' + it.text + '"');
        const mn = m[1].toUpperCase();
        const rest = m[2].trim();
        it.mn = mn;
        it.addr = pc;
        if (mn === 'ORG') {
          const v = evalExpr(rest, syms, pc);
          if (v === undefined || v < 0 || v > 0xFFFF) throw new Error('Bad ORG address');
          pc = v; it.dir = true; continue;
        }
        if (mn === 'END') { it.dir = true; it.end = true; break; }
        if (mn === 'DB') {
          it.db = splitOps(rest);
          let n = 0;
          for (const tk of it.db) n += /^(['"]).{2,}\1$/.test(tk) ? tk.length - 2 : 1;
          it.size = n; it.addr = pc; pc += n; continue;
        }
        const ops = rest ? splitOps(rest) : [];
        it.cls = ops.map(classify);
        it.entry = findEntry(mn, it.cls);
        if (!it.entry) throw new Error('Cannot assemble "' + it.text + '"');
        it.size = 1 + it.entry[1].reduce((s, t) => s + (SIZE[t] || 0), 0);
        pc += it.size;
      } catch (e) {
        errors.push({ line: it.ln, msg: e.message });
      }
    }

    /* pass 2: encode */
    const listing = [];
    for (const it of items) {
      if (it.equ || it.dir || (!it.entry && !it.db)) continue;
      try {
        const bytes = [];
        if (it.db) {
          for (const tk of it.db) {
            const q = /^(['"])(.*)\1$/.exec(tk);
            if (q && q[2].length !== 1) { for (const ch of q[2]) bytes.push(ch.charCodeAt(0) & 255); continue; }
            const v = evalExpr(tk, syms, it.addr);
            if (v === undefined) throw new Error('Unknown symbol in "' + tk + '"');
            bytes.push(v & 255);
          }
        } else {
          const e = it.entry;
          let op = e[2];
          const vals = [];
          const next = it.addr + it.size;
          e[1].forEach((t, i) => {
            const c = it.cls[i];
            if (t === 'Rn' || t === '@Ri') { op += c.n; return; }
            if (!SIZE[t]) return;
            let v;
            if (t === 'bit') v = bitAddr(c.e, syms, it.addr);
            else v = evalExpr(c.e, syms, it.addr);
            if (v === undefined) throw new Error('Unknown symbol in "' + c.e + '"');
            if (t === '#d') {
              if (v < -128 || v > 255) throw new Error('Value ' + v + ' does not fit in one byte');
              vals.push([v & 255]);
            } else if (t === '#d16') {
              vals.push([(v >> 8) & 255, v & 255]);
            } else if (t === 'dir' || t === 'bit') {
              if (v < 0 || v > 255) throw new Error('Address ' + v + ' is out of range');
              vals.push([v]);
            } else if (t === 'rel') {
              const off = v - next;
              if (off < -128 || off > 127) throw new Error('Jump target is too far (' + off + ' bytes)');
              vals.push([off & 255]);
            } else if (t === 'a16') {
              vals.push([(v >> 8) & 255, v & 255]);
            }
          });
          if (op === 0x85) vals.reverse(); /* MOV dir,dir stores source first */
          bytes.push(op);
          vals.forEach((v) => bytes.push(...v));
        }
        bytes.forEach((b, k) => { rom[(it.addr + k) & 0xFFFF] = b; });
        listing.push({ addr: it.addr, bytes, text: it.text, line: it.ln, label: it.label, types: it.entry ? it.entry[1] : null });
      } catch (e) {
        errors.push({ line: it.ln, msg: e.message });
      }
    }
    return { rom, listing, errors, syms };
  }

  /* ---------- CPU ---------- */
  class CPU {
    constructor() { this.rom = new Uint8Array(65536); this.reset(); }
    load(rom) { this.rom.set(rom); this.reset(); }
    reset() {
      this.iram = new Uint8Array(256);
      this.sfr = new Uint8Array(256);
      this.sfr[0x80] = this.sfr[0x90] = this.sfr[0xA0] = this.sfr[0xB0] = 0xFF;
      this.sfr[0x81] = 7;
      this.pc = 0; this.cycles = 0; this.steps = 0;
      this.halted = null; this.idle = false;
      this.log = [{ t: 0, p: [0xFF, 0xFF, 0xFF, 0xFF] }];
      this.tx = { busy: false, byte: 0, start: 0, cpb: 0, end: 0 };
      this.txLog = [];
      this.txText = '';
    }
    get acc() { return this.sfr[0xE0]; }
    set acc(v) { this.sfr[0xE0] = v & 255; }
    get b() { return this.sfr[0xF0]; }
    set b(v) { this.sfr[0xF0] = v & 255; }
    get sp() { return this.sfr[0x81]; }
    set sp(v) { this.sfr[0x81] = v & 255; }
    get dptr() { return (this.sfr[0x83] << 8) | this.sfr[0x82]; }
    set dptr(v) { this.sfr[0x83] = (v >> 8) & 255; this.sfr[0x82] = v & 255; }
    get psw() {
      let p = this.sfr[0xE0];
      p ^= p >> 4; p ^= p >> 2; p ^= p >> 1;
      return (this.sfr[0xD0] & 0xFE) | (p & 1);
    }
    flag(mask) { return (this.sfr[0xD0] & mask) ? 1 : 0; }
    setFlag(mask, v) { this.sfr[0xD0] = v ? (this.sfr[0xD0] | mask) : (this.sfr[0xD0] & ~mask & 255); }
    get cy() { return this.flag(0x80); } set cy(v) { this.setFlag(0x80, v); }
    get ac() { return this.flag(0x40); } set ac(v) { this.setFlag(0x40, v); }
    get ov() { return this.flag(0x04); } set ov(v) { this.setFlag(0x04, v); }
    get bank() { return (this.sfr[0xD0] >> 3) & 3; }
    R(n) { return this.iram[this.bank * 8 + n]; }
    setR(n, v) { this.iram[this.bank * 8 + n] = v & 255; }
    read(a) { if (a < 0x80) return this.iram[a]; if (a === 0xD0) return this.psw; return this.sfr[a]; }
    write(a, v) {
      v &= 255;
      if (a === 0x99) { this.txStart(v); return; }   /* SBUF write loads the transmit shift register */
      if (a < 0x80) this.iram[a] = v; else this.sfr[a] = v;
    }

    /* ---- UART, mode 1 (8-bit), baud clock from Timer 1 mode 2 ----
       One bit lasts 32 x (256 - TH1) machine cycles (halved when SMOD = 1).
       With an 11.0592 MHz crystal, TH1 = FDH gives exactly 9600 baud. */
    cyclesPerBit() { const smod = (this.sfr[0x87] >> 7) & 1; return (32 * (256 - this.sfr[0x8D])) / (smod ? 2 : 1); }
    baud() { return XTAL / 12 / this.cyclesPerBit(); }
    txStart(v) {
      const cpb = this.cyclesPerBit(), run = this.sfr[0x88] & 0x40;   /* TR1 must be running */
      this.tx = { busy: true, byte: v, start: this.cycles, cpb, end: run ? this.cycles + 10 * cpb : Infinity };
    }
    uartTick() {
      const t = this.tx;
      if (!t.busy) return;
      if (t.end === Infinity && (this.sfr[0x88] & 0x40)) t.end = this.cycles + 10 * t.cpb;
      if (this.cycles >= t.end) {
        t.busy = false;
        this.sfr[0x98] |= 2;                                          /* hardware sets TI */
        this.txLog.push({ byte: t.byte, start: t.start, cpb: t.cpb });
        if (this.txLog.length > 200) this.txLog.shift();
        this.txText += String.fromCharCode(t.byte);
        if (this.txText.length > 400) this.txText = this.txText.slice(-400);
      }
    }
    receive(b) {                                                      /* a byte arrives on RXD */
      if (!(this.sfr[0x98] & 0x10)) return false;                     /* needs REN = 1 */
      this.sfr[0x99] = b & 255; this.sfr[0x98] |= 1;                  /* hardware sets RI */
      return true;
    }
    fetch() { const v = this.rom[this.pc]; this.pc = (this.pc + 1) & 0xFFFF; return v; }
    rel() { const r = this.fetch(); return r > 127 ? r - 256 : r; }
    jump(r) { this.pc = (this.pc + r) & 0xFFFF; }
    getBit(b) {
      if (b < 0x80) return (this.iram[0x20 + (b >> 3)] >> (b & 7)) & 1;
      return (this.read(b & 0xF8) >> (b & 7)) & 1;
    }
    setBit(b, v) {
      const m = 1 << (b & 7);
      if (b < 0x80) { const a = 0x20 + (b >> 3); this.iram[a] = v ? (this.iram[a] | m) : (this.iram[a] & ~m & 255); }
      else { const a = b & 0xF8; const cur = this.read(a); this.write(a, v ? (cur | m) : (cur & ~m)); }
    }
    push(v) { this.sp = this.sp + 1; this.iram[this.sp] = v & 255; }
    pop() { const v = this.iram[this.sp]; this.sp = this.sp - 1; return v; }

    add(v, c) {
      const a = this.acc, r = a + v + c;
      this.cy = r > 0xFF ? 1 : 0;
      this.ac = ((a & 15) + (v & 15) + c) > 15 ? 1 : 0;
      const c6 = ((a & 127) + (v & 127) + c) > 127 ? 1 : 0;
      this.ov = this.cy !== c6 ? 1 : 0;
      this.acc = r & 255;
    }
    sub(v) {
      const c = this.cy, a = this.acc, r = a - v - c;
      this.ac = ((a & 15) - (v & 15) - c) < 0 ? 1 : 0;
      const b6 = ((a & 127) - (v & 127) - c) < 0 ? 1 : 0;
      this.cy = r < 0 ? 1 : 0;
      this.ov = this.cy !== b6 ? 1 : 0;
      this.acc = r & 255;
    }

    step() {
      if (this.halted) return false;
      const pc0 = this.pc;
      const op = this.fetch();
      const hi = op >> 4, lo = op & 15;
      let cyc = 1;
      const opVal = () => {
        if (lo === 4) return this.fetch();
        if (lo === 5) return this.read(this.fetch());
        if (lo === 6 || lo === 7) return this.iram[this.R(lo & 1)];
        return this.R(lo & 7);
      };
      const unimpl = () => { this.halted = 'Opcode 0x' + hex2(op) + ' at ' + hex4(pc0) + ' is not supported in this web preview'; };
      const logic = (fn) => {
        if (lo === 2) { const d = this.fetch(); this.write(d, fn(this.read(d), this.acc)); }
        else if (lo === 3) { const d = this.fetch(); const im = this.fetch(); this.write(d, fn(this.read(d), im)); cyc = 2; }
        else if (lo >= 4) { this.acc = fn(this.acc, opVal()); }
        else unimpl();
      };

      switch (hi) {
        case 0x0:
          if (lo === 0) break;
          if (lo === 2) { const a = (this.fetch() << 8) | this.fetch(); this.pc = a; cyc = 2; if (a === pc0) this.idle = true; }
          else if (lo === 3) { const a = this.acc; this.acc = ((a >> 1) | (a << 7)) & 255; }
          else if (lo === 4) this.acc = this.acc + 1;
          else if (lo === 5) { const d = this.fetch(); this.write(d, this.read(d) + 1); }
          else if (lo === 6 || lo === 7) { const r = this.R(lo & 1); this.iram[r] = (this.iram[r] + 1) & 255; }
          else if (lo >= 8) this.setR(lo & 7, this.R(lo & 7) + 1);
          else unimpl();
          break;
        case 0x1:
          if (lo === 0) { const b = this.fetch(); const r = this.rel(); if (this.getBit(b)) { this.setBit(b, 0); this.jump(r); } cyc = 2; }
          else if (lo === 2) { const a = (this.fetch() << 8) | this.fetch(); this.push(this.pc & 255); this.push(this.pc >> 8); this.pc = a; cyc = 2; }
          else if (lo === 3) { const a = this.acc, c = this.cy; this.cy = a & 1; this.acc = (a >> 1) | (c << 7); }
          else if (lo === 4) this.acc = this.acc - 1;
          else if (lo === 5) { const d = this.fetch(); this.write(d, this.read(d) - 1); }
          else if (lo === 6 || lo === 7) { const r = this.R(lo & 1); this.iram[r] = (this.iram[r] - 1) & 255; }
          else if (lo >= 8) this.setR(lo & 7, this.R(lo & 7) - 1);
          else unimpl();
          break;
        case 0x2:
          if (lo === 0) { const b = this.fetch(); const r = this.rel(); if (this.getBit(b)) this.jump(r); cyc = 2; }
          else if (lo === 2) { const h = this.pop(), l = this.pop(); this.pc = (h << 8) | l; cyc = 2; }
          else if (lo === 3) { const a = this.acc; this.acc = ((a << 1) | (a >> 7)) & 255; }
          else if (lo >= 4) this.add(opVal(), 0);
          else unimpl();
          break;
        case 0x3:
          if (lo === 0) { const b = this.fetch(); const r = this.rel(); if (!this.getBit(b)) this.jump(r); cyc = 2; }
          else if (lo === 2) { const h = this.pop(), l = this.pop(); this.pc = (h << 8) | l; cyc = 2; }
          else if (lo === 3) { const a = this.acc, c = this.cy; this.cy = (a >> 7) & 1; this.acc = ((a << 1) | c) & 255; }
          else if (lo >= 4) this.add(opVal(), this.cy);
          else unimpl();
          break;
        case 0x4:
          if (lo === 0) { const r = this.rel(); if (this.cy) this.jump(r); cyc = 2; }
          else if (lo === 2 || lo === 3 || lo >= 4) logic((x, y) => x | y);
          else unimpl();
          break;
        case 0x5:
          if (lo === 0) { const r = this.rel(); if (!this.cy) this.jump(r); cyc = 2; }
          else if (lo === 2 || lo === 3 || lo >= 4) logic((x, y) => x & y);
          else unimpl();
          break;
        case 0x6:
          if (lo === 0) { const r = this.rel(); if (this.acc === 0) this.jump(r); cyc = 2; }
          else if (lo === 2 || lo === 3 || lo >= 4) logic((x, y) => x ^ y);
          else unimpl();
          break;
        case 0x7:
          if (lo === 0) { const r = this.rel(); if (this.acc !== 0) this.jump(r); cyc = 2; }
          else if (lo === 2) { const b = this.fetch(); this.cy = this.cy | this.getBit(b); cyc = 2; }
          else if (lo === 4) this.acc = this.fetch();
          else if (lo === 5) { const d = this.fetch(); this.write(d, this.fetch()); cyc = 2; }
          else if (lo === 6 || lo === 7) this.iram[this.R(lo & 1)] = this.fetch();
          else if (lo >= 8) this.setR(lo & 7, this.fetch());
          else unimpl();
          break;
        case 0x8:
          if (lo === 0) { const r = this.rel(); this.jump(r); cyc = 2; if (r === -2) this.idle = true; }
          else if (lo === 2) { const b = this.fetch(); this.cy = this.cy & this.getBit(b); cyc = 2; }
          else if (lo === 4) {
            const b = this.b;
            this.cy = 0;
            if (b === 0) this.ov = 1;
            else { const q = Math.floor(this.acc / b); this.b = this.acc % b; this.acc = q; this.ov = 0; }
            cyc = 4;
          }
          else if (lo === 5) { const s = this.fetch(); const d = this.fetch(); this.write(d, this.read(s)); cyc = 2; }
          else if (lo === 6 || lo === 7) { const d = this.fetch(); this.write(d, this.iram[this.R(lo & 1)]); cyc = 2; }
          else if (lo >= 8) { const d = this.fetch(); this.write(d, this.R(lo & 7)); cyc = 2; }
          else unimpl();
          break;
        case 0x9:
          if (lo === 0) { this.sfr[0x83] = this.fetch(); this.sfr[0x82] = this.fetch(); cyc = 2; }
          else if (lo === 2) { const b = this.fetch(); this.setBit(b, this.cy); cyc = 2; }
          else if (lo === 3) { this.acc = this.rom[(this.dptr + this.acc) & 0xFFFF]; cyc = 2; }
          else if (lo >= 4) this.sub(opVal());
          else unimpl();
          break;
        case 0xA:
          if (lo === 2) { const b = this.fetch(); this.cy = this.getBit(b); }
          else if (lo === 3) { this.dptr = this.dptr + 1; cyc = 2; }
          else if (lo === 4) {
            const r = this.acc * this.b;
            this.acc = r & 255; this.b = r >> 8; this.cy = 0; this.ov = r > 255 ? 1 : 0; cyc = 4;
          }
          else if (lo === 6 || lo === 7) { const d = this.fetch(); this.iram[this.R(lo & 1)] = this.read(d); cyc = 2; }
          else if (lo >= 8) { const d = this.fetch(); this.setR(lo & 7, this.read(d)); cyc = 2; }
          else unimpl();
          break;
        case 0xB:
          if (lo === 2) { const b = this.fetch(); this.setBit(b, this.getBit(b) ? 0 : 1); }
          else if (lo === 3) this.cy = this.cy ? 0 : 1;
          else if (lo >= 4) {
            let l, r2;
            if (lo === 4) { l = this.acc; r2 = this.fetch(); }
            else if (lo === 5) { l = this.acc; r2 = this.read(this.fetch()); }
            else if (lo === 6 || lo === 7) { l = this.iram[this.R(lo & 1)]; r2 = this.fetch(); }
            else { l = this.R(lo & 7); r2 = this.fetch(); }
            const r = this.rel();
            this.cy = l < r2 ? 1 : 0;
            if (l !== r2) this.jump(r);
            cyc = 2;
          }
          else unimpl();
          break;
        case 0xC:
          if (lo === 0) { this.push(this.read(this.fetch())); cyc = 2; }
          else if (lo === 2) { const b = this.fetch(); this.setBit(b, 0); }
          else if (lo === 3) this.cy = 0;
          else if (lo === 4) { const a = this.acc; this.acc = ((a << 4) | (a >> 4)) & 255; }
          else if (lo === 5) { const d = this.fetch(); const t = this.read(d); this.write(d, this.acc); this.acc = t; }
          else if (lo === 6 || lo === 7) { const r = this.R(lo & 1); const t = this.iram[r]; this.iram[r] = this.acc; this.acc = t; }
          else if (lo >= 8) { const t = this.R(lo & 7); this.setR(lo & 7, this.acc); this.acc = t; }
          else unimpl();
          break;
        case 0xD:
          if (lo === 0) { const d = this.fetch(); this.write(d, this.pop()); cyc = 2; }
          else if (lo === 2) { const b = this.fetch(); this.setBit(b, 1); }
          else if (lo === 3) this.cy = 1;
          else if (lo === 4) {
            let t = this.acc, c = this.cy;
            if ((t & 15) > 9 || this.ac) t += 6;
            if (t > 0xFF) c = 1;
            t &= 255;
            if ((t >> 4) > 9 || c) t += 0x60;
            if (t > 0xFF) c = 1;
            this.acc = t & 255; this.cy = c;
          }
          else if (lo === 5) { const d = this.fetch(); const r = this.rel(); const v = (this.read(d) - 1) & 255; this.write(d, v); if (v !== 0) this.jump(r); cyc = 2; }
          else if (lo >= 8) { const n = lo & 7; const r = this.rel(); const v = (this.R(n) - 1) & 255; this.setR(n, v); if (v !== 0) this.jump(r); cyc = 2; }
          else unimpl();
          break;
        case 0xE:
          if (lo === 4) this.acc = 0;
          else if (lo >= 5) this.acc = opVal();
          else unimpl();
          break;
        case 0xF:
          if (lo === 4) this.acc = (~this.acc) & 255;
          else if (lo === 5) this.write(this.fetch(), this.acc);
          else if (lo === 6 || lo === 7) this.iram[this.R(lo & 1)] = this.acc;
          else if (lo >= 8) this.setR(lo & 7, this.acc);
          else unimpl();
          break;
        default: unimpl();
      }

      if (this.halted) { this.pc = pc0; return false; }
      this.cycles += cyc;
      this.steps++;
      this.uartTick();
      const p = [this.sfr[0x80], this.sfr[0x90], this.sfr[0xA0], this.sfr[0xB0]];
      const last = this.log[this.log.length - 1].p;
      if (p[0] !== last[0] || p[1] !== last[1] || p[2] !== last[2] || p[3] !== last[3]) {
        this.log.push({ t: this.cycles, p });
        if (this.log.length > 30000) this.log.splice(0, 10000);
      }
      return true;
    }
  }

  const api = { assemble, CPU, hex2, hex4, XTAL, cycleUs: CYCLE_US };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sim = api;
})(typeof window !== 'undefined' ? window : globalThis);