# SAP-1 Computer Simulator

A browser-based simulator of the SAP-1 (Simple-As-Possible 1) computer for
Computer Architecture and Organization. It shows the registers, the W-bus,
the controller-sequencer and the output display, and it runs the
fetch–decode–execute cycle one clock pulse (T-state) at a time.

## Run it

No dependencies and no build step.

1. Download or clone the repository.
2. Open `sap.html` in any modern browser (Chrome, Edge, Firefox).

Optional, to serve it over HTTP: `npx serve .` or `python -m http.server 8000`, then open http://localhost:3000.

## Language and framework

**Plain HTML, CSS and JavaScript, no framework.**

- The machine is small (16 bytes of RAM, 5 instructions), so a framework would add setup without adding clarity.
- `sap.js` has three layers: the `SAP1` class (CPU logic, no DOM access), an assembler/memory builder (`assembleLine`, `buildMemory`), and a UI layer that only draws the CPU state and handles clicks.
- Nothing to install, so it runs on any lab computer.
- The logic is also exported with `module.exports`, so it can be tested in Node without a browser.

## Features

| Feature                    | Details                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| CPU model                  | 16 × 8 RAM, 4-bit PC and MAR, 8-bit IR (opcode/operand split), 8-bit registers A and B, output register                                           |
| ALU                        | Adder/subtractor using 2's complement (`A + ~B + 1` for SUB), 8-bit wraparound                                                                    |
| Controller-sequencer       | T1–T6 ring counter, control signals (Ep, Lm, Cp, CE, Li, Ei, Ea, Lo, La, Lb, Eu, Su, HLT), opcode, operand, phase (FETCH/EXECUTE) and halted flag |
| Instruction set            | LDA `0000`, ADD `0001`, SUB `0010`, OUT `1110`, HLT `1111`                                                                                        |
| Register panels            | PC, MAR, IR, A, B, ALU/SUM, OUT and W-bus, each shown as LEDs plus a hex value                                                                    |
| Output display             | Three-digit decimal display of the output register, plus 8 output LEDs                                                                            |
| W-bus visualization        | Every node's current value, the active source (orange) and destination (green), and a source → data → destination readout                         |
| Three synchronized editors | ASM, machine code (binary or hex) and RAM. Editing one updates the other two                                                                      |
| Execution log              | One line per completed instruction: address, mnemonic, A and OUT                                                                                  |
| Errors & validation        | Invalid fields are highlighted and explained in the error panel                                                                                   |
| Program presets            | PROG 1–4 sample programs, one click each                                                                                                          |

## Controls

**Transport (monitor panel)**

| Button | Action                                                             |
| ------ | ------------------------------------------------------------------ |
| STEP   | Advance one clock pulse (one T-state)                              |
| RUN    | Run automatically until HLT, STOP, or the 10,000-tick safety limit |
| STOP   | Pause a running program                                            |
| RESET  | Clear registers and the log, keep the loaded program               |

**Keypad**

| Key                         | Action                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| LDA / ADD / SUB / OUT / HLT | Write that instruction into the selected ASM row (operand defaults to `0H`, edit it with the hex keys) |
| 0–F                         | Insert a hex digit into the selected input field. Click a field first                                  |
| UP / DN                     | Move the selection to the previous/next field                                                          |
| RAM                         | Jump to the RAM field of the selected address                                                          |
| STEP                        | Same as the transport STEP                                                                             |
| 2 HZ / 20 HZ / MAX          | Clock delay of 500 ms / 50 ms / 1 ms for RUN                                                           |
| PROG 1–4                    | Load a sample program (see below)                                                                      |
| CLEAR ASM                   | Erase the whole program and data                                                                       |
| DEL LINE                    | Clear the selected field                                                                               |
| SAVE PROG                   | Save the current program in the browser (`localStorage`)                                               |

Editing any field reloads the CPU and resets it to T0. Press the hex keys, then
click or tab out of the field to commit the value.

## Input rules

- RAM addresses: `0H` to `FH`.
- Data values: `00H` to `FFH`. A `0x` prefix or `H` suffix is accepted.
- Machine code: 8 binary bits (spaces allowed) or 1–2 hex digits.
- ASM: `LDA`, `ADD`, `SUB` need an address `0`–`F` (for example `LDA 9H`). `OUT` and `HLT` take no operand.
- Instructions and data share the same 16 bytes, so the program must not overwrite its own data.

## Microprogram

| T   | Fetch (all instructions) | Signals |
| --- | ------------------------ | ------- |
| T1  | PC → bus → MAR           | Ep, Lm  |
| T2  | PC + 1                   | Cp      |
| T3  | RAM[MAR] → bus → IR      | CE, Li  |

| Instr | T4                        | T5               | T6                     |
| ----- | ------------------------- | ---------------- | ---------------------- |
| LDA   | IR operand → MAR (Ei, Lm) | RAM → A (CE, La) | –                      |
| ADD   | IR operand → MAR (Ei, Lm) | RAM → B (CE, Lb) | A + B → A (Eu, La)     |
| SUB   | IR operand → MAR (Ei, Lm) | RAM → B (CE, Lb) | A − B → A (Su, Eu, La) |
| OUT   | A → OUT (Ea, Lo)          | –                | –                      |
| HLT   | stop the clock (HLT)      | –                | –                      |

After T6 the ring counter returns to T1 for the next instruction.

## Sample programs

| Key    | Program           | Result                                      |
| ------ | ----------------- | ------------------------------------------- |
| PROG 1 | `25H + 05H − 23H` | `07H` (shows 007)                           |
| PROG 2 | `21H − 02H + 0AH` | `29H` (shows 041)                           |
| PROG 3 | `FFH + 02H`       | `01H` (overflow wraps, shows 001)           |
| PROG 4 | `03H − 05H`       | `FEH` (negative, 2's complement, shows 254) |

The default program on page load is PROG 1: `LDA 9H`, `ADD AH`, `SUB BH`, `OUT`, `HLT`, with data `25H`, `05H`, `23H` at addresses 9, A, B.

## Known limitations

- SAVE PROG stores the program in the browser, but there is no button to load it back yet.
- The carry flag is tracked internally but is not shown on screen.
- An unrecognized opcode is shown as `???` and does nothing.

## Files

```
sap.html   page structure
sap.css    layout and look
sap.js     SAP1 class, runner, assembler and UI
README.md
```

## Group members

GRAGASIN ACE F.
LUIS MIKYLA JEAN
MABOLO EARL
MAGPATOC LANZE
TIPAY NIEL JOHN
