const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const endpoint = process.argv[2];
const appUrl = process.argv[3] || "http://127.0.0.1:8080/";
if (!endpoint) throw new Error("Endpoint Chrome DevTools manquant.");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "qa", "rendered");
fs.mkdirSync(outputDir, { recursive: true });

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function connect() {
  const targets = await fetch(`${endpoint}/json`).then((response) => response.json());
  const target =
    targets.find((item) => item.type === "page" && item.url.startsWith(appUrl))
    || targets.find((item) => item.type === "page");
  if (!target) throw new Error("Aucune page Chrome disponible.");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  const events = [];
  let nextId = 0;

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const handler = pending.get(message.id);
      if (!handler) return;
      pending.delete(message.id);
      if (message.error) handler.reject(new Error(message.error.message));
      else handler.resolve(message.result);
    } else {
      events.push(message);
    }
  };
  socket.onclose = () => {
    for (const handler of pending.values()) {
      handler.reject(new Error("Connexion Chrome DevTools fermée."));
    }
    pending.clear();
  };
  await Promise.race([
    new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    }),
    delay(15000).then(() => {
      throw new Error("Connexion WebSocket CDP bloquée après 15 s.");
    }),
  ]);
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Commande CDP bloquée après 15 s : ${method}`));
      }, 15000);
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  return { socket, call, events };
}

async function connectWithPlaywright() {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  const events = [];

  session.on("Runtime.exceptionThrown", (params) => {
    events.push({ method: "Runtime.exceptionThrown", params });
  });
  session.on("Log.entryAdded", (params) => {
    events.push({ method: "Log.entryAdded", params });
  });

  return {
    socket: {
      close: () => {
        void browser.close();
      },
    },
    call: (method, params = {}) => session.send(method, params),
    events,
    page,
  };
}

async function main() {
  const { socket, call, events, page } = await connectWithPlaywright();
  const evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "Erreur Runtime.evaluate");
    }
    return result.result.value;
  };
  const waitFor = async (expression, timeout = 30000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await evaluate(expression)) return;
      await delay(50);
    }
    const diagnostic = await evaluate(`(() => ({
      readyState: document.readyState,
      catalogues: document.querySelectorAll(".catalogue-card").length,
      atelierClass: document.querySelector("#atelier")?.className || null,
      drawings: document.querySelectorAll(".drawing-card").length,
      images: [...document.querySelectorAll(".drawing-card__image")].map((image) => ({
        src: image.currentSrc || image.src,
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight
      })),
      assetErrors: [...document.querySelectorAll(".asset-error")].map((error) => error.textContent)
    }))()`).catch(() => null);
    throw new Error(
      `Délai dépassé : ${expression}\nÉtat navigateur : ${JSON.stringify(diagnostic)}`,
    );
  };
  const screenshot = async (name) => {
    const result = await call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    fs.writeFileSync(path.join(outputDir, name), Buffer.from(result.data, "base64"));
  };
  const activate = async (selector, useTouch = false) => {
    const point = await evaluate(`(async () => {
      const target = document.querySelector(${JSON.stringify(selector)});
      if (!target) return null;
      target.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      );
      const rect = target.getBoundingClientRect();
      const x = Math.round(rect.left + rect.width / 2);
      const y = Math.round(rect.top + rect.height / 2);
      const hit = document.elementFromPoint(x, y);
      return {
        x,
        y,
        interactive:
          rect.width > 0
          && rect.height > 0
          && Boolean(hit)
          && target.contains(hit)
      };
    })()`);
    assert.ok(point, `Cible introuvable : ${selector}`);
    assert.equal(point.interactive, true, `Cible masquée ou sans dimensions : ${selector}`);
    if (useTouch) {
      await call("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{
          x: point.x,
          y: point.y,
          radiusX: 2,
          radiusY: 2,
          force: 1,
          id: 1,
        }],
      });
      await call("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      return;
    }
    await page.mouse.click(point.x, point.y);
  };

  const checks = [];
  const viewports = [
    { name: "phone-320", width: 320, height: 568, mobile: true },
    { name: "phone-390", width: 390, height: 844, mobile: true },
    { name: "phone-landscape", width: 667, height: 375, mobile: true },
    { name: "tablet", width: 768, height: 1024, mobile: true },
    { name: "desktop", width: 1440, height: 900, mobile: false },
  ];

  try {
    await call("Page.enable");
    await call("Runtime.enable");
    await call("Log.enable");

    for (const viewport of viewports) {
      console.log(`QA ${viewport.name}: catalogue`);
      await call("Emulation.setDeviceMetricsOverride", {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.mobile,
      });
      await call("Emulation.setTouchEmulationEnabled", {
        enabled: viewport.mobile,
        maxTouchPoints: viewport.mobile ? 5 : 1,
      });
      await call("Page.navigate", { url: appUrl });
    await waitFor(
      `document.readyState === "complete"
      && document.querySelectorAll(".catalogue-card").length === 10
      && [...document.querySelectorAll(".catalogue-card__image")]
        .every((image) => image.complete && image.naturalWidth > 0)`,
    );
      await evaluate(
        `document.querySelector("#catalogues").scrollIntoView({ block: "start", behavior: "instant" })`,
      );
      const home = await evaluate(`(() => {
        const contains = (outer, inner, tolerance = 1) =>
          inner.left >= outer.left - tolerance
          && inner.right <= outer.right + tolerance
          && inner.top >= outer.top - tolerance
          && inner.bottom <= outer.bottom + tolerance;
        const cards = [...document.querySelectorAll(".catalogue-card")];
        const images = [...document.querySelectorAll(".catalogue-card__image")];
        const imageBleeds = images.filter((image) => {
          const frame = image.closest(".catalogue-card__media");
          return !frame || !contains(frame.getBoundingClientRect(), image.getBoundingClientRect());
        }).map((image) => image.dataset.assetId || image.alt);
        const outsideCards = cards.filter((card) => {
          const rect = card.getBoundingClientRect();
          return rect.left < -1 || rect.right > window.innerWidth + 1;
        }).length;
        const header = document.querySelector(".site-header")?.getBoundingClientRect();
        const weekly = document.querySelector(".weekly-promise__stamp")?.getBoundingClientRect();
        return {
          cards: cards.length,
          visibleImages: images.filter((image) => {
            const rect = image.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }).length,
          decodedImages: images.filter((image) => image.complete && image.naturalWidth > 0).length,
          imageBleeds,
          outsideCards,
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
          headerVisible: Boolean(header && header.top >= -1 && header.bottom > 44),
          weeklyInsideViewport: Boolean(
            weekly && weekly.left >= -1 && weekly.right <= window.innerWidth + 1
          )
        };
      })()`);
      console.log(JSON.stringify(home));
      assert.equal(home.cards, 10);
      assert.equal(home.visibleImages, 10);
      assert.equal(home.decodedImages, 10);
      assert.deepEqual(home.imageBleeds, []);
      assert.equal(home.outsideCards, 0);
    assert.equal(home.horizontalOverflow, false);
    assert.equal(home.headerVisible, true);
    assert.equal(home.weeklyInsideViewport, true);

    await activate(".catalogue-card:first-child", viewport.mobile);
    await waitFor(
      `document.querySelector("#atelier").classList.contains("is-catalogue-open")
        && [...document.querySelectorAll(".drawing-card__image")]
          .every((image) => image.complete && image.naturalWidth > 0)`,
    );
    const exhaustive = await evaluate(`(async () => {
      const defects = [];
      let decodedImages = 0;
      let pages = 0;
      for (const catalogue of state.catalogues) {
        selectCatalogue(catalogue.id);
        for (let pageNumber = 1; pageNumber <= 10; pageNumber += 1) {
          selectPage(pageNumber);
          const images = [...document.querySelectorAll(".drawing-card__image")];
          await Promise.all(images.map((image) => {
            if (image.complete && image.naturalWidth > 0) return Promise.resolve();
            return image.decode();
          }));
          pages += 1;
          decodedImages += images.filter((image) => image.naturalWidth > 0).length;
          const sheetRect = document.querySelector(".colouring-sheet").getBoundingClientRect();
          const pageDefects = images
            .filter((image) => {
              const artRect = image.closest(".drawing-card__art").getBoundingClientRect();
              return image.getBoundingClientRect().left < artRect.left - 1
                || image.getBoundingClientRect().right > artRect.right + 1
                || image.getBoundingClientRect().top < artRect.top - 1
                || image.getBoundingClientRect().bottom > artRect.bottom + 1
                || artRect.left < sheetRect.left - 1
                || artRect.right > sheetRect.right + 1;
            })
            .map((image) => image.dataset.assetId || image.alt);
          if (images.length !== 4
            || images.some((image) => image.naturalWidth === 0)
            || pageDefects.length > 0
            || document.documentElement.scrollWidth > window.innerWidth) {
            defects.push({
              catalogue: catalogue.id,
              page: pageNumber,
              images: images.length,
              pageDefects,
            });
          }
        }
      }
      document.getElementById("close-catalogue").click();
      return { pages, decodedImages, defects };
    })()`);
    assert.equal(exhaustive.pages, 100);
    assert.equal(exhaustive.decodedImages, 400);
    assert.deepEqual(exhaustive.defects, []);

    await evaluate(`window.scrollTo({ top: 0, left: 0, behavior: "instant" })`);
    await delay(200);
    await screenshot(`qa-${viewport.name}-home.png`);

      await activate(".catalogue-card:nth-child(2)", viewport.mobile);
      await waitFor(
        `document.querySelector("#atelier").classList.contains("is-catalogue-open")
          && [...document.querySelectorAll(".drawing-card__image")]
            .every((image) => image.complete && image.naturalWidth > 0)`,
      );

      const catalogue = await evaluate(`(() => {
        const colorButton = document.querySelector("#open-coloring-studio");
        const sheet = document.querySelector(".colouring-sheet");
        const drawings = [...document.querySelectorAll(".drawing-card")];
        const buttonRect = colorButton.getBoundingClientRect();
        const sheetRect = sheet.getBoundingClientRect();
        const actionButtons = [
          document.querySelector("#open-coloring-studio"),
          document.querySelector("#print-page"),
          document.querySelector("#print-catalogue")
        ];
        const actionRects = actionButtons.map((button) => {
          const rect = button.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          return {
            id: button.id,
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
            hitTarget: document.elementFromPoint(centerX, centerY)?.closest("button")?.id || null
          };
        });
        const overlaps = [];
        for (let leftIndex = 0; leftIndex < actionRects.length; leftIndex += 1) {
          for (let rightIndex = leftIndex + 1; rightIndex < actionRects.length; rightIndex += 1) {
            const left = actionRects[leftIndex];
            const right = actionRects[rightIndex];
            const overlapWidth = Math.max(
              0,
              Math.min(left.right, right.right) - Math.max(left.left, right.left)
            );
            const overlapHeight = Math.max(
              0,
              Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top)
            );
            if (overlapWidth * overlapHeight > 0.5) {
              overlaps.push([left.id, right.id, overlapWidth * overlapHeight]);
            }
          }
        }
        const contains = (outer, inner, tolerance = 1) =>
          inner.left >= outer.left - tolerance
          && inner.right <= outer.right + tolerance
          && inner.top >= outer.top - tolerance
          && inner.bottom <= outer.bottom + tolerance;
        const bleedingImages = [...document.querySelectorAll(".drawing-card__image")]
          .filter((image) => {
            const art = image.closest(".drawing-card__art");
            return !art || !contains(art.getBoundingClientRect(), image.getBoundingClientRect());
          })
          .map((image) => image.dataset.assetId || image.alt);
        const stickyHeader = document.querySelector(".catalogue-viewer__back");
        const stickyRect = stickyHeader.getBoundingClientRect();
        const labels = [...document.querySelectorAll(".print-actions .button__label")];
        return {
          images: document.querySelectorAll(".drawing-card__image").length,
          decoded: [...document.querySelectorAll(".drawing-card__image")]
            .filter((image) => image.naturalWidth > 0).length,
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
          colorButtonWidth: Math.round(buttonRect.width),
          colorButtonHeight: Math.round(buttonRect.height),
          sheetWidth: Math.round(sheetRect.width),
          widestDrawing: Math.round(
            Math.max(...drawings.map((drawing) => drawing.getBoundingClientRect().width))
          ),
          actionRects,
          overlaps,
          actionsInsideViewport: actionRects.every((rect) =>
            rect.left >= -1
            && rect.right <= window.innerWidth + 1
            && rect.top >= -1
            && rect.bottom <= window.innerHeight + 1
          ),
          bleedingImages,
          sheetContainsDrawings: drawings.every((drawing) =>
            contains(sheetRect, drawing.getBoundingClientRect())
          ),
          stickyHeaderVisible:
            stickyRect.top >= -1
            && stickyRect.bottom <= window.innerHeight
            && getComputedStyle(stickyHeader).position === "sticky",
          stickyHeaderHasBrand: Boolean(stickyHeader.querySelector(".catalogue-viewer__brand")),
          wrappedLabels: labels
            .filter((label) => getComputedStyle(label).display !== "none")
            .filter((label) => getComputedStyle(label).whiteSpace !== "nowrap")
            .map((label) => label.textContent.trim())
        };
      })()`);
      console.log(JSON.stringify(catalogue));
      assert.equal(catalogue.images, 4);
      assert.equal(catalogue.decoded, 4);
      assert.equal(catalogue.horizontalOverflow, false);
      assert.ok(catalogue.colorButtonHeight >= 48);
      assert.ok(catalogue.sheetWidth <= viewport.width);
      assert.ok(catalogue.widestDrawing <= viewport.width);
      assert.deepEqual(catalogue.overlaps, []);
      assert.equal(catalogue.actionsInsideViewport, true);
      assert.deepEqual(catalogue.bleedingImages, []);
      assert.equal(catalogue.sheetContainsDrawings, true);
      assert.equal(catalogue.stickyHeaderVisible, true);
      assert.equal(catalogue.stickyHeaderHasBrand, true);
      assert.deepEqual(catalogue.wrappedLabels, []);
    for (const target of catalogue.actionRects) {
      assert.ok(target.width >= 44, `${target.id}: largeur tactile insuffisante`);
      assert.ok(target.height >= 44, `${target.id}: hauteur tactile insuffisante`);
      if (target.hitTarget !== null) {
        assert.equal(target.hitTarget, target.id, `${target.id}: zone de clic recouverte`);
      }
    }
      await screenshot(`qa-${viewport.name}-catalogue.png`);

      console.log(`QA ${viewport.name}: sélection`);
      await evaluate(`(() => {
        delete document.documentElement.dataset.lastCatalogueAction;
        document.querySelector("#print-area").replaceChildren();
        document.body.classList.remove("is-printing");
      })()`);
      await activate("#open-coloring-studio", viewport.mobile);
      await waitFor(
        `document.querySelector("#coloring-studio").open
          && [...document.querySelectorAll(".coloring-choice img")]
            .every((image) => image.complete && image.naturalWidth > 0)`,
      );
      const selection = await evaluate(`(() => ({
        choices: document.querySelectorAll(".coloring-choice").length,
        decoded: [...document.querySelectorAll(".coloring-choice img")]
          .filter((image) => image.naturalWidth > 0).length,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
        lastAction: document.documentElement.dataset.lastCatalogueAction || null,
        printSheets: document.querySelectorAll("#print-area .colouring-sheet").length,
        printing: document.body.classList.contains("is-printing")
      }))()`);
      assert.equal(selection.choices, 4);
      assert.equal(selection.decoded, 4);
      assert.equal(selection.horizontalOverflow, false);
      assert.equal(selection.lastAction, "coloring");
      assert.equal(selection.printSheets, 0);
      assert.equal(selection.printing, false);
      await screenshot(`qa-${viewport.name}-selection.png`);

      console.log(`QA ${viewport.name}: canevas`);
      await evaluate(`(() => {
        const choices = document.querySelectorAll(".coloring-choice");
        choices[0].click();
        choices[2].click();
        document.querySelector("#start-coloring").click();
        return true;
      })()`);
      await waitFor(
        `!document.querySelector("#coloring-canvas").hidden
          && document.querySelector("#coloring-line-art").naturalWidth > 0`,
      );
      const workspace = await evaluate(`(() => {
        const canvas = document.querySelector("#coloring-canvas");
        const frame = document.querySelector("#coloring-canvas-frame");
        const lineArt = document.querySelector("#coloring-line-art");
        const lineArtLayer = document.querySelector("#coloring-line-art-layer");
        const lineArtStyle = getComputedStyle(lineArt);
        frame.scrollIntoView({ block: "center", behavior: "instant" });
        const rect = frame.getBoundingClientRect();
        return {
          tabs: document.querySelectorAll(".coloring-drawing-tab").length,
          frameWidth: Math.round(rect.width),
          frameHeight: Math.round(rect.height),
          frameLeft: Math.round(rect.left),
          frameRight: Math.round(rect.right),
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          lineArt: document.querySelector("#coloring-line-art").naturalWidth,
          guide: document.querySelector("#coloring-guide-image").naturalWidth,
          lineArtInkPixels: Number(lineArtLayer.dataset.inkPixels || 0),
          lineArtLayerHidden: lineArtLayer.hidden,
          lineArtHidden: lineArt.hidden,
          lineArtDisplay: lineArtStyle.display,
          lineArtVisibility: lineArtStyle.visibility,
          lineArtOpacity: lineArtStyle.opacity,
          lineArtZIndex: lineArtStyle.zIndex,
          lineArtSource: lineArt.getAttribute("src"),
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth
        };
      })()`);
      console.log(JSON.stringify(workspace));
      assert.equal(workspace.tabs, 2);
      assert.equal(workspace.canvasWidth, workspace.canvasHeight);
      assert.ok(workspace.canvasWidth <= 768);
      assert.equal(workspace.frameWidth, workspace.frameHeight);
      assert.ok(workspace.frameLeft >= 0);
      assert.ok(workspace.frameRight <= viewport.width);
      assert.ok(workspace.lineArt > 0);
      assert.ok(workspace.guide > 0);
      assert.ok(workspace.lineArtInkPixels > 100);
      assert.equal(workspace.lineArtLayerHidden, false);
      assert.equal(workspace.horizontalOverflow, false);
      await screenshot(`qa-${viewport.name}-workspace.png`);

    checks.push({ viewport, home, exhaustive, catalogue, selection, workspace });
    }

    const consoleErrors = events
      .filter(
        (event) =>
          event.method === "Runtime.exceptionThrown" ||
          (event.method === "Log.entryAdded" &&
            event.params.entry.level === "error"),
      )
      .map((event) => event.params);
    assert.deepEqual(consoleErrors, []);

    const report = { status: "passed", checks, consoleErrors };
    fs.writeFileSync(
      path.join(root, "qa", "coloring-browser-qa.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await call("Emulation.setTouchEmulationEnabled", { enabled: false }).catch(() => {});
    await call("Emulation.clearDeviceMetricsOverride").catch(() => {});
    socket.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
