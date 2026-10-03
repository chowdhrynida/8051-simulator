/* Guided lesson: from one switch to a running program. Uses the real engine in chapter 4. */
(() => {
  'use strict';
  const { assemble, CPU, hex2 } = window.Sim;
  const $ = (id) => document.getElementById(id);
  const root = $('story');
  const el = (h) => { const d = document.createElement('div'); d.innerHTML = h; return d; };
  const bitRow = (v, on, tag) => {
    const r = el('<div class="st-bits"></div>').firstChild;
    for (let b = 7; b >= 0; b--) {
      const x = document.createElement('button');
      x.type = 'button'; x.className = 'st-b' + ((v >> b) & 1 ? ' on' : '');
      x.innerHTML = ((v >> b) & 1) + '<small>' + (tag ? tag + b : 'b' + b) + '</small>';
      x.setAttribute('aria-label', 'bit ' + b + ' is ' + ((v >> b) & 1) + ', click to flip');
      x.onclick = () => on(b); r.appendChild(x);
    }
    return r;
  };

  const CH = [
    { t: 'One switch holds one bit',
      story: 'Think of a light switch. It is either ON or OFF, nothing in between. A chip remembers things the same way, with millions of tiny switches.',
      hwNote: 'Each tiny switch is a circuit called a flip-flop. High voltage means 1, low voltage means 0. Try it: click the switch.',
      swNote: 'Software has no voltage. So it keeps the same fact as a number that can only be 0 or 1.',
      bridge: 'A hardware switch becomes a variable that is 0 or 1.',
      build(w, code) {
        let b = 0;
        const draw = () => {
          w.innerHTML = '<button type="button" class="st-b' + (b ? ' on' : '') + '" style="width:5rem;height:3.4rem" id="sw1">' + (b ? 'ON' : 'OFF') + '</button><div class="st-bulb' + (b ? ' on' : '') + '"></div><div class="st-big">' + b + ' <small>stored in the flip-flop</small></div>';
          $('sw1').onclick = () => { b ^= 1; draw(); };
          code('<em>bit</em> = <u>' + b + '</u>\n\n# a switch flipped = the value changed\nbit = bit ^ 1');
        };
        draw();
      } },
    { t: 'Eight switches make a register',
      story: 'One switch is too small to hold a useful number. So the chip puts eight in a row and treats them as one unit. That unit is a register, like the Accumulator.',
      hwNote: 'Click the switches. Each one is worth double the one on its right (1, 2, 4, 8 ...). Then press +1 until you reach 255.',
      swNote: 'The register becomes one number. But a real register has only 8 switches, so it can never be bigger than 255.',
      bridge: 'The 8-switch limit has to be copied into code. That is the "& 0xFF" you see everywhere in the simulator.',
      build(w, code) {
        let v = 0, cy = 0, msg = '';
        const draw = () => {
          w.innerHTML = '';
          w.appendChild(bitRow(v, (b) => { v ^= 1 << b; cy = 0; msg = ''; draw(); }));
          w.appendChild(el('<p class="st-big">' + v + ' <small>decimal</small> &nbsp; 0x' + hex2(v) + ' <small>hex</small> &nbsp; CY = ' + cy + '</p>'));
          const r = el('<div class="st-row"><button type="button" id="p1">+1</button><button type="button" class="ghost" id="p255">Set 255</button><button type="button" class="ghost" id="clr">Clear</button></div>');
          w.appendChild(r);
          $('p1').onclick = () => { const s = v + 1; cy = s > 255 ? 1 : 0; msg = s > 255 ? '255 + 1 = 256 needs 9 switches. Only 8 exist, so A wraps to 0 and the extra 1 goes to the Carry flag.' : ''; v = s & 255; draw(); };
          $('p255').onclick = () => { v = 255; cy = 0; msg = ''; draw(); };
          $('clr').onclick = () => { v = 0; cy = 0; msg = ''; draw(); };
          code('<em>acc</em> = <u>' + v + '</u>      # 0x' + hex2(v) + '\n\nr = acc + 1\ncy = 1 if r > 0xFF else 0\nacc = r & 0xFF   # keep only 8 bits' + (msg ? '\n\n# ' + msg : ''));
        };
        draw();
      } },
    { t: 'Many registers make memory',
      story: 'Now imagine a long shelf of these 8-switch boxes, each with a number on its door. That is memory. To use a box, you only need to know its number, called its address.',
      hwNote: 'Click a box to choose its address, type a value, and press Write. On the chip an address decoder opens exactly one box.',
      swNote: 'A shelf of numbered boxes is exactly what a list (array) is. The address is the position in the list.',
      bridge: 'Memory becomes an array. The address becomes the index.',
      build(w, code) {
        const mem = Array(16).fill(0); let sel = 2, val = 'A5';
        const draw = () => {
          w.innerHTML = '';
          const g = el('<div class="st-mem"></div>').firstChild;
          mem.forEach((m, a) => { const c = document.createElement('div'); c.className = 'st-cell' + (a === sel ? ' sel' : ''); c.innerHTML = '<small>' + hex2(a) + 'H</small>' + hex2(m); c.onclick = () => { sel = a; draw(); }; g.appendChild(c); });
          w.appendChild(g);
          w.appendChild(el('<div class="st-row">Value (hex) <input class="st-in" id="mv" maxlength="2" value="' + val + '" aria-label="value in hex"> <button type="button" id="mw">Write to ' + hex2(sel) + 'H</button></div>'));
          $('mv').oninput = (e) => { val = e.target.value.replace(/[^0-9a-fA-F]/g, '').toUpperCase(); e.target.value = val; };
          $('mw').onclick = () => { mem[sel] = parseInt(val || '0', 16) & 255; draw(); };
          code('<em>iram</em>[<u>0x' + hex2(sel) + '</u>] = <u>0x' + hex2(mem[sel]) + '</u>\n\n# the decoder opening one box\n# = picking one list position\nvalue = iram[0x' + hex2(sel) + ']');
        };
        draw();
      } },
    { t: 'An instruction is just bytes',
      story: 'The chip cannot read English. A program is stored in memory as plain numbers. The first number says what to do (the opcode) and the next ones give the details.',
      hwNote: 'Press Step. The chip reads the next bytes from memory, the decoder works out what they mean, and the registers change.',
      swNote: 'The decoder becomes a big if / elif chain: "if the opcode is 74H, load A with the next byte". This runs on the real simulator engine.',
      bridge: 'Behaviour becomes a function. Each opcode is a few lines that change the values from chapters 1 to 3.',
      build(w, code) {
        const prog = [['MOV A,#25H', 'Load A with 25H', 'acc = fetch()'], ['ADD A,#07H', 'Add 07H to A', 'acc = (acc + fetch()) & 0xFF'], ['MOV R0,A', 'Copy A into R0', 'iram[bank * 8 + 0] = acc'], ['INC A', 'Add 1 to A', 'acc = (acc + 1) & 0xFF']];
        const res = assemble(prog.map((p) => p[0]).join('\n'));
        let cpu, i;
        const reset = () => { cpu = new CPU(); cpu.load(res.rom); i = 0; draw(); };
        const draw = () => {
          const L = res.listing, cur = i > 0 ? i - 1 : -1;
          w.innerHTML = '<div class="st-ins">' + L.map((l, k) => '<div class="st-i' + (k === cur ? ' on' : '') + '"><b>' + l.bytes.map(hex2).join(' ') + '</b>' + prog[k][0] + '</div>').join('') + '</div>' +
            '<p class="st-big">A = ' + hex2(cpu.acc) + 'H &nbsp; R0 = ' + hex2(cpu.R(0)) + 'H &nbsp; <small>PC = ' + cpu.pc + '</small></p>' +
            '<div class="st-row"><button type="button" id="is"' + (i >= L.length ? ' disabled' : '') + '>Step</button><button type="button" class="ghost" id="ir">Reset</button></div>';
          $('is').onclick = () => { cpu.step(); i++; draw(); };
          $('ir').onclick = reset;
          code(cur < 0 ? '# nothing has run yet\nopcode = rom[pc]        # read a byte\nif opcode == 0x74: ...  # decode it' : '# ' + prog[cur][1] + '\nopcode = rom[pc]        # 0x' + hex2(L[cur].bytes[0]) + '\n<em>' + prog[cur][2] + '</em>\npc += ' + L[cur].bytes.length + '                  # next instruction');
        };
        reset();
      } },
    { t: 'Pins reach the real world',
      story: 'A chip that only thinks is not useful. It needs wires out to the world. Some pins are grouped into ports. Whatever the program writes into a port decides the voltage on each pin.',
      hwNote: 'Click the bits of Port 1. A 1 puts 5 V on that pin, and an LED wired to it lights up.',
      swNote: 'The port is one number, one bit per pin. The LED on screen is a small widget that reads that number and redraws itself.',
      bridge: 'A pin becomes one bit of a number, and every device on screen just watches that number.',
      build(w, code) {
        let p = 0x05;
        const draw = () => {
          w.innerHTML = '';
          w.appendChild(bitRow(p, (b) => { p ^= 1 << b; draw(); }, 'P1.'));
          w.appendChild(el('<div class="st-leds">' + [7, 6, 5, 4, 3, 2, 1, 0].map((b) => '<div class="st-led' + ((p >> b) & 1 ? ' on' : '') + '"></div>').join('') + '</div>'));
          code('<em>ports</em>[1] = <u>0x' + hex2(p) + '</u>\n\nfor bit in range(8):\n    led[bit].on = (ports[1] >> bit) & 1');
        };
        draw();
      } },
    { t: 'Put it together: time and talking',
      story: 'The last piece is time. Every instruction takes a fixed number of clock ticks. A timer simply counts them, and the serial port (UART) uses that count to send bits one at a time.',
      hwNote: 'You now know every ingredient: a bit, a register, memory, an instruction, a pin, and the clock.',
      swNote: 'In the simulator each ingredient is just a value or a few lines of code. Time is a counter of machine cycles.',
      bridge: 'Now watch all of them work together on one real program. Both sides change at the same moment.',
      build(w, code) {
        w.innerHTML = '<div class="st-chain"><span>bit</span><i>&rarr;</i><span>register</span><i>&rarr;</i><span>memory</span><i>&rarr;</i><span>instruction</span><i>&rarr;</i><span>pin</span><i>&rarr;</i><span>clock</span></div><div class="st-row"><button type="button" id="go">Run the full program &darr;</button></div>';
        $('go').onclick = () => $('demoTop').scrollIntoView({ behavior: 'smooth' });
        code('cycles_per_bit = 32 * (256 - th1)\nbaud = 11059200 / 12 / cycles_per_bit\n\n# one second of chip time\n# = 11059200 / 12 machine cycles');
      } },
  ];

  let k = 0;
  function show() {
    const c = CH[k];
    root.innerHTML = '<div class="st-dots">' + CH.map((x, j) => '<button type="button" class="st-dot' + (j === k ? ' on' : j < k ? ' done' : '') + '" data-j="' + j + '">' + (j + 1) + '. ' + x.t.split(' ').slice(0, 2).join(' ') + '</button>').join('') + '</div>' +
      '<div class="st-card"><p class="st-kicker">CHAPTER ' + (k + 1) + ' OF ' + CH.length + '</p><h2>' + c.t + '</h2><p class="st-story">' + c.story + '</p>' +
      '<div class="st-two"><div class="st-hw"><b>On the chip</b><div id="stw"></div><p class="st-note">' + c.hwNote + '</p></div><div class="st-sw"><b>In our simulator</b><pre class="st-code" id="stc"></pre><p class="st-note">' + c.swNote + '</p></div></div>' +
      '<p class="st-bridge"><i>THE BRIDGE</i>' + c.bridge + '</p>' +
      '<div class="st-nav"><button type="button" class="ghost" id="sb"' + (k ? '' : ' disabled') + '>Back</button><button type="button" id="sn"' + (k < CH.length - 1 ? '' : ' disabled') + '>Next chapter</button></div></div>';
    root.querySelectorAll('.st-dot').forEach((d) => { d.onclick = () => { k = +d.dataset.j; show(); }; });
    $('sb').onclick = () => { k--; show(); };
    $('sn').onclick = () => { k++; show(); };
    c.build($('stw'), (h) => { $('stc').innerHTML = h; });
  }
  show();
})();
