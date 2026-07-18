const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const endpoint = process.argv[2];
if (!endpoint) throw new Error("Endpoint Chrome DevTools manquant.");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "qa", "rendered");
fs.mkdirSync(outputDir, { recursive: true });

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function connect() {
  const targets = await fetch(`${endpoint}/json`).then((response) => response.json());
  const target = targets.find((item) => item.type === "page");
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
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });

  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  return { socket, call, events };
}

async function main() {
  const { socket, call, events } = await connect();
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
    await call("Page.navigate", { url: "http://127.0.0.1:8080/" });
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
    await screenshot("desktop-normal.png");
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
    await delay(250);
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
      initial,
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
