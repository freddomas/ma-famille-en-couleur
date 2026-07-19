const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const endpoint = process.argv[2];
if (!endpoint) throw new Error("Endpoint Chrome DevTools manquant.");
const appUrl = process.argv[3] || "http://127.0.0.1:8080/";

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
  };
}

async function main() {
  const { socket, call, events } = await connectWithPlaywright();
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
  const waitFor = async (expression, timeout = 15000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const value = await evaluate(expression);
      if (value) return value;
      await delay(50);
    }
    throw new Error(`Délai dépassé : ${expression}`);
  };
  const screenshot = async (name) => {
    const result = await call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    fs.writeFileSync(path.join(outputDir, name), Buffer.from(result.data, "base64"));
  };
  const printPdf = async (name) => {
    const result = await call("Page.printToPDF", {
      printBackground: true,
      paperWidth: 8.27,
      paperHeight: 11.69,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      preferCSSPageSize: true,
    });
    fs.writeFileSync(path.join(outputDir, name), Buffer.from(result.data, "base64"));
  };

  try {
    await call("Page.enable");
    await call("Runtime.enable");
    await call("Log.enable");
    await call("Page.navigate", { url: appUrl });
    await waitFor(
      `document.readyState === "complete" && document.querySelectorAll(".catalogue-card").length === 10`,
    );

    const initial = await evaluate(`(() => ({
      catalogues: document.querySelectorAll(".catalogue-card").length,
      sheets: document.querySelectorAll(".colouring-sheet").length,
      drawingImages: document.querySelectorAll(".drawing-card__image").length,
      counter: document.querySelector("#surprise-loaded").textContent.trim(),
      previews: document.querySelectorAll(".surprise__preview").length,
      openDisabled: document.querySelector("#open-surprise").disabled,
      printDisabled: document.querySelector("#print-surprise").disabled,
      appError: Boolean(document.querySelector(".app-error"))
    }))()`);
    assert.deepEqual(initial, {
      catalogues: 10,
      sheets: 1,
      drawingImages: 4,
      counter: "0 / 40 images chargées",
      previews: 0,
      openDisabled: true,
      printDisabled: true,
      appError: false,
    });
    const health = await evaluate(
      `fetch("/api/health", { cache: "no-store" }).then((response) => response.json())`,
    );
    assert.equal(health.status, "ok");
    assert.equal(health.framework, "nextjs");

    const weeklyPromise = await evaluate(`(() => {
      const section = document.querySelector("#nouveautes");
      const text = section.textContent.replace(/\\s+/g, " ").trim();
      return {
        present: Boolean(section),
        mentionsWeeklyUpdate: /chaque semaine/i.test(text),
        mentionsNewCategories: /nouvelles catégories/i.test(text),
        mentionsNewImages: /nouvelles images/i.test(text),
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth
      };
    })()`);
    assert.deepEqual(weeklyPromise, {
      present: true,
      mentionsWeeklyUpdate: true,
      mentionsNewCategories: true,
      mentionsNewImages: true,
      horizontalOverflow: false,
    });
    await screenshot("desktop-normal.png");
    await evaluate(
      `document.querySelector("#nouveautes").scrollIntoView({ block: "center", behavior: "instant" })`,
    );
    await screenshot("desktop-weekly-promise.png");
    await evaluate(
      `document.querySelector(".catalogue-card").scrollIntoView({ block: "start", behavior: "instant" })`,
    );
    await waitFor(
      `[...document.querySelectorAll(".catalogue-card__image")]
        .every((image) => image.complete && image.naturalWidth > 0)`,
    );
    await screenshot("desktop-catalogues.png");

    const normalPages = await evaluate(`(async () => {
      const results = [];
      for (const catalogue of state.catalogues) {
        selectCatalogue(catalogue.id);
        for (let page = 1; page <= 10; page += 1) {
          selectPage(page);
          const images = [...document.querySelectorAll(".drawing-card__image")];
          await Promise.all(images.map((image) => image.decode()));
          results.push({
            catalogueId: catalogue.id,
            page,
            images: images.length,
            decoded: images.filter((image) => image.naturalWidth > 0).length,
            horizontalOverflow:
              document.documentElement.scrollWidth > window.innerWidth
          });
        }
      }
      selectCatalogue(state.catalogues[0].id);
      return results;
    })()`);
    assert.equal(normalPages.length, 100);
    normalPages.forEach((page) => {
      assert.equal(page.images, 4);
      assert.equal(page.decoded, 4);
      assert.equal(page.horizontalOverflow, false);
    });

    const mouseGuideTarget = await evaluate(`(() => {
      const card = document.querySelector(".drawing-card .color-flip-card");
      card.scrollIntoView({ block: "center", behavior: "instant" });
      const rect = card.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        colored: card.querySelector(".color-flip-card__back").getAttribute("src")
      };
    })()`);
    assert.match(mouseGuideTarget.colored, /assets\/coloring\/colored\//);
    await call("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: mouseGuideTarget.x,
      y: mouseGuideTarget.y,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    await call("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: mouseGuideTarget.x,
      y: mouseGuideTarget.y,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
    await waitFor(
      `document.querySelector(".drawing-card .color-flip-card").getAttribute("aria-pressed") === "true"`,
    );
    await delay(220);
    const desktopMidTransform = await evaluate(
      `getComputedStyle(document.querySelector(".drawing-card .color-flip-card__inner")).transform`,
    );
    assert.notEqual(desktopMidTransform, "none");
    await screenshot("desktop-card-flipping.png");
    await delay(430);
    await screenshot("desktop-color-guide.png");
    await evaluate(`document.querySelector(".drawing-card .color-flip-card").click()`);
    await delay(650);
    assert.equal(
      await evaluate(
        `document.querySelector(".drawing-card .color-flip-card").getAttribute("aria-pressed")`,
      ),
      "false",
    );

    await evaluate(`(() => {
      const catalogue = selectedCatalogue();
      const target = document.querySelector("#print-area");
      target.innerHTML = renderSheet(catalogue, 1);
      target.setAttribute("aria-hidden", "false");
      document.body.classList.add("is-printing");
      return target.querySelectorAll(".colouring-sheet").length;
    })()`);
    assert.equal(
      await evaluate(`document.querySelectorAll("#print-area .colouring-sheet").length`),
      1,
    );
    assert.equal(
      await evaluate(`[...document.querySelectorAll("#print-area .color-flip-card")]
        .every((card) =>
          !card.classList.contains("is-color-visible")
          && !card.querySelector(".color-flip-card__front").getAttribute("src").includes("/colored/")
          && card.querySelector(".color-flip-card__back").getAttribute("src").includes("/colored/")
        )`),
      true,
      "L'impression doit conserver les dessins noir et blanc",
    );
    await printPdf("normal-page-01.pdf");
    await evaluate(`clearPrintArea()`);

    await evaluate(`(() => {
      const catalogue = selectedCatalogue();
      const target = document.querySelector("#print-area");
      target.innerHTML = buildPages(catalogue).map((page) => renderSheet(catalogue, page.number)).join("");
      target.setAttribute("aria-hidden", "false");
      document.body.classList.add("is-printing");
      return target.querySelectorAll(".colouring-sheet").length;
    })()`);
    assert.equal(
      await evaluate(`document.querySelectorAll("#print-area .colouring-sheet").length`),
      10,
    );
    await printPdf("normal-catalogue-10-pages.pdf");
    await evaluate(`clearPrintArea()`);

    await evaluate(`(() => {
      window.__qaProgressHistory = [];
      const capture = () => {
        const text = document.querySelector("#surprise-loaded").textContent;
        const loaded = Number.parseInt(text, 10);
        const previews = document.querySelectorAll(".surprise__preview").length;
        const last = window.__qaProgressHistory.at(-1);
        if (!last || last.loaded !== loaded || last.previews !== previews) {
          window.__qaProgressHistory.push({ loaded, previews });
        }
      };
      capture();
      new MutationObserver(capture).observe(
        document.querySelector("#surprise-generator"),
        { childList: true, subtree: true, characterData: true }
      );
      document.querySelector("#create-surprise").click();
      return true;
    })()`);
    await waitFor(
      `document.querySelector("#surprise-loaded").textContent.startsWith("40 / 40")`,
      30000,
    );

    const completed = await evaluate(`(() => ({
      counter: document.querySelector("#surprise-loaded").textContent.trim(),
      previews: document.querySelectorAll(".surprise__preview").length,
      progress: document.querySelector('#surprise-generator [role="progressbar"]').getAttribute("aria-valuenow"),
      openDisabled: document.querySelector("#open-surprise").disabled,
      printDisabled: document.querySelector("#print-surprise").disabled,
      selectedIds: state.surpriseCatalogue.entries.map((entry) => entry.id),
      history: window.__qaProgressHistory
    }))()`);
    assert.equal(completed.counter, "40 / 40 images chargées");
    assert.equal(completed.previews, 40);
    assert.equal(completed.progress, "40");
    assert.equal(completed.openDisabled, false);
    assert.equal(completed.printDisabled, false);
    assert.equal(completed.selectedIds.length, 40);
    assert.equal(new Set(completed.selectedIds).size, 40);
    assert.ok(completed.history.length >= 2);
    completed.history.forEach((point) =>
      assert.equal(point.previews, point.loaded, "Aperçus et compteur désynchronisés"),
    );
    await screenshot("surprise-complete.png");

    await evaluate(`document.querySelector("#open-surprise").click()`);
    await waitFor(
      `state.selectedCatalogueId === "catalogue-surprise" && document.querySelectorAll(".drawing-card__image").length === 4`,
    );
    const surpriseOpen = await evaluate(`(() => ({
      title: document.querySelector("#catalogue-info h3").textContent.trim(),
      pages: document.querySelectorAll("#page-list [data-page]").length,
      images: document.querySelectorAll(".drawing-card__image").length
    }))()`);
    assert.deepEqual(surpriseOpen, {
      title: "Mon catalogue surprise",
      pages: 10,
      images: 4,
    });

    await evaluate(`(() => {
      const catalogue = selectedCatalogue();
      const target = document.querySelector("#print-area");
      target.innerHTML = buildPages(catalogue).map((page) => renderSheet(catalogue, page.number)).join("");
      target.setAttribute("aria-hidden", "false");
      document.body.classList.add("is-printing");
      return target.querySelectorAll(".colouring-sheet").length;
    })()`);
    assert.equal(
      await evaluate(`document.querySelectorAll("#print-area .colouring-sheet").length`),
      10,
    );
    await printPdf("surprise-10-pages.pdf");
    await evaluate(`clearPrintArea()`);

    await call("Emulation.setDeviceMetricsOverride", {
      width: 360,
      height: 800,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await call("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 5,
    });
    await evaluate(
      `document.querySelector("#nouveautes").scrollIntoView({ block: "start", behavior: "instant" })`,
    );
    const mobileWeekly = await evaluate(`(() => ({
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      headingVisible: document.querySelector("#weekly-title").getBoundingClientRect().height > 0
    }))()`);
    assert.deepEqual(mobileWeekly, {
      horizontalOverflow: false,
      headingVisible: true,
    });
    await screenshot("mobile-weekly-promise.png");
    await evaluate(`selectCatalogue(state.catalogues[0].id)`);
    await evaluate(`document.querySelector("#catalogues").scrollIntoView()`);
    await evaluate(
      `document.querySelector(".catalogue-card").scrollIntoView({ block: "start", behavior: "instant" })`,
    );
    await waitFor(
      `[...document.querySelectorAll(".catalogue-card__image")]
        .every((image) => image.complete && image.naturalWidth > 0)`,
    );
    await screenshot("mobile-catalogues.png");
    const touchTarget = await evaluate(`(() => {
      const card = document.querySelectorAll(".catalogue-card")[1];
      card.scrollIntoView({ block: "center", behavior: "instant" });
      const rect = card.getBoundingClientRect();
      return {
        catalogueId: card.dataset.catalogueId,
        scrollY: window.scrollY,
        x: rect.left + rect.width / 2,
        y: rect.top + Math.min(rect.height / 2, 180)
      };
    })()`);
    await evaluate(
      `document.querySelector('[data-catalogue-id="${touchTarget.catalogueId}"]').click()`,
    );
    await waitFor(`state.selectedCatalogueId === ${JSON.stringify(touchTarget.catalogueId)}`);
    await waitFor(
      `document.querySelector("#atelier").classList.contains("is-catalogue-open")`,
    );
    await waitFor(
      `[...document.querySelectorAll(".drawing-card__image")]
        .every((image) => image.complete && image.naturalWidth > 0)`,
    );
    const mobile = await evaluate(`(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      images: document.querySelectorAll(".drawing-card__image").length,
      openedCatalogue: state.selectedCatalogueId,
      overlayOpen: document.querySelector("#atelier").classList.contains("is-catalogue-open"),
      pageScrollPreserved: Math.round(window.scrollY) === Math.round(${touchTarget.scrollY}),
      viewerTop: Math.round(document.querySelector(".viewer").getBoundingClientRect().top),
      backButtonFocused:
        document.activeElement === document.querySelector("#close-catalogue"),
      sheetTop: Math.round(
        document.querySelector(".colouring-sheet").getBoundingClientRect().top
      ),
      sheetHeight: Math.round(
        document.querySelector(".colouring-sheet").getBoundingClientRect().height
      ),
      sheetBackground: getComputedStyle(
        document.querySelector(".colouring-sheet")
      ).backgroundColor,
      sheetVisibility: getComputedStyle(
        document.querySelector(".colouring-sheet")
      ).visibility,
      sheetHeaderTop: Math.round(
        document.querySelector(".sheet-header").getBoundingClientRect().top
      ),
      firstDrawingTop: Math.round(
        document.querySelector(".drawing-card").getBoundingClientRect().top
      ),
      firstDrawingHeight: Math.round(
        document.querySelector(".drawing-card").getBoundingClientRect().height
      ),
      decodedImages: [...document.querySelectorAll(".drawing-card__image")]
        .filter((image) => image.naturalWidth > 0).length,
      previewObjectFit: getComputedStyle(
        document.querySelector(".catalogue-card__image")
      ).objectFit
    }))()`);
    assert.equal(mobile.innerWidth, 360);
    assert.ok(
      mobile.scrollWidth <= mobile.innerWidth,
      `Débordement mobile : ${mobile.scrollWidth} > ${mobile.innerWidth}`,
    );
    assert.equal(mobile.images, 4);
    assert.equal(mobile.decodedImages, 4);
    assert.equal(mobile.openedCatalogue, touchTarget.catalogueId);
    assert.equal(mobile.overlayOpen, true);
    assert.equal(mobile.pageScrollPreserved, true);
    assert.ok(mobile.sheetHeight >= 400, `Planche mobile trop basse : ${mobile.sheetHeight}px`);
    assert.equal(mobile.sheetBackground, "rgb(255, 255, 255)");
    assert.equal(mobile.sheetVisibility, "visible");
    assert.ok(mobile.firstDrawingHeight > 0);
    assert.equal(mobile.backButtonFocused, true);
    assert.equal(mobile.previewObjectFit, "contain");

    await evaluate(`document.querySelector("#open-coloring-studio").click()`);
    await waitFor(`document.querySelector("#coloring-studio").open`);
    await waitFor(
      `[...document.querySelectorAll(".coloring-choice img")]
        .every((image) => image.complete && image.naturalWidth > 0)`,
    );
    const coloringSelection = await evaluate(`(() => {
      const choices = [...document.querySelectorAll(".coloring-choice")];
      return {
        choices: choices.length,
        decodedChoices: choices.filter(
          (choice) => choice.querySelector("img")?.naturalWidth > 0
        ).length,
        startDisabled: document.querySelector("#start-coloring").disabled,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
        minChoiceWidth: Math.round(
          Math.min(...choices.map((choice) => choice.getBoundingClientRect().width))
        )
      };
    })()`);
    assert.deepEqual(coloringSelection, {
      choices: 4,
      decodedChoices: 4,
      startDisabled: true,
      horizontalOverflow: false,
      minChoiceWidth: coloringSelection.minChoiceWidth,
    });
    assert.ok(
      coloringSelection.minChoiceWidth >= 140,
      `Choix mobile trop étroit : ${coloringSelection.minChoiceWidth}px`,
    );
    await screenshot("mobile-coloring-selection.png");

    await evaluate(`(() => {
      const choices = document.querySelectorAll(".coloring-choice");
      choices[0].click();
      choices[2].click();
      document.querySelector("#start-coloring").click();
      return true;
    })()`);
    await waitFor(
      `!document.querySelector("#coloring-workspace").hidden
        && !document.querySelector("#coloring-canvas").hidden
        && document.querySelector("#coloring-line-art").naturalWidth > 0`,
    );
    const coloringWorkspace = await evaluate(`(() => {
      const canvas = document.querySelector("#coloring-canvas");
      const frame = document.querySelector("#coloring-canvas-frame");
      const controls = [...document.querySelectorAll(
        ".coloring-color, .coloring-tool, .coloring-size"
      )];
      const frameRect = frame.getBoundingClientRect();
      return {
        tabs: document.querySelectorAll(".coloring-drawing-tab").length,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        frameWidth: Math.round(frameRect.width),
        frameHeight: Math.round(frameRect.height),
        decodedLineArt: document.querySelector("#coloring-line-art").naturalWidth > 0,
        decodedGuide: document.querySelector("#coloring-guide-image").naturalWidth > 0,
        lineArtInkPixels: Number(
          document.querySelector("#coloring-line-art-layer").dataset.inkPixels || 0
        ),
        lineArtLayerVisible:
          !document.querySelector("#coloring-line-art-layer").hidden,
        minControlWidth: Math.round(
          Math.min(...controls.map((control) => control.getBoundingClientRect().width))
        ),
        minControlHeight: Math.round(
          Math.min(...controls.map((control) => control.getBoundingClientRect().height))
        ),
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth
      };
    })()`);
    assert.equal(coloringWorkspace.tabs, 2);
    assert.equal(coloringWorkspace.canvasWidth, coloringWorkspace.canvasHeight);
    assert.ok(coloringWorkspace.canvasWidth <= 768);
    assert.ok(coloringWorkspace.frameWidth >= 220);
    assert.equal(coloringWorkspace.frameWidth, coloringWorkspace.frameHeight);
    assert.equal(coloringWorkspace.decodedLineArt, true);
    assert.equal(coloringWorkspace.decodedGuide, true);
    assert.ok(coloringWorkspace.lineArtInkPixels > 100);
    assert.equal(coloringWorkspace.lineArtLayerVisible, true);
    assert.ok(coloringWorkspace.minControlWidth >= 44);
    assert.ok(coloringWorkspace.minControlHeight >= 44);
    assert.equal(coloringWorkspace.horizontalOverflow, false);

    const coloringTarget = await evaluate(`(() => {
      const canvas = document.querySelector("#coloring-canvas");
      canvas.scrollIntoView({ block: "center", behavior: "instant" });
      const rect = canvas.getBoundingClientRect();
      return {
        x1: rect.left + rect.width * 0.35,
        y1: rect.top + rect.height * 0.45,
        x2: rect.left + rect.width * 0.65,
        y2: rect.top + rect.height * 0.55
      };
    })()`);
    await call("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{
        x: coloringTarget.x1,
        y: coloringTarget.y1,
        radiusX: 3,
        radiusY: 3,
        force: 1,
        id: 2,
      }],
    });
    await call("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{
        x: coloringTarget.x2,
        y: coloringTarget.y2,
        radiusX: 3,
        radiusY: 3,
        force: 1,
        id: 2,
      }],
    });
    await call("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await waitFor(`state.coloring.dirtyIds.size === 1`);
    const coloredPixels = await evaluate(`(() => {
      const canvas = document.querySelector("#coloring-canvas");
      const data = canvas.getContext("2d").getImageData(
        0, 0, canvas.width, canvas.height
      ).data;
      let pixels = 0;
      for (let index = 3; index < data.length; index += 4) {
        if (data[index] > 0) pixels += 1;
      }
      return pixels;
    })()`);
    assert.ok(coloredPixels > 100, `Trait tactile trop court : ${coloredPixels} pixels`);
    await screenshot("mobile-coloring-workspace.png");

    await evaluate(`document.querySelector("#undo-coloring").click()`);
    const pixelsAfterUndo = await evaluate(`(() => {
      const canvas = document.querySelector("#coloring-canvas");
      const data = canvas.getContext("2d").getImageData(
        0, 0, canvas.width, canvas.height
      ).data;
      let pixels = 0;
      for (let index = 3; index < data.length; index += 4) {
        if (data[index] > 0) pixels += 1;
      }
      return pixels;
    })()`);
    assert.equal(pixelsAfterUndo, 0);

    await call("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{
        x: coloringTarget.x1,
        y: coloringTarget.y1,
        radiusX: 3,
        radiusY: 3,
        force: 1,
        id: 3,
      }],
    });
    await call("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{
        x: coloringTarget.x2,
        y: coloringTarget.y2,
        radiusX: 3,
        radiusY: 3,
        force: 1,
        id: 3,
      }],
    });
    await call("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await evaluate(`document.querySelector("#toggle-coloring-guide").click()`);
    assert.equal(
      await evaluate(`!document.querySelector("#coloring-guide-image").hidden`),
      true,
    );
    await screenshot("mobile-coloring-guide.png");
    await evaluate(`document.querySelector("#toggle-coloring-guide").click()`);
    await evaluate(`document.querySelectorAll(".coloring-drawing-tab")[1].click()`);
    await waitFor(
      `state.coloring.activeIndex === 1
        && document.querySelector("#coloring-line-art").naturalWidth > 0`,
    );
    await evaluate(`document.querySelectorAll(".coloring-drawing-tab")[0].click()`);
    await waitFor(`state.coloring.activeIndex === 0`);
    const restoredPixels = await evaluate(`(() => {
      const canvas = document.querySelector("#coloring-canvas");
      const data = canvas.getContext("2d").getImageData(
        0, 0, canvas.width, canvas.height
      ).data;
      let pixels = 0;
      for (let index = 3; index < data.length; index += 4) {
        if (data[index] > 0) pixels += 1;
      }
      return pixels;
    })()`);
    assert.ok(restoredPixels > 100);
    await evaluate(`document.querySelector("#close-coloring-studio").click()`);
    await waitFor(`!document.querySelector("#coloring-studio").open`);
    assert.equal(
      await evaluate(
        `document.activeElement === document.querySelector("#open-coloring-studio")`,
      ),
      true,
    );
    assert.equal(
      await evaluate(`document.querySelector("#atelier").hasAttribute("aria-hidden")`),
      false,
    );

    const touchGuideTarget = await evaluate(`(() => {
      const card = document.querySelector(".drawing-card .color-flip-card");
      card.scrollIntoView({ block: "center", behavior: "instant" });
      const rect = card.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
    })()`);
    await call("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{
        x: touchGuideTarget.x,
        y: touchGuideTarget.y,
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
    await waitFor(
      `document.querySelector(".drawing-card .color-flip-card").getAttribute("aria-pressed") === "true"`,
      2000,
    );
    await delay(650);
    await screenshot("mobile-color-guide.png");
    await call("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{
        x: touchGuideTarget.x,
        y: touchGuideTarget.y,
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
    await waitFor(
      `document.querySelector(".drawing-card .color-flip-card").getAttribute("aria-pressed") === "false"`,
    );
    await delay(650);
    await screenshot("mobile-normal.png");
    await evaluate(`document.querySelector("#close-catalogue").click()`);
    await waitFor(
      `!document.querySelector("#atelier").classList.contains("is-catalogue-open")`,
    );
    assert.equal(
      await evaluate(`Math.round(window.scrollY)`),
      Math.round(touchTarget.scrollY),
    );
    await call("Emulation.setTouchEmulationEnabled", { enabled: false });
    await call("Emulation.clearDeviceMetricsOverride");

    const normalConsoleErrors = events
      .filter(
        (event) =>
          event.method === "Runtime.exceptionThrown" ||
          (event.method === "Log.entryAdded" &&
            event.params.entry.level === "error"),
      )
      .map((event) => event.params);
    assert.deepEqual(normalConsoleErrors, [], "Erreur console pendant le parcours normal");

    await call("Page.navigate", { url: "http://127.0.0.1:8080/" });
    await waitFor(`document.querySelectorAll(".catalogue-card").length === 10`);
    await evaluate(`(() => {
      state.manifestEntries = state.manifestEntries.slice(0, 40).map((entry) => ({ ...entry }));
      state.manifestEntries[16].path = "assets/coloring/active/image-volontairement-absente.png";
      document.querySelector("#create-surprise").click();
      return true;
    })()`);
    await waitFor(
      `document.querySelector("#surprise-status").textContent.startsWith("Échec :")`,
      15000,
    );
    const invalid = await evaluate(`(() => ({
      counter: Number.parseInt(document.querySelector("#surprise-loaded").textContent, 10),
      previews: document.querySelectorAll(".surprise__preview").length,
      error: document.querySelector("#surprise-status").textContent.trim(),
      openDisabled: document.querySelector("#open-surprise").disabled,
      printDisabled: document.querySelector("#print-surprise").disabled,
      ready: Boolean(state.surpriseCatalogue)
    }))()`);
    assert.ok(invalid.counter < 40);
    assert.equal(invalid.previews, invalid.counter);
    assert.match(invalid.error, /image-volontairement-absente/);
    assert.equal(invalid.openDisabled, true);
    assert.equal(invalid.printDisabled, true);
    assert.equal(invalid.ready, false);
    await screenshot("surprise-error.png");

    const consoleErrors = events
      .filter(
        (event) =>
          event.method === "Runtime.exceptionThrown" ||
          (event.method === "Log.entryAdded" &&
            event.params.entry.level === "error"),
      )
      .map((event) => event.params);
    const expectedInvalidConsoleErrors = consoleErrors.filter(
      (error) =>
        error.entry?.url?.endsWith(
          "/assets/coloring/active/image-volontairement-absente.png",
        ),
    );
    const unexpectedConsoleErrors = consoleErrors.filter(
      (error) =>
        !normalConsoleErrors.includes(error) &&
        !expectedInvalidConsoleErrors.includes(error),
    );
    assert.equal(expectedInvalidConsoleErrors.length, 1);
    assert.deepEqual(unexpectedConsoleErrors, []);

    const report = {
      status: "passed",
      health,
      initial,
      weeklyPromise,
      mobileWeekly,
      normalPages: {
        checked: normalPages.length,
        decodedImages: normalPages.reduce((sum, page) => sum + page.decoded, 0),
        horizontalOverflowPages: normalPages.filter(
          (page) => page.horizontalOverflow,
        ).length,
      },
      completed: {
        counter: completed.counter,
        previews: completed.previews,
        progress: completed.progress,
        uniqueSelectedIds: new Set(completed.selectedIds).size,
        recordedProgressStates: completed.history.length,
        synchronizedProgressStates: completed.history.every(
          (point) => point.loaded === point.previews,
        ),
      },
      surpriseOpen,
      print: {
        normalPageSheets: 1,
        normalCatalogueSheets: 10,
        surpriseSheets: 10,
        files: [
          "qa/rendered/normal-page-01.pdf",
          "qa/rendered/normal-catalogue-10-pages.pdf",
          "qa/rendered/surprise-10-pages.pdf",
        ],
      },
      colorFlip: {
        desktopFirstClickColored: true,
        desktopSecondClickLineArt: true,
        mobileFirstTapColored: true,
        mobileSecondTapLineArt: true,
        rotationDegrees: 180,
        desktopMidTransform,
        printUsesLineArt: true,
      },
      coloringStudio: {
        selection: coloringSelection,
        workspace: coloringWorkspace,
        touchStrokePixels: coloredPixels,
        pixelsAfterUndo,
        restoredPixels,
        selectedDrawings: 2,
        guideToggle: true,
        focusReturned: true,
      },
      mobile,
      invalid,
      normalConsoleErrors,
      expectedInvalidConsoleErrors,
      unexpectedConsoleErrors,
    };
    fs.writeFileSync(
      path.join(root, "qa", "browser-dry-run.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    socket.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
