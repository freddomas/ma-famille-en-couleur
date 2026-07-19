# Contrôle global du cadrage des images

## Correction

- 400 paires noir-et-blanc / couleur inspectées, soit 800 PNG.
- 272 paires recentrées à partir de leurs limites optiques réelles.
- Aucun redimensionnement : les traits ont seulement été translatés dans leur
  canevas d’origine.
- Six fragments issus d’anciens découpages de sprites ont été retirés sur cinq
  paires, sans toucher aux détails appartenant au dessin.
- Le même déplacement est appliqué aux traits et au guide coloré afin de
  préserver leur superposition.

## Validation

- Écart optique maximal après correction : `0,319 %` dans l’audit source.
- Écart optique maximal dans Chrome : `0,3125 %`.
- 800 images décodées et mesurées dans Chrome.
- 100 pages parcourues sur chacun des trois formats :
  - téléphone `390 × 844`;
  - tablette `768 × 1024`;
  - ordinateur `1440 × 900`.
- Total : 300 pages et 1 200 cartes rendues, sans image hors cadre ni
  débordement horizontal.

Les dix planches-contact de `qa/image-framing-contact-sheets/` présentent les
400 paires après correction, catalogue par catalogue.
