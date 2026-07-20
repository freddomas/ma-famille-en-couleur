const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const externalBaseUrl = process.argv[2];
const port = 3116;
const baseUrl = externalBaseUrl || `http://127.0.0.1:${port}`;
const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForServer(server) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server && server.exitCode !== null) {
      throw new Error(`Le serveur Next.js s’est arrêté avec le code ${server.exitCode}.`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Le serveur démarre encore.
    }
    await delay(250);
  }
  throw new Error(`Le serveur ne répond pas sur ${baseUrl}.`);
}

async function openCatalogue(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForSelector(".catalogue-card", { state: "visible" });
  await page.locator(".catalogue-card").first().click();
  await page.waitForSelector("#atelier.is-catalogue-open");
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll("#page-viewer img")];
    return images.length === 8
      && images.every((image) => image.complete && image.naturalWidth > 0);
  });
}

async function activePage(page) {
  return Number(
    await page.locator('.page-pill[aria-current="page"]').textContent(),
  );
}

async function dispatchTouchSwipe(page, session, direction, distance = 150) {
  const viewer = page.locator("#page-viewer");
  await viewer.scrollIntoViewIfNeeded();
  const box = await viewer.boundingBox();
  assert.ok(box && box.width >= 240 && box.height >= 240, "Zone de balayage invalide.");

  const viewport = page.viewportSize();
  assert.ok(viewport, "Viewport indisponible.");
  const centerX = Math.max(100, Math.min(viewport.width - 100, box.x + box.width / 2));
  const y = Math.max(100, Math.min(viewport.height - 100, box.y + 180));
  const startX = centerX - (direction === "right" ? distance / 2 : -distance / 2);
  const endX = centerX + (direction === "right" ? distance / 2 : -distance / 2);
  const hit = await page.evaluate(
    ({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      return element
        ? { tag: element.tagName, className: element.getAttribute("class") }
        : null;
    },
    { x: startX, y },
  );

  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: startX, y, radiusX: 8, radiusY: 8, force: 1, id: 1 }],
  });
  const frames = [];
  for (let step = 1; step <= 6; step += 1) {
    const x = startX + ((endX - startX) * step) / 6;
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y, radiusX: 8, radiusY: 8, force: 1, id: 1 }],
    });
    await delay(12);
    frames.push(await page.evaluate(() => {
      const viewer = document.querySelector("#page-viewer");
      const sheet = viewer?.querySelector(".colouring-sheet");
      return {
        className: viewer?.className,
        swipeX: viewer?.style.getPropertyValue("--page-swipe-x"),
        transform: sheet ? getComputedStyle(sheet).transform : null,
      };
    }));
  }
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await delay(240);
  return { box, startX, endX, y, hit, frames };
}

async function inspectTouchUi(page) {
  return page.evaluate(() => {
    const hint = document.querySelector(".viewer__swipe-hint");
    const viewer = document.querySelector("#page-viewer");
    const sheet = viewer?.querySelector(".colouring-sheet");
    return {
      hintDisplay: hint ? getComputedStyle(hint).display : null,
      touchAction: viewer ? getComputedStyle(viewer).touchAction : null,
      horizontalOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth,
      pressedCards: [...document.querySelectorAll("#page-viewer [data-color-flip]")]
        .filter((card) => card.getAttribute("aria-pressed") === "true")
        .length,
      runningAnimations: sheet?.getAnimations().length ?? 0,
    };
  });
}

async function runStandardMotion(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await openCatalogue(page);
  const session = await context.newCDPSession(page);
  await page.evaluate(() => {
    window.__catalogueSwipeQaEvents = [];
    const viewer = document.querySelector("#page-viewer");
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
      viewer?.addEventListener(type, (event) => {
        window.__catalogueSwipeQaEvents.push({
          type,
          pointerType: event.pointerType,
          x: event.clientX,
          y: event.clientY,
        });
      });
    }
  });
  assert.equal(await activePage(page), 1);

  const rightSwipe = await dispatchTouchSwipe(page, session, "right");
  const rightSwipeEvents = await page.evaluate(() => window.__catalogueSwipeQaEvents);
  assert.equal(
    await activePage(page),
    2,
    `Droite doit avancer à la page 2. ${JSON.stringify({ rightSwipe, rightSwipeEvents })}`,
  );
  let ui = await inspectTouchUi(page);
  assert.equal(ui.pressedCards, 0, "Le balayage ne doit retourner aucune carte.");

  await dispatchTouchSwipe(page, session, "left");
  assert.equal(await activePage(page), 1, "Gauche doit reculer à la page 1.");

  await dispatchTouchSwipe(page, session, "left");
  assert.equal(await activePage(page), 1, "La première page doit rester une borne.");
  assert.match(
    await page.locator("#page-swipe-status").textContent(),
    /première page/,
  );

  await page.locator('[data-page="10"]').click();
  await dispatchTouchSwipe(page, session, "right");
  assert.equal(await activePage(page), 10, "La dernière page doit rester une borne.");
  assert.match(
    await page.locator("#page-swipe-status").textContent(),
    /dernière page/,
  );

  ui = await inspectTouchUi(page);
  assert.equal(ui.hintDisplay, "flex", "L’indice tactile doit être visible.");
  assert.match(ui.touchAction, /pan-y/, "Le défilement vertical doit rester autorisé.");
  assert.equal(ui.horizontalOverflow, false, "Aucun débordement horizontal attendu.");
  assert.deepEqual(consoleErrors, [], `Erreurs console : ${consoleErrors.join("\n")}`);

  await context.close();
  return ui;
}

async function runReducedMotion(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await openCatalogue(page);
  const session = await context.newCDPSession(page);

  await dispatchTouchSwipe(page, session, "right");
  assert.equal(await activePage(page), 2, "Le geste doit fonctionner sans animation.");
  const ui = await inspectTouchUi(page);
  assert.equal(ui.runningAnimations, 0, "Aucune animation ne doit rester active.");

  await context.close();
  return ui;
}

async function main() {
  let server;
  let serverOutput = "";
  if (!externalBaseUrl) {
    server = spawn(
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
  }

  let browser;
  try {
    await waitForServer(server);
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const standardMotion = await runStandardMotion(browser);
    const reducedMotion = await runReducedMotion(browser);
    console.log(JSON.stringify({
      status: "passed",
      viewport: "390x844",
      gestures: {
        rightAdvances: true,
        leftGoesBack: true,
        firstAndLastPageBounded: true,
        colorFlipSuppressed: true,
      },
      standardMotion,
      reducedMotion,
    }, null, 2));
  } finally {
    await browser?.close();
    if (server) {
      server.kill();
      await Promise.race([
        new Promise((resolve) => server.once("exit", resolve)),
        delay(3_000),
      ]);
      if (server.exitCode === null) server.kill("SIGKILL");
      if (server.exitCode && server.exitCode !== 0) console.error(serverOutput);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
