# Ma famille en couleur

Application Next.js de catalogues de coloriage pour les enfants de 2 à 3 ans.
La bibliothèque est enrichie chaque semaine avec de nouvelles catégories et de
nouvelles images.

## Architecture

- Next.js App Router et TypeScript ;
- moteur de catalogue historique conservé dans
  `public/catalogue-runtime.js` pour garantir la compatibilité fonctionnelle ;
- PostgreSQL, Auth et stockage prêts à être raccordés via Supabase ;
- route de santé `GET /api/health` sans exposition de secrets ;
- migration SQL versionnée dans `supabase/migrations/`.

Stripe n’est pas intégré dans cette version.

## Contenu livré

- 10 catalogues thématiques ;
- 10 pages A4 par catalogue ;
- 4 illustrations par page ;
- 400 illustrations locales actives ;
- 400 jumeaux colorés servant de guides ;
- 80 illustrations classées dans la réserve hebdomadaire ;
- catalogue surprise de 40 images distinctes, sélectionnées sans remise ;
- compteur lié au chargement et au décodage réels des images ;
- atelier de coloriage tactile : sélection de 1 à 4 dessins, huit couleurs,
  deux tailles de crayon, gomme, annulation, modèle coloré et export PNG ;
- impression d’une page ou d’un catalogue complet.

Le rendu utilise exclusivement `public/assets/coloring/manifest.json`. Les
880 illustrations de catalogue sont de vrais SVG locaux sans raster incorporé :
400 dessins actifs, 400 guides colorés et 80 réserves. L’image du hero reste
volontairement en PNG. Il n’existe ni génération SVG procédurale ni fallback
silencieux.

## Organisation des images

- `public/assets/coloring/active/<categorie>/` : illustrations actives SVG ;
- `public/assets/coloring/reserve/<categorie>/` : réserve des rotations SVG ;
- `public/assets/coloring/colored/<categorie>/` : jumeaux colorés SVG ;
- `public/assets/coloring/reserve/manifest.json` : inventaire de réserve ;
- `public/data/extracted-assets.csv` : association source, sujet et catégorie.

Le contenu de travail historique de `output/Extract` a été supprimé. Ce dossier
reste ignoré par Git pour les futurs imports temporaires.

## Lancer l’application

```powershell
npm install
npm run dev
```

Puis ouvrir <http://127.0.0.1:3000>.

## Variables d’environnement

Copier `.env.example` vers `.env.local`, sans jamais commiter les valeurs :

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
DATABASE_URL
```

Les deux variables publiques configurent les clients Supabase. `DATABASE_URL`
est réservée aux migrations et opérations serveur.

## Mise à jour hebdomadaire

Le pipeline de contenu écrit désormais dans `public/` afin que les nouveaux
catalogues soient immédiatement servis par Next.js. Les jumeaux colorés sont
régénérés avec un transfert sémantique de palette qui conserve les traits noirs,
nettoie les aplats, refuse les débordements et produit directement de vrais SVG
sans raster incorporé :

```powershell
npm run assets:colored
```

L’ancienne commande Python délègue à ce pipeline afin de ne plus réintroduire
le remplissage raster défectueux. Après un import raster, la migration
vectorielle des dessins actifs et de réserve s’exécute avec :

```powershell
npm run assets:svg
```

Cette commande ne touche pas au hero. Elle convertit uniquement les chemins
référencés par les manifestes, impose `xMidYMid meet`, refuse les SVG contenant
une balise raster `<image>`, met à jour les empreintes SHA-256, puis déclasse les
anciens PNG dans `output/Extract/decommissioned-catalogue-png/` avant de les
retirer du runtime. L’archive locale conserve les sous-dossiers `active/`,
`colored/` et `reserve/`; elle reste exclue de Git.

Le script d’import conserve son mode non destructif :

```powershell
python scripts\import-extracted-assets.py --dry-run
```

L’option `--apply` refuse d’écraser des dossiers `active` ou `reserve`
existants.

## Validation

```powershell
npm run typecheck
npm run validate
npm run build
```

Le DRY_RUN navigateur final se lance une seule fois après un build réussi :

```powershell
npm run dry-run
```

Il démarre le serveur de production Next.js, vérifie le rendu initial, les dix
catalogues, le catalogue surprise, les guides colorés, l’impression A4, le
mobile étroit et le scénario d’image invalide, puis arrête les processus.
