const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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
  socket.onclose = () => {
    for (const handler of pending.values()) {
      handler.reject(new Error("Connexion Chrome DevTools fermée."));
    }
    pending.clear();
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
          && document.querySelectorAll(".catalogue-card").length === 10`,
      );
      await evaluate(`document.querySelectorAll(".catalogue-card")[1].click()`);
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
          )
        };
      })()`);
      console.log(JSON.stringify(catalogue));
      assert.equal(catalogue.images, 4);
      assert.equal(catalogue.decoded, 4);
      assert.equal(catalogue.horizontalOverflow, false);
      assert.ok(catalogue.colorButtonHeight >= 48);
      assert.ok(catalogue.sheetWidth <= viewport.width);
      assert.ok(catalogue.widestDrawing <= viewport.width);
      await screenshot(`qa-${viewport.name}-catalogue.png`);

      console.log(`QA ${viewport.name}: sélection`);
      await evaluate(`document.querySelector("#open-coloring-studio").click()`);
      await waitFor(
        `document.querySelector("#coloring-studio").open
          && [...document.querySelectorAll(".coloring-choice img")]
            .every((image) => image.complete && image.naturalWidth > 0)`,
      );
      const selection = await evaluate(`(() => ({
        choices: document.querySelectorAll(".coloring-choice").length,
        decoded: [...document.querySelectorAll(".coloring-choice img")]
          .filter((image) => image.naturalWidth > 0).length,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth
      }))()`);
      assert.deepEqual(selection, {
        choices: 4,
        decoded: 4,
        horizontalOverflow: false,
      });
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

      checks.push({ viewport, catalogue, selection, workspace });
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
