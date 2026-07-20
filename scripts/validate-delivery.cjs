const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildRandomSelection,
  buildPages,
  loadEntriesProgressively,
  validateData,
  assetUrl,
} = require("../public/catalogue-runtime.js");

const root = path.resolve(__dirname, "..");
const readJson = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const check = (condition, message) => assert.ok(condition, message);

function readPng(relativePath) {
  const absolutePath = path.join(root, "public", ...relativePath.split("/"));
  const buffer = fs.readFileSync(absolutePath);
  check(
    buffer.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    ),
    `PNG illisible : ${relativePath}`,
  );
  check(buffer.toString("ascii", 12, 16) === "IHDR", `IHDR absent : ${relativePath}`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    hash: sha256(buffer),
  };
}

async function main() {
  const data = readJson("public/data/catalogues.json");
  const manifest = readJson("public/assets/coloring/manifest.json");
  const reserve = readJson("public/assets/coloring/reserve/manifest.json");
  const appSource = fs.readFileSync(
    path.join(root, "public", "catalogue-runtime.js"),
    "utf8",
  );
  const pageSource = fs.readFileSync(path.join(root, "app", "page.tsx"), "utf8");
  const stylesSource = fs.readFileSync(path.join(root, "app", "globals.css"), "utf8");
  const packageJson = readJson("package.json");

  validateData(data, manifest);
  assert.equal(assetUrl("assets/coloring/example.png"), "/assets/coloring/example.png");
  assert.equal(assetUrl("/assets/coloring/example.png"), "/assets/coloring/example.png");
  assert.equal(assetUrl("https://example.test/example.png"), "https://example.test/example.png");
  assert.equal(data.catalogues.length, 10, "10 catalogues requis");
  assert.equal(manifest.entries.length, 400, "400 actifs requis");
  assert.equal(reserve.entries.length, 80, "80 réserves requises");
  assert.equal(manifest.complete, true, "Le manifeste actif doit être complet");
  assert.equal(
    new Set(manifest.entries.map((entry) => entry.coloredPath)).size,
    400,
    "400 chemins colorés uniques requis",
  );

  const allEntries = [...manifest.entries, ...reserve.entries];
  assert.equal(new Set(allEntries.map((entry) => entry.id)).size, 480);
  assert.equal(new Set(allEntries.map((entry) => entry.path)).size, 480);
  assert.equal(new Set(allEntries.map((entry) => entry.sha256)).size, 480);

  for (const entry of allEntries) {
    check(!/^https?:\/\//i.test(entry.path), `Asset distant : ${entry.path}`);
    const decoded = readPng(entry.path);
    assert.equal(decoded.width, entry.width, `Largeur incohérente : ${entry.id}`);
    assert.equal(decoded.height, entry.height, `Hauteur incohérente : ${entry.id}`);
    assert.equal(decoded.hash, entry.sha256, `SHA-256 incohérent : ${entry.id}`);
  }

  for (const entry of manifest.entries) {
    check(entry.coloredPath, `Jumeau coloré absent : ${entry.id}`);
    check(
      entry.coloredPath.startsWith("assets/coloring/colored/"),
      `Chemin coloré invalide : ${entry.id}`,
    );
    const lineArt = readPng(entry.path);
    const colored = readPng(entry.coloredPath);
    assert.equal(colored.width, lineArt.width, `Largeur colorée : ${entry.id}`);
    assert.equal(colored.height, lineArt.height, `Hauteur colorée : ${entry.id}`);
    check(colored.hash !== lineArt.hash, `Jumeau coloré identique : ${entry.id}`);
  }

  for (const catalogue of data.catalogues) {
    const entries = manifest.entries
      .filter((entry) => entry.catalogueId === catalogue.id)
      .sort((left, right) => left.page - right.page || left.position - right.position);
    assert.equal(entries.length, 40, `${catalogue.id}: 40 images`);
    assert.equal(catalogue.items.length, 40, `${catalogue.id}: 40 titres`);
    assert.deepEqual(
      entries.map((entry) => entry.title),
      catalogue.items,
      `${catalogue.id}: titres synchronisés`,
    );
    const pages = buildPages({ entries });
    assert.equal(pages.length, 10, `${catalogue.id}: 10 pages`);
    pages.forEach((page) => assert.equal(page.entries.length, 4));
  }

  check(!/renderLineArt\s*\(/.test(appSource), "renderLineArt encore actif");
  check(!/renderFallback\s*\(/.test(appSource), "renderFallback encore actif");
  check(!/SPRITE_ASSETS/.test(appSource), "SPRITE_ASSETS encore actif");
  check(/crypto\.getRandomValues/.test(appSource), "crypto.getRandomValues requis");
  check(/image\.decode/.test(appSource), "image.decode requis");
  check(/Créer un catalogue surprise/.test(appSource), "Commande surprise absente");
  check(/aria-live/.test(appSource), "Zone aria-live surprise absente");
  check(/id="print-page"/.test(pageSource), "Bouton impression page absent");
  check(/id="print-catalogue"/.test(pageSource), "Bouton impression catalogue absent");
  check(
    /id="atelier"[\s\S]*?aria-hidden="true"[\s\S]*?\bhidden\b[\s\S]*?>/.test(
      pageSource,
    ),
    "Le catalogue doit être masqué avant l’ouverture explicite",
  );
  check(
    /atelier\.hidden\s*=\s*false/.test(appSource)
      && /atelier\.removeAttribute\("aria-hidden"\)/.test(appSource),
    "L’ouverture doit rendre le catalogue visible et accessible",
  );
  check(
    /atelier\.hidden\s*=\s*true/.test(appSource)
      && /atelier\.setAttribute\("aria-hidden",\s*"true"\)/.test(appSource),
    "La fermeture doit retirer le catalogue du rendu et de l’accessibilité",
  );
  check(
    /catalogueReturnScrollY/.test(appSource)
      && /window\.scrollTo\(\{\s*top:\s*returnScrollY/.test(appSource),
    "La fermeture doit restaurer la position de lecture",
  );
  check(
    /id="open-coloring-studio"/.test(pageSource),
    "Bouton de coloriage interactif absent",
  );
  check(
    /id="coloring-choice-grid"/.test(pageSource),
    "Sélection des quatre dessins absente",
  );
  check(/id="coloring-canvas"/.test(pageSource), "Canevas de coloriage absent");
  check(/data-color-flip/.test(appSource), "Commande de retournement absente");
  check(/handleColorFlipClick/.test(appSource), "Alternance au clic absente");
  check(/openColoringStudio/.test(appSource), "Ouverture de l’atelier absente");
  check(/startColoringStroke/.test(appSource), "Dessin tactile absent");
  check(/destination-out/.test(appSource), "Gomme du canevas absente");
  check(/downloadColoring/.test(appSource), "Export du coloriage absent");
  check(
    /touch-action:\s*none/.test(stylesSource),
    "Le canevas doit neutraliser le défilement tactile",
  );
  check(
    /grid-template-columns:\s*1fr/.test(stylesSource),
    "Adaptation mobile de la planche absente",
  );
  check(
    /transition:\s*transform\s+520ms/.test(stylesSource),
    "Transition de rotation du guide coloré absente",
  );
  check(
    /\.color-flip-card\.is-color-visible\s+\.color-flip-card__inner\s*\{[^}]*rotateY\(180deg\)/s.test(stylesSource),
    "Rotation verticale 180° absente",
  );
  check(
    /backface-visibility:\s*hidden/.test(stylesSource),
    "Masquage du revers des guides absent",
  );
  check(
    /\.drawing-card__art\s+\.color-flip-card__inner\s*\{[^}]*overflow:\s*visible/s.test(stylesSource),
    "Le conteneur 3D des guides ne doit pas être aplati par overflow",
  );
  check(!/pointerType === "mouse"/.test(appSource), "Ancien maintien souris encore actif");
  check(!/handleGuidePointerDown/.test(appSource), "Ancien appui long encore actif");
  check(
    !/lastTouchActivation|touchStart\s*=/.test(appSource),
    "L’activation tactile ne doit pas précéder le clic natif",
  );

  const manifestIds = new Set(manifest.entries.map((entry) => entry.id));
  const signatures = new Set();
  for (let run = 0; run < 100; run += 1) {
    const selection = buildRandomSelection(
      manifest.entries,
      40,
      (max) => crypto.randomInt(max),
    );
    assert.equal(selection.length, 40);
    assert.equal(new Set(selection.map((entry) => entry.id)).size, 40);
    selection.forEach((entry) => {
      check(manifestIds.has(entry.id), `ID hors manifeste : ${entry.id}`);
      assert.equal(entry.validationStatus, "validated");
      check(entry.title.length > 0, `Titre absent : ${entry.id}`);
      check(
        fs.existsSync(path.join(root, "public", ...entry.path.split("/"))),
        entry.path,
      );
    });
    assert.equal(buildPages({ entries: selection }).length, 10);
    buildPages({ entries: selection }).forEach((page) =>
      assert.equal(page.entries.length, 4),
    );
    signatures.add(selection.map((entry) => entry.id).join(","));
  }
  check(signatures.size > 1, "Les 100 générations sont toutes identiques");

  const invalidSelection = manifest.entries.slice(0, 40);
  let visiblePreviews = 0;
  let loadedCounter = 0;
  let failed = false;
  try {
    await loadEntriesProgressively(
      invalidSelection,
      async (_entry, index) => {
        if (index === 16) throw new Error("image volontairement invalide");
      },
      (_entry, loaded) => {
        visiblePreviews += 1;
        loadedCounter = loaded;
      },
    );
  } catch (error) {
    failed = /volontairement invalide/.test(error.message);
  }
  assert.equal(failed, true, "Le cas invalide doit échouer");
  assert.equal(loadedCounter, 16, "Le compteur ne doit pas dépasser les succès");
  assert.equal(visiblePreviews, loadedCounter, "Aperçus et compteur désynchronisés");
  check(loadedCounter < 40, "Le catalogue invalide ne doit pas être prêt");
  assert.equal(packageJson.dependencies.next.startsWith("^16."), true, "Next.js 16 requis");
  check(/createServerClient/.test(fs.readFileSync(path.join(root, "lib", "supabase", "server.ts"), "utf8")), "Client Supabase serveur absent");
  check(/Chaque semaine/.test(pageSource), "Promesse hebdomadaire absente");
  check(/Nouvelles catégories/.test(pageSource), "Nouvelles catégories absentes");
  check(/Nouvelles images/.test(pageSource), "Nouvelles images absentes");
  check(!/stripe/i.test(pageSource), "Stripe ne doit pas être intégré pour l’instant");

  const report = {
    status: "passed",
    framework: "Next.js",
    catalogues: data.catalogues.length,
    activeImages: manifest.entries.length,
    reserveImages: reserve.entries.length,
    coloredTwins: manifest.entries.length,
    decodedPng: allEntries.length,
    uniqueIds: new Set(allEntries.map((entry) => entry.id)).size,
    uniquePaths: new Set(allEntries.map((entry) => entry.path)).size,
    uniqueSha256: new Set(allEntries.map((entry) => entry.sha256)).size,
    randomRuns: 100,
    distinctRandomSelections: signatures.size,
    invalidImageScenario: {
      failedAsExpected: failed,
      loadedCounter,
      visiblePreviews,
      ready: false,
      printingEnabled: false,
    },
  };
  const reportPath = path.join(root, "qa", "delivery-test-report.json");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
