const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Worker, isMainThread, parentPort, workerData } = require("node:worker_threads");

const ImageTracer = require("imagetracerjs");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const publicRoot = path.join(root, "public");
const decommissionedRoot = path.join(
  root,
  "output",
  "Extract",
  "decommissioned-catalogue-png",
);
const manifestPath = path.join(publicRoot, "assets", "coloring", "manifest.json");
const reserveManifestPath = path.join(
  publicRoot,
  "assets",
  "coloring",
  "reserve",
  "manifest.json",
);
const apply = process.argv.includes("--apply");
const rebuildColored = process.argv.includes("--rebuild-colored");
const MAX_WORKERS = 4;
const GENERATOR_CENTER_TOLERANCE = 0.0032;
const BROWSER_CENTER_CORRECTIONS = new Map([
  [
    "045-lhippopotame-dans-leau-existing-animaux-09-png-colored.png",
    { x: 3, y: 0 },
  ],
]);

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const publicPath = (relativePath) =>
  path.join(publicRoot, ...relativePath.split("/"));

function archiveDecommissionedPng(relativePath) {
  assert.match(
    relativePath,
    /^assets\/coloring\/(active|colored|reserve)\/.+\.png$/i,
    `Seuls les anciens PNG du catalogue peuvent être déclassés : ${relativePath}`,
  );
  const archiveRelativePath = relativePath.replace(/^assets\/coloring\//i, "");
  const destination = path.join(
    decommissionedRoot,
    ...archiveRelativePath.split("/"),
  );
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(publicPath(relativePath), destination);
  return destination;
}

function svgPathFor(relativePath) {
  assert.match(relativePath, /\.png$/i, `Chemin PNG attendu : ${relativePath}`);
  return relativePath.replace(/\.png$/i, ".svg");
}

function buildPalette(data) {
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

function finalizeSvg(svg, sourceWidth, sourceHeight) {
  const cleaned = svg
    .replace(/\sdesc="[^"]*"/i, "")
    .replace(
      "<svg ",
      `<svg width="${sourceWidth}" height="${sourceHeight}" preserveAspectRatio="xMidYMid meet" `,
    );
  assert.match(cleaned, /^<svg\b/, "Racine SVG absente.");
  assert.match(cleaned, /\bviewBox="0 0 [\d.]+ [\d.]+"/, "viewBox SVG absent.");
  assert.match(
    cleaned,
    /\bpreserveAspectRatio="xMidYMid meet"/,
    "Centrage SVG absent.",
  );
  assert.match(cleaned, /<path\b/, "Le SVG doit contenir de vrais tracés.");
  assert.doesNotMatch(cleaned, /<image\b|data:image|<script\b|\bhref=/i, "Raster ou ressource externe incorporé.");
  return cleaned;
}

function sampleBackground(data, width, height) {
  const cornerIndexes = [
    0,
    (width - 1) * 4,
    (height - 1) * width * 4,
    (width * height - 1) * 4,
  ];
  return [0, 1, 2].map((channel) => {
    const values = cornerIndexes
      .map((index) => data[index + channel])
      .sort((left, right) => left - right);
    return Math.round((values[1] + values[2]) / 2);
  });
}

function normalizeBackground(data, width, height) {
  const background = sampleBackground(data, width, height);
  for (let index = 0; index < data.length; index += 4) {
    const delta = Math.max(
      Math.abs(data[index] - background[0]),
      Math.abs(data[index + 1] - background[1]),
      Math.abs(data[index + 2] - background[2]),
    );
    if (delta <= 28) {
      data[index] = background[0];
      data[index + 1] = background[1];
      data[index + 2] = background[2];
      data[index + 3] = 255;
    }
  }
}

function foregroundBounds(data, width, height) {
  const background = sampleBackground(data, width, height);
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const differsFromBackground = [0, 1, 2].some(
        (channel) => Math.abs(data[index + channel] - background[channel]) > 12,
      );
      const foreground = differsFromBackground
        && Math.min(data[index], data[index + 1], data[index + 2]) < 225;
      if (!foreground) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  assert.ok(right >= left && bottom >= top, "Aucun contenu coloré détecté.");
  return {
    background,
    bounds: [left, top, right + 1, bottom + 1],
    centerOffset: {
      x: (width - left - (right + 1)) / (2 * width),
      y: (height - top - (bottom + 1)) / (2 * height),
    },
  };
}

function centerForeground(data, width, height) {
  const { background, bounds } = foregroundBounds(data, width, height);
  const [left, top, right, bottom] = bounds;
  const shiftX = Math.round((width - left - right) / 2);
  const shiftY = Math.round((height - top - bottom) / 2);
  if (shiftX === 0 && shiftY === 0) return data;

  assert.ok(
    left + shiftX > 0
      && top + shiftY > 0
      && right + shiftX < width
      && bottom + shiftY < height,
    `Recentrage impossible sans rogner : ${JSON.stringify({
      width,
      height,
      bounds,
      shiftX,
      shiftY,
    })}`,
  );

  const centered = Buffer.alloc(data.length);
  for (let index = 0; index < centered.length; index += 4) {
    centered[index] = background[0];
    centered[index + 1] = background[1];
    centered[index + 2] = background[2];
    centered[index + 3] = 255;
  }
  for (let y = 0; y < height; y += 1) {
    const targetY = y + shiftY;
    if (targetY < 0 || targetY >= height) continue;
    for (let x = 0; x < width; x += 1) {
      const targetX = x + shiftX;
      if (targetX < 0 || targetX >= width) continue;
      const sourceIndex = (y * width + x) * 4;
      const targetIndex = (targetY * width + targetX) * 4;
      data.copy(centered, targetIndex, sourceIndex, sourceIndex + 4);
    }
  }
  return centered;
}

function translateSvg(svg, shiftX, shiftY, background) {
  const rootTag = svg.match(/^<svg\b[^>]*>/i)?.[0];
  assert.ok(rootTag, "Racine SVG absente avant recentrage.");
  const viewBox = rootTag.match(/\bviewBox="0 0 ([\d.]+) ([\d.]+)"/i);
  assert.ok(viewBox, "viewBox SVG absent avant recentrage.");
  const viewBoxWidth = Number(viewBox[1]);
  const viewBoxHeight = Number(viewBox[2]);
  const vectorX = Number((shiftX * viewBoxWidth / 320).toFixed(3));
  const vectorY = Number((shiftY * viewBoxHeight / 320).toFixed(3));
  const backgroundFill = `rgb(${background.join(",")})`;
  const content = svg.slice(rootTag.length, -"</svg>".length);
  return `${rootTag}<rect width="${viewBoxWidth}" height="${viewBoxHeight}" fill="${backgroundFill}"/>`
    + `<g transform="translate(${vectorX} ${vectorY})">${content}</g></svg>`;
}

async function centerTracedSvg(svg, source) {
  const auditSize = 320;
  const render = async (candidate) => {
    const { data, info } = await sharp(Buffer.from(candidate, "utf8"))
      .resize(auditSize, auditSize, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return foregroundBounds(data, info.width, info.height);
  };

  const initial = await render(svg);
  let candidate = svg;
  let measured = initial;
  let cumulativeX = 0;
  let cumulativeY = 0;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const centered = Math.max(
      Math.abs(measured.centerOffset.x),
      Math.abs(measured.centerOffset.y),
    ) <= GENERATOR_CENTER_TOLERANCE;
    const contained = measured.bounds[0] > 0
      && measured.bounds[1] > 0
      && measured.bounds[2] < auditSize
      && measured.bounds[3] < auditSize;
    if (centered && contained) {
      const browserCorrection = BROWSER_CENTER_CORRECTIONS.get(
        path.basename(source),
      );
      return browserCorrection
        ? translateSvg(
            candidate,
            browserCorrection.x,
            browserCorrection.y,
            measured.background,
          )
        : candidate;
    }

    const [left, top, right, bottom] = measured.bounds;
    const shiftX = Math.round((auditSize - left - right) / 2);
    const shiftY = Math.round((auditSize - top - bottom) / 2);
    assert.ok(
      shiftX !== 0 || shiftY !== 0,
      `SVG décentré sans correction entière possible : ${source} ${JSON.stringify(measured)}`,
    );
    assert.ok(
      left + shiftX > 0
        && top + shiftY > 0
        && right + shiftX < auditSize
        && bottom + shiftY < auditSize,
      `SVG impossible à recentrer sans rogner : ${source} ${JSON.stringify(measured)}`,
    );
    cumulativeX += shiftX;
    cumulativeY += shiftY;
    candidate = translateSvg(
      svg,
      cumulativeX,
      cumulativeY,
      initial.background,
    );
    measured = await render(candidate);
  }

  assert.fail(
    `SVG encore décentré après 4 corrections : ${source} ${JSON.stringify(measured)}`,
  );
}

async function traceVariant(source, mode, variant) {
  const metadata = await sharp(source).metadata();
  assert.ok(metadata.width && metadata.height, `Dimensions illisibles : ${source}`);
  assert.equal(metadata.width, metadata.height, `Illustration non carrée : ${source}`);

  let preprocessing = sharp(source)
    .flatten({ background: "#ffffff" })
    .resize(variant.size, variant.size, {
      fit: "contain",
      background: "#ffffff",
      withoutEnlargement: false,
    });

  if (mode === "color") {
    const { data: normalized, info: normalizedInfo } = await preprocessing
      .median(3)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    normalizeBackground(normalized, normalizedInfo.width, normalizedInfo.height);
    preprocessing = sharp(normalized, { raw: normalizedInfo }).png({
      palette: true,
      colours: variant.colors,
      dither: 0,
    });
  } else {
    preprocessing = preprocessing
      .grayscale()
      .threshold(210)
      .png({ palette: true, colours: 2, dither: 0 });
  }

  const prepared = await preprocessing.toBuffer();
  const { data: preparedData, info } = await sharp(prepared)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const data = mode === "color"
    ? centerForeground(preparedData, info.width, info.height)
    : preparedData;
  const palette = buildPalette(data);
  assert.ok(palette.length >= 2, `Palette insuffisante : ${source}`);

  const svg = ImageTracer.imagedataToSVG(
    { width: info.width, height: info.height, data },
    {
      pal: palette,
      colorsampling: 0,
      colorquantcycles: 1,
      layering: 1,
      ltres: mode === "color" ? 1.5 : 1,
      qtres: mode === "color" ? 1.5 : 1,
      pathomit: variant.pathomit,
      rightangleenhance: true,
      strokewidth: mode === "color" ? 0.6 : 0,
      linefilter: false,
      scale: 1,
      roundcoords: 1,
      viewbox: true,
      desc: false,
      blurradius: 0,
    },
  );

  const finalized = finalizeSvg(svg, metadata.width, metadata.height);
  return {
    svg: mode === "color" ? await centerTracedSvg(finalized, source) : finalized,
    width: metadata.width,
    height: metadata.height,
  };
}

async function convertJob(job) {
  const source = publicPath(job.sourcePath);
  const destinationPath = svgPathFor(job.sourcePath);
  const destination = publicPath(destinationPath);
  const sourceBuffer = fs.readFileSync(source);
  const variants =
    job.mode === "color"
      ? [
          { size: 512, colors: 16, pathomit: 24 },
          { size: 384, colors: 12, pathomit: 32 },
        ]
      : [{ size: 512, colors: 2, pathomit: 8 }];

  let traced = await traceVariant(source, job.mode, variants[0]);
  let svgBuffer = Buffer.from(traced.svg, "utf8");
  if (
    job.mode === "color"
    && svgBuffer.length >= sourceBuffer.length
    && variants.length > 1
  ) {
    const compact = await traceVariant(source, job.mode, variants[1]);
    const compactBuffer = Buffer.from(compact.svg, "utf8");
    if (compactBuffer.length < svgBuffer.length) {
      traced = compact;
      svgBuffer = compactBuffer;
    }
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, svgBuffer);
  fs.renameSync(temporary, destination);

  return {
    ...job,
    destinationPath,
    width: traced.width,
    height: traced.height,
    sourceBytes: sourceBuffer.length,
    svgBytes: svgBuffer.length,
    sha256: sha256(svgBuffer),
  };
}

async function runWorker() {
  sharp.concurrency(1);
  const results = [];
  for (const job of workerData.jobs) {
    results.push(await convertJob(job));
    if (results.length % 20 === 0) {
      parentPort.postMessage({ type: "progress", count: 20 });
    }
  }
  parentPort.postMessage({
    type: "progress",
    count: results.length % 20,
  });
  parentPort.postMessage({ type: "result", results });
}

function runWorkerThread(jobs, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: { jobs } });
    worker.on("message", (message) => {
      if (message.type === "progress") onProgress(message.count);
      if (message.type === "result") resolve(message.results);
    });
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) reject(new Error(`Worker SVG interrompu avec le code ${code}.`));
    });
  });
}

function writeJsonAtomic(filePath, value) {
  const temporary = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, filePath);
}

function validateExistingSvg(relativePath) {
  assert.match(relativePath, /\.svg$/i, `Chemin SVG attendu : ${relativePath}`);
  const buffer = fs.readFileSync(publicPath(relativePath));
  const source = buffer.toString("utf8");
  const rootTag = source.match(/^<svg\b[^>]*>/i)?.[0];
  assert.ok(rootTag, `Racine SVG absente : ${relativePath}`);
  assert.match(rootTag, /\bwidth="[\d.]+"/, `Largeur SVG absente : ${relativePath}`);
  assert.match(rootTag, /\bheight="[\d.]+"/, `Hauteur SVG absente : ${relativePath}`);
  assert.match(rootTag, /\bviewBox="0 0 [\d.]+ [\d.]+"/, `viewBox absent : ${relativePath}`);
  assert.match(
    rootTag,
    /\bpreserveAspectRatio="xMidYMid meet"/,
    `Centrage absent : ${relativePath}`,
  );
  assert.match(source, /<path\b/, `Tracés absents : ${relativePath}`);
  assert.doesNotMatch(source, /<image\b|data:image|<script\b|\bhref=/i);
  return {
    sourcePath: relativePath,
    destinationPath: relativePath,
    width: Number(rootTag.match(/\bwidth="([\d.]+)"/)?.[1]),
    height: Number(rootTag.match(/\bheight="([\d.]+)"/)?.[1]),
    svgBytes: buffer.length,
    sha256: sha256(buffer),
  };
}

async function main() {
  const manifest = readJson(manifestPath);
  const reserve = readJson(reserveManifestPath);
  const referenced = new Map();

  for (const entry of manifest.entries) {
    referenced.set(entry.path, { sourcePath: entry.path, mode: "line" });
    referenced.set(entry.coloredPath, {
      sourcePath: entry.coloredPath,
      mode: "color",
    });
  }
  for (const entry of reserve.entries) {
    referenced.set(entry.path, { sourcePath: entry.path, mode: "line" });
  }

  assert.equal(referenced.size, 880, "880 illustrations de catalogue attendues.");
  assert.ok(
    [...referenced.keys()].every(
      (relativePath) =>
        !relativePath.startsWith("assets/hero/")
        && /^assets\/coloring\/(active|colored|reserve)\//.test(relativePath),
    ),
    "Le hero et les sources hors catalogue doivent rester exclus.",
  );

  const paths = [...referenced.keys()];
  const pngPaths = paths.filter((relativePath) => /\.png$/i.test(relativePath));
  const svgPaths = paths.filter((relativePath) => /\.svg$/i.test(relativePath));
  assert.equal(
    pngPaths.length + svgPaths.length,
    paths.length,
    "Formats mixtes non pris en charge.",
  );

  const rebuildJobs = rebuildColored
    ? manifest.entries
        .map((entry) => entry.coloredPath)
        .filter((relativePath) => /\.svg$/i.test(relativePath))
        .map((relativePath) => ({
          sourcePath: relativePath.replace(/\.svg$/i, ".png"),
          mode: "color",
        }))
        .filter((job) => fs.existsSync(publicPath(job.sourcePath)))
    : [];

  if (!apply) {
    console.log(
      JSON.stringify(
        {
          status: "ready",
          applyRequired: pngPaths.length > 0,
          pngAssets: pngPaths.length,
          svgAssets: svgPaths.length,
          rebuildColoredAssets: rebuildJobs.length,
          heroExcluded: true,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (pngPaths.length === 0 && rebuildJobs.length === 0) {
    paths.forEach(validateExistingSvg);
    console.log(
      JSON.stringify(
        {
          status: "already-converted",
          svgAssets: paths.length,
          heroExcluded: true,
        },
        null,
        2,
      ),
    );
    return;
  }

  const jobs = [
    ...pngPaths.map((relativePath) => referenced.get(relativePath)),
    ...rebuildJobs,
  ];
  const workerCount = Math.min(
    MAX_WORKERS,
    Math.max(1, os.availableParallelism()),
    jobs.length,
  );
  const chunks = Array.from({ length: workerCount }, () => []);
  jobs.forEach((job, index) => chunks[index % workerCount].push(job));

  let completed = 0;
  const onProgress = (count) => {
    if (count === 0) return;
    completed += count;
    if (completed % 40 === 0 || completed === jobs.length) {
      console.log(`${completed}/${jobs.length} SVG générés`);
    }
  };
  const results = (
    await Promise.all(chunks.map((chunk) => runWorkerThread(chunk, onProgress)))
  ).flat();
  assert.equal(results.length, jobs.length, "Conversion SVG incomplète.");
  const bySource = new Map(results.map((result) => [result.sourcePath, result]));
  const byDestination = new Map(
    results.map((result) => [result.destinationPath, result]),
  );
  const resolveAsset = (relativePath) =>
    bySource.get(relativePath)
    || byDestination.get(relativePath)
    || validateExistingSvg(relativePath);

  for (const entry of manifest.entries) {
    const active = resolveAsset(entry.path);
    const colored = resolveAsset(entry.coloredPath);
    assert.ok(active && colored, `Paire SVG incomplète : ${entry.id}`);
    assert.equal(active.width, entry.width, `Largeur active : ${entry.id}`);
    assert.equal(active.height, entry.height, `Hauteur active : ${entry.id}`);
    assert.equal(colored.width, entry.width, `Largeur colorée : ${entry.id}`);
    assert.equal(colored.height, entry.height, `Hauteur colorée : ${entry.id}`);
    entry.path = active.destinationPath;
    entry.coloredPath = colored.destinationPath;
    entry.sha256 = active.sha256;
    entry.coloredSha256 = colored.sha256;
    entry.format = "svg";
  }
  for (const entry of reserve.entries) {
    const converted = resolveAsset(entry.path);
    assert.ok(converted, `Réserve SVG incomplète : ${entry.id}`);
    assert.equal(converted.width, entry.width, `Largeur réserve : ${entry.id}`);
    assert.equal(converted.height, entry.height, `Hauteur réserve : ${entry.id}`);
    entry.path = converted.destinationPath;
    entry.sha256 = converted.sha256;
    entry.format = "svg";
  }

  const sourceBytes =
    manifest.vectorization?.sourceBytes
    || results.reduce((sum, result) => sum + result.sourceBytes, 0);
  const svgBytes = [
    ...manifest.entries.flatMap((entry) => [entry.path, entry.coloredPath]),
    ...reserve.entries.map((entry) => entry.path),
  ].reduce(
    (sum, relativePath) => sum + fs.statSync(publicPath(relativePath)).size,
    0,
  );
  assert.ok(svgBytes < sourceBytes, "La migration doit réduire le poids total.");
  const reductionPercent = Number(((1 - svgBytes / sourceBytes) * 100).toFixed(2));
  const vectorizedAt = new Date().toISOString();
  for (const target of [manifest, reserve]) {
    target.schemaVersion = 3;
    target.assetFormat = "svg";
    target.vectorization = {
      engine: "imagetracerjs",
      engineVersion: "1.2.6",
      preserveAspectRatio: "xMidYMid meet",
      rasterEmbedding: false,
      heroExcluded: true,
      vectorizedAt,
      sourceBytes,
      svgBytes,
      reductionPercent,
    };
  }
  writeJsonAtomic(manifestPath, manifest);
  writeJsonAtomic(reserveManifestPath, reserve);

  for (const result of results) {
    archiveDecommissionedPng(result.sourcePath);
    fs.unlinkSync(publicPath(result.sourcePath));
  }

  console.log(
    JSON.stringify(
      {
        status: "converted",
        svgAssets: results.length,
        active: manifest.entries.length,
        colored: manifest.entries.length,
        reserve: reserve.entries.length,
        heroExcluded: true,
        decommissionedPngRoot: path.relative(root, decommissionedRoot),
        sourceBytes,
        svgBytes,
        reductionPercent,
      },
      null,
      2,
    ),
  );
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
