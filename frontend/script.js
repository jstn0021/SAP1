/*
 * SAP-1 Computer Simulator
 * Core CPU Logic + Frontend Integration
 *
 * FIX 1-4: CPU and assembler corrections
 * CHANGED 1: STEP executes one complete instruction
 * CHANGED 2: Three-digit hexadecimal output without H
 * FIX 5: Match the updated HTML output elements
 */

const OPCODES = {
  LDA: 0b0000,
  ADD: 0b0001,
  SUB: 0b0010,
  OUT: 0b1110,
  HLT: 0b1111,
};

const MNEMONICS = Object.fromEntries(
  Object.entries(OPCODES).map(([k, v]) => [v, k]),
);

// ============================================================
// PART 1: SAP-1 CPU
// ============================================================

class SAP1 {
  constructor(onChange = () => {}) {
    this.onChange = onChange;
    this.program = new Array(16).fill(0);
    this.reset();
  }

  reset() {
    this.ram = this.program.slice();

    this.pc = 0;
    this.mar = 0;
    this.ir = 0;

    // FIX 4: Do not display LDA before fetching an instruction.
    this.instructionFetched = false;

    this.a = 0;
    this.b = 0;
    this.out = 0;

    this.carry = false;
    this.halted = false;

    this.t = 0;
    this.cycleCount = 0;

    this.bus = {
      value: null,
      source: null,
      dest: null,
    };

    this.signals = {};
    this.lastMemAddr = null;

    this._emit();
  }

  loadMemory(bytes) {
    // FIX 3: Validate memory values.
    if (
      !Array.isArray(bytes) ||
      bytes.length > 16 ||
      !bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
    ) {
      throw new RangeError(
        "Memory must contain at most 16 integer bytes (0-255)",
      );
    }

    this.program = new Array(16).fill(0).map((_, i) => (bytes[i] ?? 0) & 0xff);

    this.reset();
  }

  clockPulse() {
    if (this.halted) return false;

    this.t = this.t === 6 || this.t === 0 ? 1 : this.t + 1;

    this.signals = {};

    this.bus = {
      value: null,
      source: null,
      dest: null,
    };

    this.lastMemAddr = null;

    const opcode = this.ir >> 4;
    const operand = this.ir & 0x0f;

    switch (this.t) {
      case 1:
        // T1: PC -> MAR
        this._drive("PC", this.pc, "MAR", { Ep: 1, Lm: 1 });

        this.mar = this.pc & 0x0f;
        break;

      case 2:
        // T2: Increment PC
        this.signals = { Cp: 1 };
        this.pc = (this.pc + 1) & 0x0f;
        break;

      case 3:
        // T3: RAM -> IR
        this._drive("RAM", this.ram[this.mar], "IR", { CE: 1, Li: 1 });

        this.lastMemAddr = this.mar;
        this.ir = this.bus.value;
        this.instructionFetched = true;
        break;

      case 4:
        this._executeT4(opcode, operand);
        break;

      case 5:
        this._executeT5(opcode);
        break;

      case 6:
        this._executeT6(opcode);
        break;
    }

    if (this.t === 6 || (this.t === 4 && this.halted)) {
      this.cycleCount++;
    }

    this._emit();
    return true;
  }

  stepInstruction() {
    if (this.halted) return false;

    do {
      this.clockPulse();
    } while (!this.halted && this.t !== 6);

    return true;
  }

  _executeT4(opcode, operand) {
    switch (opcode) {
      case OPCODES.LDA:
      case OPCODES.ADD:
      case OPCODES.SUB:
        this._drive("IR", operand, "MAR", { Ei: 1, Lm: 1 });

        this.mar = operand;
        break;

      case OPCODES.OUT:
        this._drive("A", this.a, "OUT", { Ea: 1, Lo: 1 });

        this.out = this.a;
        break;

      case OPCODES.HLT:
        this.signals = { HLT: 1 };
        this.halted = true;
        break;

      default:
        // Undefined opcode: NOP
        break;
    }
  }

  _executeT5(opcode) {
    switch (opcode) {
      case OPCODES.LDA:
        this._drive("RAM", this.ram[this.mar], "A", { CE: 1, La: 1 });

        this.lastMemAddr = this.mar;
        this.a = this.bus.value;
        break;

      case OPCODES.ADD:
      case OPCODES.SUB:
        this._drive("RAM", this.ram[this.mar], "B", { CE: 1, Lb: 1 });

        this.lastMemAddr = this.mar;
        this.b = this.bus.value;
        break;
    }
  }

  _executeT6(opcode) {
    if (opcode === OPCODES.ADD) {
      const sum = this.a + this.b;

      this.carry = sum > 0xff;

      this._drive("ALU", sum & 0xff, "A", { Eu: 1, La: 1, Su: 0 });

      this.a = this.bus.value;
    } else if (opcode === OPCODES.SUB) {
      // Two's complement subtraction.
      const diff = this.a + (~this.b & 0xff) + 1;

      this.carry = diff > 0xff;

      this._drive("ALU", diff & 0xff, "A", { Eu: 1, La: 1, Su: 1 });

      this.a = this.bus.value;
    }
  }

  _drive(source, value, dest, signals) {
    this.bus = {
      value: value & 0xff,
      source,
      dest,
    };

    this.signals = signals;
  }

  getSnapshot() {
    return {
      pc: this.pc,
      mar: this.mar,
      ir: this.ir,

      opcode: this.ir >> 4,
      operand: this.ir & 0x0f,

      mnemonic: this.instructionFetched
        ? (MNEMONICS[this.ir >> 4] ?? "???")
        : "---",

      a: this.a,
      b: this.b,
      out: this.out,

      carry: this.carry,
      halted: this.halted,

      tState: this.t,

      bus: { ...this.bus },
      signals: { ...this.signals },

      ram: this.ram.slice(),

      activeAddress: this.lastMemAddr,
      cycleCount: this.cycleCount,
    };
  }

  _emit() {
    this.onChange(this.getSnapshot());
  }
}

// ============================================================
// PART 2: AUTOMATIC RUNNER
// ============================================================

class Runner {
  constructor(cpu, granularity = "clock") {
    this.cpu = cpu;
    this.granularity = granularity;
    this.delayMs = 400;
    this.timer = null;
    this.maxTicks = 10000;
    this.ticks = 0;
  }

  get running() {
    return this.timer !== null;
  }

  setSpeed(ms) {
    this.delayMs = ms;

    if (this.running) {
      this.stop();
      this.start();
    }
  }

  start() {
    if (this.running || this.cpu.halted) return;

    this.timer = setInterval(() => {
      if (this.cpu.halted || ++this.ticks > this.maxTicks) {
        return this.stop();
      }

      this.granularity === "clock"
        ? this.cpu.clockPulse()
        : this.cpu.stepInstruction();

      if (this.cpu.halted) {
        this.stop();
      }
    }, this.delayMs);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.ticks = 0;
  }
}

// ============================================================
// PART 3: ASSEMBLY AND MEMORY HELPERS
// ============================================================

function parseHexByte(text) {
  const clean = String(text).trim().replace(/^0x/i, "").replace(/h$/i, "");

  if (!/^[0-9a-f]{1,2}$/i.test(clean)) {
    return null;
  }

  return parseInt(clean, 16);
}

function assembleLine(line) {
  // FIX 2: Reject unexpected extra operands.
  const [mn, arg, ...extras] = line.trim().toUpperCase().split(/\s+/);

  if (!(mn in OPCODES)) {
    return {
      error: `Unknown instruction "${mn}"`,
    };
  }

  if (extras.length || ((mn === "OUT" || mn === "HLT") && arg !== undefined)) {
    return {
      error: `Unexpected extra operand in "${line.trim()}"`,
    };
  }

  if (mn === "OUT" || mn === "HLT") {
    return {
      byte: (OPCODES[mn] << 4) | 0x0f,
    };
  }

  const addr = parseHexByte(arg ?? "");

  if (addr === null || addr > 0x0f) {
    return {
      error: `${mn} needs an address 0-F`,
    };
  }

  return {
    byte: (OPCODES[mn] << 4) | addr,
  };
}

function buildMemory(instructions, data = {}) {
  const memory = new Array(16).fill(0);
  const errors = [];

  // FIX 1: Prevent instruction/data overlap.
  const instructionAddresses = new Set();

  instructions.forEach((line, i) => {
    if (!line.trim()) return;

    if (i > 15) {
      return errors.push("Program exceeds 16 bytes");
    }

    const result = assembleLine(line);

    if (result.error) {
      errors.push(`Line ${i}: ${result.error}`);
    } else {
      memory[i] = result.byte;
      instructionAddresses.add(i);
    }
  });

  for (const [addrTxt, valTxt] of Object.entries(data)) {
    const addr = parseHexByte(addrTxt);
    const val = parseHexByte(valTxt);

    if (addr === null || addr > 15) {
      errors.push(`Bad address "${addrTxt}"`);
    } else if (val === null) {
      errors.push(`Bad value "${valTxt}" at ${addrTxt}`);
    } else if (instructionAddresses.has(addr)) {
      errors.push(`Memory overlap at address ${addrTxt}: instruction and data`);
    } else {
      memory[addr] = val;
    }
  }

  return { memory, errors };
}

const toBin = (n, bits = 8) => (n >>> 0).toString(2).padStart(bits, "0");

const toHex = (n, digits = 2) =>
  n.toString(16).toUpperCase().padStart(digits, "0");

// ============================================================
// PART 4: NODE.JS EXPORTS
// ============================================================

if (typeof module !== "undefined") {
  module.exports = {
    SAP1,
    Runner,
    OPCODES,
    buildMemory,
    assembleLine,
    parseHexByte,
    toBin,
    toHex,
  };
}

// ============================================================
// PART 5: FRONTEND INTEGRATION
// ============================================================

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    const byId = (id) => document.getElementById(id);

    const addressHex = (index) => index.toString(16).toUpperCase();

    const cell = (prefix, index) => byId(`${prefix}_${index.toString(16)}h`);

    const bytes = new Array(16).fill(0);
    const rowKinds = new Array(16).fill("data");

    let selectedInput = null;
    let logCount = 0;
    let aluValue = 0;
    let uiError = false;

    // ADDED UI 1: Read existing HTML table inputs.
    for (let address = 0; address < 16; address++) {
      const asmText = cell("Asm", address)?.value.trim().toUpperCase() || "";

      rowKinds[address] = /^(LDA|ADD|SUB|OUT|HLT)(?:\s|$)/.test(asmText)
        ? "instruction"
        : "data";

      const raw = cell("Ram", address)?.value.trim() || "00";

      const parsed = parseHexByte(raw);

      bytes[address] = parsed === null ? 0 : parsed;
    }

    const cpu = new SAP1();
    const runner = new Runner(cpu, "clock");
    let lastInstructionCount = 0;

    // ========================================================
    // ADDED UI 2: FORMATTING AND INPUT VALIDATION
    // ========================================================

    const binary8 = (value) => toBin(value & 0xff, 8);

    const formatted8 = (value) =>
      binary8(value).replace(/(.{4})(.{4})/, "$1 $2");

    const byteAt = (index) => bytes[index] & 0xff;

    const instructionAt = (value) => {
      const opcode = value >> 4;
      const mnemonic = MNEMONICS[opcode];

      if (!mnemonic) return null;

      return mnemonic === "OUT" || mnemonic === "HLT"
        ? mnemonic
        : `${mnemonic} ${(value & 0x0f).toString(16).toUpperCase()}H`;
    };

    const parseCode = (text) => {
      const compact = text.trim().replace(/\s+/g, "");

      if (/^[01]{8}$/.test(compact)) {
        return parseInt(compact, 2);
      }

      return parseHexByte(compact);
    };

    const parseAssemblyOrData = (text) => {
      const normalized = text.trim().toUpperCase();

      if (!normalized) {
        return {
          byte: 0,
          kind: "data",
          empty: true,
        };
      }

      if (/^(LDA|ADD|SUB|OUT|HLT)(?:\s|$)/.test(normalized)) {
        return {
          ...assembleLine(normalized),
          kind: "instruction",
        };
      }

      const value = parseHexByte(normalized);

      return value === null
        ? { error: `Invalid ASM or hex data: ${text}` }
        : { byte: value, kind: "data" };
    };

    function setStatus(message, className = "") {
      const element = byId("status");
      if (!element) return;

      element.textContent = message;
      element.className = className;
    }

    const showError = (message) => {
      uiError = true;

      const errorBox = byId("error-box");
      if (errorBox) errorBox.hidden = false;

      if (byId("error-title")) {
        byId("error-title").textContent = "Invalid Input";
      }

      if (byId("error-message")) {
        byId("error-message").textContent = message;
      }

      if (byId("validation-status")) {
        byId("validation-status").textContent = "Validation error detected";
      }

      setStatus("ERROR", "error");
    };

    const clearError = () => {
      uiError = false;

      if (byId("error-box")) {
        byId("error-box").hidden = true;
      }

      if (byId("validation-status")) {
        byId("validation-status").textContent = "No errors detected";
      }

      document
        .querySelectorAll("input.invalid")
        .forEach((input) => input.classList.remove("invalid"));
    };

    // ========================================================
    // ADDED UI 3: SYNCHRONIZE ASM, MACHINE CODE, AND RAM
    // ========================================================

    const refreshRow = (address, source = "") => {
      const ramInput = cell("Ram", address);
      const machineInput = cell("Mc", address);
      const asmInput = cell("Asm", address);

      if (ramInput && source !== "Ram") {
        ramInput.value = toHex(byteAt(address));
      }

      if (machineInput && source !== "Mc") {
        machineInput.value = formatted8(byteAt(address));
      }

      if (asmInput && source !== "Asm") {
        const decoded =
          rowKinds[address] === "instruction"
            ? instructionAt(byteAt(address))
            : null;

        asmInput.value =
          decoded || (byteAt(address) ? `${toHex(byteAt(address))}H` : "");
      }
    };

    const refreshAllRows = () => {
      for (let address = 0; address < 16; address++) {
        refreshRow(address);
      }
    };

    const loadCpuFromEditor = () => {
      runner.stop();
      cpu.loadMemory(bytes);

      aluValue = 0;
      lastInstructionCount = 0;

      clearExecutionLog();
      clearError();
      setStatus("READY");
    };

    const editRow = (input, source, address) => {
      const text = input.value.trim();
      let parsed;

      if (source === "Asm") {
        parsed = parseAssemblyOrData(text);
      } else if (source === "Mc") {
        const value = parseCode(text);

        parsed =
          value === null
            ? {
                error: "Machine code must be 8 binary bits or 1-2 hex digits",
              }
            : { byte: value };
      } else {
        const value = parseHexByte(text);

        parsed =
          value === null
            ? {
                error: "RAM data must be hexadecimal (00-FF)",
              }
            : { byte: value };
      }

      if (parsed.error) {
        input.classList.add("invalid");

        showError(`Address ${addressHex(address)}H: ${parsed.error}`);

        return;
      }

      bytes[address] = parsed.byte;

      if (source === "Asm") {
        rowKinds[address] = parsed.kind;
      }

      refreshRow(address, source);
      input.classList.remove("invalid");
      loadCpuFromEditor();
    };

    // ========================================================
    // FIX 5: MATCH THE UPDATED HTML HEX OUTPUT
    // ========================================================

    const updateHexOutput = (value) => {
      // The existing HTML uses three spans with IDs display-2, display-1,
      // and display-0. Show the 8-bit OUT register as three hex digits.
      const display = toHex(value & 0xff, 3);
      const digit2 = byId("display-2");
      const digit1 = byId("display-1");
      const digit0 = byId("display-0");

      if (!digit2 || !digit1 || !digit0) {
        console.error("SAP-1 hexadecimal output elements not found.");
        return;
      }

      digit2.textContent = display[0];
      digit1.textContent = display[1];
      digit0.textContent = display[2];
    };

    // ========================================================
    // ADDED UI 4: REGISTER LED INDICATORS
    // ========================================================

    const renderBits = (id, value, count = 8) => {
      const container = byId(id);
      if (!container) return;

      const digits = toBin(value, count).slice(-count);

      if (container.children.length !== count) {
        container.replaceChildren(
          ...Array.from({ length: count }, () => document.createElement("i")),
        );
      }

      [...container.children].forEach((bit, index) => {
        bit.classList.toggle("lit", digits[index] === "1");
      });
    };

    const setText = (id, value) => {
      const element = byId(id);

      if (element) {
        element.textContent = value;
      }
    };

    const highlightRows = (address) => {
      for (const name of ["asm-table", "code-table", "ram-table"]) {
        const rows = byId(name)?.querySelectorAll("tr") || [];

        rows.forEach((row, index) => {
          row.classList.toggle("active-row", index === address);
        });
      }
    };

    const highlightRegister = (name) => {
      document.querySelectorAll(".signal[data-register]").forEach((element) => {
        element.classList.toggle(
          "active",
          element.dataset.register === name.toLowerCase(),
        );
      });
    };

    // ========================================================
    // ADDED UI 5: W-BUS VISUALIZATION
    // ========================================================

    const renderWireNodes = (snapshot) => {
      const values = {
        pc: toBin(snapshot.pc, 4).slice(-4),
        mar: toBin(snapshot.mar, 4).slice(-4),
        ram: binary8(snapshot.ram[snapshot.mar] ?? 0),
        ir: binary8(snapshot.ir),
        a: binary8(snapshot.a),
        b: binary8(snapshot.b),
        alu: binary8(aluValue),
        out: binary8(snapshot.out),
      };

      for (const [name, value] of Object.entries(values)) {
        const node = byId(`wire-${name}`);
        if (!node) continue;

        const small = node.querySelector("small");
        if (small) small.textContent = value;

        const activeSource = snapshot.bus.source?.toLowerCase() === name;

        const activeDestination = snapshot.bus.dest?.toLowerCase() === name;

        node.classList.toggle("active-source", activeSource);

        node.classList.toggle("active-destination", activeDestination);

        node.style.outline = activeSource
          ? "3px solid #f6a04f"
          : activeDestination
            ? "3px solid #65ad6a"
            : "";
      }

      const active = snapshot.bus.value !== null;

      setText("bus-source", active ? snapshot.bus.source : "---");

      setText("bus-data", active ? binary8(snapshot.bus.value) : "00000000");

      setText("bus-destination", active ? snapshot.bus.dest : "---");

      setText(
        "bus-transfer-message",
        active
          ? `${snapshot.bus.source} → ${snapshot.bus.dest}: ${toHex(snapshot.bus.value)}H`
          : "No active transfer",
      );

      const backbone = byId("bus-backbone");

      if (backbone) {
        backbone.classList.toggle("active", active);
      }
    };

    // ========================================================
    // ADDED UI 5: UPDATE CPU MONITOR
    // ========================================================

    const renderSnapshot = (snapshot) => {
      if (snapshot.bus.source === "ALU") {
        aluValue = snapshot.bus.value;
      }

      const reg = [
        ["pc", snapshot.pc, 4],
        ["mar", snapshot.mar, 4],
        ["ir", snapshot.ir, 8],
        ["a", snapshot.a, 8],
        ["b", snapshot.b, 8],
        ["out", snapshot.out, 8],
        ["alu", aluValue, 8],
        ["bus", snapshot.bus.value ?? 0, 8],
      ];

      reg.forEach(([name, value, width]) => {
        setText(`${name}-value`, toHex(value, width === 4 ? 1 : 2));

        renderBits(`${name}-bits`, value, width);
      });

      setText("control-value", `T${snapshot.tState}`);

      setText(
        "current-instruction",
        snapshot.mnemonic === "---"
          ? "---"
          : `${snapshot.mnemonic}${
              ["LDA", "ADD", "SUB"].includes(snapshot.mnemonic)
                ? ` ${snapshot.operand.toString(16).toUpperCase()}H`
                : ""
            }`,
      );

      setText(
        "opcode-value",
        snapshot.mnemonic === "---"
          ? "----"
          : toBin(snapshot.opcode, 4).slice(-4),
      );

      setText(
        "operand-value",
        snapshot.mnemonic === "---"
          ? "----"
          : toBin(snapshot.operand, 4).slice(-4),
      );

      setText(
        "phase-value",
        snapshot.tState === 0
          ? "IDLE"
          : snapshot.tState <= 3
            ? "FETCH"
            : "EXECUTE",
      );

      setText("halted-value", snapshot.halted ? "YES" : "NO");

      // FIX 5: Update the three hexadecimal output digits.
      updateHexOutput(snapshot.out);

      highlightRows(snapshot.activeAddress);

      highlightRegister(snapshot.bus.dest || snapshot.bus.source || "");

      renderWireNodes(snapshot);

      if (snapshot.halted) {
        setStatus("HALTED", "halted");
      } else if (runner.running) {
        setStatus("RUNNING", "running");
      } else if (!uiError && snapshot.tState !== 0) {
        setStatus("PAUSED");
      } else if (!uiError) {
        setStatus("READY");
      }

      if (snapshot.cycleCount > lastInstructionCount) {
        lastInstructionCount = snapshot.cycleCount;
        appendExecutionLog(snapshot);
      }
    };

    // ========================================================
    // ADDED UI 6: EXECUTION LOG
    // ========================================================

    function clearExecutionLog() {
      logCount = 0;

      if (byId("execution-log")) {
        byId("execution-log").replaceChildren();
      }

      if (byId("log-placeholder")) {
        byId("log-placeholder").hidden = false;
      }
    }

    function appendExecutionLog(snapshot) {
      const list = byId("execution-log");
      if (!list) return;

      const item = document.createElement("li");

      const executedAddress = (snapshot.pc + 15) & 0x0f;

      item.textContent =
        `#${++logCount} @${addressHex(executedAddress)}H: ` +
        `${snapshot.mnemonic} | ` +
        `A=${toHex(snapshot.a)}H | ` +
        `OUT=${toHex(snapshot.out)}H` +
        (snapshot.halted ? " | HALTED" : "");

      list.appendChild(item);

      if (byId("log-placeholder")) {
        byId("log-placeholder").hidden = true;
      }
    }

    // ========================================================
    // ADDED UI 7: CONNECT TABLE INPUTS
    // ========================================================

    for (let address = 0; address < 16; address++) {
      for (const source of ["Asm", "Mc", "Ram"]) {
        const input = cell(source, address);
        if (!input) continue;

        input.addEventListener("focus", () => {
          selectedInput = input;
        });

        input.addEventListener("change", () => {
          editRow(input, source, address);
        });
      }
    }

    // ========================================================
    // ADDED UI 8: SAMPLE PROGRAM PRESETS
    // ========================================================

    const presets = {
      1: {
        instructions: ["LDA 9H", "ADD AH", "SUB BH", "OUT", "HLT"],
        data: {
          9: 0x25,
          10: 0x05,
          11: 0x23,
        },
      },

      2: {
        instructions: ["LDA 9H", "SUB AH", "ADD BH", "OUT", "HLT"],
        data: {
          9: 0x21,
          10: 0x02,
          11: 0x0a,
        },
      },

      3: {
        instructions: ["LDA 9H", "ADD AH", "OUT", "HLT"],
        data: {
          9: 0xff,
          10: 0x02,
        },
      },

      4: {
        instructions: ["LDA 9H", "SUB AH", "OUT", "HLT"],
        data: {
          9: 0x03,
          10: 0x05,
        },
      },
    };

    const preset = (number) => {
      bytes.fill(0);
      rowKinds.fill("data");

      const program = presets[number];

      program.instructions.forEach((line, address) => {
        bytes[address] = assembleLine(line).byte;
        rowKinds[address] = "instruction";
      });

      for (const [address, value] of Object.entries(program.data)) {
        bytes[Number(address)] = value;
      }

      refreshAllRows();
      loadCpuFromEditor();
    };

    // ========================================================
    // ADDED UI 8: RESET AND BUTTON ACTIONS
    // ========================================================

    const reset = () => {
      runner.stop();
      cpu.reset();

      aluValue = 0;
      lastInstructionCount = 0;

      clearExecutionLog();
      clearError();
      setStatus("READY");
    };

    const handleAction = (action) => {
      if (action === "run") {
        if (uiError) return;

        runner.start();

        setStatus(
          runner.running ? "RUNNING" : "HALTED",
          runner.running ? "running" : "halted",
        );
      } else if (action === "stop") {
        runner.stop();

        if (!cpu.halted) {
          setStatus("PAUSED");
        }
      } else if (action === "step") {
        if (uiError) return;

        runner.stop();

        // CHANGED 1: One STEP click = one instruction.
        cpu.stepInstruction();
      } else if (action === "reset") {
        reset();
      } else if (action === "up" || action === "down") {
        const inputs = [
          ...document.querySelectorAll(
            "#asm-table input, #code-table input, #ram-table input",
          ),
        ];

        let index = inputs.indexOf(selectedInput);

        index =
          (index + (action === "up" ? -1 : 1) + inputs.length) % inputs.length;

        selectedInput = inputs[index];
        selectedInput?.focus();
      } else if (action === "ram") {
        const index = selectedInput
          ? parseInt(selectedInput.id.split("_")[1], 16)
          : 0;

        selectedInput = cell("Ram", Number.isNaN(index) ? 0 : index);

        selectedInput?.focus();
      } else if (action === "clear") {
        bytes.fill(0);
        rowKinds.fill("data");

        refreshAllRows();
        loadCpuFromEditor();
      } else if (action === "delete" && selectedInput) {
        selectedInput.value = "";

        selectedInput.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (action === "save") {
        try {
          localStorage.setItem(
            "sap1-saved-program",
            JSON.stringify({ bytes, rowKinds }),
          );

          setStatus("SAVED");
        } catch {
          showError("Unable to save program in this browser");
        }
      }
    };

    // ========================================================
    // ADDED UI 8: BUTTON EVENT LISTENERS
    // ========================================================

    document.querySelectorAll("button[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        handleAction(button.dataset.action);
      });
    });

    document.querySelectorAll("button[data-speed]").forEach((button) => {
      button.addEventListener("click", () => {
        runner.setSpeed(Math.max(1, Number(button.dataset.speed)));

        document.querySelectorAll("button[data-speed]").forEach((item) => {
          item.classList.toggle("active", item === button);
        });
      });
    });

    document.querySelectorAll("button[data-program]").forEach((button) => {
      button.addEventListener("click", () => {
        preset(Number(button.dataset.program));
      });
    });

    document.querySelectorAll("button[data-instruction]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!selectedInput || !selectedInput.id.startsWith("Asm_")) {
          selectedInput = cell("Asm", 0);
        }

        const mnemonic = button.dataset.instruction;

        selectedInput.value = ["OUT", "HLT"].includes(mnemonic)
          ? mnemonic
          : `${mnemonic} 0H`;

        selectedInput.dispatchEvent(new Event("change", { bubbles: true }));

        selectedInput.focus();
      });
    });

    document.querySelectorAll("button[data-hex]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!selectedInput) return;

        const digit = button.dataset.hex;
        const previous = selectedInput.value;

        const start = selectedInput.selectionStart ?? previous.length;

        const end = selectedInput.selectionEnd ?? previous.length;

        selectedInput.value =
          previous.slice(0, start) + digit + previous.slice(end);

        selectedInput.focus();

        selectedInput.setSelectionRange(start + 1, start + 1);
      });
    });

    // ========================================================
    // ADDED UI 9: INITIALIZE CPU AND MONITOR
    // ========================================================

    cpu.onChange = renderSnapshot;
    cpu.loadMemory(bytes);

    renderSnapshot(cpu.getSnapshot());
    clearExecutionLog();

    setStatus("READY");
  });
}