const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} = require("node:worker_threads");
const ImageTracer = require("imagetracerjs");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const publicRoot = path.join(root, "public");
const manifestPath = path.join(
  publicRoot,
  "assets",
  "coloring",
  "manifest.json",
);
const reportPath = path.join(root, "qa", "colored-guides-report.json");
const contactSheetPath = path.join(
  root,
  "qa",
  "colored-guides-contact-sheet.jpg",
);
const contactSheetsRoot = path.join(
  root,
  "qa",
  "colored-guides-contact-sheets",
);
const stageRoot = path.join(
  root,
  "tmp",
  "colored-guides-regeneration",
);

const PROCESS_SIZE = 512;
const WHITE_REGION_THRESHOLD = 218;
const MIN_REGION_AREA = 28;
const MIN_COLORED_COVERAGE = 0.08;
const MAX_PALETTE_COLORS = 9;
const MAX_WORKERS = 4;
const VECTOR_OPTIONS = Object.freeze({
  colors: 16,
  pathomit: 24,
  adaptivePathomit: [24, 16, 8],
  ltres: 1.5,
  qtres: 1.5,
  strokewidth: 0.6,
});

const sha256 = (buffer) =>
  crypto.createHash("sha256").update(buffer).digest("hex");

const readJson = (filePath) =>
  JSON.parse(fs.readFileSync(filePath, "utf8"));

const publicPath = (relativePath) =>
  path.join(publicRoot, ...relativePath.split("/"));

function luminance(r, g, b) {
  return Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
}

function colorDistance(left, right) {
  return Math.sqrt(
    (left[0] - right[0]) ** 2 +
      (left[1] - right[1]) ** 2 +
      (left[2] - right[2]) ** 2,
  );
}

function isNearWhite(r, g, b) {
  return luminance(r, g, b) > 244 && Math.max(r, g, b) - Math.min(r, g, b) < 15;
}

function isReferenceColor(r, g, b) {
  return luminance(r, g, b) >= 48 && !isNearWhite(r, g, b);
}

function isSemanticReferenceColor(palette, r, g, b) {
  if (isNearWhite(r, g, b)) return false;
  const nearest = nearestPaletteColor(palette, r, g, b);
  if (nearest.distance > 88) return false;
  if (luminance(r, g, b) >= 35) return true;
  return luminance(...nearest.color) < 90;
}

function paletteFromReference(data) {
  const bins = new Map();
  for (let offset = 0; offset < data.length; offset += 3) {
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    if (!isReferenceColor(r, g, b)) continue;
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    const entry = bins.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    entry.count += 1;
    entry.r += r;
    entry.g += g;
    entry.b += b;
    bins.set(key, entry);
  }

  const clusters = [];
  const ordered = [...bins.values()].sort(
    (left, right) => right.count - left.count,
  );
  for (const entry of ordered) {
    const color = [
      Math.round(entry.r / entry.count),
      Math.round(entry.g / entry.count),
      Math.round(entry.b / entry.count),
    ];
    const existing = clusters.find(
      (cluster) => colorDistance(cluster.color, color) <= 34,
    );
    if (existing) {
      const count = existing.count + entry.count;
      existing.color = existing.color.map((channel, index) =>
        Math.round(
          (channel * existing.count + color[index] * entry.count) / count,
        ),
      );
      existing.count = count;
    } else {
      clusters.push({ color, count: entry.count });
    }
  }

  return clusters
    .sort((left, right) => right.count - left.count)
    .slice(0, MAX_PALETTE_COLORS)
    .map((entry) => entry.color);
}

function nearestPaletteColor(palette, r, g, b) {
  let color = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const candidate of palette) {
    const candidateDistance = colorDistance(candidate, [r, g, b]);
    if (candidateDistance < distance) {
      color = candidate;
      distance = candidateDistance;
    }
  }
  return { color, distance };
}

function segmentLineArt(source) {
  const pixelCount = PROCESS_SIZE * PROCESS_SIZE;
  const labels = new Int32Array(pixelCount);
  const queue = new Uint32Array(pixelCount);
  const regions = [];
  let nextLabel = 0;

  const isRegionPixel = (index) => {
    const offset = index * 3;
    return (
      luminance(source[offset], source[offset + 1], source[offset + 2]) >=
      WHITE_REGION_THRESHOLD
    );
  };

  for (let start = 0; start < pixelCount; start += 1) {
    if (labels[start] !== 0 || !isRegionPixel(start)) continue;
    nextLabel += 1;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = nextLabel;
    const pixels = [];

    while (head < tail) {
      const index = queue[head++];
      pixels.push(index);
      const x = index % PROCESS_SIZE;
      const y = Math.floor(index / PROCESS_SIZE);
      if (x > 0) {
        const neighbor = index - 1;
        if (labels[neighbor] === 0 && isRegionPixel(neighbor)) {
          labels[neighbor] = nextLabel;
          queue[tail++] = neighbor;
        }
      }
      if (x + 1 < PROCESS_SIZE) {
        const neighbor = index + 1;
        if (labels[neighbor] === 0 && isRegionPixel(neighbor)) {
          labels[neighbor] = nextLabel;
          queue[tail++] = neighbor;
        }
      }
      if (y > 0) {
        const neighbor = index - PROCESS_SIZE;
        if (labels[neighbor] === 0 && isRegionPixel(neighbor)) {
          labels[neighbor] = nextLabel;
          queue[tail++] = neighbor;
        }
      }
      if (y + 1 < PROCESS_SIZE) {
        const neighbor = index + PROCESS_SIZE;
        if (labels[neighbor] === 0 && isRegionPixel(neighbor)) {
          labels[neighbor] = nextLabel;
          queue[tail++] = neighbor;
        }
      }
    }

    regions.push(pixels);
  }

  const exteriorLabels = new Set();
  for (let index = 0; index < PROCESS_SIZE; index += 1) {
    exteriorLabels.add(labels[index]);
    exteriorLabels.add(labels[(PROCESS_SIZE - 1) * PROCESS_SIZE + index]);
    exteriorLabels.add(labels[index * PROCESS_SIZE]);
    exteriorLabels.add(labels[index * PROCESS_SIZE + PROCESS_SIZE - 1]);
  }
  exteriorLabels.delete(0);
  return { labels, regions, exteriorLabels };
}

function closedInteriorMask(source, radius = 12) {
  const size = PROCESS_SIZE;
  const pixelCount = size * size;
  const barrier = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 3;
    barrier[index] =
      luminance(source[offset], source[offset + 1], source[offset + 2]) <
      WHITE_REGION_THRESHOLD
        ? 1
        : 0;
  }

  const horizontalDilated = new Uint8Array(pixelCount);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let filled = 0;
      for (
        let candidateX = Math.max(0, x - radius);
        candidateX <= Math.min(size - 1, x + radius);
        candidateX += 1
      ) {
        if (barrier[y * size + candidateX]) {
          filled = 1;
          break;
        }
      }
      horizontalDilated[y * size + x] = filled;
    }
  }
  const dilated = new Uint8Array(pixelCount);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let filled = 0;
      for (
        let candidateY = Math.max(0, y - radius);
        candidateY <= Math.min(size - 1, y + radius);
        candidateY += 1
      ) {
        if (horizontalDilated[candidateY * size + x]) {
          filled = 1;
          break;
        }
      }
      dilated[y * size + x] = filled;
    }
  }

  const horizontalClosed = new Uint8Array(pixelCount);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let filled = 1;
      for (let candidateX = x - radius; candidateX <= x + radius; candidateX += 1) {
        if (
          candidateX < 0 ||
          candidateX >= size ||
          !dilated[y * size + candidateX]
        ) {
          filled = 0;
          break;
        }
      }
      horizontalClosed[y * size + x] = filled;
    }
  }
  const closed = new Uint8Array(pixelCount);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let filled = 1;
      for (let candidateY = y - radius; candidateY <= y + radius; candidateY += 1) {
        if (
          candidateY < 0 ||
          candidateY >= size ||
          !horizontalClosed[candidateY * size + x]
        ) {
          filled = 0;
          break;
        }
      }
      closed[y * size + x] = filled;
    }
  }

  const exterior = new Uint8Array(pixelCount);
  const queue = new Uint32Array(pixelCount);
  let head = 0;
  let tail = 0;
  const enqueue = (index) => {
    if (!closed[index] && !exterior[index]) {
      exterior[index] = 1;
      queue[tail++] = index;
    }
  };
  for (let index = 0; index < size; index += 1) {
    enqueue(index);
    enqueue((size - 1) * size + index);
    enqueue(index * size);
    enqueue(index * size + size - 1);
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % size;
    const y = Math.floor(index / size);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < size) enqueue(index + 1);
    if (y > 0) enqueue(index - size);
    if (y + 1 < size) enqueue(index + size);
  }

  const interior = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    interior[index] = !exterior[index] && !barrier[index] ? 1 : 0;
  }
  return interior;
}

function transferColors(
  source,
  reference,
  semanticPalette,
  forcePrimaryFill,
) {
  const palette =
    Array.isArray(semanticPalette) && semanticPalette.length > 0
      ? semanticPalette
      : paletteFromReference(reference);
  assert.ok(palette.length >= 1, "Palette sémantique absente.");
  const { labels, regions, exteriorLabels } = segmentLineArt(source);
  const fills = new Array(regions.length + 1).fill(null);
  let forcedMask = null;

  for (let regionIndex = 0; regionIndex < regions.length; regionIndex += 1) {
    const pixels = regions[regionIndex];
    const label = regionIndex + 1;
    if (
      pixels.length < MIN_REGION_AREA ||
      exteriorLabels.has(label)
    ) {
      continue;
    }

    const counts = new Array(palette.length).fill(0);
    let coloredSamples = 0;
    for (const index of pixels) {
      const offset = index * 3;
      const r = reference[offset];
      const g = reference[offset + 1];
      const b = reference[offset + 2];
      if (
        semanticPalette
          ? !isSemanticReferenceColor(palette, r, g, b)
          : !isReferenceColor(r, g, b)
      ) {
        continue;
      }
      const nearest = nearestPaletteColor(palette, r, g, b);
      if (nearest.distance > (semanticPalette ? 88 : 72)) continue;
      const paletteIndex = palette.indexOf(nearest.color);
      counts[paletteIndex] += 1;
      coloredSamples += 1;
    }

    if (coloredSamples / pixels.length < MIN_COLORED_COVERAGE) continue;
    const dominantIndex = counts.reduce(
      (best, count, index) => (count > counts[best] ? index : best),
      0,
    );
    fills[label] = palette[dominantIndex];
  }

  if (forcePrimaryFill) {
    const filledArea = regions.reduce(
      (sum, pixels, index) => sum + (fills[index + 1] ? pixels.length : 0),
      0,
    );
    if (filledArea / labels.length < 0.05) {
      const fallback = regions
        .map((pixels, index) => ({
          pixels,
          label: index + 1,
        }))
        .filter(
          (region) =>
            !exteriorLabels.has(region.label) &&
            !fills[region.label] &&
            region.pixels.length >= 1000,
        )
        .sort((left, right) => right.pixels.length - left.pixels.length)[0];
      if (fallback) fills[fallback.label] = palette[0];
      const updatedFilledArea = regions.reduce(
        (sum, pixels, index) =>
          sum + (fills[index + 1] ? pixels.length : 0),
        0,
      );
      if (updatedFilledArea / labels.length < 0.05) {
        forcedMask = closedInteriorMask(source);
      }
    }
  }

  const output = Buffer.alloc(source.length, 255);
  let coloredPixels = 0;
  for (let index = 0; index < labels.length; index += 1) {
    const offset = index * 3;
    const gray = luminance(
      source[offset],
      source[offset + 1],
      source[offset + 2],
    );
    const fill =
      fills[labels[index]] ||
      (forcedMask && forcedMask[index] ? palette[0] : null);

    if (!fill) {
      output[offset] = source[offset];
      output[offset + 1] = source[offset + 1];
      output[offset + 2] = source[offset + 2];
      continue;
    }

    const nearest = nearestPaletteColor(
      palette,
      reference[offset],
      reference[offset + 1],
      reference[offset + 2],
    );
    const selected =
      (semanticPalette
        ? isSemanticReferenceColor(
            palette,
            reference[offset],
            reference[offset + 1],
            reference[offset + 2],
          )
        : isReferenceColor(
            reference[offset],
            reference[offset + 1],
            reference[offset + 2],
          )) && nearest.distance <= (semanticPalette ? 88 : 72)
        ? nearest.color
        : fill;
    const shade = gray / 255;
    output[offset] = Math.round(selected[0] * shade);
    output[offset + 1] = Math.round(selected[1] * shade);
    output[offset + 2] = Math.round(selected[2] * shade);
    coloredPixels += 1;
  }

  return {
    output,
    labels,
    exteriorLabels,
    palette,
    regions: regions.length,
    coloredRegions: fills.filter(Boolean).length,
    forcedPrimaryPixels: forcedMask
      ? forcedMask.reduce((sum, value) => sum + value, 0)
      : 0,
    forcedMask,
    coloredPixels,
  };
}

function buildTracerPalette(data) {
  const colors = new Map();
  for (let index = 0; index < data.length; index += 4) {
    const key = `${data[index]},${data[index + 1]},${data[index + 2]},${data[index + 3]}`;
    colors.set(key, (colors.get(key) || 0) + 1);
  }
  return [...colors.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([key]) => {
      const [r, g, b, a] = key.split(",").map(Number);
      return { r, g, b, a };
    });
}

async function vectorize(output, width, height, pathomit) {
  const prepared = await sharp(output, {
    raw: { width: PROCESS_SIZE, height: PROCESS_SIZE, channels: 3 },
  })
    .median(3)
    .png({ palette: true, colours: VECTOR_OPTIONS.colors, dither: 0 })
    .toBuffer();
  const { data, info } = await sharp(prepared)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const palette = buildTracerPalette(data);
  let svg = ImageTracer.imagedataToSVG(
    { width: info.width, height: info.height, data },
    {
      pal: palette,
      colorsampling: 0,
      colorquantcycles: 1,
      layering: 1,
      ltres: VECTOR_OPTIONS.ltres,
      qtres: VECTOR_OPTIONS.qtres,
      pathomit,
      rightangleenhance: true,
      strokewidth: VECTOR_OPTIONS.strokewidth,
      linefilter: false,
      scale: 1,
      roundcoords: 1,
      viewbox: true,
      desc: false,
      blurradius: 0,
    },
  );
  svg = svg
    .replace(/\sdesc="[^"]*"/i, "")
    .replace(
      "<svg ",
      `<svg width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" `,
    );
  assert.match(svg, /^<svg\b/);
  assert.match(svg, /\bviewBox="0 0 512 512"/);
  assert.match(svg, /\bpreserveAspectRatio="xMidYMid meet"/);
  assert.doesNotMatch(svg, /<image\b|data:image|<script\b|\bhref=/i);
  return { svg, tracerPaletteColors: palette.length, pathomit };
}

async function renderAsset(filePath) {
  return sharp(filePath)
    .resize(PROCESS_SIZE, PROCESS_SIZE, { fit: "fill" })
    .flatten({ background: "#ffffff" })
    .removeAlpha()
    .raw()
    .toBuffer();
}

function lineRecall(source, rendered) {
  let inkPixels = 0;
  let recalled = 0;
  for (let index = 0; index < PROCESS_SIZE * PROCESS_SIZE; index += 1) {
    const offset = index * 3;
    if (
      luminance(source[offset], source[offset + 1], source[offset + 2]) >= 100
    ) {
      continue;
    }
    inkPixels += 1;
    const x = index % PROCESS_SIZE;
    const y = Math.floor(index / PROCESS_SIZE);
    let found = false;
    for (let deltaY = -1; deltaY <= 1 && !found; deltaY += 1) {
      const candidateY = y + deltaY;
      if (candidateY < 0 || candidateY >= PROCESS_SIZE) continue;
      for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
        const candidateX = x + deltaX;
        if (candidateX < 0 || candidateX >= PROCESS_SIZE) continue;
        const candidateOffset =
          (candidateY * PROCESS_SIZE + candidateX) * 3;
        if (
          luminance(
            rendered[candidateOffset],
            rendered[candidateOffset + 1],
            rendered[candidateOffset + 2],
          ) < 145
        ) {
          found = true;
          break;
        }
      }
    }
    if (found) recalled += 1;
  }
  return inkPixels === 0 ? 1 : recalled / inkPixels;
}

function exteriorColorRatio(
  rendered,
  labels,
  exteriorLabels,
  allowedInteriorMask,
) {
  let exteriorPixels = 0;
  let coloredExteriorPixels = 0;
  for (let index = 0; index < labels.length; index += 1) {
    if (!exteriorLabels.has(labels[index])) continue;
    if (allowedInteriorMask && allowedInteriorMask[index]) continue;
    exteriorPixels += 1;
    const offset = index * 3;
    const r = rendered[offset];
    const g = rendered[offset + 1];
    const b = rendered[offset + 2];
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    if (spread > 22 && luminance(r, g, b) < 245) {
      coloredExteriorPixels += 1;
    }
  }
  return exteriorPixels === 0 ? 0 : coloredExteriorPixels / exteriorPixels;
}

async function processJob(job, workerStageRoot) {
  const source = await renderAsset(publicPath(job.path));
  const reference = await renderAsset(publicPath(job.coloredPath));
  const transferred = transferColors(
    source,
    reference,
    job.semanticPalette,
    job.catalogueId === "apprentissage",
  );
  assert.ok(
    transferred.coloredRegions >= 1,
    `${job.id}: aucune région colorée.`,
  );
  let vector;
  let svgBuffer;
  let rendered;
  let inkPreservation = 0;
  let spillRatio = 1;
  for (const pathomit of VECTOR_OPTIONS.adaptivePathomit) {
    vector = await vectorize(
      transferred.output,
      job.width,
      job.height,
      pathomit,
    );
    svgBuffer = Buffer.from(vector.svg, "utf8");
    rendered = await sharp(svgBuffer)
      .resize(PROCESS_SIZE, PROCESS_SIZE, { fit: "fill" })
      .flatten({ background: "#ffffff" })
      .removeAlpha()
      .raw()
      .toBuffer();
    inkPreservation = lineRecall(source, rendered);
    spillRatio = exteriorColorRatio(
      rendered,
      transferred.labels,
      transferred.exteriorLabels,
      transferred.forcedMask,
    );
    if (inkPreservation >= 0.94 && spillRatio <= 0.004) break;
  }
  assert.ok(
    inkPreservation >= 0.94,
    `${job.id}: rappel des traits insuffisant (${inkPreservation}).`,
  );
  assert.ok(
    spillRatio <= 0.004,
    `${job.id}: débordement extérieur excessif (${spillRatio}).`,
  );

  const stagedPath = path.join(
    workerStageRoot,
    ...job.coloredPath.split("/"),
  );
  fs.mkdirSync(path.dirname(stagedPath), { recursive: true });
  fs.writeFileSync(stagedPath, svgBuffer);
  return {
    id: job.id,
    catalogueId: job.catalogueId,
    title: job.title,
    path: job.path,
    coloredPath: job.coloredPath,
    width: job.width,
    height: job.height,
    sha256: sha256(svgBuffer),
    svgBytes: svgBuffer.length,
    pathCount: (vector.svg.match(/<path\b/g) || []).length,
    pathomit: vector.pathomit,
    paletteColors: transferred.palette.length,
    tracerPaletteColors: vector.tracerPaletteColors,
    regions: transferred.regions,
    coloredRegions: transferred.coloredRegions,
    coloredPixels: transferred.coloredPixels,
    forcedPrimaryPixels: transferred.forcedPrimaryPixels,
    inkPreservation: Number((inkPreservation * 100).toFixed(3)),
    exteriorColorRatio: Number((spillRatio * 100).toFixed(4)),
    stagedPath,
  };
}

async function runWorker() {
  sharp.concurrency(1);
  const results = [];
  for (const job of workerData.jobs) {
    results.push(await processJob(job, workerData.stageRoot));
    parentPort.postMessage({ type: "progress", count: 1 });
  }
  parentPort.postMessage({ type: "result", results });
}

function runWorkerThread(jobs, selectedStageRoot, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: { jobs, stageRoot: selectedStageRoot },
    });
    worker.on("message", (message) => {
      if (message.type === "progress") onProgress(message.count);
      if (message.type === "result") resolve(message.results);
    });
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Worker couleur interrompu avec le code ${code}.`));
      }
    });
  });
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function buildSheet(entries, resolveImage, destination, columns = 5) {
  const tileWidth = 210;
  const imageSize = 172;
  const tileHeight = 220;
  const rows = Math.ceil(entries.length / columns);
  const composites = [];
  for (const [index, entry] of entries.entries()) {
    const left = (index % columns) * tileWidth;
    const top = Math.floor(index / columns) * tileHeight;
    const image = await sharp(resolveImage(entry))
      .resize(imageSize, imageSize, {
        fit: "contain",
        background: "#ffffff",
      })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 88 })
      .toBuffer();
    composites.push({
      input: image,
      left: left + Math.floor((tileWidth - imageSize) / 2),
      top: top + 4,
    });
    composites.push({
      input: Buffer.from(
        `<svg width="${tileWidth}" height="40"><text x="8" y="17" font-family="Arial" font-size="13" fill="#17342e">${escapeXml(entry.title)}</text><text x="8" y="34" font-family="Arial" font-size="11" fill="#5c6965">${escapeXml(entry.id)}</text></svg>`,
      ),
      left,
      top: top + imageSize + 4,
    });
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  await sharp({
    create: {
      width: columns * tileWidth,
      height: rows * tileHeight,
      channels: 3,
      background: "#f7f4ec",
    },
  })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toFile(destination);
}

async function buildContactSheets(entries, results, selectedStageRoot, apply) {
  const resultById = new Map(results.map((result) => [result.id, result]));
  const resolveImage = (entry) =>
    apply
      ? publicPath(entry.coloredPath)
      : resultById.get(entry.id).stagedPath;

  if (!apply) {
    const destination = path.join(
      selectedStageRoot,
      "sample-contact-sheet.jpg",
    );
    await buildSheet(entries, resolveImage, destination, 5);
    return [destination];
  }

  const destinations = [];
  const byCatalogue = new Map();
  for (const entry of entries) {
    const catalogueEntries = byCatalogue.get(entry.catalogueId) || [];
    catalogueEntries.push(entry);
    byCatalogue.set(entry.catalogueId, catalogueEntries);
  }
  for (const [catalogueId, catalogueEntries] of byCatalogue) {
    const destination = path.join(
      contactSheetsRoot,
      `${catalogueId}.jpg`,
    );
    await buildSheet(catalogueEntries, resolveImage, destination, 5);
    destinations.push(destination);
  }

  const summaryEntries = [...byCatalogue.values()].flatMap((catalogueEntries) =>
    catalogueEntries.slice(0, 4),
  );
  await buildSheet(summaryEntries, resolveImage, contactSheetPath, 5);
  destinations.push(contactSheetPath);
  return destinations;
}

function selectSample(entries) {
  const byCatalogue = new Map();
  for (const entry of entries) {
    const catalogueEntries = byCatalogue.get(entry.catalogueId) || [];
    catalogueEntries.push(entry);
    byCatalogue.set(entry.catalogueId, catalogueEntries);
  }
  return [...byCatalogue.values()].flatMap((catalogueEntries) =>
    [0, 11, 22, 39].map((index) => catalogueEntries[index]),
  );
}

function attachSemanticPalettes(entries) {
  const helper = [
    "import importlib.util,json,pathlib,sys",
    "root=pathlib.Path(sys.argv[1])",
    "spec=importlib.util.spec_from_file_location('colored',root/'scripts'/'generate-colored-twins.py')",
    "module=importlib.util.module_from_spec(spec)",
    "spec.loader.exec_module(module)",
    "entries=json.loads(sys.stdin.read())",
    "print(json.dumps({entry['id']:module.palette_for(entry['title'],entry['catalogueId']) for entry in entries}))",
  ].join(";");
  const input = JSON.stringify(
    entries.map(({ id, title, catalogueId }) => ({
      id,
      title,
      catalogueId,
    })),
  );
  const execution = childProcess.spawnSync(
    "python",
    ["-c", helper, root],
    {
      cwd: root,
      input,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  assert.equal(
    execution.status,
    0,
    `Chargement des palettes impossible : ${execution.stderr}`,
  );
  const palettes = JSON.parse(execution.stdout);
  return entries.map((entry) => ({
    ...entry,
    semanticPalette: palettes[entry.id],
  }));
}

async function main() {
  const apply = process.argv.includes("--apply");
  const sample = process.argv.includes("--sample");
  assert.ok(!(apply && sample), "--apply et --sample sont incompatibles.");
  const manifest = readJson(manifestPath);
  assert.equal(manifest.entries.length, 400, "400 guides attendus.");
  assert.equal(
    new Set(manifest.entries.map((entry) => entry.coloredPath)).size,
    400,
    "400 chemins couleur uniques attendus.",
  );
  let entries = sample ? selectSample(manifest.entries) : manifest.entries;
  const idsArgument = process.argv.find((argument) =>
    argument.startsWith("--ids="),
  );
  if (idsArgument) {
    const ids = new Set(
      idsArgument
        .slice("--ids=".length)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    );
    entries = manifest.entries.filter((entry) => ids.has(entry.id));
    assert.equal(entries.length, ids.size, "Un ou plusieurs identifiants sont absents.");
  }
  const limitArgument = process.argv.find((argument) =>
    argument.startsWith("--limit="),
  );
  if (limitArgument) {
    const limit = Number(limitArgument.split("=")[1]);
    assert.ok(Number.isInteger(limit) && limit > 0, "--limit invalide.");
    entries = entries.slice(0, limit);
  }
  entries = attachSemanticPalettes(entries);

  const selectedStageRoot = path.join(
    stageRoot,
    apply ? "apply" : sample ? "sample" : "preview",
  );
  fs.rmSync(selectedStageRoot, { recursive: true, force: true });
  fs.mkdirSync(selectedStageRoot, { recursive: true });

  const workerCount = Math.min(
    MAX_WORKERS,
    Math.max(1, os.availableParallelism()),
    entries.length,
  );
  const chunks = Array.from({ length: workerCount }, () => []);
  entries.forEach((entry, index) => {
    chunks[index % workerCount].push(entry);
  });
  let completed = 0;
  const onProgress = (count) => {
    completed += count;
    if (
      completed % 25 === 0 ||
      completed === entries.length
    ) {
      console.log(`${completed}/${entries.length} guides SVG préparés`);
    }
  };
  const results = (
    await Promise.all(
      chunks.map((chunk) =>
        runWorkerThread(chunk, selectedStageRoot, onProgress),
      ),
    )
  ).flat();
  assert.equal(results.length, entries.length, "Lot SVG incomplet.");
  const resultById = new Map(results.map((result) => [result.id, result]));

  if (apply) {
    assert.equal(entries.length, 400, "--apply exige les 400 guides.");
    for (const entry of manifest.entries) {
      const result = resultById.get(entry.id);
      assert.ok(result, `Résultat absent : ${entry.id}`);
      fs.copyFileSync(result.stagedPath, publicPath(entry.coloredPath));
      entry.coloredSha256 = result.sha256;
    }
    manifest.coloredGuideRegeneration = {
      generatedAt: new Date().toISOString(),
      pipeline: "semantic-color-transfer-v1",
      processSize: PROCESS_SIZE,
      vectorizer: VECTOR_OPTIONS,
      guides: manifest.entries.length,
      source: "active line art plus previous colored guide as semantic map",
      nativeSvg: true,
      embeddedRaster: false,
    };
    const temporaryManifest = `${manifestPath}.tmp-${process.pid}`;
    fs.writeFileSync(
      temporaryManifest,
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    fs.renameSync(temporaryManifest, manifestPath);
  }

  const sheets = await buildContactSheets(
    entries,
    results,
    selectedStageRoot,
    apply,
  );
  const summary = {
    guides: results.length,
    totalSvgBytes: results.reduce((sum, result) => sum + result.svgBytes, 0),
    averageSvgBytes: Math.round(
      results.reduce((sum, result) => sum + result.svgBytes, 0) /
        results.length,
    ),
    maximumSvgBytes: Math.max(...results.map((result) => result.svgBytes)),
    minimumInkPreservation: Math.min(
      ...results.map((result) => result.inkPreservation),
    ),
    maximumExteriorColorRatio: Math.max(
      ...results.map((result) => result.exteriorColorRatio),
    ),
    totalPaths: results.reduce((sum, result) => sum + result.pathCount, 0),
  };
  const report = {
    status: "passed",
    mode: apply ? "apply" : sample ? "sample" : "preview",
    generatedAt: new Date().toISOString(),
    pipeline: "semantic-color-transfer-v1",
    summary,
    contactSheets: sheets.map((filePath) =>
      path.relative(root, filePath).replaceAll("\\", "/"),
    ),
    entries: results
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(({ stagedPath, ...result }) => result),
  };
  if (apply) {
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  } else {
    fs.writeFileSync(
      path.join(selectedStageRoot, "report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }
  console.log(JSON.stringify({ status: "passed", mode: report.mode, summary, contactSheets: report.contactSheets }, null, 2));
}

if (isMainThread) {
  main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
} else {
  runWorker().catch((error) => {
    throw error;
  });
}
