const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "public", "assets", "coloring", "manifest.json"), "utf8"),
);
const headed = process.argv.includes("--headed");
const externalBaseUrl = process.argv
  .slice(2)
  .find((argument) => !argument.startsWith("--"));
const baseUrl = externalBaseUrl || "http://127.0.0.1:3112/";
const outputPath = path.join(root, "qa", "image-framing-playwright.json");
const viewports = [
  { name: "phone-320", width: 320, height: 568, isMobile: true, hasTouch: true },
  { name: "phone-390", width: 390, height: 844, isMobile: true, hasTouch: true },
  { name: "phone-landscape", width: 667, height: 375, isMobile: true, hasTouch: true },
  { name: "tablet", width: 768, height: 1024, isMobile: true, hasTouch: true },
  { name: "desktop", width: 1440, height: 900, isMobile: false, hasTouch: false },
];

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {}
    await delay(250);
  }
  throw new Error(`Next.js n’a pas démarré sur ${baseUrl}.`);
}

async function pixelAudit(page) {
  const results = [];
  const chunkSize = 10;
  for (let start = 0; start < manifest.entries.length; start += chunkSize) {
    const chunk = manifest.entries.slice(start, start + chunkSize);
    const audited = await page.evaluate(async (entries) => {
      const analyze = async (source) => {
        const image = new Image();
        image.src = source.startsWith("/") ? source : `/${source}`;
        try {
          await image.decode();
        } catch (error) {
          throw new Error(`${source}: ${error.message}`);
        }
        const size = 320;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0, size, size);
        const pixels = context.getImageData(0, 0, size, size).data;
        const cornerOffsets = [
          0,
          (size - 1) * 4,
          (size - 1) * size * 4,
          (size * size - 1) * 4,
        ];
        const background = [0, 1, 2].map((channel) => {
          const values = cornerOffsets
            .map((offset) => pixels[offset + channel])
            .sort((left, right) => left - right);
          return (values[1] + values[2]) / 2;
        });
        let left = size;
        let top = size;
        let right = -1;
        let bottom = -1;
        for (let y = 0; y < size; y += 1) {
          for (let x = 0; x < size; x += 1) {
            const offset = (y * size + x) * 4;
            const differsFromBackground = [0, 1, 2].some(
              (channel) =>
                Math.abs(pixels[offset + channel] - background[channel]) > 12,
            );
            const foreground =
              differsFromBackground &&
              Math.min(pixels[offset], pixels[offset + 1], pixels[offset + 2]) < 225;
            if (!foreground) {
              continue;
            }
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
          }
        }
        if (right < left || bottom < top) {
          throw new Error(`Aucun trait détecté dans ${source}.`);
        }
        return {
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          bounds: [left, top, right + 1, bottom + 1],
          centerOffset: {
            x: (size - left - (right + 1)) / (2 * size),
            y: (size - top - (bottom + 1)) / (2 * size),
          },
        };
      };

      const results = [];
      for (const entry of entries) {
        results.push({
          id: entry.id,
          active: await analyze(entry.path),
          colored: await analyze(entry.coloredPath),
        });
      }
      return results;
    }, chunk);
    results.push(...audited);
  }
  return results;
}

async function waitForCatalogues(page, consoleErrors) {
  try {
    await page.waitForFunction(
      () => document.querySelectorAll(".catalogue-card").length === 10,
      null,
      { timeout: 120_000 },
    );
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      readyState: document.readyState,
      cards: document.querySelectorAll(".catalogue-card").length,
      decodedImages: [...document.images].filter(
        (image) => image.complete && image.naturalWidth > 0,
      ).length,
      totalImages: document.images.length,
      appError: document.querySelector(".app-error")?.textContent?.trim() || null,
      bodyText: document.body.innerText.slice(0, 600),
    }));
    throw new Error(
      `Les catalogues ne sont pas prêts: ${JSON.stringify({
        ...diagnostic,
        consoleErrors,
      })}\n${error.message}`,
    );
  }
}

async function renderedCatalogueAudit(page, viewport) {
  const catalogues = [...new Set(manifest.entries.map((entry) => entry.catalogueId))];
  const pages = [];
  for (const catalogueId of catalogues) {
    for (let pageNumber = 1; pageNumber <= 10; pageNumber += 1) {
      await page.evaluate(
        ({ id, number }) => {
          selectCatalogue(id, { open: true });
          selectPage(number);
        },
        { id: catalogueId, number: pageNumber },
      );
      await page.waitForFunction(() => {
        const images = [...document.querySelectorAll(".color-flip-card__face")];
        return images.length === 8 && images.every((image) => image.complete && image.naturalWidth);
      });
      const flip = await page.evaluate(async () => {
        const cards = [...document.querySelectorAll(".drawing-card [data-color-flip]")];
        const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
        const transformState = (card) => {
          const inner = card.querySelector(".color-flip-card__inner");
          const transform = getComputedStyle(inner).transform;
          return {
            transform,
            identity: transform === "none"
              || transform === "matrix(1, 0, 0, 1, 0, 0)"
              || transform === "matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)",
          };
        };
        await nextFrame();
        cards.forEach((card) => {
          const inner = card.querySelector(".color-flip-card__inner");
          void inner.offsetWidth;
          getComputedStyle(inner).transform;
        });
        cards.forEach((card) => card.click());
        await nextFrame();
        await nextFrame();
        let framesWaited = 2;
        while (
          framesWaited < 10
          && cards.some((card) => transformState(card).identity)
        ) {
          await nextFrame();
          framesWaited += 1;
        }
        const activated = cards.map((card) => {
          const { transform, identity } = transformState(card);
          return {
            id: card.querySelector(".color-flip-card__front")?.dataset.assetId,
            pressed: card.getAttribute("aria-pressed"),
            transform,
            identity,
            framesWaited,
          };
        });
        cards.forEach((card) => card.click());
        await nextFrame();
        await nextFrame();
        return {
          activated,
          reset: cards.every(
            (card) => card.getAttribute("aria-pressed") === "false"
              && !card.classList.contains("is-color-visible"),
          ),
        };
      });
      const metrics = await page.evaluate(() => {
        const contains = (outer, inner) =>
          inner.left >= outer.left - 1 &&
          inner.top >= outer.top - 1 &&
          inner.right <= outer.right + 1 &&
          inner.bottom <= outer.bottom + 1;
        const cards = [...document.querySelectorAll(".drawing-card")];
        return {
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
          cards: cards.map((card) => {
            const art = card.querySelector(".drawing-card__art");
            const front = card.querySelector(".color-flip-card__front");
            const back = card.querySelector(".color-flip-card__back");
            const artRect = art.getBoundingClientRect();
            const frontRect = front.getBoundingClientRect();
            const backRect = back.getBoundingClientRect();
            return {
              id: front.dataset.assetId,
              decoded: front.complete && front.naturalWidth > 0 && back.complete && back.naturalWidth > 0,
              frontContained: contains(artRect, frontRect),
              backContained: contains(artRect, backRect),
              artWidth: artRect.width,
              artHeight: artRect.height,
            };
          }),
        };
      });
      pages.push({ catalogueId, page: pageNumber, flip, ...metrics });
    }
  }
  return { viewport, pages };
}

async function main() {
  let server;
  let serverOutput = "";
  if (!externalBaseUrl) {
    server = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "start", "-p", "3112"],
      { cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );
    server.stdout.on("data", (chunk) => {
      serverOutput += chunk;
    });
    server.stderr.on("data", (chunk) => {
      serverOutput += chunk;
    });
    await waitForServer();
  }
  const browser = await chromium.launch({
    channel: "chrome",
    headless: !headed,
    slowMo: headed ? 25 : 0,
  });
  const report = {
    status: "passed",
    browserMode: headed ? "headed" : "headless",
    baseUrl,
    assets: [],
    viewports: [],
  };
  try {
    for (let index = 0; index < viewports.length; index += 1) {
      const viewport = viewports[index];
      const context = await browser.newContext(viewport);
      const page = await context.newPage();
      const consoleErrors = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await waitForCatalogues(page, consoleErrors);
      if (index === 0) report.assets = await pixelAudit(page);
      const rendered = await renderedCatalogueAudit(page, viewport);
      rendered.consoleErrors = consoleErrors;
      report.viewports.push(rendered);
      await context.close();
    }
  } finally {
    await browser.close();
    if (server) {
      server.kill();
      await Promise.race([
        new Promise((resolve) => server.once("exit", resolve)),
        delay(3_000),
      ]);
      if (server.exitCode === null) server.kill("SIGKILL");
      if (server.exitCode && server.exitCode !== 0) {
        console.error(serverOutput);
      }
    }
  }

  assert.equal(report.assets.length, 400, "Le contrôle pixel doit couvrir 400 paires.");
  for (const entry of report.assets) {
    for (const variant of ["active", "colored"]) {
      const image = entry[variant];
      assert.equal(image.naturalWidth, image.naturalHeight, `${entry.id}: canevas non carré.`);
      assert.ok(
        image.bounds[0] > 0
          && image.bounds[1] > 0
          && image.bounds[2] < 320
          && image.bounds[3] < 320,
        `${entry.id} ${variant}: tracé au bord du viewBox ${JSON.stringify(image)}.`,
      );
      assert.ok(
        Math.max(Math.abs(image.centerOffset.x), Math.abs(image.centerOffset.y)) <= 0.0085,
        `${entry.id} ${variant}: centre optique hors tolérance ${JSON.stringify(image)}.`,
      );
    }
  }
  for (const viewport of report.viewports) {
    assert.equal(viewport.pages.length, 100, `${viewport.viewport.name}: couverture incomplète.`);
    assert.deepEqual(viewport.consoleErrors, [], `${viewport.viewport.name}: erreurs console.`);
    for (const page of viewport.pages) {
      assert.equal(page.cards.length, 4, `${viewport.viewport.name}: page incomplète.`);
      assert.equal(page.horizontalOverflow, false, `${viewport.viewport.name}: débordement horizontal.`);
      assert.equal(page.flip.activated.length, 4, `${viewport.viewport.name}: flips incomplets.`);
      assert.equal(page.flip.reset, true, `${viewport.viewport.name}: flips non réinitialisés.`);
      for (const flip of page.flip.activated) {
        assert.equal(flip.pressed, "true", `${flip.id}: aria-pressed du flip incorrect.`);
        assert.equal(flip.identity, false, `${flip.id}: rotation du flip absente.`);
      }
      for (const card of page.cards) {
        assert.equal(card.decoded, true, `${card.id}: paire non décodée.`);
        assert.equal(card.frontContained, true, `${card.id}: traits hors cadre.`);
        assert.equal(card.backContained, true, `${card.id}: guide hors cadre.`);
        assert.ok(card.artWidth > 0 && card.artHeight > 0, `${card.id}: cadre invisible.`);
      }
    }
  }

  report.summary = {
    pairsPixelChecked: report.assets.length,
    imagesPixelChecked: report.assets.length * 2,
    renderedPagesChecked: report.viewports.reduce(
      (total, viewport) => total + viewport.pages.length,
      0,
    ),
    renderedCardsChecked: report.viewports.reduce(
      (total, viewport) =>
        total + viewport.pages.reduce((sum, page) => sum + page.cards.length, 0),
      0,
    ),
    flipsChecked: report.viewports.reduce(
      (total, viewport) =>
        total + viewport.pages.reduce((sum, page) => sum + page.flip.activated.length, 0),
      0,
    ),
    maximumCenterOffset: Math.max(
      ...report.assets.flatMap((entry) =>
        ["active", "colored"].flatMap((variant) => [
          Math.abs(entry[variant].centerOffset.x),
          Math.abs(entry[variant].centerOffset.y),
        ]),
      ),
    ),
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.summary, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
