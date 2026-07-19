const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const phase = process.argv.includes("--after") ? "after" : "before";
const strict = process.argv.includes("--strict");
const quiet = process.argv.includes("--quiet");
const port = Number(process.env.DESIGN_QA_PORT || 8091);
const appUrl = `http://localhost:${port}/`;
const outputDir = path.join(root, "qa", "design-audit", "screenshots");
const reportPath = path.join(root, "qa", "design-audit", `${phase}-playwright.json`);

const viewports = [
  { name: "phone-320", width: 320, height: 568, mobile: true },
  { name: "phone-390", width: 390, height: 844, mobile: true },
  { name: "phone-landscape", width: 667, height: 375, mobile: true },
  { name: "tablet", width: 768, height: 1024, mobile: true },
  { name: "laptop", width: 1024, height: 768, mobile: false },
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "monitor", width: 1920, height: 1080, mobile: false },
];

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForServer(server) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js s'est arrêté avec le code ${server.exitCode}.`);
    }
    try {
      const response = await fetch(appUrl, { signal: AbortSignal.timeout(800) });
      if (response.ok) return;
    } catch {}
    await delay(250);
  }
  throw new Error(`Next.js n'a pas répondu sur ${appUrl}.`);
}

async function waitForImages(page, selector) {
  await page.waitForFunction(
    (target) => {
      const images = [...document.querySelectorAll(target)];
      return images.length > 0
        && images.every((image) => image.complete && image.naturalWidth > 0);
    },
    selector,
  );
}

async function inspectHome(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity) > 0
        && rect.width > 0
        && rect.height > 0;
    };
    const rect = (element) => {
      const value = element?.getBoundingClientRect();
      return value
        ? {
            left: value.left,
            top: value.top,
            right: value.right,
            bottom: value.bottom,
            width: value.width,
            height: value.height,
          }
        : null;
    };
    const colorCanvas = document.createElement("canvas");
    colorCanvas.width = 1;
    colorCanvas.height = 1;
    const colorContext = colorCanvas.getContext("2d", { willReadFrequently: true });
    const rgb = (value) => {
      if (!colorContext) return null;
      colorContext.clearRect(0, 0, 1, 1);
      colorContext.fillStyle = "#000";
      colorContext.fillStyle = value;
      colorContext.fillRect(0, 0, 1, 1);
      return [...colorContext.getImageData(0, 0, 1, 1).data.slice(0, 3)];
    };
    const luminance = (value) => {
      const channels = rgb(value);
      if (!channels) return null;
      const linear = channels.map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const contrast = (foreground, background) => {
      const foregroundLuminance = luminance(foreground);
      const backgroundLuminance = luminance(background);
      if (foregroundLuminance === null || backgroundLuminance === null) return null;
      return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
        / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
    };
    const intersects = (first, second) =>
      first.left < second.right
      && first.right > second.left
      && first.top < second.bottom
      && first.bottom > second.top;
    const clippedText = [...document.querySelectorAll("h1, h2, h3, p, a, button, span")]
      .filter(visible)
      .filter((element) => {
        const style = getComputedStyle(element);
        const clipsX = style.overflowX === "hidden" || style.overflowX === "clip";
        const clipsY = style.overflowY === "hidden" || style.overflowY === "clip";
        return clipsX && element.scrollWidth > element.clientWidth + 1
          || clipsY && element.scrollHeight > element.clientHeight + 1;
      })
      .map((element) => ({
        selector: element.className || element.tagName,
        text: element.textContent.trim().slice(0, 90),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      }))
      .slice(0, 30);
    const smallText = [...document.querySelectorAll("main p, main a, main button, main span")]
      .filter(visible)
      .filter((element) => !element.closest('[aria-hidden="true"], .colouring-sheet'))
      .map((element) => ({
        selector: element.className || element.tagName,
        text: element.textContent.trim().replace(/\s+/g, " ").slice(0, 90),
        size: Number.parseFloat(getComputedStyle(element).fontSize),
      }))
      .filter((item) => item.text && item.size < 14)
      .slice(0, 40);
    const sections = [...document.querySelectorAll("main > section")].map((section) => ({
      id: section.id || section.className,
      ...rect(section),
    }));
    const verticalGaps = sections
      .slice(1)
      .map((section, index) => ({
        after: sections[index].id,
        before: section.id,
        gap: Math.round(section.top - sections[index].bottom),
      }))
      .filter((item) => item.gap > 96);
    const stamp = document.querySelector(".weekly-promise__stamp");
    const stampRect = stamp?.getBoundingClientRect();
    const stampTextClipped = stamp
      ? [...stamp.querySelectorAll("span, strong, small")].some((element) => {
          const value = element.getBoundingClientRect();
          return value.left < stampRect.left - 1
            || value.right > stampRect.right + 1
            || value.top < stampRect.top - 1
            || value.bottom > stampRect.bottom + 1;
        })
      : true;
    const stampText = stamp
      ? [...stamp.querySelectorAll("span, strong, small")]
      : [];
    const stampBackground = stamp ? getComputedStyle(stamp).backgroundColor : null;
    const weeklyStampContrast = stampText.map((element) => ({
      tag: element.tagName.toLowerCase(),
      text: element.textContent.trim(),
      ratio: contrast(getComputedStyle(element).color, stampBackground),
    }));
    const pseudo = stamp ? getComputedStyle(stamp, "::after") : null;
    const pseudoVisible = pseudo
      && pseudo.display !== "none"
      && pseudo.content !== "none"
      && Number.parseFloat(pseudo.width) > 0
      && Number.parseFloat(pseudo.height) > 0;
    const pseudoWidth = pseudoVisible
      ? Number.parseFloat(pseudo.width)
        + Number.parseFloat(pseudo.borderLeftWidth)
        + Number.parseFloat(pseudo.borderRightWidth)
      : 0;
    const pseudoHeight = pseudoVisible
      ? Number.parseFloat(pseudo.height)
        + Number.parseFloat(pseudo.borderTopWidth)
        + Number.parseFloat(pseudo.borderBottomWidth)
      : 0;
    const weeklyDecorationRect = pseudoVisible ? {
      left: stampRect.right - Number.parseFloat(pseudo.right) - pseudoWidth,
      right: stampRect.right - Number.parseFloat(pseudo.right),
      top: stampRect.bottom - Number.parseFloat(pseudo.bottom) - pseudoHeight,
      bottom: stampRect.bottom - Number.parseFloat(pseudo.bottom),
      width: pseudoWidth,
      height: pseudoHeight,
    } : null;
    const weeklyDecorationOverlaps = weeklyDecorationRect
      ? stampText.some((element) =>
          intersects(element.getBoundingClientRect(), weeklyDecorationRect))
      : false;
    const hero = document.querySelector(".hero");
    const brand = document.querySelector(".brand");
    const brandLink = brand?.closest("a");
    const thumbnails = [...document.querySelectorAll(".catalogue-card__image")];
    return {
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      bodyHeight: document.body.scrollHeight,
      brandClickable: Boolean(brandLink?.href),
      brandHref: brandLink?.getAttribute("href") || null,
      brandRect: rect(brand),
      heroRect: rect(hero),
      weeklyStampRect: rect(stamp),
      weeklyStampClipped: stampTextClipped,
      weeklyStampContrast,
      weeklyStampMinContrast: Math.min(
        ...weeklyStampContrast.map((item) => item.ratio ?? 0),
      ),
      weeklyDecorationRect,
      weeklyDecorationOverlaps,
      clippedText,
      smallText,
      verticalGaps,
      catalogueCards: document.querySelectorAll(".catalogue-card").length,
      decodedThumbnails: thumbnails
        .filter((image) => image.complete && image.naturalWidth > 0).length,
      visibleThumbnails: thumbnails.filter(visible).length,
    };
  });
}

async function inspectCatalogue(page) {
  return page.evaluate(() => {
    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return {
        left: value.left,
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        width: value.width,
        height: value.height,
      };
    };
    const contains = (outer, inner, tolerance = 1) =>
      inner.left >= outer.left - tolerance
      && inner.right <= outer.right + tolerance
      && inner.top >= outer.top - tolerance
      && inner.bottom <= outer.bottom + tolerance;
    const sheet = document.querySelector(".colouring-sheet");
    const actionButtons = [...document.querySelectorAll(".print-actions button")];
    const actionRects = actionButtons.map((button) => ({
      id: button.id,
      ...rect(button),
    }));
    const overlaps = [];
    for (let leftIndex = 0; leftIndex < actionRects.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < actionRects.length; rightIndex += 1) {
        const left = actionRects[leftIndex];
        const right = actionRects[rightIndex];
        const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
        const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
        if (width * height > 0.5) overlaps.push([left.id, right.id]);
      }
    }
    const images = [...document.querySelectorAll(".drawing-card__image")];
    return {
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      sheetInsideViewport: sheet
        ? rect(sheet).left >= -1 && rect(sheet).right <= window.innerWidth + 1
        : false,
      images: images.length,
      decodedImages: images.filter((image) => image.complete && image.naturalWidth > 0).length,
      imageBleeds: images
        .filter((image) => {
          const art = image.closest(".drawing-card__art");
          return !art || !contains(rect(art), rect(image));
        })
        .map((image) => image.alt),
      actionRects,
      overlaps,
      actionTargetsLargeEnough: actionRects.every((button) =>
        button.width >= 44 && button.height >= 44
      ),
      headerVisible: Boolean(document.querySelector(".catalogue-viewer__back .brand")),
    };
  });
}

async function inspectColoredGuide(page, midRotationPath) {
  const card = page.locator(".drawing-card .color-flip-card").first();
  await card.scrollIntoViewIfNeeded();
  await card.click();
  await page.waitForFunction(() =>
    document.querySelector(".drawing-card .color-flip-card")?.getAttribute("aria-pressed") === "true"
  );
  await page.waitForTimeout(220);
  await page.screenshot({ path: midRotationPath, fullPage: false });
  await page.waitForFunction(() => {
    const inner = document.querySelector(
      ".drawing-card .color-flip-card__inner",
    );
    const transform = inner ? getComputedStyle(inner).transform : "none";
    if (transform === "none") return false;
    const matrix = new DOMMatrixReadOnly(transform);
    return matrix.m11 <= -0.99 && matrix.m33 <= -0.99;
  });
  return card.evaluate((element) => {
    const front = element.querySelector(".color-flip-card__front");
    const back = element.querySelector(".color-flip-card__back");
    const frontStyle = getComputedStyle(front);
    const backStyle = getComputedStyle(back);
    const inner = element.querySelector(".color-flip-card__inner");
    const innerStyle = getComputedStyle(inner);
    const innerTransform = innerStyle.transform;
    const matrix = new DOMMatrixReadOnly(innerTransform);
    const rect = back.getBoundingClientRect();
    return {
      pressed: element.getAttribute("aria-pressed"),
      className: element.className,
      coloredPath: back.getAttribute("src"),
      decoded: back.complete && back.naturalWidth > 0,
      naturalWidth: back.naturalWidth,
      naturalHeight: back.naturalHeight,
      visible: backStyle.display !== "none"
        && backStyle.visibility !== "hidden"
        && Number(backStyle.opacity) > 0
        && rect.width > 0
        && rect.height > 0,
      rect: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      },
      frontOpacity: Number(frontStyle.opacity),
      backOpacity: Number(backStyle.opacity),
      frontBackface: frontStyle.backfaceVisibility,
      backBackface: backStyle.backfaceVisibility,
      innerTransform,
      innerOverflow: innerStyle.overflow,
      rotationSettled: matrix.m11 <= -0.99 && matrix.m33 <= -0.99,
    };
  });
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  let serverOutput = "";
  const server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", String(port)],
    { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  server.stdout.on("data", (chunk) => {
    serverOutput += chunk;
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk;
  });
  let browser;
  try {
    await waitForServer(server);
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const results = [];
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        hasTouch: viewport.mobile,
        isMobile: viewport.mobile,
        deviceScaleFactor: 1,
        reducedMotion: "no-preference",
      });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => consoleErrors.push(error.message));
      await page.goto(appUrl, { waitUntil: "networkidle" });
      if (await page.locator(".catalogue-card").count() === 0) {
        await page.screenshot({
          path: path.join(outputDir, `${phase}-${viewport.name}-load-error.png`),
          fullPage: true,
        });
        throw new Error(
          `Aucun catalogue rendu.\nPage: ${await page.locator("body").innerText()}\n`
          + `Console: ${consoleErrors.join("\n")}\nServeur: ${serverOutput}`,
        );
      }
      await page.waitForSelector(".catalogue-card", { state: "attached" });
      await waitForImages(page, ".catalogue-card__image");
      const home = await inspectHome(page);
      await page.screenshot({
        path: path.join(outputDir, `${phase}-${viewport.name}-home.png`),
        fullPage: true,
      });
    await page.screenshot({
      path: path.join(outputDir, `${phase}-${viewport.name}-home-viewport.png`),
      fullPage: false,
    });
    await page.locator("#nouveautes").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(outputDir, `${phase}-${viewport.name}-weekly-viewport.png`),
      fullPage: false,
    });
    await page.locator("#catalogues").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(outputDir, `${phase}-${viewport.name}-library-viewport.png`),
      fullPage: false,
    });

    await page.locator(".catalogue-card").first().click();
      await page.waitForSelector("#atelier.is-catalogue-open");
      await waitForImages(page, ".drawing-card__image");
      const catalogue = await inspectCatalogue(page);
      const coloredGuide = await inspectColoredGuide(
        page,
        path.join(
          outputDir,
          `${phase}-${viewport.name}-catalogue-flip-mid.png`,
        ),
      );
      await page.screenshot({
        path: path.join(outputDir, `${phase}-${viewport.name}-catalogue.png`),
        fullPage: true,
      });
      await page.screenshot({
        path: path.join(outputDir, `${phase}-${viewport.name}-catalogue-viewport.png`),
        fullPage: false,
      });

      const viewerBrand = page.locator(".catalogue-viewer__brand a");
      const viewerBrandCount = await viewerBrand.count();
      let brandNavigation = {
        linkPresent: viewerBrandCount === 1,
        returnedHome: false,
        scrollY: null,
      };
      if (viewerBrandCount === 1) {
        await viewerBrand.click();
        await page.waitForLoadState("networkidle");
        brandNavigation = {
          linkPresent: true,
          returnedHome: new URL(page.url()).pathname === "/"
            && !await page.locator("#atelier.is-catalogue-open").count(),
          scrollY: await page.evaluate(() => window.scrollY),
        };
      }

      results.push({
        viewport,
        home,
        catalogue,
        coloredGuide,
        brandNavigation,
        consoleErrors,
      });
      await context.close();
    }

    const report = {
      phase,
      generatedAt: new Date().toISOString(),
      status: strict ? "passed" : "observed",
      results,
    };

    if (strict) {
      for (const result of results) {
        assert.equal(result.home.horizontalOverflow, false, `${result.viewport.name}: accueil déborde`);
      assert.equal(result.home.brandClickable, true, `${result.viewport.name}: marque non cliquable`);
      assert.equal(result.home.brandHref, "/", `${result.viewport.name}: destination marque incorrecte`);
      assert.equal(result.home.weeklyStampClipped, false, `${result.viewport.name}: promesse rognée`);
      assert.equal(
        result.home.weeklyDecorationOverlaps,
        false,
        `${result.viewport.name}: décoration superposée au texte hebdomadaire`,
      );
      assert.ok(
        result.home.weeklyStampMinContrast >= 4.5,
        `${result.viewport.name}: contraste hebdomadaire insuffisant`,
      );
        assert.deepEqual(result.home.clippedText, [], `${result.viewport.name}: texte rogné`);
        assert.deepEqual(result.home.verticalGaps, [], `${result.viewport.name}: vide vertical excessif`);
        assert.equal(result.home.catalogueCards, 10, `${result.viewport.name}: catalogues manquants`);
        assert.equal(result.home.decodedThumbnails, 10, `${result.viewport.name}: vignettes non décodées`);
        assert.equal(result.home.visibleThumbnails, 10, `${result.viewport.name}: vignettes invisibles`);
        if (!result.viewport.mobile) {
          assert.deepEqual(result.home.smallText, [], `${result.viewport.name}: texte inférieur à 14px`);
        }
        assert.equal(result.catalogue.horizontalOverflow, false, `${result.viewport.name}: catalogue déborde`);
        assert.equal(result.catalogue.sheetInsideViewport, true, `${result.viewport.name}: feuille hors écran`);
        assert.deepEqual(result.catalogue.imageBleeds, [], `${result.viewport.name}: image déborde`);
        assert.deepEqual(result.catalogue.overlaps, [], `${result.viewport.name}: actions se chevauchent`);
        assert.equal(
          result.catalogue.actionTargetsLargeEnough,
          true,
          `${result.viewport.name}: cible inférieure à 44px`,
        );
        assert.equal(result.coloredGuide.decoded, true, `${result.viewport.name}: guide non décodé`);
        assert.equal(result.coloredGuide.visible, true, `${result.viewport.name}: guide invisible`);
        assert.equal(
          result.coloredGuide.frontBackface,
          "hidden",
          `${result.viewport.name}: revers noir et blanc visible`,
        );
        assert.equal(
          result.coloredGuide.backBackface,
          "hidden",
          `${result.viewport.name}: revers coloré visible`,
        );
        assert.equal(
          result.coloredGuide.rotationSettled,
          true,
          `${result.viewport.name}: rotation verticale incomplète`,
        );
        assert.equal(
          result.coloredGuide.innerOverflow,
          "visible",
          `${result.viewport.name}: scène 3D aplatie par overflow`,
        );
        assert.equal(result.brandNavigation.linkPresent, true, `${result.viewport.name}: marque sans lien`);
        assert.equal(result.brandNavigation.returnedHome, true, `${result.viewport.name}: retour accueil cassé`);
        assert.equal(result.brandNavigation.scrollY, 0, `${result.viewport.name}: retour accueil décalé`);
        assert.deepEqual(result.consoleErrors, [], `${result.viewport.name}: erreurs console`);
      }
    }

    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    if (quiet) {
      console.log(JSON.stringify({
        phase,
        status: report.status,
        viewports: results.map((result) => ({
          name: result.viewport.name,
          bodyHeight: result.home.bodyHeight,
          smallText: result.home.smallText.length,
        clippedText: result.home.clippedText.length,
        verticalGaps: result.home.verticalGaps.length,
        weeklyContrast: Number(result.home.weeklyStampMinContrast.toFixed(2)),
        weeklyOverlap: result.home.weeklyDecorationOverlaps,
        thumbnails: result.home.visibleThumbnails,
        coloredGuide: result.coloredGuide.decoded
          && result.coloredGuide.visible
          && result.coloredGuide.frontBackface === "hidden"
          && result.coloredGuide.backBackface === "hidden"
          && result.coloredGuide.innerOverflow === "visible"
          && result.coloredGuide.rotationSettled,
          homeLink: result.brandNavigation.returnedHome,
          overflows: result.home.horizontalOverflow || result.catalogue.horizontalOverflow,
          overlaps: result.catalogue.overlaps.length,
          consoleErrors: result.consoleErrors.length,
        })),
      }, null, 2));
    } else {
      console.log(JSON.stringify(report, null, 2));
    }
  } finally {
    if (browser) await browser.close();
    server.kill();
    await Promise.race([
      new Promise((resolve) => server.once("exit", resolve)),
      delay(3000),
    ]);
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
