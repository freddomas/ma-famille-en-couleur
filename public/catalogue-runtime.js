const PAGE_COUNT = 10;
const ITEMS_PER_PAGE = 4;
const RANDOM_DRAWING_COUNT = 40;

const state = {
  catalogues: [],
  manifestEntries: [],
  selectedCatalogueId: null,
  selectedPage: 1,
  search: "",
  surpriseCatalogue: null,
  surpriseGeneration: 0,
  toastTimer: null,
  catalogueReturnTarget: null,
  coloring: {
    returnTarget: null,
    pageKey: null,
    pageEntries: [],
    selectedIds: new Set(),
    entries: [],
    activeIndex: 0,
    activeColor: "#ef3f4f",
    tool: "brush",
    size: 48,
    drawing: false,
    lastPoint: null,
    snapshots: new Map(),
    histories: new Map(),
    dirtyIds: new Set(),
    loadToken: 0,
  },
};

if (typeof window !== "undefined") {
  init();
}

async function init() {
  try {
    const [dataResponse, manifestResponse] = await Promise.all([
      fetch("/data/catalogues.json", { cache: "no-store" }),
      fetch("/assets/coloring/manifest.json", { cache: "no-store" }),
    ]);
    if (!dataResponse.ok || !manifestResponse.ok) {
      throw new Error(
        `Chargement impossible (catalogues ${dataResponse.status}, manifeste ${manifestResponse.status}).`,
      );
    }

    const [data, manifest] = await Promise.all([
      dataResponse.json(),
      manifestResponse.json(),
    ]);
    validateData(data, manifest);

    state.manifestEntries = manifest.entries;
    state.catalogues = data.catalogues.map((catalogue) => ({
      ...catalogue,
      entries: manifest.entries
        .filter((entry) => entry.catalogueId === catalogue.id)
        .sort(compareManifestPosition),
    }));
    state.selectedCatalogueId = state.catalogues[0].id;

    renderStats();
    renderHeroDrawing();
    installSurpriseGenerator();
    renderLibrary();
    renderCatalogueMenu();
    renderWorkspace();
    bindGlobalEvents();
  } catch (error) {
    console.error(error);
    renderAppError(error);
  }
}

function validateData(data, manifest) {
  if (!data || !Array.isArray(data.catalogues) || data.catalogues.length !== 10) {
    throw new Error("Le fichier JSON doit contenir exactement 10 catalogues.");
  }
  if (
    !manifest ||
    manifest.complete !== true ||
    !Array.isArray(manifest.entries) ||
    manifest.entries.length !== 400
  ) {
    throw new Error("Le manifeste doit contenir exactement 400 illustrations validées.");
  }

  const ids = new Set();
  const paths = new Set();
  for (const entry of manifest.entries) {
    if (entry.validationStatus !== "validated") {
      throw new Error(`Illustration non validée dans le manifeste : ${entry.id}.`);
    }
    if (!entry.id || ids.has(entry.id)) {
      throw new Error(`Identifiant dupliqué ou absent : ${entry.id || "inconnu"}.`);
    }
    if (!entry.path || paths.has(entry.path)) {
      throw new Error(`Chemin dupliqué ou absent : ${entry.path || "inconnu"}.`);
    }
    if (!entry.coloredPath) {
      throw new Error(`Jumeau coloré absent : ${entry.id}.`);
    }
    ids.add(entry.id);
    paths.add(entry.path);
  }

  for (const catalogue of data.catalogues) {
    if (!catalogue.id || !catalogue.title || !Array.isArray(catalogue.items)) {
      throw new Error("Un catalogue est incomplet.");
    }
    if (catalogue.items.length !== PAGE_COUNT * ITEMS_PER_PAGE) {
      throw new Error(`Le catalogue « ${catalogue.title} » doit contenir 40 dessins.`);
    }
    const entries = manifest.entries.filter(
      (entry) => entry.catalogueId === catalogue.id,
    );
    if (entries.length !== RANDOM_DRAWING_COUNT) {
      throw new Error(
        `Le manifeste doit contenir 40 images pour « ${catalogue.title} ».`,
      );
    }
    entries.sort(compareManifestPosition).forEach((entry, index) => {
      if (entry.title !== catalogue.items[index]) {
        throw new Error(
          `Titre incohérent pour ${entry.id}: « ${entry.title} » / « ${catalogue.items[index]} ».`,
        );
      }
    });
  }
}

function compareManifestPosition(left, right) {
  return left.page - right.page || left.position - right.position;
}

function renderStats() {
  setText("catalogue-count", state.catalogues.length);
  setText("page-count", state.catalogues.length * PAGE_COUNT);
  setText("drawing-count", state.manifestEntries.length);
  setText("sidebar-count", `${state.catalogues.length} thèmes`);
}

function renderHeroDrawing() {
  const target = document.getElementById("hero-drawing");
  if (!target) return;
  target.innerHTML = `
    <img
      class="hero-drawing__image"
      src="/assets/hero/enfants-coloriage.png"
      alt=""
      loading="eager"
      decoding="async"
    />
  `;
}

function installSurpriseGenerator() {
  if (document.getElementById("surprise-generator")) return;
  const library = document.getElementById("catalogues");
  if (!library) return;

  library.insertAdjacentHTML(
    "afterend",
    `
      <section id="surprise-generator" class="surprise section-shell" aria-labelledby="surprise-title">
        <div class="surprise__intro">
          <div>
            <p class="eyebrow"><span></span> Sélection locale et sans doublon</p>
            <h2 id="surprise-title">Créer un catalogue surprise</h2>
            <p>Quarante illustrations validées, dix pages stables, aucune image générée à distance.</p>
          </div>
          <button id="create-surprise" class="button button--ink" type="button">
            Créer un catalogue surprise
          </button>
        </div>
        <div class="surprise__progress">
          <p class="surprise__counter" aria-live="polite">
            <strong id="surprise-loaded">0 / 40 images chargées</strong>
          </p>
          <div
            class="surprise__track"
            role="progressbar"
            aria-label="Chargement du catalogue surprise"
            aria-valuemin="0"
            aria-valuemax="40"
            aria-valuenow="0"
          >
            <div id="surprise-bar" class="surprise__bar"></div>
          </div>
          <p id="surprise-status" class="surprise__status" aria-live="polite">
            Prêt à composer un nouveau catalogue.
          </p>
        </div>
        <div id="surprise-previews" class="surprise__previews" aria-label="Aperçus chargés"></div>
        <div class="surprise__actions">
          <button id="open-surprise" class="button button--paper" type="button" disabled>
            Ouvrir les 10 pages
          </button>
          <button id="print-surprise" class="button button--ink" type="button" disabled>
            Imprimer le catalogue surprise
          </button>
        </div>
      </section>
    `,
  );

  document
    .getElementById("create-surprise")
    ?.addEventListener("click", generateSurpriseCatalogue);
  document.getElementById("open-surprise")?.addEventListener("click", (event) => {
    if (!state.surpriseCatalogue) return;
    selectCatalogue(state.surpriseCatalogue.id, {
      open: true,
      trigger: event.currentTarget,
    });
  });
  document.getElementById("print-surprise")?.addEventListener("click", async () => {
    if (!state.surpriseCatalogue) return;
    await printEntries(state.surpriseCatalogue, "catalogue");
  });
}

function bindGlobalEvents() {
  document.getElementById("catalogue-search")?.addEventListener("input", (event) => {
    state.search = normalizeText(event.target.value.trim());
    renderLibrary();
  });
  document
    .getElementById("previous-page")
    ?.addEventListener("click", () => selectPage(state.selectedPage - 1));
  document
    .getElementById("next-page")
    ?.addEventListener("click", () => selectPage(state.selectedPage + 1));
  document.getElementById("print-page")?.addEventListener("click", async () => {
    const catalogue = selectedCatalogue();
    if (catalogue) await printEntries(catalogue, "page");
  });
  document.getElementById("print-catalogue")?.addEventListener("click", async () => {
    const catalogue = selectedCatalogue();
    if (catalogue) await printEntries(catalogue, "catalogue");
  });
  document
    .getElementById("close-catalogue")
    ?.addEventListener("click", closeCatalogueViewer);
  document
    .getElementById("open-coloring-studio")
    ?.addEventListener("click", openColoringStudio);
  document
    .getElementById("close-coloring-studio")
    ?.addEventListener("click", closeColoringStudio);
  document
    .getElementById("restart-coloring-selection")
    ?.addEventListener("click", showColoringSelection);
  document
    .getElementById("start-coloring")
    ?.addEventListener("click", startColoring);
  document
    .getElementById("toggle-coloring-guide")
    ?.addEventListener("click", toggleColoringGuide);
  document
    .getElementById("undo-coloring")
    ?.addEventListener("click", undoColoring);
  document
    .getElementById("clear-coloring")
    ?.addEventListener("click", clearColoring);
  document
    .getElementById("download-coloring")
    ?.addEventListener("click", downloadColoring);
  document
    .getElementById("coloring-studio")
    ?.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeColoringStudio();
    });
  bindColoringCanvas();
  document.addEventListener("click", handleColorFlipClick);
  window.addEventListener("beforeprint", resetColorFlips);
  window.addEventListener("afterprint", clearPrintArea);
  document.addEventListener(
    "error",
    (event) => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement) || !image.dataset.assetId) return;
      const wrapper = image.closest(".drawing-card__art, .catalogue-card__visual");
      if (wrapper) {
        wrapper.innerHTML = `<p class="asset-error" role="alert">Image indisponible : ${escapeHtml(image.dataset.assetId)}</p>`;
      }
    },
    true,
  );
  document.addEventListener("keydown", (event) => {
    if (document.getElementById("coloring-studio")?.open) return;
    if (
      event.key === "Escape" &&
      document.getElementById("atelier")?.classList.contains("is-catalogue-open")
    ) {
      event.preventDefault();
      closeCatalogueViewer();
      return;
    }
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (event.key === "ArrowLeft") selectPage(state.selectedPage - 1);
    if (event.key === "ArrowRight") selectPage(state.selectedPage + 1);
  });
}

function renderLibrary() {
  const list = document.getElementById("catalogue-list");
  const count = document.getElementById("library-result-count");
  const empty = document.getElementById("empty-state");
  if (!list || !count || !empty) return;

  const filtered = state.catalogues.filter((catalogue) =>
    normalizeText(
      [
        catalogue.title,
        catalogue.shortTitle,
        catalogue.eyebrow,
        catalogue.description,
        ...catalogue.entries.map((entry) => entry.title),
      ].join(" "),
    ).includes(state.search),
  );

  count.textContent = `${filtered.length} ${filtered.length > 1 ? "catalogues" : "catalogue"}`;
  empty.hidden = filtered.length > 0;
  list.innerHTML = filtered
    .map(
      (catalogue) => `
        <button
          class="catalogue-card"
          type="button"
          data-catalogue-id="${escapeAttribute(catalogue.id)}"
          style="--card-accent:${escapeAttribute(catalogue.accent)};--card-soft:${escapeAttribute(catalogue.soft)}"
          aria-label="Ouvrir le catalogue ${escapeAttribute(catalogue.title)}"
        >
          <span class="catalogue-card__visual">
            <span class="catalogue-card__media">
              ${imageMarkup(catalogue.entries[0], "catalogue-card__image")}
            </span>
          </span>
          <span class="catalogue-card__body">
            <span class="catalogue-card__eyebrow">${escapeHtml(catalogue.eyebrow)}</span>
            <span class="catalogue-card__title">${escapeHtml(catalogue.title)}</span>
            <span class="catalogue-card__meta">
              <span>40 dessins · ${escapeHtml(catalogue.age)}</span>
              <span class="catalogue-card__arrow" aria-hidden="true">↗</span>
            </span>
          </span>
        </button>
      `,
    )
    .join("");

  list.querySelectorAll("[data-catalogue-id]").forEach((button) => {
    bindPressActivation(button, () => {
      selectCatalogue(button.dataset.catalogueId, {
        open: true,
        trigger: button,
      });
    });
  });
}

function renderCatalogueMenu() {
  const menu = document.getElementById("catalogue-menu");
  if (!menu) return;
  const catalogues = state.surpriseCatalogue
    ? [...state.catalogues, state.surpriseCatalogue]
    : state.catalogues;
  menu.innerHTML = catalogues
    .map((catalogue) => {
      const active = catalogue.id === state.selectedCatalogueId;
      return `
        <button
          class="menu-item ${active ? "is-active" : ""}"
          type="button"
          data-menu-id="${escapeAttribute(catalogue.id)}"
          style="--menu-accent:${escapeAttribute(catalogue.accent)};--menu-soft:${escapeAttribute(catalogue.soft)}"
          aria-pressed="${active}"
        >
          <span class="menu-item__icon" aria-hidden="true">●</span>
          <span class="menu-item__text">
            <strong>${escapeHtml(catalogue.shortTitle)}</strong>
            <small>10 pages · 40 dessins</small>
          </span>
          <span class="menu-item__arrow" aria-hidden="true">›</span>
        </button>
      `;
    })
    .join("");
  menu.querySelectorAll("[data-menu-id]").forEach((button) => {
    bindPressActivation(button, () => selectCatalogue(button.dataset.menuId));
  });
}

function bindPressActivation(button, activate) {
  let touchStart = null;
  let lastTouchActivation = 0;

  button.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch" || !event.isPrimary) return;
    touchStart = { x: event.clientX, y: event.clientY };
  });

  button.addEventListener("pointercancel", () => {
    touchStart = null;
  });

  button.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "touch" || !event.isPrimary || !touchStart) return;
    const distance = Math.hypot(
      event.clientX - touchStart.x,
      event.clientY - touchStart.y,
    );
    touchStart = null;
    if (distance > 12) return;
    lastTouchActivation = Date.now();
    activate();
  });

  button.addEventListener("click", (event) => {
    const isSyntheticTouchClick =
      event.detail > 0 && Date.now() - lastTouchActivation < 700;
    if (!isSyntheticTouchClick) activate();
  });
}

function selectCatalogue(id, options = {}) {
  const catalogue =
    state.catalogues.find((item) => item.id === id) ||
    (state.surpriseCatalogue?.id === id ? state.surpriseCatalogue : null);
  if (!catalogue) return;
  state.selectedCatalogueId = id;
  state.selectedPage = 1;
  renderCatalogueMenu();
  renderWorkspace();
  if (options.open) openCatalogueViewer(options.trigger);
}

function openCatalogueViewer(trigger) {
  const atelier = document.getElementById("atelier");
  const closeButton = document.getElementById("close-catalogue");
  if (!atelier) return;

  state.catalogueReturnTarget =
    trigger instanceof HTMLElement ? trigger : document.activeElement;
  atelier.classList.add("is-catalogue-open");
  atelier.setAttribute("role", "dialog");
  atelier.setAttribute("aria-modal", "true");
  document.body.classList.add("catalogue-viewer-open");

  window.requestAnimationFrame(() => {
    closeButton?.focus({ preventScroll: true });
  });
}

function closeCatalogueViewer() {
  const atelier = document.getElementById("atelier");
  if (!atelier?.classList.contains("is-catalogue-open")) return;

  atelier.classList.remove("is-catalogue-open");
  atelier.removeAttribute("role");
  atelier.removeAttribute("aria-modal");
  document.body.classList.remove("catalogue-viewer-open");

  const returnTarget = state.catalogueReturnTarget;
  state.catalogueReturnTarget = null;
  if (returnTarget instanceof HTMLElement && returnTarget.isConnected) {
    returnTarget.focus({ preventScroll: true });
  }
}

const COLORING_COLORS = [
  { value: "#ef3f4f", label: "Rouge fraise" },
  { value: "#f47a2a", label: "Orange mandarine" },
  { value: "#f3c623", label: "Jaune soleil" },
  { value: "#39a86b", label: "Vert feuille" },
  { value: "#2684e8", label: "Bleu ciel" },
  { value: "#7454c7", label: "Violet" },
  { value: "#e84d9b", label: "Rose" },
  { value: "#875135", label: "Brun" },
];

function openColoringStudio(event) {
  const dialog = document.getElementById("coloring-studio");
  const catalogue = selectedCatalogue();
  const page = catalogue ? buildPages(catalogue)[state.selectedPage - 1] : null;
  if (!(dialog instanceof HTMLDialogElement) || !page) return;

  const pageKey = `${catalogue.id}:${state.selectedPage}`;
  state.coloring.returnTarget =
    event?.currentTarget instanceof HTMLElement
      ? event.currentTarget
      : document.activeElement;
  state.coloring.pageKey = pageKey;
  state.coloring.pageEntries = page.entries;
  state.coloring.selectedIds = new Set();
  state.coloring.entries = [];
  state.coloring.activeIndex = 0;
  state.coloring.snapshots = new Map();
  state.coloring.histories = new Map();
  state.coloring.dirtyIds = new Set();
  state.coloring.loadToken += 1;

  renderColoringPalette();
  renderColoringSelection();
  showColoringSelection();
  const atelier = document.getElementById("atelier");
  if (atelier?.classList.contains("is-catalogue-open")) {
    atelier.setAttribute("aria-hidden", "true");
  }
  dialog.showModal();
  document.body.classList.add("coloring-studio-open");
  window.requestAnimationFrame(() => {
    document.querySelector("[data-coloring-choice]")?.focus({
      preventScroll: true,
    });
  });
}

function closeColoringStudio() {
  const dialog = document.getElementById("coloring-studio");
  if (!(dialog instanceof HTMLDialogElement) || !dialog.open) return;
  stopColoringStroke();
  saveCurrentColoringSnapshot();
  dialog.close();
  document.body.classList.remove("coloring-studio-open");
  hideColoringGuide();
  document
    .getElementById("atelier")
    ?.removeAttribute("aria-hidden");

  const returnTarget = state.coloring.returnTarget;
  state.coloring.returnTarget = null;
  if (returnTarget instanceof HTMLElement && returnTarget.isConnected) {
    returnTarget.focus({ preventScroll: true });
  }
}

function renderColoringSelection() {
  const target = document.getElementById("coloring-choice-grid");
  if (!target) return;
  target.innerHTML = state.coloring.pageEntries
    .map(
      (entry, index) => `
        <button
          class="coloring-choice"
          type="button"
          data-coloring-choice="${escapeAttribute(entry.id)}"
          aria-pressed="false"
          aria-label="Choisir ${escapeAttribute(entry.title)}"
        >
          <span class="coloring-choice__number" aria-hidden="true">${index + 1}</span>
          <span class="coloring-choice__image-wrap">
            <img
              src="${escapeAttribute(entry.path)}"
              alt="${escapeAttribute(entry.title)}"
              data-asset-id="${escapeAttribute(entry.id)}-studio-choice"
              loading="eager"
              decoding="async"
            />
          </span>
          <strong>${escapeHtml(entry.title)}</strong>
          <span class="coloring-choice__check" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>
          </span>
        </button>
      `,
    )
    .join("");

  target.querySelectorAll("[data-coloring-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.coloringChoice;
      if (!id) return;
      if (state.coloring.selectedIds.has(id)) {
        state.coloring.selectedIds.delete(id);
      } else {
        state.coloring.selectedIds.add(id);
      }
      const selected = state.coloring.selectedIds.has(id);
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
      updateColoringSelectionStatus();
    });
  });

  target.querySelectorAll("img").forEach((image) => {
    image.addEventListener("error", () => {
      const choice = image.closest(".coloring-choice");
      if (!choice) return;
      choice.disabled = true;
      choice.classList.add("has-error");
      image.parentElement.innerHTML =
        '<p class="asset-error" role="alert">Ce dessin est indisponible.</p>';
    });
  });
  updateColoringSelectionStatus();
}

function updateColoringSelectionStatus() {
  const count = state.coloring.selectedIds.size;
  const status = document.getElementById("coloring-selection-status");
  const startButton = document.getElementById("start-coloring");
  if (status) {
    status.textContent =
      count === 0
        ? "Aucun dessin choisi"
        : `${count} dessin${count > 1 ? "s" : ""} choisi${count > 1 ? "s" : ""}`;
  }
  if (startButton) startButton.disabled = count === 0;
}

function showColoringSelection() {
  saveCurrentColoringSnapshot();
  stopColoringStroke();
  const selection = document.getElementById("coloring-selection");
  const workspace = document.getElementById("coloring-workspace");
  const restart = document.getElementById("restart-coloring-selection");
  if (selection) selection.hidden = false;
  if (workspace) workspace.hidden = true;
  if (restart) restart.hidden = true;
  hideColoringGuide();
  document.querySelector("[data-coloring-choice]")?.focus({
    preventScroll: true,
  });
}

function startColoring() {
  const entries = state.coloring.pageEntries.filter((entry) =>
    state.coloring.selectedIds.has(entry.id),
  );
  if (!entries.length) return;

  state.coloring.entries = entries;
  state.coloring.activeIndex = Math.min(
    state.coloring.activeIndex,
    entries.length - 1,
  );
  const selection = document.getElementById("coloring-selection");
  const workspace = document.getElementById("coloring-workspace");
  const restart = document.getElementById("restart-coloring-selection");
  if (selection) selection.hidden = true;
  if (workspace) workspace.hidden = false;
  if (restart) restart.hidden = false;
  renderColoringTabs();
  loadActiveColoring();
}

function renderColoringTabs() {
  const target = document.getElementById("coloring-drawing-tabs");
  if (!target) return;
  target.innerHTML = state.coloring.entries
    .map(
      (entry, index) => `
        <button
          class="coloring-drawing-tab ${index === state.coloring.activeIndex ? "is-active" : ""}"
          type="button"
          data-coloring-index="${index}"
          aria-current="${index === state.coloring.activeIndex ? "true" : "false"}"
          aria-label="Colorier ${escapeAttribute(entry.title)}"
        >
          <img src="${escapeAttribute(entry.path)}" alt="" aria-hidden="true" />
          <span>${index + 1}</span>
        </button>
      `,
    )
    .join("");
  target.querySelectorAll("[data-coloring-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.coloringIndex);
      if (!Number.isInteger(index) || index === state.coloring.activeIndex) return;
      saveCurrentColoringSnapshot();
      state.coloring.activeIndex = index;
      renderColoringTabs();
      loadActiveColoring();
    });
  });
}

function renderColoringPalette() {
  const target = document.getElementById("coloring-colors");
  if (!target) return;
  target.innerHTML = COLORING_COLORS.map(
    (color) => `
      <button
        class="coloring-color ${color.value === state.coloring.activeColor ? "is-active" : ""}"
        type="button"
        data-coloring-color="${escapeAttribute(color.value)}"
        style="--coloring-swatch:${escapeAttribute(color.value)}"
        aria-label="${escapeAttribute(color.label)}"
        aria-pressed="${color.value === state.coloring.activeColor}"
      ><span aria-hidden="true"></span></button>
    `,
  ).join("");

  target.querySelectorAll("[data-coloring-color]").forEach((button) => {
    button.addEventListener("click", () => {
      state.coloring.activeColor = button.dataset.coloringColor;
      setColoringTool("brush");
      target.querySelectorAll("[data-coloring-color]").forEach((item) => {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      announceColoring(
        button.getAttribute("aria-label") || "Nouvelle couleur choisie",
      );
    });
  });

  document.querySelectorAll("[data-coloring-tool]").forEach((button) => {
    if (button.dataset.coloringBound === "true") return;
    button.dataset.coloringBound = "true";
    button.addEventListener("click", () => {
      setColoringTool(button.dataset.coloringTool);
    });
  });
  document.querySelectorAll("[data-coloring-size]").forEach((button) => {
    if (button.dataset.coloringBound === "true") return;
    button.dataset.coloringBound = "true";
    button.addEventListener("click", () => {
      const size = Number(button.dataset.coloringSize);
      if (!Number.isFinite(size)) return;
      state.coloring.size = size;
      document.querySelectorAll("[data-coloring-size]").forEach((item) => {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      announceColoring(size <= 24 ? "Crayon fin" : "Gros crayon");
    });
  });
}

function setColoringTool(tool) {
  if (tool !== "brush" && tool !== "eraser") return;
  state.coloring.tool = tool;
  document.querySelectorAll("[data-coloring-tool]").forEach((button) => {
    const active = button.dataset.coloringTool === tool;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  announceColoring(tool === "eraser" ? "Gomme choisie" : "Crayon choisi");
}

function activeColoringEntry() {
  return state.coloring.entries[state.coloring.activeIndex] || null;
}

async function loadActiveColoring() {
  const entry = activeColoringEntry();
  const canvas = document.getElementById("coloring-canvas");
  const lineArt = document.getElementById("coloring-line-art");
  const lineArtLayer = document.getElementById("coloring-line-art-layer");
  const guide = document.getElementById("coloring-guide-image");
  const error = document.getElementById("coloring-canvas-error");
  if (
    !entry ||
    !(canvas instanceof HTMLCanvasElement) ||
    !(lineArt instanceof HTMLImageElement) ||
    !(lineArtLayer instanceof HTMLCanvasElement) ||
    !(guide instanceof HTMLImageElement)
  ) {
    return;
  }

  const loadToken = ++state.coloring.loadToken;
  stopColoringStroke();
  hideColoringGuide();
  if (error) error.hidden = true;
  canvas.hidden = true;
  lineArtLayer.hidden = true;
  lineArt.hidden = true;
  guide.hidden = true;
  lineArt.src = "";
  guide.src = "";
  lineArt.alt = "";
  guide.alt = `Modèle coloré : ${entry.title}`;

  try {
    await Promise.all([
      loadImageElement(lineArt, entry.path),
      loadImageElement(guide, entry.coloredPath),
    ]);
    if (loadToken !== state.coloring.loadToken) return;
    const sourceWidth = entry.width || lineArt.naturalWidth || 627;
    const sourceHeight = entry.height || lineArt.naturalHeight || 627;
    const canvasScale = Math.min(1, 768 / Math.max(sourceWidth, sourceHeight));
    canvas.width = Math.round(sourceWidth * canvasScale);
    canvas.height = Math.round(sourceHeight * canvasScale);
    lineArtLayer.width = canvas.width;
    lineArtLayer.height = canvas.height;
    const inkPixels = renderColoringLineArt(lineArt, lineArtLayer);
    if (inkPixels < 100) {
      throw new Error("le dessin ne contient pas de tracé visible");
    }
    await restoreColoringSnapshot(entry.id);
    canvas.hidden = false;
    lineArtLayer.hidden = false;
    updateColoringControls();
    document.getElementById("coloring-drawing-title").textContent = entry.title;
    announceColoring(`${entry.title} est prêt à colorier`);
  } catch (loadError) {
    if (loadToken !== state.coloring.loadToken) return;
    if (error) {
      error.hidden = false;
      error.textContent = `Ce dessin ne peut pas être chargé : ${loadError.message}`;
    }
    updateColoringControls(true);
  }
}

function loadImageElement(image, path) {
  return new Promise((resolve, reject) => {
    if (!path) {
      reject(new Error("chemin manquant"));
      return;
    }
    image.onload = async () => {
      try {
        if (typeof image.decode === "function") await image.decode();
        resolve();
      } catch (error) {
        reject(new Error(`${path} ne peut pas être décodée`));
      }
    };
    image.onerror = () => reject(new Error(`chargement impossible pour ${path}`));
    image.src = path;
  });
}

function renderColoringLineArt(image, target) {
  const context = target.getContext("2d", { willReadFrequently: true });
  if (!context) return 0;
  context.clearRect(0, 0, target.width, target.height);
  context.drawImage(image, 0, 0, target.width, target.height);
  const pixels = context.getImageData(0, 0, target.width, target.height);
  let inkPixels = 0;
  for (let index = 0; index < pixels.data.length; index += 4) {
    const sourceAlpha = pixels.data[index + 3] / 255;
    const luminance =
      pixels.data[index] * 0.2126 +
      pixels.data[index + 1] * 0.7152 +
      pixels.data[index + 2] * 0.0722;
    const ink = Math.max(0, Math.min(1, (238 - luminance) / 205));
    const alpha = Math.round(255 * ink * sourceAlpha);
    pixels.data[index] = 24;
    pixels.data[index + 1] = 39;
    pixels.data[index + 2] = 35;
    pixels.data[index + 3] = alpha;
    if (alpha > 24) inkPixels += 1;
  }
  context.putImageData(pixels, 0, 0);
  target.dataset.inkPixels = String(inkPixels);
  return inkPixels;
}

function bindColoringCanvas() {
  const canvas = document.getElementById("coloring-canvas");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  canvas.addEventListener("pointerdown", startColoringStroke);
  canvas.addEventListener("pointermove", continueColoringStroke);
  canvas.addEventListener("pointerup", stopColoringStroke);
  canvas.addEventListener("pointercancel", stopColoringStroke);
  canvas.addEventListener("lostpointercapture", stopColoringStroke);
}

function startColoringStroke(event) {
  if (event.button !== undefined && event.button !== 0) return;
  const canvas = event.currentTarget;
  if (!(canvas instanceof HTMLCanvasElement) || canvas.hidden) return;
  event.preventDefault();
  const entry = activeColoringEntry();
  if (!entry) return;
  pushColoringHistory(entry.id, canvas);
  state.coloring.drawing = true;
  state.coloring.lastPoint = coloringPoint(event, canvas);
  canvas.setPointerCapture?.(event.pointerId);
  drawColoringSegment(canvas, state.coloring.lastPoint, state.coloring.lastPoint);
}

function continueColoringStroke(event) {
  if (!state.coloring.drawing) return;
  const canvas = event.currentTarget;
  if (!(canvas instanceof HTMLCanvasElement)) return;
  event.preventDefault();
  const nextPoint = coloringPoint(event, canvas);
  drawColoringSegment(canvas, state.coloring.lastPoint, nextPoint);
  state.coloring.lastPoint = nextPoint;
}

function stopColoringStroke(event) {
  if (!state.coloring.drawing) return;
  if (event?.currentTarget instanceof HTMLCanvasElement) {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }
  state.coloring.drawing = false;
  state.coloring.lastPoint = null;
  const entry = activeColoringEntry();
  if (entry) state.coloring.dirtyIds.add(entry.id);
  updateColoringControls();
}

function coloringPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function drawColoringSegment(canvas, from, to) {
  if (!from || !to) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const scale = canvas.width / 627;
  context.save();
  context.globalCompositeOperation =
    state.coloring.tool === "eraser" ? "destination-out" : "source-over";
  context.strokeStyle = state.coloring.activeColor;
  context.fillStyle = state.coloring.activeColor;
  context.lineWidth = state.coloring.size * scale;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
  if (from.x === to.x && from.y === to.y) {
    context.beginPath();
    context.arc(to.x, to.y, context.lineWidth / 2, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function pushColoringHistory(id, canvas) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const history = state.coloring.histories.get(id) || [];
  history.push(context.getImageData(0, 0, canvas.width, canvas.height));
  if (history.length > 4) history.shift();
  state.coloring.histories.set(id, history);
}

function undoColoring() {
  const entry = activeColoringEntry();
  const canvas = document.getElementById("coloring-canvas");
  if (!entry || !(canvas instanceof HTMLCanvasElement)) return;
  const history = state.coloring.histories.get(entry.id) || [];
  const previous = history.pop();
  if (!previous) return;
  const context = canvas.getContext("2d");
  context?.putImageData(previous, 0, 0);
  state.coloring.histories.set(entry.id, history);
  state.coloring.dirtyIds.add(entry.id);
  updateColoringControls();
  announceColoring("Dernier trait annulé");
}

function clearColoring() {
  const entry = activeColoringEntry();
  const canvas = document.getElementById("coloring-canvas");
  if (!entry || !(canvas instanceof HTMLCanvasElement)) return;
  pushColoringHistory(entry.id, canvas);
  canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  state.coloring.dirtyIds.delete(entry.id);
  updateColoringControls();
  announceColoring("Le dessin est de nouveau blanc");
}

function saveCurrentColoringSnapshot() {
  const entry = activeColoringEntry();
  const canvas = document.getElementById("coloring-canvas");
  if (!entry || !(canvas instanceof HTMLCanvasElement) || canvas.hidden) return;
  state.coloring.snapshots.set(entry.id, canvas.toDataURL("image/png"));
}

async function restoreColoringSnapshot(id) {
  const canvas = document.getElementById("coloring-canvas");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const context = canvas.getContext("2d");
  context?.clearRect(0, 0, canvas.width, canvas.height);
  const snapshot = state.coloring.snapshots.get(id);
  if (!snapshot || !context) return;
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = snapshot;
  });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
}

function toggleColoringGuide() {
  const button = document.getElementById("toggle-coloring-guide");
  const guide = document.getElementById("coloring-guide-image");
  if (!button || !(guide instanceof HTMLImageElement) || !guide.complete) return;
  const show = guide.hidden;
  guide.hidden = !show;
  button.setAttribute("aria-pressed", String(show));
  button.textContent = show ? "Reprendre mon dessin" : "Voir le modèle";
  announceColoring(show ? "Modèle coloré affiché" : "Ton coloriage est affiché");
}

function hideColoringGuide() {
  const button = document.getElementById("toggle-coloring-guide");
  const guide = document.getElementById("coloring-guide-image");
  if (guide) guide.hidden = true;
  if (button) {
    button.setAttribute("aria-pressed", "false");
    button.textContent = "Voir le modèle";
  }
}

function updateColoringControls(disabled = false) {
  const entry = activeColoringEntry();
  const history = entry ? state.coloring.histories.get(entry.id) || [] : [];
  const undo = document.getElementById("undo-coloring");
  const clear = document.getElementById("clear-coloring");
  const download = document.getElementById("download-coloring");
  if (undo) undo.disabled = disabled || history.length === 0;
  if (clear) {
    clear.disabled =
      disabled || !entry || !state.coloring.dirtyIds.has(entry.id);
  }
  if (download) download.disabled = disabled || !entry;
}

async function downloadColoring() {
  const entry = activeColoringEntry();
  const source = document.getElementById("coloring-canvas");
  const lineArt = document.getElementById("coloring-line-art-layer");
  if (
    !entry ||
    !(source instanceof HTMLCanvasElement) ||
    !(lineArt instanceof HTMLCanvasElement) ||
    lineArt.hidden
  ) {
    return;
  }

  const output = document.createElement("canvas");
  output.width = source.width;
  output.height = source.height;
  const context = output.getContext("2d");
  if (!context) return;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(source, 0, 0);
  context.drawImage(lineArt, 0, 0, output.width, output.height);

  const link = document.createElement("a");
  link.download = `mon-coloriage-${slugify(entry.title)}.png`;
  link.href = output.toDataURL("image/png");
  link.click();
  announceColoring("Ton coloriage est enregistré");
}

function announceColoring(message) {
  const target = document.getElementById("coloring-live-status");
  if (target) target.textContent = message;
}

function slugify(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function selectPage(page) {
  const nextPage = Math.max(1, Math.min(PAGE_COUNT, page));
  if (nextPage === state.selectedPage) return;
  state.selectedPage = nextPage;
  renderWorkspace();
}

function renderWorkspace() {
  const catalogue = selectedCatalogue();
  if (!catalogue) return;
  renderCatalogueInfo(catalogue);
  renderPageNavigation();
  const viewer = document.getElementById("page-viewer");
  if (viewer) viewer.innerHTML = renderSheet(catalogue, state.selectedPage);
  const previous = document.getElementById("previous-page");
  const next = document.getElementById("next-page");
  if (previous) previous.disabled = state.selectedPage === 1;
  if (next) next.disabled = state.selectedPage === PAGE_COUNT;
}

function renderCatalogueInfo(catalogue) {
  const target = document.getElementById("catalogue-info");
  if (!target) return;
  target.innerHTML = `
    <div class="viewer__identity">
      <span
        class="viewer__icon"
        style="background:${escapeAttribute(catalogue.soft)};color:${escapeAttribute(catalogue.accent)}"
        aria-hidden="true"
      >●</span>
      <div>
        <h3>${escapeHtml(catalogue.title)}</h3>
        <p>${escapeHtml(catalogue.description)}</p>
      </div>
    </div>
    <div class="viewer__badges" aria-label="Informations">
      <span class="soft-badge">${escapeHtml(catalogue.age)}</span>
      ${catalogue.skills.map((skill) => `<span class="soft-badge">${escapeHtml(skill)}</span>`).join("")}
    </div>
  `;
}

function renderPageNavigation() {
  const target = document.getElementById("page-list");
  if (!target) return;
  target.innerHTML = Array.from({ length: PAGE_COUNT }, (_, index) => {
    const page = index + 1;
    const active = page === state.selectedPage;
    return `
      <button
        class="page-pill ${active ? "is-active" : ""}"
        type="button"
        data-page="${page}"
        aria-label="Afficher la page ${page}"
        aria-current="${active ? "page" : "false"}"
      >${page}</button>
    `;
  }).join("");
  target.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => selectPage(Number(button.dataset.page)));
  });
}

function buildPages(catalogue) {
  return Array.from({ length: PAGE_COUNT }, (_, pageIndex) => ({
    number: pageIndex + 1,
    entries: catalogue.entries.slice(
      pageIndex * ITEMS_PER_PAGE,
      pageIndex * ITEMS_PER_PAGE + ITEMS_PER_PAGE,
    ),
  }));
}

function renderSheet(catalogue, pageNumber) {
  const page = buildPages(catalogue)[pageNumber - 1];
  if (!page || page.entries.length !== ITEMS_PER_PAGE) {
    return `<p class="asset-error" role="alert">Page ${pageNumber} incomplète.</p>`;
  }
  return `
    <article
      class="colouring-sheet"
      style="--sheet-accent:${escapeAttribute(catalogue.accent)}"
      aria-label="${escapeAttribute(catalogue.title)}, page ${pageNumber}"
    >
      <header class="sheet-header">
        <span class="sheet-header__brand">
          <strong>Ma famille en couleur</strong>
          <small>Mon cahier de coloriage</small>
        </span>
        <span class="sheet-header__meta">
          <span>${escapeHtml(catalogue.shortTitle)} · Planche</span>
          <strong class="sheet-page-number">${pageNumber}</strong>
        </span>
      </header>
      <div class="sheet-grid">
        ${page.entries
          .map(
            (entry) => `
              <section class="drawing-card">
                <div class="drawing-card__art">
                  ${colorFlipMarkup(entry, "drawing-card__image")}
                </div>
                <div class="drawing-card__footer">
                  <strong>${escapeHtml(entry.title)}</strong>
                  <span>Clique pour retourner la carte</span>
                </div>
              </section>
            `,
          )
          .join("")}
      </div>
      <footer class="sheet-footer">
        <span>Mon prénom : ____________________</span>
        <span>Page ${pageNumber} / ${PAGE_COUNT}</span>
      </footer>
    </article>
  `;
}

function imageMarkup(entry, className) {
  if (!entry?.path) {
    return `<p class="asset-error" role="alert">Chemin d’image manquant.</p>`;
  }
  return `
    <img
      class="${escapeAttribute(className)}"
      src="${escapeAttribute(entry.path)}"
      alt="${escapeAttribute(entry.title)}"
      data-asset-id="${escapeAttribute(entry.id)}"
      data-line-art-src="${escapeAttribute(entry.path)}"
      data-colored-src="${escapeAttribute(entry.coloredPath || "")}"
      loading="eager"
      decoding="async"
    />
  `;
}

function colorFlipMarkup(entry, imageClass) {
  if (!entry?.path || !entry?.coloredPath) {
    return `<p class="asset-error" role="alert">Paire d’images manquante.</p>`;
  }
  return `
    <button
      class="color-flip-card"
      type="button"
      data-color-flip
      aria-pressed="false"
      aria-label="Afficher la version coloriée de ${escapeAttribute(entry.title)}"
    >
      <span class="color-flip-card__inner">
        <img
          class="${escapeAttribute(imageClass)} color-flip-card__face color-flip-card__front"
          src="${escapeAttribute(entry.path)}"
          alt="${escapeAttribute(entry.title)}"
          data-asset-id="${escapeAttribute(entry.id)}"
          loading="eager"
          decoding="async"
        />
        <img
          class="color-flip-card__image color-flip-card__face color-flip-card__back"
          src="${escapeAttribute(entry.coloredPath)}"
          alt=""
          aria-hidden="true"
          data-asset-id="${escapeAttribute(entry.id)}-color"
          loading="eager"
          decoding="async"
        />
      </span>
    </button>
  `;
}

function handleColorFlipClick(event) {
  if (!(event.target instanceof Element)) return;
  const card = event.target.closest("[data-color-flip]");
  if (!card) return;
  const showColor = !card.classList.contains("is-color-visible");
  card.classList.toggle("is-color-visible", showColor);
  card.setAttribute("aria-pressed", String(showColor));
  const title = card.querySelector(".color-flip-card__front")?.alt || "l’image";
  card.setAttribute(
    "aria-label",
    showColor
      ? `Afficher la version noir et blanc de ${title}`
      : `Afficher la version coloriée de ${title}`,
  );
}

function resetColorFlips() {
  document.querySelectorAll("[data-color-flip].is-color-visible").forEach((card) => {
    card.classList.remove("is-color-visible");
    card.setAttribute("aria-pressed", "false");
  });
}

async function generateSurpriseCatalogue() {
  const generation = ++state.surpriseGeneration;
  const createButton = document.getElementById("create-surprise");
  const openButton = document.getElementById("open-surprise");
  const printButton = document.getElementById("print-surprise");
  const previews = document.getElementById("surprise-previews");
  const status = document.getElementById("surprise-status");

  state.surpriseCatalogue = null;
  if (createButton) createButton.disabled = true;
  if (openButton) openButton.disabled = true;
  if (printButton) printButton.disabled = true;
  if (previews) previews.innerHTML = "";
  updateSurpriseProgress(0);
  if (status) {
    status.classList.remove("is-error");
    status.textContent = "Sélection des illustrations validées…";
  }

  try {
    const pool = state.manifestEntries.filter(
      (entry) => entry.validationStatus === "validated",
    );
    if (pool.length < RANDOM_DRAWING_COUNT) {
      throw new Error(
        `Seulement ${pool.length} images validées sont disponibles; 40 sont requises.`,
      );
    }
    const selected = buildRandomSelection(pool, RANDOM_DRAWING_COUNT);

    await loadEntriesProgressively(
      selected,
      (entry) => decodeImage(entry.path),
      (entry, loaded) => {
        appendSurprisePreview(entry);
        updateSurpriseProgress(loaded);
        if (status) {
          status.textContent = `Chargement réel : ${loaded} image${loaded > 1 ? "s" : ""} décodée${loaded > 1 ? "s" : ""}.`;
        }
      },
      () => generation === state.surpriseGeneration,
    );
    if (generation !== state.surpriseGeneration) return;

    state.surpriseCatalogue = {
      id: "catalogue-surprise",
      title: "Mon catalogue surprise",
      shortTitle: "Surprise",
      eyebrow: "Une sélection unique",
      description:
        "Quarante illustrations locales choisies sans remise dans les dix univers.",
      accent: "#D66A24",
      soft: "#FFF1E6",
      age: "2–3 ans",
      skills: ["Découverte", "Imagination"],
      entries: selected,
    };
    if (openButton) openButton.disabled = false;
    if (printButton) printButton.disabled = false;
    if (status) status.textContent = "Catalogue prêt : 10 pages et 40 images distinctes.";
    renderCatalogueMenu();
  } catch (error) {
    state.surpriseCatalogue = null;
    if (status) {
      status.classList.add("is-error");
      status.textContent = `Échec : ${error.message}`;
    }
    if (openButton) openButton.disabled = true;
    if (printButton) printButton.disabled = true;
  } finally {
    if (createButton) {
      createButton.disabled = false;
      createButton.textContent = "Créer une nouvelle sélection";
    }
  }
}

function buildRandomSelection(pool, count, randomInt = cryptoRandomInt) {
  if (!Array.isArray(pool) || pool.length < count) {
    throw new Error(`Pool insuffisant : ${pool?.length || 0} / ${count}.`);
  }
  const shuffled = pool.slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled.slice(0, count);
}

async function loadEntriesProgressively(
  entries,
  decode,
  onLoaded,
  shouldContinue = () => true,
) {
  let loaded = 0;
  for (const [index, entry] of entries.entries()) {
    if (!shouldContinue()) return loaded;
    await decode(entry, index);
    if (!shouldContinue()) return loaded;
    loaded += 1;
    onLoaded(entry, loaded);
  }
  return loaded;
}

function cryptoRandomInt(maxExclusive) {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error("Borne aléatoire invalide.");
  }
  if (typeof crypto === "undefined" || !crypto.getRandomValues) {
    throw new Error("crypto.getRandomValues est indisponible.");
  }
  const range = 0x100000000;
  const limit = range - (range % maxExclusive);
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % maxExclusive;
}

function decodeImage(path) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = async () => {
      try {
        if (typeof image.decode === "function") await image.decode();
        resolve();
      } catch (error) {
        reject(new Error(`${path} ne peut pas être décodée : ${error.message}`));
      }
    };
    image.onerror = () => reject(new Error(`chargement impossible pour ${path}`));
    image.src = path;
  });
}

function appendSurprisePreview(entry) {
  const target = document.getElementById("surprise-previews");
  if (!target) return;
  const figure = document.createElement("figure");
  figure.className = "surprise__preview";
  figure.innerHTML = `
    ${colorFlipMarkup(entry, "surprise__preview-image")}
    <figcaption>
      <strong>${escapeHtml(entry.title)}</strong>
      <span>${escapeHtml(entry.catalogueTitle)}</span>
    </figcaption>
  `;
  target.appendChild(figure);
}

function updateSurpriseProgress(loaded) {
  const value = Math.max(0, Math.min(RANDOM_DRAWING_COUNT, loaded));
  const counter = document.getElementById("surprise-loaded");
  const bar = document.getElementById("surprise-bar");
  const progress = document.querySelector(
    '#surprise-generator [role="progressbar"]',
  );
  if (counter) counter.textContent = `${value} / 40 images chargées`;
  if (bar) bar.style.transform = `scaleX(${value / RANDOM_DRAWING_COUNT})`;
  if (progress) {
    progress.setAttribute("aria-valuenow", String(value));
    progress.setAttribute("aria-valuetext", `${value} images chargées sur 40`);
  }
}

async function printEntries(catalogue, mode) {
  const pages =
    mode === "catalogue"
      ? buildPages(catalogue).map((page) => page.number)
      : [state.selectedPage];
  const entries = pages.flatMap(
    (pageNumber) => buildPages(catalogue)[pageNumber - 1].entries,
  );
  try {
    showToast(`Vérification de ${entries.length} image${entries.length > 1 ? "s" : ""} avant impression…`);
    for (const entry of entries) await decodeImage(entry.path);
    const target = document.getElementById("print-area");
    if (!target) return;
    target.innerHTML = pages
      .map((pageNumber) => renderSheet(catalogue, pageNumber))
      .join("");
    target.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-printing");
    showToast(
      mode === "catalogue"
        ? "Catalogue complet prêt pour l’impression A4."
        : "Page prête pour l’impression A4.",
    );
    requestAnimationFrame(() => window.print());
  } catch (error) {
    showToast(`Impression bloquée : ${error.message}`);
  }
}

function clearPrintArea() {
  const target = document.getElementById("print-area");
  if (target) {
    target.innerHTML = "";
    target.setAttribute("aria-hidden", "true");
  }
  document.body.classList.remove("is-printing");
}

function selectedCatalogue() {
  return (
    state.catalogues.find(
      (catalogue) => catalogue.id === state.selectedCatalogueId,
    ) ||
    (state.surpriseCatalogue?.id === state.selectedCatalogueId
      ? state.surpriseCatalogue
      : null)
  );
}

function showToast(message) {
  const toast = document.getElementById("status-toast");
  if (!toast) return;
  window.clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  state.toastTimer = window.setTimeout(
    () => toast.classList.remove("is-visible"),
    3600,
  );
}

function renderAppError(error) {
  document.body.innerHTML = `
    <main class="app-error">
      <h2>Le catalogue n’a pas pu être chargé.</h2>
      <p>${escapeHtml(error?.message || "Erreur inconnue.")}</p>
      <p>Relancez l’application avec <code>npm run dev</code>.</p>
    </main>
  `;
}

function normalizeText(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = String(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    PAGE_COUNT,
    ITEMS_PER_PAGE,
    RANDOM_DRAWING_COUNT,
    buildRandomSelection,
    buildPages,
    loadEntriesProgressively,
    validateData,
  };
}
