# Audit UI/UX — Ma famille en couleur

## Verdict

La refonte corrige les cinq défauts bloquants observés : guides colorés masqués,
marque sans retour accueil, textes trop petits, chevauchements et densité mal
maîtrisée. Le langage visuel existant est conservé, mais la hiérarchie,
l’exploitation de l’espace et les comportements responsive ont été
structurellement repris.

## Correctifs

### ISSUE-001 — Guide coloré masqué

- Sévérité initiale : haute
- Cause : retournement 3D fragile laissant la face noir-et-blanc au-dessus.
- Correctif : rotation verticale 3D déterministe de 520 ms, revers masqués,
  face colorée réellement visible et impression A4 toujours forcée en noir et
  blanc.
- Preuve : `after-desktop-catalogue-viewport.png`.

### ISSUE-002 — Marque sans retour accueil

- Sévérité initiale : haute
- Cause : `href="#"` sur l’accueil et marque non interactive dans le lecteur.
- Correctif : composant `Link` Astryx sur les trois marques, cible minimale de
  44 px, fermeture du lecteur et retour réel en haut de page.
- Preuve : assertion Playwright `homeLink: true` sur les sept formats.

### ISSUE-003 — Textes trop petits

- Sévérité initiale : moyenne
- Cause : plusieurs libellés fonctionnels mesurés entre 8,6 et 13,8 px sur PC.
- Correctif : corps, métadonnées, menus, actions et libellés remontés à une
  taille lisible, avec hiérarchie typographique resserrée.
- Preuve : aucun texte fonctionnel sous le seuil sur laptop, desktop et monitor.

### ISSUE-004 — Chevauchements et rognages

- Sévérité initiale : haute
- Cause : compositions trop rigides et zones décoratives prises pour du
  contenu dimensionnant.
- Correctif : cadres à débordement contrôlé, grilles adaptatives, actions
  isolées et contrôle géométrique des zones cliquables.
- Preuve : zéro chevauchement, zéro débordement horizontal et zéro texte rogné.

### ISSUE-005 — Espaces vides et cartes trop hautes

- Sévérité initiale : moyenne
- Cause : espacements verticaux excessifs et modèle de carte mobile empilé.
- Correctif : rythme vertical réduit, largeur utile mieux exploitée et cartes
  mobiles horizontales conservant image, titre, métadonnées et action.
- Preuve : zéro intervalle vide anormal détecté; dix vignettes visibles sur
  chaque format.

## Direction de mouvement

Le mouvement est volontairement fonctionnel : rotation verticale en 520 ms,
retours de pression courts, aucune chorégraphie décorative de page. Les
transitions sont neutralisées par `prefers-reduced-motion`.

## Matrice Playwright

La passe stricte a été exécutée sur :

- 320 × 568
- 390 × 844
- 667 × 375
- 768 × 1024
- 1024 × 768
- 1440 × 900
- 1920 × 1080

Résultat commun aux sept formats :

- 10 catalogues chargés, décodés et visibles;
- guide coloré décodé et affiché;
- retour accueil fonctionnel et positionné à `scrollY = 0`;
- aucun chevauchement entre les actions;
- aucune image hors de son conteneur;
- aucun débordement horizontal;
- aucun texte rogné;
- aucune erreur console.

Les mesures complètes sont dans `after-playwright.json`; les captures avant et
après sont conservées dans `screenshots/`.
