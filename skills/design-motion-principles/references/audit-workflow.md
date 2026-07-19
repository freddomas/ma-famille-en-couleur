# Audit workflow

## 1. Reconnaissance

Read scoped instructions and identify:

- product type and user goals;
- motion libraries and shared tokens;
- animation declarations and keyframes;
- conditional rendering and state swaps;
- input methods and high-frequency workflows.

Search for motion gaps as well as excessive motion:

- modal, menu, toast, tab, loading, and error state transitions;
- conditional mounts without an intentional entry or exit;
- layout changes that snap and hide spatial relationships;
- focus changes or route changes that disorient users.

A missing animation is not automatically a defect. Apply the frequency and
purpose tests.

## 2. Audit dimensions

Check:

1. **Purpose** — Does motion explain change, hierarchy, or feedback?
2. **Frequency** — Does repeated use become slow or irritating?
3. **Timing** — Are durations and springs coherent with context?
4. **Continuity** — Do enter, exit, interruption, and reversal behave?
5. **Accessibility** — Is reduced motion complete and usable?
6. **Performance** — Are layout thrash, heavy filters, and excess layers
   controlled?
7. **Consistency** — Are tokens and patterns reused?
8. **Input parity** — Do keyboard, touch, pointer, and assistive technology
   receive equivalent feedback?

## 3. Anti-pattern gate

Flag only when repeated, distracting, inaccessible, or unjustified:

- hover scale on every surface;
- staggered reveal on every section;
- pulsing status indicators or calls to action;
- long spring tails on frequent actions;
- scroll hijacking without clear benefit;
- exit motion that blocks the next task;
- animated width, height, top, or left causing visible jank;
- motion that breaks focus, reading order, or reduced-motion mode;
- multiple unrelated easing and duration systems.

## 4. Output

Default to an inline report:

- verdict and motion posture;
- critical defects;
- important defects;
- optional opportunities;
- what already works;
- file and line evidence;
- recommended correction and validation method.

Create a self-contained HTML report only when the user asks for one. If created,
keep the report chrome static; animate only isolated demonstrations and provide
a reduced-motion fallback.

Do not implement fixes unless the user asked to change or fix the interface.
