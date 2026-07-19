# Create workflow

## 1. Inspect

- Read scoped instructions and existing components.
- Identify the stack and installed motion libraries.
- Search for shared timing, easing, spring, and reduced-motion utilities.
- Infer product context and interaction frequency.

Do not add a new motion dependency when existing CSS or the installed library is
sufficient.

## 2. Define the motion contract

For each interaction, write down:

- trigger;
- initial and final state;
- purpose;
- frequency;
- duration or spring;
- interruption behavior;
- reduced-motion behavior.

For a tiny well-specified change, keep this internal. For a motion system or
complex component, state the contract briefly before implementation.

## 3. Implement

Prefer:

- opacity plus small translation for enter and exit;
- scale only for tactile press feedback or spatially justified zoom;
- shared-layout or FLIP techniques for continuity;
- transform-based drawers, sheets, menus, and carousels;
- CSS for simple transitions and keyframes;
- the project's established motion library for orchestration.

Make exits slightly quieter than entrances unless the product context suggests
otherwise. Keep high-frequency feedback short and avoid delaying task completion.

## 4. Reduced motion

Ship the alternative in the same change:

- remove parallax, zoom, spin, and large travel;
- replace decorative motion with the stable end state;
- preserve functional state changes instantly;
- stop or pause ambient loops.

## 5. Self-check

- Trigger repeatedly and rapidly.
- Interrupt midway and reverse direction.
- Test mount and unmount.
- Resize during the transition.
- Test keyboard activation.
- Enable reduced motion.
- Watch for layout shift, dropped frames, stale timers, and focus loss.
- Run the repository's required checks.
- Inspect the rendered result when a browser or simulator is available.

Report what was actually tested.
