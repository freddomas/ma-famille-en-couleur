const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const archiveRoot = path.join(
  root,
  "output",
  "Extract",
  "decommissioned-catalogue-png",
);
const stagingRoot = `${archiveRoot}.__staging`;
const backupRoot = `${archiveRoot}.__previous`;
const legacyExpandedRoot = `${archiveRoot}.__head`;
const legacyZipPath = `${archiveRoot}.__head.zip`;
const cataloguePrefix = "public/assets/coloring/";
const roots = [
  `${cataloguePrefix}active`,
  `${cataloguePrefix}colored`,
  `${cataloguePrefix}reserve`,
];
const EXPECTED_BYTES = 259_732_436;
const HISTORY_LIMIT = 50;

function readSourceRefArgument() {
  const inline = process.argv.find((argument) =>
    argument.startsWith("--source-ref=")
  );
  if (inline) return inline.slice("--source-ref=".length);
  const index = process.argv.indexOf("--source-ref");
  if (index === -1) return null;
  assert.ok(process.argv[index + 1], "--source-ref attend une valeur.");
  return process.argv[index + 1];
}

function trackedPng(sourceRef) {
  return execFileSync(
    "git",
    ["ls-tree", "-r", "--name-only", sourceRef, "--", ...roots],
    { cwd: root, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  )
    .split(/\r?\n/)
    .filter((file) => /\.png$/i.test(file));
}

function resolveSource() {
  const requested = readSourceRefArgument();
  if (requested) {
    const tracked = trackedPng(requested);
    assert.equal(
      tracked.length,
      880,
      `${requested} doit contenir exactement 880 PNG de catalogue.`,
    );
    return {
      requested,
      resolved: execFileSync(
        "git",
        ["rev-parse", `${requested}^{commit}`],
        { cwd: root, encoding: "utf8" },
      ).trim(),
      tracked,
    };
  }

  const history = execFileSync(
    "git",
    ["rev-list", `--max-count=${HISTORY_LIMIT}`, "HEAD", "--", ...roots],
    { cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024 },
  )
    .split(/\r?\n/)
    .filter(Boolean);
  for (const candidate of [...new Set(["HEAD", ...history])]) {
    const tracked = trackedPng(candidate);
    if (tracked.length === 880) {
      return {
        requested: null,
        resolved: execFileSync(
          "git",
          ["rev-parse", `${candidate}^{commit}`],
          { cwd: root, encoding: "utf8" },
        ).trim(),
        tracked,
      };
    }
  }
  assert.fail(
    `Aucun des ${HISTORY_LIMIT} derniers commits ne contient exactement 880 PNG de catalogue. Utilisez --source-ref.`,
  );
}

function walkPng(directory) {
  if (!fs.existsSync(directory)) return [];
  const results = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(absolute);
      if (entry.isFile() && /\.png$/i.test(entry.name)) results.push(absolute);
    }
  }
  return results;
}

function summarize(directory) {
  const files = walkPng(directory);
  return {
    count: files.length,
    bytes: files.reduce((sum, file) => sum + fs.statSync(file).size, 0),
  };
}

function main() {
  const source = resolveSource();
  const { tracked } = source;

  const existingByName = new Map();
  for (const file of walkPng(archiveRoot)) {
    const name = path.basename(file);
    assert.ok(!existingByName.has(name), `Nom PNG ambigu dans l’archive : ${name}`);
    existingByName.set(name, file);
  }

  fs.rmSync(stagingRoot, { recursive: true, force: true });
  fs.rmSync(backupRoot, { recursive: true, force: true });
  fs.rmSync(legacyExpandedRoot, { recursive: true, force: true });
  fs.rmSync(legacyZipPath, { force: true });
  fs.mkdirSync(stagingRoot, { recursive: true });

  for (const trackedPath of tracked) {
    const relativePath = trackedPath.slice(cataloguePrefix.length);
    const destination = path.join(stagingRoot, ...relativePath.split("/"));
    const runtimeSource = path.join(root, ...trackedPath.split("/"));
    const archivedSource = existingByName.get(path.posix.basename(trackedPath));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    if (fs.existsSync(runtimeSource)) {
      fs.copyFileSync(runtimeSource, destination);
    } else if (archivedSource) {
      fs.copyFileSync(archivedSource, destination);
    } else {
      const content = execFileSync("git", ["show", `${source.resolved}:${trackedPath}`], {
        cwd: root,
        encoding: null,
        maxBuffer: 8 * 1024 * 1024,
      });
      fs.writeFileSync(destination, content);
    }
  }

  const active = summarize(path.join(stagingRoot, "active"));
  const colored = summarize(path.join(stagingRoot, "colored"));
  const reserve = summarize(path.join(stagingRoot, "reserve"));
  const all = summarize(stagingRoot);
  const hero = walkPng(stagingRoot).filter((file) =>
    /[\\/]hero[\\/]/i.test(file)
  );
  assert.equal(active.count, 400, "400 PNG actifs attendus.");
  assert.equal(colored.count, 400, "400 PNG couleur attendus.");
  assert.equal(reserve.count, 80, "80 PNG de réserve attendus.");
  assert.equal(all.count, 880, "880 PNG archivés attendus.");
  assert.equal(all.bytes, EXPECTED_BYTES, "Taille totale PNG inattendue.");
  assert.equal(hero.length, 0, "Le hero ne doit pas être archivé.");

  if (fs.existsSync(archiveRoot)) fs.renameSync(archiveRoot, backupRoot);
  try {
    fs.renameSync(stagingRoot, archiveRoot);
    fs.rmSync(backupRoot, { recursive: true, force: true });
  } catch (error) {
    if (fs.existsSync(backupRoot) && !fs.existsSync(archiveRoot)) {
      fs.renameSync(backupRoot, archiveRoot);
    }
    throw error;
  }

  console.log(JSON.stringify({
    status: "archived",
    active: active.count,
    colored: colored.count,
    reserve: reserve.count,
    total: all.count,
    bytes: all.bytes,
    hero: hero.length,
    sourceRef: source.resolved,
    sourceRefRequested: source.requested,
    historyLimit: HISTORY_LIMIT,
    root: archiveRoot,
  }, null, 2));
}

main();
