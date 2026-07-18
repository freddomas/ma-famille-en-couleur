const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildRandomSelection,
  buildPages,
  loadEntriesProgressively,
  validateData,
} = require("../app.js");

const root = path.resolve(__dirname, "..");
const readJson = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const check = (condition, message) => assert.ok(condition, message);

function readPng(relativePath) {
  const absolutePath = path.join(root, ...relativePath.split("/"));
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
  const data = readJson("data/catalogues.json");
  const manifest = readJson("assets/coloring/manifest.json");
  const reserve = readJson("assets/coloring/reserve/manifest.json");
  const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const stylesSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");

  validateData(data, manifest);
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
  check(/id="print-page"/.test(indexSource), "Bouton impression page absent");
  check(/id="print-catalogue"/.test(indexSource), "Bouton impression catalogue absent");
  check(/data-color-flip/.test(appSource), "Commande de retournement absente");
  check(/handleColorFlipClick/.test(appSource), "Alternance au clic absente");
  check(/rotateY\(180deg\)/.test(stylesSource), "Rotation verticale 180° absente");
  check(!/pointerType === "mouse"/.test(appSource), "Ancien maintien souris encore actif");
  check(!/handleGuidePointerDown/.test(appSource), "Ancien appui long encore actif");

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
      check(fs.existsSync(path.join(root, ...entry.path.split("/"))), entry.path);
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

  const report = {
    status: "passed",
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
