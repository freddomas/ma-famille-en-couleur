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
