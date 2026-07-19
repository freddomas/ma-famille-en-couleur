# Accessibility and performance

## Reduced motion

Every animation needs an explicit reduced-motion outcome.

CSS baseline:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
```

Use a scoped alternative when the global rule would break functional state
changes. Verify that the final state renders correctly without relying on an
animation's final keyframe.

Avoid or gate:

- large zoom and depth changes;
- rotation and spinning;
- parallax and background drift;
- flashing;
- unpausable continuous motion.

Users must be able to complete every task with motion reduced.

## Performance

Prefer compositor-friendly properties:

- `transform`;
- `opacity`;
- carefully measured `filter`.

Treat `width`, `height`, `top`, `left`, large blur, clip paths, and many
simultaneous layers as performance risks. They are not absolute bans; measure
them on representative hardware.

Use `will-change` narrowly and temporarily. Never apply it globally.

## Runtime checks

- Record before/after frames or inspect with browser performance tools for
  complex motion.
- Check long tasks, layout recalculation, paint area, layer count, and memory.
- Test low-power mobile hardware or throttling when the effect is prominent.
- Ensure cleanup of timers, observers, animation frames, and event listeners.
- Avoid state updates on every pointer or scroll event when motion values or
  direct animation APIs can update without rerendering the component tree.

## Interaction checks

- Preserve focus through animated mount and unmount.
- Do not make invisible elements keyboard-focusable.
- Prevent rapid triggers from stacking stale animations.
- Make interruption and reversal deterministic.
- Keep touch targets stable while nearby elements animate.
