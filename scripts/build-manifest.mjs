import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const publicRoot = path.join(root, "public");
const dataPath = path.join(publicRoot, "data", "catalogues.json");
const manifestPath = path.join(publicRoot, "assets", "coloring", "manifest.json");
const data = JSON.parse(await readFile(dataPath, "utf8"));

function pngDimensions(buffer, filePath) {
  if (
    buffer.length < 24 ||
    buffer.toString("hex", 0, 8) !== "89504e470d0a1a0a" ||
    buffer.toString("ascii", 12, 16) !== "IHDR"
  ) {
    throw new Error(`Fichier PNG invalide : ${filePath}`);
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

const entries = [];
const missing = [];

for (const catalogue of data.catalogues) {
  for (let index = 0; index < catalogue.items.length; index += 1) {
    const relativePath = path
      .join("assets", "coloring", "items", catalogue.id, `${String(index + 1).padStart(2, "0")}.png`)
      .replaceAll("\\", "/");
    const absolutePath = path.join(publicRoot, relativePath);

    if (!existsSync(absolutePath)) {
      missing.push(relativePath);
      continue;
    }

    const buffer = await readFile(absolutePath);
    const { width, height } = pngDimensions(buffer, relativePath);
    entries.push({
      id: `${catalogue.id}-${String(index + 1).padStart(2, "0")}`,
      catalogueId: catalogue.id,
      catalogueTitle: catalogue.title,
      title: catalogue.items[index],
      page: Math.floor(index / 4) + 1,
      position: (index % 4) + 1,
      path: relativePath,
      width,
      height,
      validationStatus: "validated",
      origin: index < 4 ? "gold-master-sprite" : "generated-image",
      sha256: createHash("sha256").update(buffer).digest("hex"),
    });
  }
}

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  expectedEntries: 400,
  validatedEntries: entries.length,
  complete: entries.length === 400 && missing.length === 0,
  entries,
  missing,
};

await mkdir(path.dirname(manifestPath), { recursive: true });
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`Manifeste écrit : ${path.relative(root, manifestPath)}`);
console.log(`Entrées validées : ${entries.length} / 400`);
console.log(`Fichiers manquants : ${missing.length}`);
