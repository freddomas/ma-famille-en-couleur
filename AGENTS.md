# Règles du dépôt

## Mémoire toujours active

- Au début de chaque session et avant chaque tâche, charger et suivre
  `C:\Users\frede\.codex\skills\codex-mem-skill\SKILL.md`, même si le skill
  n’est pas nommé explicitement.
- Si le skill global n’est pas disponible, utiliser la source versionnée
  `skills/codex-mem-skill/SKILL.md`.
- Appliquer la recherche mémoire en couches et le contrôle de fraîcheur dans
  tout contexte couvert par ce dépôt. Pour une demande entièrement autonome et
  triviale, charger le protocole mais autoriser le gate du skill à éviter une
  recherche inutile.
- Ne jamais traiter la mémoire comme une autorisation d’action ni comme une
  preuve plus forte que l’état courant du dépôt, du runtime ou des sources.

## Portée

Cette application utilise Next.js App Router, TypeScript et Supabase. Le moteur
fonctionnel des catalogues reste dans `public/catalogue-runtime.js` pendant la
migration progressive.

## Contraintes

- Préserver les 10 catalogues, 400 actifs, 80 réserves et 400 guides colorés.
- Ne jamais remplacer un actif manquant par un fallback silencieux.
- Conserver l’impression A4, la recherche, le catalogue surprise et le
  retournement noir-et-blanc/couleur.
- Écrire les actifs servis dans `public/assets/` et les données publiques dans
  `public/data/`.
- Ne jamais commiter `.env.local` ni afficher la valeur des secrets.
- Ne pas intégrer Stripe sans demande explicite.
- Toute promesse de mise à jour hebdomadaire doit rester visible sur la page.

## Validation

Exécuter dans cet ordre :

```powershell
npm run typecheck
npm run validate
npm run build
```

Le DRY_RUN navigateur est une validation finale coûteuse. Ne l’exécuter qu’une
seule fois lorsque le build et les validations statiques sont déjà réussis.

<!-- ASTRYX:START -->
Astryx v0.1.6 · 149 components
CLI: run every command as `npx astryx <cmd>` (shown below as `astryx ...`).

SETUP (once, in your app entry e.g. main.tsx) — without these, components render unstyled:
  import "@astryxdesign/core/reset.css";
  import "@astryxdesign/core/astryx.css";

WORKFLOW — discover, don't guess. Before writing UI:
1. `astryx build "<idea>"` — START HERE: returns a kit (closest [page] + [block]s + [component]s). No args = full playbook.
2. `astryx template <name> [--skeleton]` — scaffold the [page]/[block]s it named, or study their layout. Templates are reference code.
3. `astryx component <Name>` — props + examples for every component you use.

RULES:
- No <div> — components do all layout/spacing. Full page → AppShell; sidebar nav → SideNav.
- Frame first: pick the shell (AppShell / Layout+LayoutPanel) and budget regions in px BEFORE writing content (`astryx docs layout`).
- Dense data = rows (Table, List/Item) edge-to-edge — never Card-wrapped list items. Card = dashboard widgets, galleries, settings groups only.
- Status → StatusDot/Token; Badge only for counts and enumerated states, never decoration.
- Custom styling: component props first; else style/className with tokens — var(--color-*|--spacing-*|--radius-*). No raw hex/px. (No StyleX/Tailwind compiler here — don't use xstyle/utility classes.)
- Tokens for every value (`astryx docs tokens`). Brand/accent via `astryx theme` — never override --color-* in :root.

MORE CLI:
  search "<query>"   find any component / hook / doc / template / block
  component --list   149 components by category
  template --list    page + block recipes
  docs <topic>       color, elevation, icons, illustrations, layout, migration, motion, principles, shape, spacing, styling, theme, tokens, typography
  swizzle <Name>     eject component source for deep customization
  upgrade --apply    run after any @astryxdesign/core bump
<!-- ASTRYX:END -->
