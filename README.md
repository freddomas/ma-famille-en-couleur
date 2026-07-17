# Les Masiala en couleur

Application web statique de catalogues de coloriage pour enfants de 2 à 3 ans.

## Contenu

- 10 catalogues thématiques
- 10 pages A4 par catalogue
- 4 dessins à colorier par page
- 400 sujets au total
- 40 illustrations HD d’ouverture, dessinées spécialement pour les 2–3 ans
- 360 illustrations vectorielles simplifiées et imprimables
- impression d’une page ou d’un catalogue complet
- données éditoriales centralisées dans `data/catalogues.json`

## Lancer le projet

Le fichier JSON est chargé avec `fetch`, il faut donc ouvrir le projet avec un petit serveur local :

```powershell
python -m http.server 8080
```

Puis ouvrir <http://127.0.0.1:8080>.

## Structure

- `index.html` : structure de l’interface
- `styles.css` : direction visuelle, responsive et styles d’impression A4
- `app.js` : navigation, recherche, génération SVG et impression
- `data/catalogues.json` : les 10 catalogues et leurs 400 sujets
- `assets/coloring/` : les 10 planches HD utilisées sur les premières pages

Le projet ne requiert ni compilation ni dépendance JavaScript.
