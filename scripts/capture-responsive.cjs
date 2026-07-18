const fs = require("node:fs");
const path = require("node:path");

const endpoint = process.argv[2];
const appUrl = process.argv[3] || "http://127.0.0.1:3000/";

if (!endpoint) {
  throw new Error("Endpoint Chrome DevTools manquant.");
}

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "qa");
fs.mkdirSync(outputDir, { recursive: true });

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function connect() {
  const targets = await fetch(`${endpoint}/json`).then((response) => response.json());
  const target = targets.find((item) => item.type === "page");
  if (!target) throw new Error("Aucune page Chrome disponible.");

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 0;

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const handler = pending.get(message.id);
    if (!handler) return;
    pending.delete(message.id);
    if (message.error) handler.reject(new Error(message.error.message));
    else handler.resolve(message.result);
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

  return { socket, call };
}

async function main() {
  console.log("Connexion à Chrome…");
  const { socket, call } = await connect();
  console.log("Chrome connecté.");

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

  const waitFor = async (expression, timeout = 20_000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await evaluate(expression)) return;
      await delay(80);
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

  const capture = async (prefix, width, height, mobile) => {
    console.log(`Capture ${prefix} (${width}x${height})…`);
    await call("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile,
    });
    await call("Page.navigate", { url: appUrl });
    await waitFor(
      `document.readyState === "complete" && document.querySelectorAll(".catalogue-card").length === 10`,
    );
    console.log(`${prefix}: catalogue prêt.`);
    await screenshot(`${prefix}-hero.png`);
    await evaluate(
      `document.querySelector("#nouveautes").scrollIntoView({ block: "start", behavior: "instant" })`,
    );
    await delay(200);
    await screenshot(`${prefix}-weekly.png`);
    console.log(`${prefix}: captures écrites.`);
  };

  try {
    await call("Page.enable");
    await call("Runtime.enable");
    await capture("next-visual-desktop", 1440, 1000, false);
    await capture("next-visual-mobile", 390, 844, true);
  } finally {
    socket.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
