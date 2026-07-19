const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { chromium, devices } = require("playwright");

const baseUrl = process.argv[2] || "http://127.0.0.1:3113/";
const viewports = [
  { name: "phone-short-320", width: 320, height: 480, mobile: true, short: true },
  { name: "phone-320", width: 320, height: 568, mobile: true },
  { name: "phone-390", width: 390, height: 844, mobile: true },
  { name: "tablet", width: 768, height: 1024, mobile: true },
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "monitor", width: 1920, height: 1080, mobile: false },
];
const mobileDevice = devices["Pixel 5"];

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForServer(server) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server && server.exitCode !== null) {
      throw new Error(`Next.js s’est arrêté avec le code ${server.exitCode}.`);
    }
    try {
      const response = await fetch(baseUrl, {
        signal: AbortSignal.timeout(800),
      });
      if (response.ok) return;
    } catch {}
    await delay(250);
  }
  throw new Error(`Next.js n’a pas répondu sur ${baseUrl}.`);
}

async function inspectViewer(page) {
  return page.evaluate(() => {
    const atelier = document.getElementById("atelier");
    const rectangle = atelier?.getBoundingClientRect();
    const rectangleOf = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return {
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        left: value.left,
        width: value.width,
        height: value.height,
      };
    };
    const actionRectangles = [
      "#open-coloring-studio",
      "#print-page",
      "#print-catalogue",
    ].map(rectangleOf);
    const rectanglesOverlap = (left, right) =>
      Boolean(
        left
          && right
          && left.left < right.right
          && left.right > right.left
          && left.top < right.bottom
          && left.bottom > right.top,
      );
    return {
      hidden: atelier?.hidden ?? null,
      ariaHidden: atelier?.getAttribute("aria-hidden") ?? null,
      role: atelier?.getAttribute("role") ?? null,
      ariaModal: atelier?.getAttribute("aria-modal") ?? null,
      openClass: atelier?.classList.contains("is-catalogue-open") ?? false,
      bodyOpenClass: document.body.classList.contains("catalogue-viewer-open"),
      display: atelier ? getComputedStyle(atelier).display : null,
      position: atelier ? getComputedStyle(atelier).position : null,
      clientRects: atelier?.getClientRects().length ?? null,
      width: rectangle?.width ?? null,
      height: rectangle?.height ?? null,
      offsetHeight: atelier?.offsetHeight ?? null,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      visualViewportWidth: window.visualViewport?.width ?? window.innerWidth,
      visualViewportHeight: window.visualViewport?.height ?? window.innerHeight,
      horizontalOverflow:
        document.documentElement.scrollWidth
          > document.documentElement.clientWidth + 1,
      coloringStudioOpen:
        document.getElementById("coloring-studio")?.open ?? false,
      viewerBack: rectangleOf(".catalogue-viewer__back"),
      viewerHead: rectangleOf(".viewer__head"),
      viewerToolbar: rectangleOf(".viewer__toolbar"),
      firstDrawing: rectangleOf(".drawing-card__art"),
      actionRectangles,
      actionOverlap:
        rectanglesOverlap(actionRectangles[0], actionRectangles[1])
        || rectanglesOverlap(actionRectangles[0], actionRectangles[2])
        || rectanglesOverlap(actionRectangles[1], actionRectangles[2]),
      activeElementId: document.activeElement?.id || null,
      activeElementClass:
        document.activeElement instanceof HTMLElement
          ? document.activeElement.className
          : null,
      scrollY: window.scrollY,
    };
  });
}

function assertClosed(state, viewport, phase) {
  const prefix = `${viewport.name} ${phase}`;
  assert.equal(state.hidden, true, `${prefix}: attribut hidden absent.`);
  assert.equal(state.ariaHidden, "true", `${prefix}: aria-hidden incorrect.`);
  assert.equal(state.display, "none", `${prefix}: catalogue encore rendu.`);
  assert.equal(state.clientRects, 0, `${prefix}: boîte de rendu résiduelle.`);
  assert.equal(state.offsetHeight, 0, `${prefix}: espace vertical résiduel.`);
  assert.equal(state.openClass, false, `${prefix}: classe ouverte résiduelle.`);
  assert.equal(state.bodyOpenClass, false, `${prefix}: body verrouillé.`);
  assert.equal(state.role, null, `${prefix}: rôle dialog résiduel.`);
  assert.equal(state.ariaModal, null, `${prefix}: aria-modal résiduel.`);
  assert.equal(
    state.horizontalOverflow,
    false,
    `${prefix}: débordement horizontal.`,
  );
}

function assertOpen(state, viewport) {
  const prefix = `${viewport.name} ouvert`;
  assert.equal(state.hidden, false, `${prefix}: catalogue toujours masqué.`);
  assert.equal(state.ariaHidden, null, `${prefix}: masqué à l’accessibilité.`);
  assert.equal(state.openClass, true, `${prefix}: classe ouverte absente.`);
  assert.equal(state.bodyOpenClass, true, `${prefix}: body non verrouillé.`);
  assert.equal(state.role, "dialog", `${prefix}: rôle dialog absent.`);
  assert.equal(state.ariaModal, "true", `${prefix}: aria-modal absent.`);
  assert.equal(state.position, "fixed", `${prefix}: position non modale.`);
  assert.equal(
    state.coloringStudioOpen,
    false,
    `${prefix}: atelier de coloriage ouvert par un clic fantôme.`,
  );
  assert.equal(state.activeElementId, "close-catalogue", `${prefix}: focus initial.`);
  assert.ok(
    state.width >= state.visualViewportWidth - 1,
    `${prefix}: largeur incomplète (${state.width}/${state.visualViewportWidth}).`,
  );
  assert.ok(
    state.height >= state.visualViewportHeight,
    `${prefix}: hauteur incomplète (${state.height}/${state.visualViewportHeight}).`,
  );
  assert.equal(
    state.horizontalOverflow,
    false,
    `${prefix}: débordement horizontal.`,
  );
  assert.equal(state.actionOverlap, false, `${prefix}: actions superposées.`);
  state.actionRectangles.forEach((rectangle, index) => {
    assert.ok(
      rectangle && rectangle.width >= 44 && rectangle.height >= 44,
      `${prefix}: cible tactile ${index + 1} inférieure à 44 px.`,
    );
  });
  if (viewport.short) {
    const visibleDrawingHeight = Math.max(
      0,
      Math.min(state.firstDrawing.bottom, state.visualViewportHeight)
        - Math.max(state.firstDrawing.top, 0),
    );
    assert.ok(
      state.viewerBack.height <= 64,
      `${prefix}: barre de retour trop haute (${state.viewerBack.height}px).`,
    );
    assert.ok(
      state.viewerHead.height <= 72,
      `${prefix}: en-tête du thème trop haut (${state.viewerHead.height}px).`,
    );
    assert.ok(
      state.viewerToolbar.height <= 120,
      `${prefix}: commandes trop hautes (${state.viewerToolbar.height}px).`,
    );
    assert.ok(
      visibleDrawingHeight >= 120,
      `${prefix}: dessin insuffisamment visible au premier écran `
        + `(${visibleDrawingHeight}px).`,
    );
  }
}

async function inspectScrollCoverage(page) {
  return page.evaluate(async () => {
    const atelier = document.getElementById("atelier");
    const maximumScroll = atelier.scrollHeight - atelier.clientHeight;
    const samples = [0, 0.25, 0.5, 0.75, 1].map((ratio) =>
      Math.round(maximumScroll * ratio),
    );
    const results = [];
    for (const scrollTop of samples) {
      atelier.scrollTop = scrollTop;
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      const intervals = [
        ...document.querySelectorAll(
          ".catalogue-viewer__back, .viewer__head, .viewer__toolbar, "
            + ".sheet-header, .drawing-card, .sheet-footer",
        ),
      ]
        .map((element) => element.getBoundingClientRect())
        .map((rectangle) => [
          Math.max(0, rectangle.top),
          Math.min(window.innerHeight, rectangle.bottom),
        ])
        .filter(([top, bottom]) => bottom > top)
        .sort((left, right) => left[0] - right[0]);
      const merged = [];
      for (const interval of intervals) {
        const previous = merged.at(-1);
        if (!previous || interval[0] > previous[1]) {
          merged.push([...interval]);
        } else {
          previous[1] = Math.max(previous[1], interval[1]);
        }
      }
      results.push({
        scrollTop,
        coveredHeight: merged.reduce(
          (total, [top, bottom]) => total + bottom - top,
          0,
        ),
      });
    }
    atelier.scrollTop = 0;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    return results;
  });
}

async function main() {
  const externalServer = process.argv.length > 2;
  let server;
  let serverOutput = "";
  if (!externalServer) {
    server = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "start", "-p", "3113"],
      {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    server.stdout.on("data", (chunk) => {
      serverOutput += chunk;
    });
    server.stderr.on("data", (chunk) => {
      serverOutput += chunk;
    });
  }

  let browser;
  const report = [];
  try {
    await waitForServer(server);
    browser = await chromium.launch({ channel: "chrome", headless: true });

    for (const viewport of viewports) {
      console.log(`[catalogue-visibility] ${viewport.name}`);
      const context = await browser.newContext({
        ...(viewport.mobile ? mobileDevice : {}),
        viewport: { width: viewport.width, height: viewport.height },
        hasTouch: viewport.mobile,
        isMobile: viewport.mobile,
        deviceScaleFactor: viewport.mobile ? mobileDevice.deviceScaleFactor : 1,
      });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => consoleErrors.push(error.message));

      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await page.waitForSelector(".catalogue-card");

      const closedBefore = await inspectViewer(page);
      assertClosed(closedBefore, viewport, "avant ouverture");

      const card = page.locator(".catalogue-card").first();
      await card.scrollIntoViewIfNeeded();
      if (viewport.mobile) {
        await card.tap();
      } else {
        await card.click();
      }
      await page.waitForSelector("#atelier.is-catalogue-open", {
        state: "visible",
      });
      await page.waitForFunction(
        () =>
          document.activeElement?.id === "close-catalogue",
        undefined,
        { timeout: 5_000 },
      );

      const opened = await inspectViewer(page);
      assertOpen(opened, viewport);
      const scrollCoverage = viewport.short
        ? await inspectScrollCoverage(page)
        : [];
      scrollCoverage.forEach((sample) => {
        assert.ok(
          sample.coveredHeight >= viewport.height * 0.7,
          `${viewport.name}: espace mort au scroll ${sample.scrollTop} `
            + `(${sample.coveredHeight}px couverts).`,
        );
      });

      const closeButton = page.locator("#close-catalogue");
      if (viewport.mobile) {
        await closeButton.tap();
      } else {
        await closeButton.click();
      }
      await page.waitForFunction(
        () =>
          document.getElementById("atelier")?.hidden === true
          && !document.body.classList.contains("catalogue-viewer-open"),
      );

      const closedAfter = await inspectViewer(page);
      assertClosed(closedAfter, viewport, "après fermeture");
      assert.match(
        String(closedAfter.activeElementClass),
        /catalogue-card/,
        `${viewport.name}: focus non restitué à la vignette.`,
      );
      assert.ok(
        Math.abs(closedAfter.scrollY - opened.scrollY) <= 1,
        `${viewport.name}: position de lecture perdue après fermeture `
          + `(${opened.scrollY} → ${closedAfter.scrollY}).`,
      );
      assert.deepEqual(
        consoleErrors,
        [],
        `${viewport.name}: erreurs navigateur.`,
      );

      report.push({
        viewport: viewport.name,
        closedBefore,
        opened,
        scrollCoverage,
        closedAfter,
        consoleErrors,
      });
      await context.close();
    }

    console.log(
      JSON.stringify(
        {
          status: "passed",
          viewports: report.map((result) => result.viewport),
          checks: {
            initiallyAbsentFromLayout: true,
            opensFromThumbnail: true,
            closesWithoutResidualSpace: true,
            focusAndScrollRestored: true,
            consoleErrors: 0,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    if (browser) await browser.close();
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
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
