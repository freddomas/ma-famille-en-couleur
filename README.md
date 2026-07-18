# Ma famille en couleur

Application web statique de catalogues de coloriage pour enfants de 2 à 3 ans.

## Contenu livré

- 10 catalogues thématiques ;
- 10 pages A4 par catalogue ;
- 4 illustrations par page ;
- 400 illustrations locales actives ;
- 400 jumeaux colorés servant de guides réalistes ;
- 80 illustrations locales classées dans la réserve hebdomadaire ;
- catalogue surprise de 40 images distinctes, sélectionnées sans remise ;
- compteur lié au chargement et au décodage réels des 40 images ;
- impression d’une page, d’un catalogue normal ou du catalogue surprise.

Le rendu utilise exclusivement `assets/coloring/manifest.json`. Il n’existe plus
de génération SVG procédurale ni de fallback silencieux.

## Organisation des images

- `assets/coloring/active/<categorie>/` : les 400 illustrations actuellement
  injectées dans les dix catalogues ;
- `assets/coloring/reserve/<categorie>/` : les 80 illustrations destinées aux
  rotations futures ;
- `assets/coloring/colored/<categorie>/` : le jumeau coloré de chacune des
  400 illustrations actives ;
- `assets/coloring/reserve/manifest.json` : inventaire de la réserve ;
- `data/extracted-assets.csv` : association vérifiée entre les 360 fichiers
  provenant de `output/Extract`, leur sujet et leur catégorie.

Les 360 PNG importés ont reçu uniquement un traitement de netteté non destructif
avec `Pillow UnsharpMask` (`radius=1.0`, `percent=95`, `threshold=3`). Les sources
de `output/Extract` sont préservées. Les 120 illustrations antérieures n’ont pas
été retouchées.

## Guide des couleurs

Un clic ou toucher normal retourne l’illustration de 180 degrés autour de son
axe vertical et affiche son jumeau coloré. Le clic suivant retourne à nouveau
la carte et rétablit le dessin au trait. L’alternance fonctionne sans limite,
sur ordinateur comme sur smartphone ou tablette.

Les pages imprimables utilisent toujours les sources noir et blanc. Les jumeaux
colorés peuvent être régénérés de manière déterministe avec :

```powershell
python scripts\generate-colored-twins.py
```

## Lancer l’application

```powershell
python -m http.server 8080
```

Puis ouvrir <http://127.0.0.1:8080>.

## Reproduire l’import

Le DRY_RUN ne modifie aucun fichier :

```powershell
python scripts\import-extracted-assets.py --dry-run
```

L’option `--apply` construit les dossiers `active` et `reserve` uniquement s’ils
n’existent pas encore. Cette protection empêche un écrasement accidentel.

## Validation

```powershell
node --check app.js
node scripts\validate-delivery.cjs
.\scripts\run-browser-dry-run.ps1
```

Le contrôle navigateur couvre le rendu initial, la génération surprise complète,
la synchronisation compteur/aperçus, les dix pages du catalogue surprise,
l’impression PDF A4, le mobile étroit et une image volontairement invalide.
Les rapports sont conservés dans `qa/`.
