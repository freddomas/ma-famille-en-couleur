import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [, , catalogueId, pageArgument] = process.argv;
const page = Number(pageArgument);

if (!catalogueId || !Number.isInteger(page) || page < 2 || page > 10) {
  console.error("Usage: node scripts/create-page-batch.mjs <catalogueId> <page 2..10>");
  process.exit(1);
}

const root = process.cwd();
const data = JSON.parse(await readFile(path.join(root, "data", "catalogues.json"), "utf8"));
const catalogue = data.catalogues.find((entry) => entry.id === catalogueId);

if (!catalogue) {
  console.error(`Catalogue inconnu : ${catalogueId}`);
  process.exit(1);
}

const firstIndex = (page - 1) * 4;
const titles = catalogue.items.slice(firstIndex, firstIndex + 4);

if (titles.length !== 4) {
  console.error(`La page ${page} ne contient pas exactement 4 titres.`);
  process.exit(1);
}

function semanticConstraint(title) {
  const quantity = title.match(/^(\d+)\s+(.+)$/u);
  if (quantity) {
    return `CRITICAL COUNTING RULE: show exactly ${quantity[1]} separate, clearly countable ${quantity[2]}; no additional object of that kind and no decorative object that could be counted.`;
  }

  if (catalogue.type === "number") {
    return "Render the requested numeral as one large, hollow, outlined coloring shape; no other numeral and no decorative objects.";
  }

  if (catalogue.type === "shape") {
    return "Keep every requested geometric form exact, symmetric where appropriate, visually unambiguous, and made of large open coloring areas.";
  }

  if (catalogue.type === "people") {
    return "Show exactly one friendly adult professional, full body, with one or two unmistakable job-related tools or clothing cues; credible human anatomy; two arms and two legs only.";
  }

  if (catalogue.type === "vehicle") {
    return "Show exactly one complete vehicle with credible structure, all essential wheels or transport parts visible, and no driver unless required by the title.";
  }

  return "Show exactly the named subject and only minimal title-required context; the subject must be immediately recognizable and semantically exact.";
}

function promptFor(title) {
  return [
    "Use case: illustration-story",
    "Asset type: final individual toddler coloring-book illustration",
    `Primary request: ${title}.`,
    semanticConstraint(title),
    "Audience: children aged 2 to 3 years.",
    "Style: polished professional black-and-white children's coloring-book line art; charming, serious, and consistent with a premium toddler coloring book.",
    "Composition: exactly one centered composition; main subject entirely visible; subject occupies 68 to 80 percent of a square canvas; generous pure-white padding on every side.",
    "Line work: clean continuous thick black outlines; large easy-to-color areas; only moderate useful interior details; natural coherent silhouette.",
    "Constraints: pure white background; no color; no gray shading; no gradient; no shadow; no photographic texture; no watermark; no text; no caption; no border; no cropped element; no extra limb; no deformation; no ambiguous form; no pictogram; no logo; no crude clipart; no unfinished sketch.",
  ].join("\n");
}

const jobs = titles.map((title, position) => {
  const itemNumber = firstIndex + position + 1;
  return {
    prompt: promptFor(title),
    use_case: "illustration-story",
    size: "1024x1024",
    quality: "high",
    output_format: "png",
    out: `${String(itemNumber).padStart(2, "0")}.png`,
  };
});

const temporaryDirectory = path.join(root, "tmp", "imagegen");
const outputDirectory = path.join(
  root,
  "output",
  "imagegen",
  catalogueId,
  `page-${String(page).padStart(2, "0")}`,
);
const inputPath = path.join(
  temporaryDirectory,
  `${catalogueId}-page-${String(page).padStart(2, "0")}.jsonl`,
);

await mkdir(temporaryDirectory, { recursive: true });
await mkdir(outputDirectory, { recursive: true });
await writeFile(inputPath, `${jobs.map((job) => JSON.stringify(job)).join("\n")}\n`, "utf8");

console.log(JSON.stringify({
  catalogueId,
  page,
  inputPath,
  outputDirectory,
  jobs: jobs.length,
  titles,
}));
