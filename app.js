const state = {
  catalogues: [],
  selectedCatalogueId: null,
  selectedPage: 1,
  search: "",
  toastTimer: null,
};

const PAGE_COUNT = 10;
const ITEMS_PER_PAGE = 4;
const SPRITE_ASSETS = {
  animal: "assets/coloring/animals-toddlers.png",
  vehicle: "assets/coloring/vehicles-toddlers.png",
  number: "assets/coloring/numbers-toddlers.png",
  shape: "assets/coloring/shapes-toddlers.png",
  fruit: "assets/coloring/fruits-toddlers.png",
  vegetable: "assets/coloring/vegetables-toddlers.png",
  home: "assets/coloring/home-toddlers.png",
  building: "assets/coloring/buildings-toddlers.png",
  nature: "assets/coloring/nature-toddlers.png",
  people: "assets/coloring/people-toddlers.png",
};

if (typeof window !== "undefined") {
  init();
}

async function init() {
  try {
    const response = await fetch("data/catalogues.json");
    if (!response.ok) {
      throw new Error(`Réponse HTTP ${response.status}`);
    }

    const data = await response.json();
    validateData(data);

    state.catalogues = data.catalogues;
    state.selectedCatalogueId = data.catalogues[0].id;

    renderStats(data.meta);
    renderHeroDrawing();
    renderLibrary();
    renderCatalogueMenu();
    renderWorkspace();
    bindGlobalEvents();
  } catch (error) {
    console.error(error);
    renderAppError();
  }
}

function validateData(data) {
  if (!data || !Array.isArray(data.catalogues) || data.catalogues.length !== 10) {
    throw new Error("Le fichier JSON doit contenir exactement 10 catalogues.");
  }

  data.catalogues.forEach((catalogue) => {
    if (!catalogue.id || !catalogue.title || !catalogue.type) {
      throw new Error("Un catalogue est incomplet.");
    }

    if (!Array.isArray(catalogue.items) || catalogue.items.length !== PAGE_COUNT * ITEMS_PER_PAGE) {
      throw new Error(`Le catalogue « ${catalogue.title} » doit contenir exactement 40 dessins.`);
    }

    if (new Set(catalogue.items).size !== catalogue.items.length) {
      throw new Error(`Le catalogue « ${catalogue.title} » contient des doublons.`);
    }
  });
}

function renderStats(meta) {
  const catalogueCount = state.catalogues.length;
  const pageCount = catalogueCount * PAGE_COUNT;
  const drawingCount = pageCount * ITEMS_PER_PAGE;

  setText("catalogue-count", meta?.catalogueCount ?? catalogueCount);
  setText("page-count", pageCount);
  setText("drawing-count", drawingCount);
  setText("sidebar-count", `${catalogueCount} thèmes`);
}

function renderHeroDrawing() {
  const animalCatalogue = state.catalogues.find((catalogue) => catalogue.type === "animal");
  const target = document.getElementById("hero-drawing");
  if (!animalCatalogue || !target) return;

  target.innerHTML = renderDrawingArt(animalCatalogue, animalCatalogue.items[0], 0);
}

function bindGlobalEvents() {
  const search = document.getElementById("catalogue-search");
  const previous = document.getElementById("previous-page");
  const next = document.getElementById("next-page");
  const printPage = document.getElementById("print-page");
  const printCatalogue = document.getElementById("print-catalogue");

  search?.addEventListener("input", (event) => {
    state.search = normalizeText(event.target.value.trim());
    renderLibrary();
  });

  previous?.addEventListener("click", () => selectPage(state.selectedPage - 1));
  next?.addEventListener("click", () => selectPage(state.selectedPage + 1));
  printPage?.addEventListener("click", () => preparePrint("page"));
  printCatalogue?.addEventListener("click", () => preparePrint("catalogue"));

  window.addEventListener("afterprint", clearPrintArea);

  document.addEventListener("keydown", (event) => {
    const activeTag = document.activeElement?.tagName;
    if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;

    if (event.key === "ArrowLeft" && state.selectedPage > 1) {
      selectPage(state.selectedPage - 1);
    }

    if (event.key === "ArrowRight" && state.selectedPage < PAGE_COUNT) {
      selectPage(state.selectedPage + 1);
    }
  });
}

function renderLibrary() {
  const list = document.getElementById("catalogue-list");
  const count = document.getElementById("library-result-count");
  const empty = document.getElementById("empty-state");
  if (!list || !count || !empty) return;

  const filtered = state.catalogues.filter((catalogue) => {
    const haystack = normalizeText(
      [
        catalogue.title,
        catalogue.shortTitle,
        catalogue.eyebrow,
        catalogue.description,
        ...catalogue.items,
      ].join(" "),
    );

    return haystack.includes(state.search);
  });

  count.textContent = `${filtered.length} ${filtered.length > 1 ? "catalogues" : "catalogue"}`;
  empty.hidden = filtered.length > 0;
  list.innerHTML = filtered
    .map((catalogue) => {
      const previewIndex = previewIndexFor(catalogue.type);
      return `
        <button
          class="catalogue-card"
          type="button"
          data-catalogue-id="${escapeAttribute(catalogue.id)}"
          style="--card-accent:${escapeAttribute(catalogue.accent)};--card-soft:${escapeAttribute(catalogue.soft)}"
          aria-label="Ouvrir le catalogue ${escapeAttribute(catalogue.title)}"
        >
          <span class="catalogue-card__visual">
            ${renderCataloguePreview(catalogue, previewIndex)}
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
      `;
    })
    .join("");

  list.querySelectorAll("[data-catalogue-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectCatalogue(button.dataset.catalogueId, { scroll: true });
    });
  });
}

function previewIndexFor(type) {
  return {
    animal: 4,
    vehicle: 20,
    number: 11,
    shape: 14,
    fruit: 7,
    vegetable: 24,
    home: 4,
    building: 3,
    nature: 15,
    people: 33,
  }[type] ?? 0;
}

function renderCatalogueMenu() {
  const menu = document.getElementById("catalogue-menu");
  if (!menu) return;

  menu.innerHTML = state.catalogues
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
          <span class="menu-item__icon">${renderIcon(catalogue.icon)}</span>
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
    button.addEventListener("click", () => selectCatalogue(button.dataset.menuId));
  });
}

function selectCatalogue(id, options = {}) {
  const catalogue = state.catalogues.find((item) => item.id === id);
  if (!catalogue) return;

  state.selectedCatalogueId = id;
  state.selectedPage = 1;
  renderCatalogueMenu();
  renderWorkspace();

  if (options.scroll) {
    document.getElementById("atelier")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function selectPage(pageNumber) {
  const nextPage = Math.max(1, Math.min(PAGE_COUNT, pageNumber));
  if (nextPage === state.selectedPage) return;
  state.selectedPage = nextPage;
  renderWorkspace();
}

function renderWorkspace() {
  const catalogue = selectedCatalogue();
  if (!catalogue) return;

  renderCatalogueInfo(catalogue);
  renderPageNavigation();

  const pageViewer = document.getElementById("page-viewer");
  if (pageViewer) {
    pageViewer.innerHTML = renderSheet(catalogue, state.selectedPage);
  }

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
      >
        ${renderIcon(catalogue.icon)}
      </span>
      <div>
        <h3>${escapeHtml(catalogue.title)}</h3>
        <p>${escapeHtml(catalogue.description)}</p>
      </div>
    </div>
    <div class="viewer__badges" aria-label="Informations pédagogiques">
      <span class="soft-badge">${escapeHtml(catalogue.age)}</span>
      ${catalogue.skills.map((skill) => `<span class="soft-badge">${escapeHtml(skill)}</span>`).join("")}
    </div>
  `;
}

function renderPageNavigation() {
  const target = document.getElementById("page-list");
  if (!target) return;

  target.innerHTML = Array.from({ length: PAGE_COUNT }, (_, index) => {
    const pageNumber = index + 1;
    const active = pageNumber === state.selectedPage;
    return `
      <button
        class="page-pill ${active ? "is-active" : ""}"
        type="button"
        data-page="${pageNumber}"
        aria-label="Afficher la page ${pageNumber}"
        aria-current="${active ? "page" : "false"}"
      >
        ${pageNumber}
      </button>
    `;
  }).join("");

  target.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => selectPage(Number(button.dataset.page)));
  });
}

function buildPages(catalogue) {
  return Array.from({ length: PAGE_COUNT }, (_, pageIndex) => ({
    number: pageIndex + 1,
    items: catalogue.items.slice(
      pageIndex * ITEMS_PER_PAGE,
      pageIndex * ITEMS_PER_PAGE + ITEMS_PER_PAGE,
    ),
  }));
}

function renderSheet(catalogue, pageNumber) {
  const page = buildPages(catalogue)[pageNumber - 1];
  const startIndex = (pageNumber - 1) * ITEMS_PER_PAGE;

  return `
    <article
      class="colouring-sheet"
      style="--sheet-accent:${escapeAttribute(catalogue.accent)}"
      aria-label="${escapeAttribute(catalogue.title)}, page ${pageNumber}"
    >
      <header class="sheet-header">
        <span class="sheet-header__brand">
          <strong>Ma famille en couleur</strong>
          <small>Mon catalogue de coloriage</small>
        </span>
        <span class="sheet-header__meta">
          <span>${escapeHtml(catalogue.shortTitle)} · Planche</span>
          <span class="sheet-page-number">${pageNumber}</span>
        </span>
      </header>

      <div class="sheet-grid">
        ${page.items
          .map(
            (title, itemIndex) => `
              <section class="drawing-card">
                <div class="drawing-card__art">
                  ${renderDrawingArt(catalogue, title, startIndex + itemIndex)}
                </div>
                <div class="drawing-card__footer">
                  <strong>${escapeHtml(title)}</strong>
                  <span>Observe · Imagine · Colorie</span>
                </div>
              </section>
            `,
          )
          .join("")}
      </div>

      <footer class="sheet-footer">
        <span>Prénom : ____________________</span>
        <span>Page ${pageNumber} / ${PAGE_COUNT}</span>
      </footer>
    </article>
  `;
}

function preparePrint(mode) {
  const catalogue = selectedCatalogue();
  const target = document.getElementById("print-area");
  if (!catalogue || !target) return;

  const pages = mode === "catalogue" ? buildPages(catalogue).map((page) => page.number) : [state.selectedPage];
  target.innerHTML = pages.map((pageNumber) => renderSheet(catalogue, pageNumber)).join("");
  target.setAttribute("aria-hidden", "false");

  showToast(
    mode === "catalogue"
      ? "Le catalogue complet est prêt : vérifiez le format A4 dans la fenêtre d’impression."
      : "La planche affichée est prête à imprimer au format A4.",
  );

  requestAnimationFrame(() => window.print());
}

function clearPrintArea() {
  const target = document.getElementById("print-area");
  if (!target) return;
  target.innerHTML = "";
  target.setAttribute("aria-hidden", "true");
}

function selectedCatalogue() {
  return state.catalogues.find((catalogue) => catalogue.id === state.selectedCatalogueId);
}

function showToast(message) {
  const toast = document.getElementById("status-toast");
  if (!toast) return;

  window.clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  state.toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 3600);
}

function renderAppError() {
  document.body.innerHTML = `
    <main class="app-error">
      <h2>Le catalogue n’a pas pu être chargé.</h2>
      <p>
        Ouvrez ce projet avec un petit serveur local afin que le navigateur puisse lire
        <code>data/catalogues.json</code>.
      </p>
      <p><code>python -m http.server 8080</code></p>
    </main>
  `;
}

function renderIcon(name) {
  const icons = {
    paw: `<svg viewBox="0 0 24 24"><circle cx="7" cy="7" r="2"/><circle cx="17" cy="7" r="2"/><circle cx="4.5" cy="12" r="2"/><circle cx="19.5" cy="12" r="2"/><path d="M7.5 17c0-3 2-5 4.5-5s4.5 2 4.5 5c0 2-1.7 3-4.5 3s-4.5-1-4.5-3Z"/></svg>`,
    car: `<svg viewBox="0 0 24 24"><path d="M3 15V9l2-4h12l3 4 1 6"/><path d="M4 15h16M7 9h10"/><circle cx="7" cy="16" r="2"/><circle cx="17" cy="16" r="2"/></svg>`,
    number: `<svg viewBox="0 0 24 24"><path d="M6 5h3v14M5 19h8M14 8c0-2 1-3 3-3s3 1 3 3c0 4-6 5-6 11h7"/></svg>`,
    shapes: `<svg viewBox="0 0 24 24"><circle cx="7" cy="7" r="4"/><path d="m17 3 4 7h-8Z"/><rect x="4" y="14" width="7" height="7" rx="1"/><path d="m17.5 14 4 4-4 4-4-4Z"/></svg>`,
    fruit: `<svg viewBox="0 0 24 24"><path d="M12 8c-3-4-8-2-8 4 0 5 3 8 8 8s8-3 8-8c0-6-5-8-8-4Z"/><path d="M12 8c0-3 2-5 5-5M12 6c-2-2-4-2-6-1"/></svg>`,
    leaf: `<svg viewBox="0 0 24 24"><path d="M4 20c1-9 7-15 16-16 0 9-6 15-16 16Z"/><path d="M5 19c4-4 8-7 12-10"/></svg>`,
    chair: `<svg viewBox="0 0 24 24"><path d="M7 12V4h10v8M5 10v6h14v-6M7 16v5M17 16v5"/></svg>`,
    building: `<svg viewBox="0 0 24 24"><path d="M4 21V7l8-4 8 4v14M2 21h20"/><path d="M8 9h2v2H8zM14 9h2v2h-2zM8 14h2v2H8zM14 14h2v7h-2z"/></svg>`,
    sun: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>`,
    spark: `<svg viewBox="0 0 24 24"><path d="M12 2c1 6 4 9 10 10-6 1-9 4-10 10-1-6-4-9-10-10 6-1 9-4 10-10Z"/><path d="M19 2c.3 2 1 2.7 3 3-2 .3-2.7 1-3 3-.3-2-1-2.7-3-3 2-.3 2.7-1 3-3Z"/></svg>`,
  };

  return icons[name] ?? icons.spark;
}

function renderCataloguePreview(catalogue, fallbackIndex) {
  if (SPRITE_ASSETS[catalogue.type]) {
    return renderSpriteArt(catalogue, catalogue.items[0], 0, true);
  }

  return renderLineArt(catalogue, catalogue.items[fallbackIndex], fallbackIndex);
}

function renderDrawingArt(catalogue, title, index) {
  if (index < ITEMS_PER_PAGE && SPRITE_ASSETS[catalogue.type]) {
    return renderSpriteArt(catalogue, title, index);
  }

  return renderLineArt(catalogue, title, index);
}

function renderSpriteArt(catalogue, title, index, lazy = false) {
  const source = SPRITE_ASSETS[catalogue.type];
  if (!source) return renderLineArt(catalogue, title, index);

  return `
    <div
      class="sprite-crop sprite-crop--${index % ITEMS_PER_PAGE}"
      role="img"
      aria-label="${escapeAttribute(title)}"
    >
      <img
        src="${escapeAttribute(source)}"
        alt=""
        ${lazy ? 'loading="lazy"' : ""}
        decoding="async"
        draggable="false"
      />
    </div>
  `;
}

function renderLineArt(catalogue, title, index, options = {}) {
  const renderers = {
    animal: () => renderAnimal(index),
    vehicle: () => renderVehicle(index),
    number: () => renderNumber(index, title),
    shape: () => renderShape(index),
    fruit: () => renderFruit(index),
    vegetable: () => renderVegetable(index),
    home: () => renderHome(index),
    building: () => renderBuilding(index),
    nature: () => renderNature(index),
    people: () => renderPerson(index),
  };

  const seed = hashString(`${catalogue.id}-${index}-${title}`);
  const decoration = options.decorative === true ? renderDecoration(seed) : "";
  const renderer = renderers[catalogue.type];
  const body = renderer ? renderer() : renderFallback(index);
  return svg(`${decoration}${body}`, title);
}

function svg(body, label) {
  return `
    <svg
      class="line-art-svg"
      viewBox="0 0 260 200"
      role="img"
      aria-label="${escapeAttribute(label)}"
      preserveAspectRatio="xMidYMid meet"
    >
      ${body}
    </svg>
  `;
}

function renderDecoration(seed) {
  const left = 20 + (seed % 18);
  const right = 224 - (seed % 14);
  const top = 25 + (seed % 12);
  return `
    <path class="texture" d="M${left} 153c5-5 10-5 15 0s10 5 15 0" />
    <path class="texture" d="M${right - 8} ${top}v9M${right - 13} ${top + 4.5}h10" />
    <circle class="detail" cx="${left + 3}" cy="${top + 8}" r="3.5" />
  `;
}

function renderAnimal(index) {
  if (index === 4) return animalLion();
  if (index === 1) return animalDog();
  if ([5].includes(index)) return animalElephant();
  if ([6].includes(index)) return animalGiraffe();
  if (index === 7) return animalZebra();
  if (index === 9) return animalRhino();
  if ([10, 11].includes(index)) return animalPrimate(index);
  if ([12, 13].includes(index)) return animalBear(index);
  if (index === 14) return animalFox();
  if (index === 15) return animalHedgehog();
  if ([16, 17, 18, 19].includes(index)) return animalFarm(index);
  if ([20].includes(index)) return animalCrocodile();
  if ([21].includes(index)) return animalTurtle();
  if (index === 22) return animalChameleon();
  if ([22, 23].includes(index)) return animalReptile(index);
  if ([24, 25, 26, 27].includes(index)) return animalMarine(index);
  if ([28, 29, 30, 31, 32, 33].includes(index)) return animalBirdSpecific(index);
  if ([34, 35, 36, 37].includes(index)) return animalWinged(index);
  if (index === 38) return animalFrog();
  if (index === 39) return animalSmall(index);
  if ([3].includes(index)) return animalBird(index);
  if ([2].includes(index)) return animalRabbit(index);
  if ([8, 10, 11].includes(index)) return animalHeavy(index);
  return animalFeline(index);
}

function animalLion() {
  return `
    <path class="outline" d="M89 104c-17-6-27-21-24-38 2-13 12-22 24-25 3-13 14-22 28-22 10-9 26-9 36 0 14 0 25 9 28 22 13 3 22 13 24 26 3 16-7 31-23 37-4 17-20 29-40 29s-38-12-42-29Z"/>
    <path class="outline" d="M102 59c11-10 24-14 40-12 14 2 26 9 33 20v22c0 20-14 34-34 34-21 0-36-15-36-35V67Z"/>
    <path class="outline" d="m104 63-15-14 3 27m80-13 15-14-4 28"/>
    <circle class="ink-fill" cx="123" cy="80" r="3.2"/>
    <circle class="ink-fill" cx="158" cy="80" r="3.2"/>
    <path class="outline" d="M133 91c5-4 11-4 16 0-2 7-5 10-8 10-4 0-7-3-8-10Z"/>
    <path class="detail" d="M141 101v8m0 0c-7 0-12-3-15-8m15 8c7 0 12-3 15-8"/>
    <path class="outline" d="M103 126c-21 9-32 25-31 48h100c2-23-9-39-30-50"/>
    <path class="outline" d="M91 145v34m28-38v38m30-34v34M81 179h22m8 0h22m8 0h22"/>
    <path class="detail" d="M104 129c5 8 12 12 21 13m31-13c-5 8-12 12-21 13"/>
    <path class="outline" d="M170 148c22-4 35 5 34 20-1 10-9 15-17 12"/>
    <path class="outline" d="M187 180c-5-7-2-14 6-15 8 1 11 8 6 15Z"/>
  `;
}

function animalZebra() {
  return `
    <path class="outline" d="M50 118c10-27 34-43 69-44h38l21-31c8-12 25-15 36-6 11 9 12 26 3 38l-22 28v40c0 11-8 20-19 20H82c-22 0-38-20-32-45Z"/>
    <path class="outline" d="m181 49-2-24 17 16m9 1 17-14-4 25"/>
    <path class="detail" d="M196 61c4-3 9-3 13 0m-21 20c10 6 20 5 29-2"/>
    <circle class="ink-fill" cx="205" cy="58" r="3"/>
    <path class="outline" d="M177 54c-10 9-17 20-21 33"/>
    <path class="texture" d="M176 61l-13-12m7 23-14-10m8 22-15-8M75 91l18 18m3-30 17 27m7-31 14 29m10-28 11 27M66 119l24 17m13-24 16 24m20-23 14 23m17-27 15 18"/>
    <path class="outline" d="M80 158v25m31-25v25m48-25v25m28-32v32M70 183h20m12 0h20m28 0h20m8 0h20"/>
    <path class="outline" d="M52 119 28 99m23 31-27 3"/>
    <path class="detail" d="M77 78c-8-9-8-18-1-27m65 24c7-8 9-16 5-25"/>
  `;
}

function animalRhino() {
  return `
    <path class="outline" d="M47 115c8-31 36-49 78-49h42l20-18c14-12 34-8 41 8 5 13-1 27-15 34l-19 10v48c0 12-9 21-21 21H83c-25 0-42-24-36-54Z"/>
    <path class="outline" d="m212 72 24-19-5 28-19 9"/>
    <path class="outline" d="m194 62 11-26 10 28"/>
    <circle class="ink-fill" cx="207" cy="68" r="2.8"/>
    <path class="detail" d="M194 85c10 5 21 5 31 0M91 69c-8-11-7-21 2-30"/>
    <path class="outline" d="M82 157v25m30-23v23m48-24v24m27-32v32M73 182h19m11 0h19m29 0h19m9 0h19"/>
    <path class="texture" d="M52 119 31 103m20 29-24 4"/>
  `;
}

function animalPrimate(index) {
  if (index === 11) {
    return `
      <path class="outline" d="M65 112c0-38 27-66 65-66s65 28 65 66c0 28-17 51-42 62H107c-25-11-42-34-42-62Z"/>
      <path class="outline" d="M96 65c-14-17-35-8-34 13 1 15 13 25 31 23m71-36c14-17 35-8 34 13-1 15-13 25-31 23"/>
      <ellipse class="outline" cx="130" cy="91" rx="37" ry="32"/>
      <circle class="ink-fill" cx="117" cy="86" r="3"/><circle class="ink-fill" cx="143" cy="86" r="3"/>
      <path class="outline" d="M119 101c7-6 15-6 22 0-1 11-7 17-11 17s-10-6-11-17Z"/>
      <path class="outline" d="M77 112 50 153m133-41 27 41M96 174v-29m68 29v-29"/>
      <path class="detail" d="M113 130c11 7 23 7 34 0"/>
    `;
  }
  return `
    <circle class="outline" cx="126" cy="65" r="38"/>
    <circle class="outline" cx="88" cy="66" r="17"/><circle class="outline" cx="164" cy="66" r="17"/>
    <circle class="ink-fill" cx="115" cy="59" r="3"/><circle class="ink-fill" cx="137" cy="59" r="3"/>
    <ellipse class="outline" cx="126" cy="78" rx="18" ry="14"/>
    <path class="detail" d="M118 79c5 5 11 5 16 0"/>
    <path class="outline" d="M101 100c-19 12-29 31-26 56h102c3-25-7-44-26-56"/>
    <path class="outline" d="M91 119 54 145m107-26 34 28M97 155v27m58-27v27"/>
    <path class="outline" d="M176 143c27-6 40 5 38 23-2 16-18 22-29 13-8-6-6-17 3-20"/>
  `;
}

function animalBear(index) {
  const panda = index === 12;
  return `
    <circle class="outline" cx="97" cy="47" r="20"/><circle class="outline" cx="163" cy="47" r="20"/>
    <circle class="outline" cx="130" cy="82" r="51"/>
    ${panda ? `<ellipse class="outline" cx="111" cy="73" rx="13" ry="17"/><ellipse class="outline" cx="149" cy="73" rx="13" ry="17"/>` : ""}
    <circle class="ink-fill" cx="112" cy="74" r="3"/><circle class="ink-fill" cx="148" cy="74" r="3"/>
    <ellipse class="outline" cx="130" cy="96" rx="22" ry="17"/>
    <path class="outline" d="M124 90c4-4 8-4 12 0-1 5-3 7-6 7s-5-2-6-7Z"/>
    <path class="detail" d="M130 97v7m0 0c-5 0-9-2-12-6m12 6c5 0 9-2 12-6"/>
    <path class="outline" d="M91 122c-20 13-30 32-27 58h132c3-26-7-45-27-58"/>
    <path class="outline" d="M91 140 67 166m102-26 24 26M106 180v-29m48 29v-29"/>
    ${panda ? `<path class="texture" d="M84 133c14 9 29 12 45 9m47-9c-14 9-29 12-45 9"/>` : ""}
  `;
}

function animalFox() {
  return `
    <path class="outline" d="M101 58 77 28l4 45m78-15 24-30-4 45"/>
    <path class="outline" d="M82 71c11-27 29-40 49-40 21 0 39 13 49 40l-12 39-37 17-37-17Z"/>
    <circle class="ink-fill" cx="111" cy="76" r="3"/><circle class="ink-fill" cx="151" cy="76" r="3"/>
    <path class="outline" d="m131 91-9 8 9 8 9-8Z"/>
    <path class="detail" d="M131 107c-5 6-11 9-18 8m18-8c5 6 11 9 18 8"/>
    <path class="outline" d="M100 126c-18 13-25 31-20 54h88c5-23-2-41-20-54"/>
    <path class="outline" d="M168 142c30-22 58-15 60 8 2 23-25 35-60 20 20-3 31-10 32-20-7-6-18-9-32-8Z"/>
    <path class="detail" d="M98 180v-31m52 31v-31"/>
  `;
}

function animalHedgehog() {
  return `
    <path class="outline" d="M48 133 61 98l-8-18 21 3 5-22 20 11 11-23 17 17 18-20 11 23 23-10 3 23 23 1-10 20 19 13-18 12 8 24-24-3-12 21-18-16-18 17-12-21-24 5-1-24-23-4 17-14Z"/>
    <path class="outline" d="M97 91c30-17 62-7 76 22 12 25 1 52-27 61H91c-12-24-10-51 6-83Z"/>
    <circle class="ink-fill" cx="148" cy="112" r="3.2"/>
    <path class="outline" d="m174 126 15 8-15 8"/>
    <path class="detail" d="M145 145c8 5 16 5 24 0M107 173v12m44-12v12"/>
  `;
}

function animalFarm(index) {
  const isHorse = index === 16;
  const isCow = index === 17;
  const isGoat = index === 18;
  const isSheep = index === 19;
  return `
    <path class="outline" d="M46 112c11-29 38-45 78-44h37l18-28c9-14 29-17 41-5 10 11 9 28-2 39l-24 23v45c0 13-9 22-22 22H81c-26 0-43-25-35-52Z"/>
    ${isHorse ? `<path class="outline" d="m183 47-3-25 17 17m9 0 18-15-5 27"/><path class="texture" d="M177 48c-10 8-17 20-20 35m18-24-18-7m13 18-18-7m12 19-17-6"/>` : ""}
    ${isCow ? `<path class="outline" d="m184 48-18-18 4 27m37-9 18-18-4 29"/><path class="texture" d="M83 80c14 15 29 15 44 0m18 26c13 12 26 12 39 0"/><path class="outline" d="M117 156c4 15 14 21 29 15"/><path class="detail" d="M123 164v13m17-13v13"/>` : ""}
    ${isGoat ? `<path class="outline" d="M187 43c-2-21 6-34 24-38m-10 39c3-19 14-30 32-31"/><path class="outline" d="M205 76c8 10 8 20 0 30"/><path class="texture" d="M202 86 215 99"/>` : ""}
    ${isSheep ? `<path class="outline" d="M54 105c-15-18-2-40 19-36 4-21 28-29 44-15 13-18 40-14 48 7 21-5 37 14 30 34"/><path class="texture" d="M72 91c12 8 24 8 36 0m17-14c12 8 24 8 36 0m-45 39c12 8 24 8 36 0"/>` : ""}
    <circle class="ink-fill" cx="205" cy="59" r="3"/>
    <path class="detail" d="M196 77c9 5 18 5 27 0"/>
    <path class="outline" d="M77 157v27m31-26v26m48-26v26m29-35v35M68 184h19m12 0h19m29 0h19m10 0h19"/>
    <path class="outline" d="M48 112 25 94m22 31-25 3"/>
  `;
}

function animalChameleon() {
  return `
    <path class="outline" d="M67 119c20-31 52-45 86-35 23 7 39 23 48 47-18 25-47 34-82 26-24-6-42-18-52-38Z"/>
    <path class="outline" d="M187 108c12-25 34-31 48-16 13 14 4 34-17 42"/>
    <circle class="outline" cx="221" cy="105" r="7"/><circle class="ink-fill" cx="223" cy="104" r="2"/>
    <path class="outline" d="M72 119c-25-15-43-7-42 11 1 17 25 20 36 5 9-13-5-25-15-17"/>
    <path class="outline" d="m112 86 12-21 13 22 15-18 8 22"/>
    <path class="detail" d="M94 150 78 176m45-20-3 24m45-35 20 24"/>
    <path class="texture" d="m92 108 14 7-8 13-14-6Zm37-14 15 7-8 14-15-7Zm31 25 14 7-7 13-15-6Z"/>
    <path class="outline" d="M34 180h195"/>
  `;
}

function animalMarine(index) {
  if (index === 27) {
    return `
      <path class="outline" d="M133 30c-25 0-40 18-35 41 3 14 12 23 25 28v18c-20 5-31 19-29 36 2 18 20 29 37 21 14-7 17-24 8-35-7-9-21-7-25 2"/>
      <path class="outline" d="M123 99c-23-5-36-19-34-37m34 37c23-5 36-19 34-37"/>
      <path class="outline" d="m98 122-23-11 7 24m49-105c9-13 22-17 37-10-6 14-17 21-33 21"/>
      <circle class="ink-fill" cx="128" cy="52" r="3"/>
      <path class="detail" d="M136 65c7 4 14 4 21 0M119 84l-15 7m25-2 15 9m-21 22-16 8m21 7 16 9"/>
      <path class="texture" d="M39 181c22-8 44-8 66 0 22 8 44 8 66 0 18-7 35-7 52 0"/>
    `;
  }
  if (index === 24) {
    return `
      <path class="outline" d="M38 124c24-41 62-60 110-51 28 5 52 20 73 45-25 28-58 42-98 37-35-4-63-14-85-31Z"/>
      <path class="outline" d="M100 77c9-24 26-35 50-34-4 20-16 33-36 39"/>
      <path class="outline" d="m44 124-28-26c-5 19 0 34 15 45-11 10-16 22-13 37l31-25"/>
      <path class="outline" d="M178 80c14-17 32-20 50-9"/>
      <circle class="ink-fill" cx="190" cy="111" r="3"/>
      <path class="detail" d="M199 128c-10 6-20 6-30 0"/>
      <path class="texture" d="M38 181c20-8 40-8 60 0 20 8 40 8 60 0 20-8 40-8 60 0"/>
    `;
  }
  if (index === 25) {
    return `
      <path class="outline" d="M35 121c26-40 66-57 113-45 32 8 56 27 74 55-27 27-64 38-107 27-34-8-61-21-80-37Z"/>
      <path class="outline" d="m42 121-26-25c-5 18-1 33 14 44-12 9-17 22-14 37l31-23"/>
      <path class="outline" d="M120 79c9-20 25-29 48-27-6 18-19 28-39 31"/>
      <circle class="ink-fill" cx="192" cy="119" r="3"/>
      <path class="detail" d="M202 137c-11 5-22 5-33 0"/>
      <path class="outline" d="M157 74c-3-23 4-39 22-48m-22 48c7-20 20-32 38-35m-38 35c-14-17-29-24-46-20"/>
      <path class="texture" d="M39 181c22-8 44-8 66 0 22 8 44 8 66 0 18-7 35-7 52 0"/>
    `;
  }
  return animalSea(index);
}

function animalBirdSpecific(index) {
  if (index === 29) {
    return `
      <ellipse class="outline" cx="130" cy="112" rx="56" ry="62"/>
      <circle class="outline" cx="106" cy="86" r="23"/><circle class="outline" cx="154" cy="86" r="23"/>
      <circle class="ink-fill" cx="106" cy="86" r="7"/><circle class="ink-fill" cx="154" cy="86" r="7"/>
      <path class="outline" d="m130 96-10 10 10 8 10-8Z"/>
      <path class="outline" d="M83 72 72 41l31 17m74 14 11-31-31 17"/>
      <path class="detail" d="M93 126c9 18 21 27 37 28m37-28c-9 18-21 27-37 28M110 174v12m40-12v12"/>
      <path class="outline" d="M96 186h28m12 0h28"/>
    `;
  }
  if (index === 30) {
    return `
      <circle class="outline" cx="130" cy="72" r="31"/>
      <path class="outline" d="M105 64 78 73l27 12m50-21 27 9-27 12"/>
      <circle class="ink-fill" cx="120" cy="67" r="3"/><circle class="ink-fill" cx="141" cy="67" r="3"/>
      <path class="outline" d="m130 76-8 8 8 7 8-7Z"/>
      <path class="outline" d="M106 100c-42 2-69 23-79 60 35-9 68-6 103 14 35-20 68-23 103-14-10-37-37-58-79-60"/>
      <path class="detail" d="M42 148c25-18 48-25 69-20m107 20c-25-18-48-25-69-20M114 161v25m32-25v25"/>
    `;
  }
  if (index === 31) {
    return `
      <path class="outline" d="M136 45c-18 13-25 31-20 53 4 18 16 30 32 34"/>
      <path class="outline" d="M136 45c13-17 30-22 49-15 19 7 28 27 21 46-6 17-21 26-41 24"/>
      <circle class="ink-fill" cx="181" cy="52" r="3"/>
      <path class="outline" d="M141 128c-17 10-25 26-21 47h52c4-21-4-37-21-47"/>
      <path class="detail" d="M145 133v50m24-6-31-8m-18 6-18 10m44-10h38"/>
      <path class="outline" d="M146 183h29m-55-8-17 10"/>
      <path class="texture" d="M75 188h122"/>
    `;
  }
  if (index === 32) {
    return `
      <ellipse class="outline" cx="128" cy="111" rx="61" ry="40"/>
      <circle class="outline" cx="174" cy="82" r="28"/>
      <path class="outline" d="m198 81 25 10-24 10"/>
      <circle class="ink-fill" cx="181" cy="75" r="3"/>
      <path class="outline" d="M75 108 39 94c-4 22 7 36 34 43"/>
      <path class="detail" d="M93 90c14 15 31 22 51 21m-42 39v23m48-25v25M91 173h23m25 0h23"/>
      <path class="texture" d="M30 183c22-8 44-8 66 0 22 8 44 8 66 0 19-7 37-7 55 0"/>
    `;
  }
  if (index === 33) {
    return `
      <circle class="outline" cx="130" cy="72" r="29"/>
      <path class="outline" d="m107 74-24 9 24 10m47-19 24 9-24 10"/>
      <circle class="ink-fill" cx="120" cy="68" r="3"/><circle class="ink-fill" cx="141" cy="68" r="3"/>
      <path class="outline" d="m130 76-7 8 7 6 8-6Z"/>
      <path class="outline" d="M103 102c-22 14-31 35-26 64h106c5-29-4-50-26-64"/>
      <path class="outline" d="M107 160c-42-3-66 9-73 37 31-9 63-7 96 5 33-12 65-14 96-5-7-28-31-40-73-37"/>
      <path class="detail" d="M61 188c18-15 35-20 53-16m85 16c-18-15-35-20-53-16M96 185l7 8m27-18v20m31-10-7 8"/>
    `;
  }
  return `
    <path class="outline" d="M95 63c11-18 27-26 47-22 20 4 34 20 35 40 0 18-10 32-28 42v42H97c-4-19 2-36 18-50-20-7-30-24-27-43 1-3 4-6 7-9Z"/>
    <path class="outline" d="M162 65 189 76l-26 12"/>
    <circle class="ink-fill" cx="150" cy="65" r="3"/>
    <path class="outline" d="M97 118 63 106c-5 20 6 34 33 42"/>
    <path class="detail" d="M114 133c12 9 24 9 36 0M111 165v20m31-20v20M99 185h23m9 0h23"/>
    <path class="outline" d="M107 82c-8-18-4-34 12-47"/>
  `;
}

function animalWinged(index) {
  if (index === 35) return animalInsect(index);
  if (index === 34) {
    return `
      <ellipse class="outline" cx="130" cy="105" rx="16" ry="58"/>
      <path class="outline" d="M116 85c-27-43-63-43-72-14-7 22 14 40 56 43m44-29c27-43 63-43 72-14 7 22-14 40-56 43"/>
      <path class="outline" d="M115 116c-33-4-52 7-52 28 0 22 25 28 54-6m28-22c33-4 52 7 52 28 0 22-25 28-54-6"/>
      <path class="detail" d="M121 87h18m-18 23h18m-18 23h18M99 76c-7 10-15 18-25 24m87-24c7 10 15 18 25 24"/>
      <path class="outline" d="M123 47c-6-16-15-22-27-19m41 19c6-16 15-22 27-19"/>
    `;
  }
  if (index === 36) {
    return `
      <ellipse class="outline" cx="126" cy="103" rx="28" ry="53"/>
      <path class="outline" d="M105 83c-30-33-59-26-62-2-3 21 20 33 56 29m48-27c30-33 59-26 62-2 3 21-20 33-56 29"/>
      <path class="detail" d="M102 76h48m-51 22h54m-52 23h50m-43 22h36"/>
      <path class="outline" d="M116 51c-7-16-16-22-28-18m48 18c7-16 16-22 28-18"/>
      <circle class="outline" cx="194" cy="151" r="23"/>
      <path class="outline" d="M194 128v46m-23-23h46"/>
      <path class="detail" d="M194 128c-16-17-27-20-34-10m34 10c16-17 27-20 34-10m-34 56c-16 17-27 20-34 10m34-10c16 17 27 20 34 10"/>
    `;
  }
  return `
    <ellipse class="outline" cx="130" cy="104" rx="12" ry="62"/>
    <circle class="outline" cx="130" cy="35" r="14"/>
    <path class="outline" d="M118 75C91 36 54 45 54 78c0 24 25 33 64 20m24-23c27-39 64-30 64 3 0 24-25 33-64 20"/>
    <path class="outline" d="M118 111c-33-16-62-4-57 24 4 23 29 27 62-5m19-19c33-16 62-4 57 24-4 23-29 27-62-5"/>
    <path class="detail" d="M119 84h22m-22 24h22m-20 24h18M124 24c-7-12-15-16-24-12m36 12c7-12 15-16 24-12"/>
  `;
}

function animalFrog() {
  return `
    <circle class="outline" cx="102" cy="76" r="24"/><circle class="outline" cx="158" cy="76" r="24"/>
    <circle class="ink-fill" cx="102" cy="75" r="5"/><circle class="ink-fill" cx="158" cy="75" r="5"/>
    <path class="outline" d="M81 91c13-19 29-28 49-28s36 9 49 28c14 22 11 48-7 65H88c-18-17-21-43-7-65Z"/>
    <path class="detail" d="M108 111c15 11 30 11 45 0"/>
    <path class="outline" d="M91 151 52 172l-22-3m139-18 39 21 22-3"/>
    <path class="outline" d="M56 174c20-26 48-35 74-24 26-11 54-2 74 24-23 12-48 14-74 5-26 9-51 7-74-5Z"/>
    <path class="detail" d="M130 150v29"/>
  `;
}

function animalDog() {
  return `
    <path class="outline" d="M94 62c-17-22-36-25-47-10-10 15 2 39 31 46m88-36c17-22 36-25 47-10 10 15-2 39-31 46"/>
    <path class="outline" d="M82 73c7-29 25-43 49-43 25 0 43 14 50 43 6 25-1 48-18 61-18 14-46 14-64 0-17-13-24-36-17-61Z"/>
    <path class="detail" d="M103 82c4-5 9-5 14 0m28 0c4-5 9-5 14 0"/>
    <ellipse class="outline" cx="131" cy="105" rx="25" ry="20"/>
    <path class="outline" d="M124 98c4-5 10-5 14 0-1 6-4 9-7 9s-6-3-7-9Z"/>
    <path class="detail" d="M131 107v7m0 0c-7 0-12-3-15-8m15 8c7 0 12-3 15-8"/>
    <path class="outline" d="M101 139c-12 9-18 22-18 39m96 0c0-17-6-30-18-39M83 178h96"/>
    <path class="detail" d="M97 153c22 11 45 11 68 0M105 178v-23m52 23v-23"/>
    <path class="outline" d="M98 143c5 14 16 21 33 21s28-7 33-21"/>
    <circle class="ink-fill" cx="151" cy="59" r="5"/>
  `;
}

function animalFeline(index) {
  const mane =
    index === 4
      ? `<path class="outline" d="M86 79c-15-12-18-35-5-49 7-8 16-10 25-9 7-8 20-8 27 0 9-2 19 1 25 9 12 15 9 37-7 49 5 18-7 35-26 38-19-3-31-20-26-38-5 2-9 2-13 0Z"/>`
      : "";
  return `
    ${mane}
    <path class="outline" d="M93 66 88 41l18 12c14-7 33-7 47 0l18-12-5 26c4 7 5 16 2 25-5 18-22 29-39 29s-35-11-40-29c-3-9-1-19 4-26Z"/>
    <path class="detail" d="M110 83c4-4 9-4 13 0M143 83c4-4 9-4 13 0"/>
    <path class="outline" d="M128 91c2-3 7-3 9 0-1 5-3 7-5 7s-4-2-4-7Z"/>
    <path class="detail" d="M132 98v7m0 0c-5 0-8-2-10-5m10 5c5 0 8-2 10-5"/>
    <path class="texture" d="M105 99 82 95m24 11-25 4m77-11 23-4m-24 11 25 4"/>
    <path class="outline" d="M109 119c-12 9-19 21-19 36v17m59-53c12 9 19 21 19 36v17m-78 0h78"/>
    <path class="detail" d="M107 172v-25m50 25v-25M117 58l-3 7m35-7 3 7"/>
    ${index % 2 === 0 ? `<path class="texture" d="M126 132c4 5 8 5 12 0M119 145c8 5 18 5 26 0"/>` : ""}
  `;
}

function animalRabbit(index) {
  return `
    <path class="outline" d="M104 70C88 47 88 16 104 13c14-2 17 31 19 48m13 0c3-18 8-48 22-45 15 4 10 37-5 56"/>
    <ellipse class="outline" cx="130" cy="92" rx="43" ry="35"/>
    <path class="detail" d="M110 83c4-4 8-4 12 0m20 0c4-4 8-4 12 0"/>
    <path class="outline" d="M127 94c2-3 6-3 8 0-1 4-3 6-4 6-2 0-3-2-4-6Z"/>
    <path class="detail" d="M131 100v7m0 0-8 5m8-5 8 5M100 102l-24-3m25 11-23 7m84-15 23-3m-24 11 22 7"/>
    <path class="outline" d="M106 123c-17 13-23 31-14 49h75c8-21-2-39-20-50"/>
    <circle class="outline" cx="${index === 15 ? 88 : 174}" cy="148" r="14"/>
    <path class="detail" d="M112 144c5 4 10 4 15 0m8 0c5 4 10 4 15 0"/>
  `;
}

function animalElephant() {
  return `
    <path class="outline" d="M81 83c-6-35 16-59 50-59 34 0 57 25 50 60-4 18-14 30-27 37v22c0 24-11 35-25 35-12 0-20-8-18-18 1-8 8-12 16-10"/>
    <path class="outline" d="M89 53c-24-6-40 7-38 27 2 21 19 32 43 20m77-47c24-6 40 7 38 27-2 21-19 32-43 20"/>
    <path class="detail" d="M106 72c4-4 9-4 13 0m28 0c4-4 9-4 13 0M130 48v91"/>
    <path class="outline" d="M96 116c-9 13-12 31-8 57m76-57c9 13 12 31 8 57M88 173h22m40 0h22"/>
    <path class="detail" d="M112 101c10 7 28 7 38 0"/>
    <path class="texture" d="M62 164c22-6 45-5 66 0m15 0c21-6 42-5 60 0"/>
  `;
}

function animalGiraffe() {
  return `
    <path class="outline" d="M118 40c-4-14 4-25 17-27 14-2 27 7 29 22 2 12-4 22-14 27v57c18 8 29 24 29 52H75c0-23 13-42 35-50l8-81Z"/>
    <path class="outline" d="M123 20l-3-11m27 6 5-10M121 22c-7 1-11-2-13-7m43 3c7-1 12-5 13-11"/>
    <circle class="ink-fill" cx="136" cy="36" r="2.5"/>
    <path class="detail" d="M148 46c4 2 8 2 12 0M119 69c12 8 22 8 31 1"/>
    <path class="texture" d="m128 55 9 4-4 10-10-3Zm-8 28 11 5-5 12-11-4Zm15 24 10 4-3 11-10-3Zm-26 27 14 6-5 13-14-5Zm39 3 15 5-5 13-14-5Z"/>
    <path class="outline" d="M93 171v-25m64 25v-26M83 171h20m44 0h20"/>
  `;
}

function animalHoofed(index) {
  const horn = index === 9 ? `<path class="outline" d="M181 71l22-15-12 25"/>` : "";
  const stripes =
    index === 7
      ? `<path class="texture" d="m98 87 12 24m4-28 10 26m8-25 7 27m10-21-3 24M94 130l14 16m46-16-12 17"/>`
      : "";
  return `
    <path class="outline" d="M61 104c11-25 35-38 69-36 26 2 44 13 55 34v36c0 9-4 16-11 21H80c-14-10-21-29-19-55Z"/>
    <path class="outline" d="M166 82c2-22 15-36 32-33 14 3 20 18 15 32-4 13-15 21-30 20"/>
    ${horn}
    <path class="detail" d="M192 66c3-3 7-3 10 0m-18 17c8 4 17 4 25 0M70 104 47 90m18 28-24 2"/>
    <path class="outline" d="M86 157v23m25-22v22m43-22v22m24-31v31M78 180h17m8 0h17m25 0h18m7 0h17"/>
    <path class="detail" d="M100 70c-6-9-5-17 2-24m44 25c8-7 10-15 7-24"/>
    ${stripes}
    ${index === 17 ? `<path class="texture" d="M105 100c8 6 16 6 24 0m-14 25c8 6 16 6 24 0"/>` : ""}
  `;
}

function animalHeavy(index) {
  return `
    <path class="outline" d="M55 120c0-34 29-62 70-62 42 0 72 27 72 62 0 22-13 42-34 52H89c-22-10-34-29-34-52Z"/>
    <circle class="outline" cx="127" cy="72" r="46"/>
    <path class="outline" d="M95 45c-12-12-27-7-28 9-1 13 9 21 24 18m70-27c12-12 27-7 28 9 1 13-9 21-24 18"/>
    <circle class="ink-fill" cx="111" cy="69" r="3"/>
    <circle class="ink-fill" cx="145" cy="69" r="3"/>
    <ellipse class="detail" cx="128" cy="91" rx="18" ry="12"/>
    <circle class="ink-fill" cx="121" cy="91" r="2"/>
    <circle class="ink-fill" cx="135" cy="91" r="2"/>
    <path class="detail" d="M128 103c-3 7-9 10-17 9m17-9c3 7 9 10 17 9M85 170v-24m83 24v-24"/>
    ${index === 10 ? `<path class="texture" d="M99 132c8 7 18 7 26 0m8 0c8 7 18 7 26 0"/>` : ""}
  `;
}

function animalBird(index) {
  const tail =
    index === 33
      ? `<path class="outline" d="M120 129c-38 7-62 27-66 56 24-11 49-10 74 1 25-12 50-12 75-2-7-29-30-48-68-55"/><path class="texture" d="M82 168c12-13 25-20 39-21m54 21c-12-13-25-20-39-21m-8 4v29"/>`
      : `<path class="outline" d="M118 132 102 173l27-17 24 17-12-42"/>`;
  return `
    <ellipse class="outline" cx="128" cy="96" rx="51" ry="45"/>
    <circle class="outline" cx="128" cy="57" r="32"/>
    <path class="outline" d="m105 60-25 10 26 8m44-18 26 10-27 8"/>
    <circle class="ink-fill" cx="117" cy="52" r="3"/>
    <circle class="ink-fill" cx="140" cy="52" r="3"/>
    <path class="outline" d="m128 61-7 8 8 5 8-5Z"/>
    <path class="outline" d="M84 89c-23 6-34 23-29 43 17-1 32-9 41-25m76-18c23 6 34 23 29 43-17-1-32-9-41-25"/>
    <path class="detail" d="M113 135v20m31-20v20m-42 0h22m9 0h22"/>
    ${tail}
    ${index === 29 ? `<path class="detail" d="M110 36c-5-9-2-17 7-22m23 22c5-9 2-17-7-22"/>` : ""}
  `;
}

function animalCrocodile() {
  return `
    <path class="outline" d="M34 116c31-38 67-54 108-46 33 6 59 25 82 52-31 20-68 27-111 20-32-5-58-13-79-26Z"/>
    <path class="outline" d="M146 75c12-25 34-35 53-24 17 10 19 30 4 47"/>
    <circle class="ink-fill" cx="183" cy="66" r="3"/>
    <path class="detail" d="M159 101c23 3 42 10 57 21m-41-12-5 11m20-7-5 11m18-6-4 10"/>
    <path class="outline" d="m86 89 11-18 12 20 14-18 12 22"/>
    <path class="detail" d="M87 139 71 161m43-16-5 22m55-26 16 20"/>
    <path class="texture" d="M52 176c35-9 68-7 99 3m11-4c19-5 37-5 54 0"/>
  `;
}

function animalTurtle() {
  return `
    <ellipse class="outline" cx="125" cy="108" rx="67" ry="48"/>
    <path class="outline" d="M184 96c10-20 28-25 40-14 11 10 6 27-8 36-9 5-19 5-31 0"/>
    <circle class="ink-fill" cx="211" cy="93" r="2.5"/>
    <path class="outline" d="M71 82 49 66c-11 9-10 24 8 37m17 32-24 18c7 14 24 17 41 2m67-16 24 19c12-9 10-24-6-37"/>
    <path class="detail" d="m125 64-31 21 8 38 23 24 29-22 3-38Zm-31 21 63 2m-55 36 52 2m-29-61v83"/>
    <path class="texture" d="M66 174c26-7 49-7 70 0m13 0c21-6 40-6 58 0"/>
  `;
}

function animalReptile(index) {
  if (index === 23) {
    return `
      <path class="outline" d="M72 159c-27-17-34-46-17-66 17-19 50-14 59 9 10 24-12 46-35 37-17-7-18-29-3-38 19-11 42 3 53 23 14 24 44 36 76 24"/>
      <path class="outline" d="m204 148 21-16-3 25-18 7Z"/>
      <circle class="ink-fill" cx="217" cy="144" r="2.4"/>
      <path class="detail" d="m225 143 12-5-10 10"/>
      <path class="texture" d="M98 90c4 5 8 7 13 8m-26-17c4 5 8 7 13 8m31 31c4 5 8 7 13 8m15 6c4 5 8 7 13 8m15 2c4 5 8 7 13 8"/>
    `;
  }
  return `
    <path class="outline" d="M47 129c21-32 53-49 88-41 24 5 41 20 52 42-18 25-47 35-83 29-27-4-46-14-57-30Z"/>
    <path class="outline" d="M174 108c15-24 36-29 49-14 12 14 2 32-18 39"/>
    <circle class="ink-fill" cx="211" cy="103" r="2.5"/>
    <path class="outline" d="m109 88 14-24 13 24"/>
    <path class="detail" d="M91 154 76 177m44-17-5 20m44-30 20 22"/>
    <path class="texture" d="m88 111 16 7-9 13-16-6Zm40-13 16 7-8 14-17-7Zm30 24 15 7-8 13-15-6Z"/>
  `;
}

function animalSea(index) {
  const whale = index === 25;
  return `
    <path class="outline" d="M40 111c29-37 70-55 112-43 28 8 48 27 62 52-23 28-59 41-98 32-32-7-58-22-76-41Z"/>
    <path class="outline" d="M48 111 22 87c-5 17-2 32 11 45-11 10-15 23-12 38l30-24"/>
    <circle class="ink-fill" cx="183" cy="105" r="3"/>
    <path class="detail" d="M192 127c-10 6-20 6-30 0M117 72c10 15 15 29 15 43m-23-39c-4 18-3 37 4 56"/>
    <path class="outline" d="M114 72c10-16 27-22 43-14-5 14-16 22-33 25"/>
    ${
      whale
        ? `<path class="detail" d="M169 69c-2-18 3-30 15-37m-15 37c7-16 18-24 32-23m-32 23c-12-14-25-18-37-13"/>`
        : `<path class="texture" d="M44 174c18-8 35-8 52 0 18 8 36 8 54 0 17-8 34-8 51 0"/>`
    }
  `;
}

function animalInsect(index) {
  if (index === 35) {
    return `
      <ellipse class="outline" cx="130" cy="113" rx="52" ry="48"/>
      <path class="outline" d="M130 65v96M90 82c12 11 26 16 40 16m40-16c-12 11-26 16-40 16"/>
      <circle class="ink-fill" cx="108" cy="86" r="7"/><circle class="ink-fill" cx="151" cy="88" r="6"/>
      <circle class="ink-fill" cx="102" cy="122" r="8"/><circle class="ink-fill" cx="157" cy="125" r="7"/>
      <path class="outline" d="M112 68c-8-10-15-13-23-9m59 9c8-10 15-13 23-9"/>
      <path class="detail" d="M85 149 62 166m113-17 23 17"/>
    `;
  }
  return `
    <ellipse class="outline" cx="130" cy="105" rx="20" ry="52"/>
    <path class="outline" d="M116 91c-25-42-62-42-70-13-6 22 15 39 55 42m43-29c25-42 62-42 70-13 6 22-15 39-55 42"/>
    <path class="outline" d="M112 118c-28-1-45 10-46 28-1 20 23 25 52-5m30-23c28-1 45 10 46 28 1 20-23 25-52-5"/>
    <circle class="outline" cx="130" cy="43" r="16"/>
    <path class="detail" d="M121 31c-4-12-10-17-18-15m36 15c4-12 10-17 18-15M111 88h38m-39 18h40m-37 19h34"/>
    ${index === 36 ? `<path class="texture" d="M78 76c7 10 16 17 26 22m78-22c-7 10-16 17-26 22"/>` : ""}
  `;
}

function animalSmall(index) {
  if (index === 39) {
    return `
      <path class="outline" d="M61 134c0-39 26-69 63-69 33 0 57 23 57 55 0 28-21 47-48 47H61Z"/>
      <path class="outline" d="M91 135c0-20 13-36 32-36 16 0 29 13 29 29 0 14-11 26-25 26-12 0-22-9-22-21 0-10 8-18 18-18"/>
      <path class="outline" d="M181 133c16-23 35-28 49-15 12 12 5 31-16 41h-49"/>
      <circle class="ink-fill" cx="216" cy="131" r="2.5"/>
      <path class="detail" d="M204 115c-1-14 4-23 15-27m2 29c5-13 13-20 24-20"/>
    `;
  }
  return `
    <ellipse class="outline" cx="128" cy="112" rx="53" ry="44"/>
    <path class="outline" d="M92 83C79 54 82 27 98 22c16-5 29 20 31 48m35 13c13-29 10-56-6-61-16-5-29 20-31 48"/>
    <circle class="ink-fill" cx="111" cy="103" r="3"/>
    <circle class="ink-fill" cx="146" cy="103" r="3"/>
    <path class="outline" d="m128 110-7 6 7 7 8-7Z"/>
    <path class="detail" d="M128 123c-2 7-8 11-17 12m17-12c2 7 8 11 17 12M89 153 72 172m94-19 18 19"/>
    <path class="outline" d="M75 118c-22-3-32 11-24 27 7 14 23 18 41 7m89-34c22-3 32 11 24 27-7 14-23 18-41 7"/>
  `;
}

function renderVehicle(index) {
  if (index === 4) return vehicleCar(index);
  if (index === 5) return vehicleMinibus();
  if (index === 6) return vehicleDumpTruck();
  if (index === 7) return vehicleAmbulance();
  if ([10, 11].includes(index)) return vehicleFarm(index);
  if (index === 13) return vehicleBulldozer();
  if (index === 14) return vehicleCrane();
  if (index === 15) return vehicleMixer();
  if (index === 21) return vehicleSteamTrain();
  if (index === 23) return vehicleTram();
  if ([24, 25, 26, 27].includes(index)) return vehicleWater(index);
  if (index === 33) return vehicleBalloon();
  if (index === 34) return vehicleRocket();
  if (index === 35) return vehicleRover();
  if (index === 36) return vehicleScooter();
  if (index === 37) return vehicleRickshaw();
  if (index >= 20 && index <= 23) return vehicleTrain(index);
  if (index >= 24 && index <= 28) return vehicleBoat(index);
  if (index >= 29 && index <= 34) return vehicleAir(index);
  if (index === 35) return vehicleRocket();
  if (index >= 16 && index <= 19) return vehicleBike(index);
  if (index === 36 || index === 37) return vehicleBike(index);
  if (index >= 10 && index <= 15) return vehicleConstruction(index);
  if ([2, 3, 4, 5, 6, 7, 15, 39].includes(index)) return vehicleTruck(index);
  return vehicleCar(index);
}

function vehicleFarm(index) {
  return `
    <circle class="outline" cx="78" cy="142" r="35"/>
    <circle class="detail" cx="78" cy="142" r="13"/>
    <circle class="outline" cx="184" cy="151" r="23"/>
    <circle class="detail" cx="184" cy="151" r="8"/>
    <path class="outline" d="M65 104h88l24 24h31v23h-1"/>
    <path class="outline" d="M100 104V62h55l21 42"/>
    <path class="detail" d="M114 74h29l15 30h-44Z"/>
    <path class="outline" d="M81 62V34h15"/>
    ${index === 11 ? `<path class="outline" d="M44 128H17l-10 30h42"/><path class="detail" d="M15 132v26m13-30v30m13-30v30"/><path class="outline" d="M104 61 77 42m80 29 25-22"/>` : `<path class="outline" d="M48 106 30 86m18 34-27 2"/>`}
  `;
}

function vehicleBulldozer() {
  return `
    <path class="outline" d="M65 105h107l28 32H55Z"/>
    <path class="outline" d="M91 105V64h61l20 41M105 76h35l14 29h-49Z"/>
    <path class="outline" d="M55 137h133c14 0 25 10 25 22s-11 22-25 22H55c-14 0-25-10-25-22s11-22 25-22Z"/>
    <circle class="detail" cx="65" cy="159" r="11"/><circle class="detail" cx="178" cy="159" r="11"/>
    <path class="outline" d="M50 119 21 91v57l34-2"/>
    <path class="detail" d="M88 153h68m-68 12h68"/>
  `;
}

function vehicleCrane() {
  return `
    <path class="outline" d="M49 127h120l22 27H43Z"/>
    <path class="outline" d="M75 127V84h57l22 43M89 96h31l15 31H89Z"/>
    <path class="outline" d="M132 84 187 27h24l-57 100"/>
    <path class="detail" d="M195 27 235 39 226 65 187 53"/>
    <path class="outline" d="M225 63v60m0 0-13 16m13-16 13 16"/>
    <path class="outline" d="M55 154h132c13 0 23 9 23 20H32c0-11 10-20 23-20Z"/>
    <circle class="detail" cx="67" cy="173" r="9"/><circle class="detail" cx="176" cy="173" r="9"/>
  `;
}

function vehicleMixer() {
  return `
    <path class="outline" d="M132 92h55l37 31v29h-92Z"/>
    <path class="detail" d="M151 101h30l25 21h-55Z"/>
    <path class="outline" d="M37 76h91v68H37Z"/>
    <ellipse class="outline" cx="85" cy="93" rx="45" ry="35" transform="rotate(-18 85 93)"/>
    <path class="detail" d="M61 72 111 111m-57-18 39 30"/>
    <path class="outline" d="M115 120h17m-94 24h194"/>
    <circle class="outline" cx="68" cy="151" r="22"/><circle class="outline" cx="190" cy="151" r="22"/>
    <circle class="detail" cx="68" cy="151" r="8"/><circle class="detail" cx="190" cy="151" r="8"/>
  `;
}

function vehicleSteamTrain() {
  return `
    <path class="outline" d="M42 84h123v70H42Z"/>
    <path class="outline" d="M165 105h41l23 27v22h-64Z"/>
    <path class="outline" d="M62 84V54h63v30M78 54V27h28v27"/>
    <path class="outline" d="M72 27 61 12h50l-8 15"/>
    <circle class="outline" cx="73" cy="158" r="22"/><circle class="outline" cx="177" cy="158" r="22"/>
    <circle class="detail" cx="73" cy="158" r="8"/><circle class="detail" cx="177" cy="158" r="8"/>
    <path class="outline" d="M78 12c-8-11-5-22 8-27m18 27c8-11 5-22-8-27"/>
    <path class="detail" d="M42 111h123M24 180h216"/>
  `;
}

function vehicleTram() {
  return `
    <path class="outline" d="M31 61h198v99H31Z"/>
    <path class="outline" d="M49 78h43v42H49Zm58 0h46v42h-46Zm61 0h43v42h-43Z"/>
    <path class="detail" d="M31 134h198M107 61v99m46-99v99"/>
    <circle class="outline" cx="74" cy="163" r="16"/><circle class="outline" cx="186" cy="163" r="16"/>
    <path class="outline" d="M94 61 117 28h34l21 33M117 28l-15-16m49 16 15-16"/>
    <path class="detail" d="M22 183h216"/>
  `;
}

function vehicleWater(index) {
  if (index === 24) {
    return `
      <path class="outline" d="M28 121h204c-18 35-52 52-102 52S46 156 28 121Z"/>
      <path class="detail" d="M58 139h144"/>
      <path class="outline" d="M147 40 92 121m50-81 25 23"/>
      <path class="outline" d="m151 43 58-10-45 39"/>
      <path class="texture" d="M25 188c23-9 46-9 69 0 24 9 48 9 72 0 23-9 46-9 69 0"/>
    `;
  }
  if (index === 25) {
    return `
      <path class="outline" d="M34 136h192l-25 37H61Z"/>
      <path class="outline" d="M128 39v97M128 48 65 126h63Zm0 10 63 68h-63Z"/>
      <path class="detail" d="M128 39V19m0 8 27 13-27 2"/>
      <path class="texture" d="M27 188c22-8 44-8 66 0 22 8 44 8 66 0 20-7 39-7 58 0"/>
    `;
  }
  if (index === 26) {
    return `
      <path class="outline" d="M31 136h198l-26 37H58Z"/>
      <path class="outline" d="M76 136V68h91l25 68M91 83h61v32H91Z"/>
      <path class="outline" d="M167 80h24l18 24v32"/>
      <path class="outline" d="M82 68V47h59v21"/>
      <path class="detail" d="M164 52c26 11 44 29 53 54"/>
      <path class="texture" d="M27 188c22-8 44-8 66 0 22 8 44 8 66 0 20-7 39-7 58 0"/>
    `;
  }
  return `
    <path class="outline" d="M27 132h206l-24 43H55Z"/>
    <path class="outline" d="M48 61h164v71H48Z"/>
    <path class="detail" d="M65 77h28v28H65Zm42 0h28v28h-28Zm42 0h28v28h-28Zm42 0h14v28h-14Z"/>
    <path class="outline" d="M75 61V38h110v23"/>
    <path class="texture" d="M26 189c22-8 44-8 66 0 22 8 44 8 66 0 20-7 39-7 58 0"/>
  `;
}

function vehicleBalloon() {
  return `
    <path class="outline" d="M130 19c39 0 68 28 68 64 0 30-20 55-49 72h-38C82 138 62 113 62 83c0-36 29-64 68-64Z"/>
    <path class="detail" d="M130 19c-18 18-27 40-27 66s9 49 27 70m0-136c18 18 27 40 27 66s-9 49-27 70M66 78h128"/>
    <path class="outline" d="M111 155h38l12 31h-62Z"/>
    <path class="detail" d="M114 155 103 186m43-31 11 31"/>
  `;
}

function vehicleRover() {
  return `
    <path class="outline" d="M63 92h134l18 47H45Z"/>
    <path class="outline" d="M95 92V57h70v35M109 70h42v22"/>
    <path class="outline" d="M130 57V29m0 0 25-12"/>
    <circle class="outline" cx="68" cy="148" r="20"/><circle class="outline" cx="130" cy="148" r="20"/><circle class="outline" cx="192" cy="148" r="20"/>
    <circle class="detail" cx="68" cy="148" r="7"/><circle class="detail" cx="130" cy="148" r="7"/><circle class="detail" cx="192" cy="148" r="7"/>
    <path class="detail" d="M83 109h27m40 0h27M30 183h200"/>
  `;
}

function vehicleScooter() {
  return `
    <circle class="outline" cx="68" cy="153" r="24"/><circle class="outline" cx="194" cy="153" r="24"/>
    <path class="outline" d="M68 153h86c19 0 31-9 37-27l9-53"/>
    <path class="outline" d="M200 73h25m-25 0-16-18"/>
    <path class="outline" d="M91 137h62l17-24H98Z"/>
    <path class="detail" d="M79 153h104M109 126h44"/>
  `;
}

function vehicleRickshaw() {
  return `
    <circle class="outline" cx="52" cy="154" r="25"/><circle class="outline" cx="200" cy="154" r="25"/>
    <path class="outline" d="M52 154h61l37-49h50"/>
    <path class="outline" d="M102 77h80l30 77H94Z"/>
    <path class="outline" d="M111 77c7-28 23-42 48-42 25 0 43 14 53 42Z"/>
    <path class="detail" d="M120 90h54v43h-54Zm62 0h20M146 133v21"/>
  `;
}

function vehicleMinibus() {
  return `
    <path class="outline" d="M31 67h151c24 0 43 19 43 43v35H31Z"/>
    <path class="outline" d="M48 84h41v37H48Zm54 0h41v37h-41Zm54 0h36c9 7 15 16 18 27v10h-54Z"/>
    <path class="detail" d="M31 127h194M143 68v77M48 91h41m13 0h41m13 0h39"/>
    <circle class="outline" cx="69" cy="148" r="21"/>
    <circle class="outline" cx="186" cy="148" r="21"/>
    <circle class="detail" cx="69" cy="148" r="8"/>
    <circle class="detail" cx="186" cy="148" r="8"/>
    <path class="outline" d="M22 145h26m42 0h75m42 0h26"/>
    <path class="detail" d="M174 132h17"/>
  `;
}

function vehicleDumpTruck() {
  return `
    <path class="outline" d="M25 72h116l19 61H25Z"/>
    <path class="outline" d="m31 72 18-27h100l-8 27"/>
    <path class="detail" d="M49 89h91m-83 17h88"/>
    <path class="outline" d="M160 89h40l31 31v20h-71Z"/>
    <path class="detail" d="M176 97h19l20 21h-39Z"/>
    <circle class="outline" cx="66" cy="145" r="22"/>
    <circle class="outline" cx="193" cy="145" r="22"/>
    <circle class="detail" cx="66" cy="145" r="8"/>
    <circle class="detail" cx="193" cy="145" r="8"/>
    <path class="outline" d="M20 140h24m44 0h83m44 0h24"/>
  `;
}

function vehicleAmbulance() {
  return `
    <path class="outline" d="M27 65h139v76H27Zm139 27h38l30 29v20h-68Z"/>
    <path class="detail" d="M181 100h18l19 19h-37ZM43 82h41m-41 18h41"/>
    <path class="outline" d="M101 79h34m-17-17v34"/>
    <path class="outline" d="M175 75h26v17h-26Z"/>
    <path class="detail" d="M180 75c0-10 4-15 8-15s8 5 8 15"/>
    <circle class="outline" cx="68" cy="146" r="22"/>
    <circle class="outline" cx="193" cy="146" r="22"/>
    <circle class="detail" cx="68" cy="146" r="8"/>
    <circle class="detail" cx="193" cy="146" r="8"/>
    <path class="outline" d="M20 141h26m44 0h81m44 0h25"/>
  `;
}

function vehicleCar(index) {
  return `
    <path class="outline" d="M35 121 47 91l38-9 26-31h63l29 34 23 11 6 25-13 15H46l-11-15Z"/>
    <path class="detail" d="m84 82 31-22h51l20 25Zm31-22-2 25m53-25 6 25M47 105h178"/>
    <circle class="outline" cx="79" cy="137" r="23"/>
    <circle class="outline" cx="192" cy="137" r="23"/>
    <circle class="detail" cx="79" cy="137" r="9"/>
    <circle class="detail" cx="192" cy="137" r="9"/>
    <path class="outline" d="M35 118H21m211 0h13"/>
    <path class="detail" d="M52 100h18m130 0h22M126 98h22"/>
    ${index === 4 ? `<path class="outline" d="M112 49h40v14h-40Z"/><text class="svg-label" x="132" y="59" text-anchor="middle">TAXI</text><path class="texture" d="M97 112h72m-62-7v14m14-14v14m14-14v14m14-14v14m14-14v14"/>` : ""}
    ${index === 8 ? `<path class="texture" d="M55 114h22l7 12H51m145-12h21"/>` : ""}
  `;
}

function vehicleTruck(index) {
  const emergency =
    index === 6 || index === 7
      ? `<path class="outline" d="M166 59h27m-13-13v26"/><path class="detail" d="M62 82h24m-12-12v24"/>`
      : "";
  return `
    <path class="outline" d="M25 72h132v67H25Zm132 20h45l31 29v18h-76Z"/>
    <path class="detail" d="M173 98h22l20 21h-42ZM39 88h45m-45 17h76m-76 17h50"/>
    ${emergency}
    <circle class="outline" cx="66" cy="143" r="22"/>
    <circle class="outline" cx="190" cy="143" r="22"/>
    <circle class="detail" cx="66" cy="143" r="8"/>
    <circle class="detail" cx="190" cy="143" r="8"/>
    <path class="outline" d="M21 139h22m45 0h80m44 0h26"/>
    ${index === 5 ? `<path class="outline" d="m25 72 20-31h94l18 31"/><path class="texture" d="M48 50h88"/>` : ""}
  `;
}

function vehicleConstruction(index) {
  return `
    <path class="outline" d="M47 113h123l22 25H43Z"/>
    <path class="outline" d="M72 113V68h65l25 45m-77-33h40v25H85Z"/>
    <path class="outline" d="M139 68 173 35h23l-34 78"/>
    <path class="detail" d="m196 35 26 6-9 31-30-8M47 138h145"/>
    <path class="outline" d="M58 138c-13 0-24 10-24 22s11 22 24 22h124c13 0 24-10 24-22s-11-22-24-22Z"/>
    <circle class="detail" cx="63" cy="160" r="12"/>
    <circle class="detail" cx="177" cy="160" r="12"/>
    <path class="texture" d="M86 154h68m-68 12h68"/>
    ${index === 10 ? `<path class="outline" d="M40 113 23 88m22 25 9-31 18 31"/>` : ""}
  `;
}

function vehicleBike(index) {
  const motor = index === 18 || index === 19;
  return `
    <circle class="outline" cx="62" cy="139" r="39"/>
    <circle class="outline" cx="198" cy="139" r="39"/>
    <path class="outline" d="m62 139 49-60 33 60H62l27-39h76l33 39m-54 0 21-73m-68 0h29m31 0h23"/>
    <circle class="detail" cx="144" cy="139" r="9"/>
    <path class="detail" d="M62 139h136M62 100v78m136-78v78"/>
    ${
      motor
        ? `<path class="outline" d="M87 100c5-22 19-33 42-33h27l15 33m-69-7h45l14 28h-70Z"/><path class="detail" d="M107 107h37"/>`
        : `<path class="outline" d="M168 65h24l7 20m-120 6H56V72h32Z"/>`
    }
  `;
}

function vehicleTrain(index) {
  return `
    <path class="outline" d="M32 48h155c19 0 35 16 35 35v62H32Z"/>
    <path class="outline" d="M50 67h50v46H50Zm68 0h50v46h-50Zm68 1c14 3 24 16 24 31v14h-24Z"/>
    <path class="detail" d="M32 126h190M49 49V34h137v15"/>
    <circle class="outline" cx="72" cy="151" r="18"/>
    <circle class="outline" cx="177" cy="151" r="18"/>
    <path class="detail" d="M22 169h216M55 176l10-14m129 14-10-14"/>
    ${index === 21 ? `<path class="outline" d="M42 48C33 29 43 17 62 17c12 0 21 6 25 17"/>` : ""}
  `;
}

function vehicleBoat(index) {
  const submarine = index === 28;
  if (submarine) {
    return `
      <ellipse class="outline" cx="126" cy="116" rx="92" ry="43"/>
      <path class="outline" d="M107 73V52h41v21m-20-21V34h27"/>
      <circle class="outline" cx="84" cy="115" r="12"/><circle class="outline" cx="126" cy="115" r="12"/><circle class="outline" cx="168" cy="115" r="12"/>
      <path class="outline" d="M33 111 14 91v50l20-20m184-24 25-17v72l-25-17"/>
      <path class="texture" d="M28 176c18-8 35-8 52 0 18 8 36 8 54 0 17-8 34-8 51 0 17 7 34 7 50 0"/>
    `;
  }
  return `
    <path class="outline" d="M29 125h204l-25 41H61Z"/>
    <path class="outline" d="M91 125V47h72v78M91 59h72"/>
    <path class="outline" d="M127 47V19m0 7 52 30-52 3m0-33L79 58h48"/>
    <path class="detail" d="M71 139h118m-81-61h19m17 0h19M75 125 62 98h29"/>
    <path class="texture" d="M28 179c18-8 35-8 52 0 18 8 36 8 54 0 17-8 34-8 51 0 17 7 34 7 50 0"/>
    ${index === 25 ? `<path class="detail" d="M103 95c17 12 33 12 49 0"/>` : ""}
  `;
}

function vehicleAir(index) {
  if (index === 34) {
    return `
      <circle class="outline" cx="130" cy="78" r="53"/>
      <path class="detail" d="M79 78h102M91 47c25 12 52 12 78 0M91 109c25-12 52-12 78 0M130 25v106"/>
      <path class="outline" d="M111 129h38l20 45H91Z"/>
      <path class="detail" d="M101 151h58m-48-22 7 45m31-45-7 45"/>
      <path class="texture" d="M40 176c21-7 42-7 63 0m54 0c21-7 42-7 63 0"/>
    `;
  }
  const helicopter = index === 32;
  return helicopter
    ? `
      <path class="outline" d="M49 112c0-31 27-55 63-55h43c27 0 49 22 49 49v23H75c-14 0-26-5-26-17Z"/>
      <path class="outline" d="m204 95 31-24m-31 42 34 14M95 57V37m-47 0h96"/>
      <path class="detail" d="M82 70v42h105m-71-55v55M63 144h119m-100-15-8 15m88-15 9 15"/>
      <circle class="outline" cx="128" cy="106" r="8"/>
    `
    : `
      <path class="outline" d="M24 105 105 89l31-63h24l-7 60 70 21c17 5 17 20 0 23l-72 7 3 40h-21l-25-39-58 3Z"/>
      <path class="detail" d="M105 89 91 112l17 26m45-52-1 51M52 115h43m69-9h38"/>
      <circle class="outline" cx="128" cy="115" r="8"/>
      <path class="texture" d="M45 169c19-6 38-6 57 0m55 0c19-6 38-6 57 0"/>
    `;
}

function vehicleRocket() {
  return `
    <path class="outline" d="M130 18c29 22 44 55 43 98l-43 35-43-35c-1-43 14-76 43-98Z"/>
    <circle class="outline" cx="130" cy="72" r="21"/>
    <path class="outline" d="m91 99-27 30v33l34-20m71-43 27 30v33l-34-20"/>
    <path class="outline" d="M113 144c-6 15-3 29 8 42l9-21 9 21c11-13 14-27 8-42"/>
    <path class="detail" d="M118 34c8 5 16 5 24 0M103 120h54"/>
    <path class="texture" d="M32 48h18m-9-9v18m168 3h18m-9-9v18M44 94l12 12m0-12-12 12"/>
  `;
}

function renderNumber(index, title) {
  const pageNumber = Math.floor(index / ITEMS_PER_PAGE) + 1;
  const isLargeNumber = index % ITEMS_PER_PAGE === 0;
  if (isLargeNumber) {
    return `
      <path class="outline" d="M48 28h164v144H48Z"/>
      <path class="texture" d="M61 45h18m-9-9v18m120 98h18m-9-9v18"/>
      <text x="130" y="142" text-anchor="middle" font-family="Arial, sans-serif" font-size="${pageNumber === 10 ? 112 : 130}" font-weight="800" fill="#fff" stroke="currentColor" stroke-width="3.2" paint-order="stroke">${pageNumber}</text>
    `;
  }

  const count = pageNumber;
  const positions = countPositions(count);
  return `
    <path class="detail" d="M31 25h198v150H31Z"/>
    ${positions
      .map(([x, y], itemIndex) => renderCountSymbol(title, x, y, itemIndex))
      .join("")}
    <text x="224" y="40" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" font-weight="800" fill="#fff" stroke="currentColor" stroke-width="1.8" paint-order="stroke">${count}</text>
  `;
}

function countPositions(count) {
  const layouts = {
    1: [[130, 100]],
    2: [[88, 100], [172, 100]],
    3: [[130, 62], [83, 128], [177, 128]],
    4: [[88, 65], [172, 65], [88, 135], [172, 135]],
    5: [[80, 60], [180, 60], [130, 100], [80, 140], [180, 140]],
    6: [[76, 58], [130, 58], [184, 58], [76, 138], [130, 138], [184, 138]],
    7: [[65, 55], [130, 55], [195, 55], [82, 110], [130, 110], [178, 110], [130, 158]],
    8: [[65, 55], [130, 55], [195, 55], [65, 110], [130, 110], [195, 110], [95, 158], [165, 158]],
    9: [[65, 52], [130, 52], [195, 52], [65, 105], [130, 105], [195, 105], [65, 158], [130, 158], [195, 158]],
    10: [[54, 52], [105, 52], [155, 52], [206, 52], [80, 102], [130, 102], [180, 102], [80, 153], [130, 153], [180, 153]],
  };
  return layouts[count] ?? layouts[1];
}

function renderCountSymbol(title, x, y, index) {
  const key = normalizeText(title);
  const transform = `translate(${x} ${y}) scale(${index % 2 === 0 ? 0.9 : 0.84})`;
  let symbol;

  if (key.includes("soleil") || key.includes("etoile")) {
    symbol = `
      <circle class="outline" cx="0" cy="0" r="12"/>
      <path class="detail" d="M0-22v6M0 16v6M-22 0h6M16 0h6M-16-16l5 5m22 22 5 5m0-32-5 5m-22 22-5 5"/>
    `;
  } else if (key.includes("coeur")) {
    symbol = `<path class="outline" d="M0 19c-16-10-22-21-17-32 6-12 20-10 17 3 3-13 17-15 23-3 5 11-1 22-23 32Z"/>`;
  } else if (key.includes("poisson")) {
    symbol = `
      <path class="outline" d="M-21 0c10-14 26-14 37 0-11 14-27 14-37 0Z"/>
      <path class="outline" d="m16 0 12-12v24Z"/>
      <circle class="ink-fill" cx="-11" cy="-3" r="1.8"/>
    `;
  } else if (key.includes("chaussure")) {
    symbol = `
      <path class="outline" d="M-22 8c9 0 15-8 16-20l9 3c4 8 11 12 21 13 4 6 1 12-8 13h-38Z"/>
      <path class="detail" d="M-7-4h12m-15 5H3"/>
    `;
  } else if (key.includes("oiseau")) {
    symbol = `
      <path class="outline" d="M-19 7c4-17 17-24 31-15 8 5 10 14 7 24H-9Z"/>
      <path class="outline" d="m18-2 12 6-12 6"/>
      <path class="detail" d="M-8 1c7 7 14 8 22 3"/>
      <circle class="ink-fill" cx="12" cy="-7" r="1.6"/>
    `;
  } else if (key.includes("papillon")) {
    symbol = `
      <ellipse class="outline" cx="-10" cy="-8" rx="10" ry="14"/>
      <ellipse class="outline" cx="10" cy="-8" rx="10" ry="14"/>
      <ellipse class="outline" cx="-8" cy="10" rx="8" ry="11"/>
      <ellipse class="outline" cx="8" cy="10" rx="8" ry="11"/>
      <path class="detail" d="M0-14v29m0-25-8-11m8 11 8-11"/>
    `;
  } else if (key.includes("voiture")) {
    symbol = `
      <path class="outline" d="M-24 6-18-6H9l9 8 7 3v10h-49Z"/>
      <circle class="outline" cx="-13" cy="15" r="5"/>
      <circle class="outline" cx="14" cy="15" r="5"/>
      <path class="detail" d="m-10-6 5-8H8l6 12"/>
    `;
  } else if (key.includes("fleur")) {
    symbol = `
      <circle class="outline" cx="0" cy="0" r="5"/>
      <circle class="outline" cx="0" cy="-12" r="8"/>
      <circle class="outline" cx="11" cy="-4" r="8"/>
      <circle class="outline" cx="7" cy="10" r="8"/>
      <circle class="outline" cx="-7" cy="10" r="8"/>
      <circle class="outline" cx="-11" cy="-4" r="8"/>
    `;
  } else if (key.includes("crayon")) {
    symbol = `
      <path class="outline" d="m-17 13 26-32 10 8-27 32-12 3Z"/>
      <path class="detail" d="m9-19 10 8m-39 35 3-11 9 8"/>
    `;
  } else if (key.includes("tortue")) {
    symbol = `
      <ellipse class="outline" cx="0" cy="1" rx="17" ry="13"/>
      <circle class="outline" cx="21" cy="0" r="7"/>
      <path class="detail" d="m-11-8 11 9-11 8M0 1l11-9M0 1l11 8"/>
      <path class="outline" d="m-12-10-7-6m7 26-7 6m22-26 7-6m-7 26 7 6"/>
    `;
  } else if (key.includes("banane")) {
    symbol = `<path class="outline" d="M-19-13c8 23 23 30 40 17 4-3 8 3 4 7-17 20-44 13-51-12-3-9 1-15 7-12Z"/>`;
  } else if (key.includes("feuille")) {
    symbol = `
      <path class="outline" d="M-19 18C-18-5-5-19 19-20c0 24-14 37-38 38Z"/>
      <path class="detail" d="M-16 15 13-14m-17 17-1-12m11 1 10-1"/>
    `;
  } else if (key.includes("coccinelle")) {
    symbol = `
      <ellipse class="outline" cx="0" cy="3" rx="15" ry="18"/>
      <path class="detail" d="M0-15v36M-13-8c8 5 18 5 26 0"/>
      <circle class="ink-fill" cx="-7" cy="2" r="2.5"/><circle class="ink-fill" cx="7" cy="2" r="2.5"/>
      <circle class="ink-fill" cx="-7" cy="11" r="2.5"/><circle class="ink-fill" cx="7" cy="11" r="2.5"/>
    `;
  } else if (key.includes("coquillage")) {
    symbol = `
      <path class="outline" d="M-21 15c0-24 9-36 21-36s21 12 21 36Z"/>
      <path class="detail" d="M0-21v36M-9-18l4 33m14-33L5 15m-26 0h42"/>
    `;
  } else if (key.includes("cerf-volant")) {
    symbol = `
      <path class="outline" d="m0-24 20 21L0 21-20-3Z"/>
      <path class="detail" d="M0-24v45M-20-3h40M0 21c-10 6 9 9 0 15"/>
    `;
  } else if (key.includes("champignon")) {
    symbol = `
      <path class="outline" d="M-22 0c3-16 12-24 22-24S19-16 22 0Z"/>
      <path class="outline" d="M-6 0c1 8-1 15-6 22h24C7 15 5 8 6 0"/>
      <circle class="detail" cx="-9" cy="-7" r="3"/><circle class="detail" cx="8" cy="-11" r="3"/>
    `;
  } else if (key.includes("tambour")) {
    symbol = `
      <path class="outline" d="M-18-17h36l-4 35h-28Z"/>
      <path class="detail" d="m-18-17 36 35m0-35-32 35M-22-22l14 11m30-11L8-11"/>
    `;
  } else if (key.includes("mangue") || key.includes("orange")) {
    symbol = `
      <path class="outline" d="M0-18c15 0 23 10 20 23-3 13-13 19-24 17-13-2-20-13-16-25 3-10 10-15 20-15Z"/>
      <path class="detail" d="M0-18c1-8 6-13 14-15m-12 14c-8-6-15-6-22-2"/>
    `;
  } else {
    symbol = `
      <circle class="outline" cx="0" cy="0" r="19"/>
      <path class="detail" d="M-11-8c8 5 15 5 22 0M0-19v38"/>
    `;
  }

  return `<g transform="${transform}">${symbol}</g>`;
}

function renderShape(index) {
  const basicShapes = [
    `<circle class="outline" cx="130" cy="103" r="68"/><circle class="detail" cx="130" cy="103" r="42"/><circle class="texture" cx="130" cy="103" r="16"/>`,
    `<rect class="outline" x="62" y="35" width="136" height="136" rx="3"/><rect class="detail" x="85" y="58" width="90" height="90"/><path class="texture" d="m62 35 136 136m0-136L62 171"/>`,
    `<path class="outline" d="M130 25 221 171H39Z"/><path class="detail" d="m130 59 57 92H73Z"/><path class="texture" d="M130 59v92m-57 0 85-46"/>`,
    `<rect class="outline" x="35" y="62" width="190" height="82" rx="7"/><rect class="detail" x="59" y="79" width="142" height="48"/><path class="texture" d="M82 62v82m96-82v82"/>`,
    `<ellipse class="outline" cx="130" cy="102" rx="84" ry="59"/><ellipse class="detail" cx="130" cy="102" rx="55" ry="35"/><path class="texture" d="M46 102h168M130 43v118"/>`,
    `<path class="outline" d="m130 24 88 78-88 78-88-78Z"/><path class="detail" d="m130 54 54 48-54 48-54-48Z"/><path class="texture" d="M42 102h176M130 24v156"/>`,
    `<path class="outline" d="m82 32 96 0 49 70-49 70H82l-49-70Z"/><path class="detail" d="m99 57 62 0 31 45-31 45H99l-31-45Z"/>`,
    `<path class="outline" d="m85 29 90 0 53 53v40l-53 53H85l-53-53V82Z"/><path class="detail" d="m101 56 58 0 42 42v9l-42 42h-58l-42-42v-9Z"/>`,
    `<path class="outline" d="m130 23 28 50 58 11-40 43 7 58-53-25-53 25 7-58-40-43 58-11Z"/><path class="detail" d="m130 59 15 28 32 6-22 23 4 32-29-14-29 14 4-32-22-23 32-6Z"/>`,
    `<path class="outline" d="M166 29c-50 9-77 42-70 83 6 37 37 59 80 57-23-9-36-28-36-53 0-36 19-65 52-87-9-2-18-2-26 0Z"/><path class="detail" d="M157 52c-25 12-38 32-38 60 0 17 6 31 18 42"/>`,
    `<path class="outline" d="M130 169c-49-29-76-58-68-91 8-32 49-37 68-4 19-33 60-28 68 4 8 33-19 62-68 91Z"/><path class="detail" d="M130 75v84M87 91c19 17 34 39 43 65m43-65c-19 17-34 39-43 65"/>`,
    `<path class="outline" d="M164 48c-20-23-58-9-55 19 3 25 40 24 43 48 3 22-23 41-47 24-22-15-14-48 8-55"/><path class="detail" d="M112 47c-12-9-24-10-36-3m79 92c12 8 24 9 36 2"/>`,
  ];

  if (index < basicShapes.length) {
    return basicShapes[index];
  }

  const mode = (index - basicShapes.length) % 10;
  const shapes = [
    `<circle class="outline" cx="130" cy="103" r="64"/><circle class="detail" cx="130" cy="103" r="40"/><circle class="texture" cx="130" cy="103" r="17"/>`,
    `<rect class="outline" x="66" y="39" width="128" height="128" rx="4"/><rect class="detail" x="89" y="62" width="82" height="82"/><path class="texture" d="m66 39 128 128m0-128L66 167"/>`,
    `<path class="outline" d="M130 29 218 168H42Z"/><path class="detail" d="m130 61 56 89H74Z"/><path class="texture" d="M130 61v89m-56 0 84-45"/>`,
    `<rect class="outline" x="43" y="61" width="174" height="84" rx="12"/><path class="detail" d="M72 61v84m116-84v84M43 103h174"/>`,
    `<path class="outline" d="M130 28c67 0 93 49 75 88-16 35-60 57-75 57s-59-22-75-57c-18-39 8-88 75-88Z"/><path class="detail" d="M84 70c28-18 62-18 92 0M70 106c38 23 78 23 120 0"/>`,
    `<path class="outline" d="m130 24 29 49 58 12-40 43 7 58-54-24-54 24 7-58-40-43 58-12Z"/><path class="detail" d="m130 57 16 30 34 7-24 25 4 34-30-14-30 14 4-34-24-25 34-7Z"/>`,
    `<path class="outline" d="M130 28c12 33 35 44 70 34-10 34 1 57 34 70-33 12-44 35-34 70-35-10-58 1-70 34-12-33-35-44-70-34 10-35-1-58-34-70 33-13 44-36 34-70 35 10 58-1 70-34Z" transform="translate(0 -32)"/><circle class="detail" cx="130" cy="100" r="35"/>`,
    `<path class="outline" d="M45 54h170v102H45Z"/><path class="detail" d="M45 88h170M45 122h170M79 54v102m34-102v102m34-102v102m34-102v102"/><path class="texture" d="m45 54 34 34-34 34 34 34m34-102 34 34-34 34 34 34m34-102 34 34-34 34 34 34"/>`,
    `<path class="outline" d="M36 136c16-55 47-82 94-82s78 27 94 82"/><path class="detail" d="M60 136c13-38 36-57 70-57s57 19 70 57M85 136c8-22 23-33 45-33s37 11 45 33"/><path class="texture" d="M36 151h188"/>`,
    `<circle class="outline" cx="130" cy="101" r="73"/><path class="detail" d="M130 28v146M57 101h146M78 49l104 104M182 49 78 153"/><circle class="detail" cx="130" cy="101" r="43"/><circle class="texture" cx="130" cy="101" r="19"/>`,
  ];
  return shapes[mode];
}

function renderFruit(index) {
  const mode = index % 10;
  if (index === 6) return fruitPapaya();
  if (index === 14) return fruitStrawberry();
  if (index === 20) return fruitAvocado();
  if (index === 24) return fruitPomegranate();
  if ([4, 35].includes(index)) return fruitBanana(index);
  if ([7, 39].includes(index)) return fruitPineapple(index);
  if ([12, 13].includes(index)) return fruitMelon(index);
  if ([2, 3, 15, 16, 17].includes(index)) return fruitCluster(index);
  if ([19, 34].includes(index)) return fruitCoconut(index);
  if (index >= 36) return fruitBasket(index);

  const silhouettes = [
    `<path class="outline" d="M130 61c-28-28-73-12-73 37 0 45 27 78 73 78s73-33 73-78c0-49-45-65-73-37Z"/>`,
    `<path class="outline" d="M130 37c-20 7-27 28-20 50-28 16-43 48-27 72 18 29 76 29 94 0 16-24 1-56-27-72 7-22 0-43-20-50Z"/>`,
    `<ellipse class="outline" cx="130" cy="112" rx="68" ry="61"/>`,
    `<path class="outline" d="M130 38c30 20 54 55 54 91 0 31-22 48-54 48s-54-17-54-48c0-36 24-71 54-91Z"/>`,
    `<path class="outline" d="M66 130c10-54 41-86 82-84 42 2 61 41 45 78-15 34-57 55-93 46-24-6-39-19-34-40Z"/>`,
    `<path class="outline" d="M130 39c41 0 70 31 70 70s-29 68-70 68-70-29-70-68 29-70 70-70Z"/>`,
    `<path class="outline" d="M130 31c11 27 37 38 64 28-8 28 2 53 29 65-27 11-37 37-29 65-27-10-53 1-64 28-11-27-37-38-64-28 8-28-2-54-29-65 27-12 37-37 29-65 27 10 53-1 64-28Z" transform="translate(0 -22)"/>`,
    `<path class="outline" d="M130 45c22 0 49 26 49 69s-22 64-49 64-49-21-49-64 27-69 49-69Z"/>`,
    `<path class="outline" d="M64 116c0-43 30-76 66-76s66 33 66 76c0 40-27 62-66 62s-66-22-66-62Z"/>`,
    `<path class="outline" d="M130 42c42 0 66 29 66 68 0 43-27 68-66 68s-66-25-66-68c0-39 24-68 66-68Z"/>`,
  ];

  return `
    ${silhouettes[mode]}
    <path class="outline" d="M130 61c-2-24 9-39 31-45"/>
    <path class="detail" d="M133 44c-21-15-40-16-57-3 15 14 34 18 55 11"/>
    ${mode % 2 === 0 ? `<path class="texture" d="M101 105c14 9 31 9 48 0m-42 28c15 8 31 8 47 0"/>` : `<path class="texture" d="M130 78v67m-25-49 50 31m0-31-50 31"/>`}
  `;
}

function fruitPapaya() {
  return `
    <path class="outline" d="M130 33c37 22 58 55 58 94 0 34-22 56-58 56s-58-22-58-56c0-39 21-72 58-94Z"/>
    <path class="outline" d="M130 42c21 24 31 52 31 83 0 27-11 43-31 51-20-8-31-24-31-51 0-31 10-59 31-83Z"/>
    <circle class="ink-fill" cx="118" cy="105" r="3"/><circle class="ink-fill" cx="138" cy="96" r="3"/><circle class="ink-fill" cx="143" cy="120" r="3"/><circle class="ink-fill" cx="116" cy="130" r="3"/><circle class="ink-fill" cx="132" cy="143" r="3"/>
    <path class="outline" d="M130 36c-5-18 1-31 18-39"/>
  `;
}

function fruitStrawberry() {
  return `
    <path class="outline" d="M130 61c-42-17-76 10-66 49 8 33 31 59 66 78 35-19 58-45 66-78 10-39-24-66-66-49Z"/>
    <path class="outline" d="M130 65c-18-25-37-32-58-21 11 21 29 30 54 28m8-7c18-25 37-32 58-21-11 21-29 30-54 28m-8-7c-3-25 5-44 24-57"/>
    <circle class="detail" cx="99" cy="102" r="3"/><circle class="detail" cx="130" cy="94" r="3"/><circle class="detail" cx="160" cy="105" r="3"/><circle class="detail" cx="113" cy="128" r="3"/><circle class="detail" cx="147" cy="132" r="3"/><circle class="detail" cx="130" cy="155" r="3"/>
  `;
}

function fruitAvocado() {
  return `
    <path class="outline" d="M130 31c27 18 43 44 47 76 5 38-13 70-47 77-34-7-52-39-47-77 4-32 20-58 47-76Z"/>
    <path class="detail" d="M130 48c20 17 31 39 33 65 3 29-8 50-33 59-25-9-36-30-33-59 2-26 13-48 33-65Z"/>
    <circle class="outline" cx="130" cy="126" r="27"/>
    <path class="outline" d="M130 34c-4-18 3-31 20-39"/>
  `;
}

function fruitPomegranate() {
  return `
    <path class="outline" d="M130 55c40 0 69 27 69 64 0 40-29 66-69 66s-69-26-69-66c0-37 29-64 69-64Z"/>
    <path class="outline" d="m107 58 6-35 17 14 17-14 6 35"/>
    <path class="detail" d="M88 95c27 13 55 13 84 0M78 126c34 16 69 16 104 0M93 157c24-10 49-10 74 0"/>
    <circle class="detail" cx="106" cy="112" r="4"/><circle class="detail" cx="132" cy="107" r="4"/><circle class="detail" cx="157" cy="115" r="4"/><circle class="detail" cx="119" cy="140" r="4"/><circle class="detail" cx="146" cy="141" r="4"/>
  `;
}

function fruitBanana(index) {
  return `
    <path class="outline" d="M57 76c27 61 75 80 133 45 10-6 19 7 12 17-41 58-122 53-163-12-17-28-7-59 18-50Z"/>
    <path class="outline" d="M57 76 45 51m143 72 17-15"/>
    <path class="detail" d="M60 96c30 45 73 57 122 27"/>
    ${index === 35 ? `<path class="outline" d="M69 83c16-24 34-31 54-23m-34 40c17-28 39-36 65-23m-48 34c16-25 35-31 56-19"/>` : ""}
  `;
}

function fruitPineapple(index) {
  return `
    <ellipse class="outline" cx="130" cy="123" rx="55" ry="67"/>
    <path class="outline" d="M130 58C112 39 109 20 120 7c13 13 17 28 10 46m0 5c18-19 21-38 10-51-13 13-17 28-10 46m-4 5c-25-8-40-22-42-40 18 1 32 12 42 34m8 6c25-8 40-22 42-40-18 1-32 12-42 34"/>
    <path class="detail" d="m90 83 80 78m-80 0 80-78M78 112h104m-104 26h104"/>
    ${index === 39 ? `<path class="texture" d="M57 181c21-8 43-8 64 0m18 0c21-8 43-8 64 0"/>` : ""}
  `;
}

function fruitMelon(index) {
  return `
    <path class="outline" d="M36 154C53 79 93 42 156 43c35 1 62 14 80 40-22 52-60 84-112 91-35 5-65-2-88-20Z"/>
    <path class="detail" d="M56 145c18-52 51-79 99-80 24 0 44 7 61 21-24 36-57 58-99 66-24 5-44 2-61-7Z"/>
    <path class="texture" d="M94 119c7-7 14-7 21 0m21-17c7-7 14-7 21 0m18-14c7-7 14-7 21 0m-78 48c7-7 14-7 21 0m24-15c7-7 14-7 21 0"/>
    ${index === 13 ? `<path class="outline" d="M42 154c-17-14-20-29-9-45"/>` : ""}
  `;
}

function fruitCluster(index) {
  return `
    <path class="outline" d="M128 47c-3-21 6-34 27-41m-24 39c-18-14-36-16-54-7 14 17 31 23 53 16"/>
    ${[
      [105, 75],
      [132, 73],
      [159, 78],
      [91, 101],
      [119, 101],
      [148, 103],
      [174, 106],
      [105, 128],
      [134, 130],
      [162, 133],
      [120, 156],
      [149, 158],
    ]
      .map(([x, y], grapeIndex) => `<circle class="${grapeIndex % 3 === 0 ? "outline" : "detail"}" cx="${x}" cy="${y}" r="17"/>`)
      .join("")}
  `;
}

function fruitCoconut(index) {
  return `
    <ellipse class="outline" cx="129" cy="115" rx="66" ry="61"/>
    <path class="detail" d="M76 79c39 2 75 21 107 56m-91-78c44 17 71 50 81 99M120 54c29 25 43 62 42 111"/>
    <circle class="outline" cx="110" cy="100" r="5"/><circle class="outline" cx="137" cy="91" r="5"/><circle class="outline" cx="151" cy="115" r="5"/>
    ${index === 34 ? `<path class="outline" d="M129 54c-5-22 1-38 18-48"/>` : ""}
  `;
}

function fruitBasket(index) {
  return `
    <path class="outline" d="M45 106h170l-17 67H62Z"/>
    <path class="outline" d="M70 106c5-50 25-75 60-75s55 25 60 75"/>
    <circle class="outline" cx="91" cy="91" r="25"/>
    <path class="outline" d="M114 96c0-21 13-38 29-38 17 0 30 17 30 38"/>
    <path class="outline" d="M155 93c5-22 19-32 40-27 7 16 1 30-17 42"/>
    <path class="detail" d="M55 127h150m-145 22h140M87 107v66m43-66v66m43-66v66"/>
    ${index === 39 ? `<path class="texture" d="M33 181h194"/>` : ""}
  `;
}

function renderVegetable(index) {
  if (index === 4) return vegetablePepper();
  if (index === 7) return vegetablePumpkin();
  if (index === 9) return vegetableCauliflower();
  if (index === 10) return vegetableBroccoli();
  if (index === 13) return vegetableLeek();
  if (index === 14) return vegetableOnion(false);
  if (index === 15) return vegetableOnion(true);
  if ([16, 17, 18].includes(index)) return vegetableRoundRoot(index);
  if (index === 19) return vegetablePotato();
  if ([20, 21, 22, 23].includes(index)) return vegetableTuber(index);
  if (index === 24) return vegetableCorn();
  if (index === 25) return vegetablePeas();
  if (index === 26) return vegetableBeans();
  if (index === 27) return vegetableOkra();
  if (index === 28) return vegetableMushroom();
  if (index === 29) return vegetableArtichoke();
  if (index === 30) return vegetableCelery();
  if (index === 31) return vegetableFennel();
  if ([32, 33].includes(index)) return vegetableHerbs(index);
  if (index === 35) return vegetableWheelbarrow();
  if (index >= 36) return vegetableMealScene(index);
  if ([8, 9, 10, 11, 12].includes(index)) return vegetableLeafy(index);
  if ([14, 15, 24, 25, 26, 27, 32, 33].includes(index)) return vegetableBunch(index);
  if (index >= 34) return vegetableScene(index);
  if ([0, 16, 17, 18, 19, 20, 21, 22, 23].includes(index)) return vegetableRoot(index);
  if ([5, 6, 7].includes(index)) return vegetableLong(index);
  return vegetableRound(index);
}

function vegetablePepper() {
  return `
    <path class="outline" d="M130 58c-13-13-30-13-42-2-20 18-22 57-6 91 10 22 27 34 48 34s38-12 48-34c16-34 14-73-6-91-12-11-29-11-42 2Z"/>
    <path class="outline" d="M130 58c-8-21-3-38 16-50"/>
    <path class="outline" d="M132 52c18-17 37-19 56-7-10 17-27 24-50 20"/>
    <path class="detail" d="M130 62c-14 33-14 70 0 111m0-111c14 33 14 70 0 111M93 72c16 11 28 11 37 0m37 0c-16 11-28 11-37 0"/>
  `;
}

function vegetablePumpkin() {
  return `
    <path class="outline" d="M130 58c-35-18-77 9-77 57 0 42 32 67 77 67s77-25 77-67c0-48-42-75-77-57Z"/>
    <path class="outline" d="M130 59c-8-24-2-41 18-53"/>
    <path class="outline" d="M132 51c18-14 36-15 53-3-12 16-29 21-50 15"/>
    <path class="detail" d="M130 61c-22 21-30 50-23 88 4 21 12 32 23 33m0-121c22 21 30 50 23 88-4 21-12 32-23 33M87 73c-22 22-25 54-8 85m94-85c22 22 25 54 8 85"/>
  `;
}

function vegetableCauliflower() {
  return `
    <path class="outline" d="M76 107c-17-7-21-28-7-40 8-7 18-8 27-5 4-18 23-26 38-17 13-13 36-9 43 8 20-2 34 16 28 34 14 10 13 31-1 41-23 16-111 14-128-21Z"/>
    <path class="outline" d="M70 117c18 6 38 18 60 56m60-56c-18 6-38 18-60 56M130 117v56"/>
    <path class="outline" d="M72 132c-17 15-21 34-11 56 29-7 52-19 69-36 17 17 40 29 69 36 10-22 6-41-11-56"/>
    <path class="detail" d="M92 83c8 6 16 6 24 0m19-15c8 6 16 6 24 0m12 23c8 6 16 6 24 0"/>
  `;
}

function vegetableBroccoli() {
  return `
    <circle class="outline" cx="91" cy="75" r="31"/><circle class="outline" cx="130" cy="58" r="35"/><circle class="outline" cx="170" cy="76" r="32"/>
    <path class="outline" d="M86 99c12 16 22 34 29 53l-12 37h54l-12-37c7-19 17-37 29-53"/>
    <path class="detail" d="M130 92v82M102 103c16 12 25 26 28 43m28-43c-16 12-25 26-28 43"/>
    <path class="texture" d="M76 74c9 7 18 7 27 0m13-20c9 7 18 7 27 0m13 22c9 7 18 7 27 0"/>
  `;
}

function vegetableLeek() {
  return `
    <path class="outline" d="M102 61c3-25-3-43-19-56 1 27 7 48 19 63m28-7c0-31 8-51 24-61 2 25-5 47-20 66m28-3c9-24 24-38 45-41-3 25-15 43-37 54"/>
    <path class="outline" d="M99 60h65l14 116H85Z"/>
    <path class="detail" d="M114 61 108 176m37-115 5 115M91 111h80m-75 29h78"/>
  `;
}

function vegetableOnion(garlic) {
  if (garlic) {
    return `
      <path class="outline" d="M130 60c-12-18-11-36 4-54m-4 54c12-17 27-24 45-21-2 19-13 31-34 36"/>
      <path class="outline" d="M130 62c-12-18-35-15-40 5-24-2-38 20-27 41-15 18-6 44 15 51 12 20 39 22 52 4 13 18 40 16 52-4 21-7 30-33 15-51 11-21-3-43-27-41-5-20-28-23-40-5Z"/>
      <path class="detail" d="M130 67v96M92 76c22 20 35 47 38 81m38-81c-22 20-35 47-38 81"/>
    `;
  }
  return `
    <path class="outline" d="M130 59c-13-20-11-39 6-56m-6 56c14-18 30-25 49-20-5 19-18 30-40 34"/>
    <path class="outline" d="M130 62c43 19 65 49 60 83-4 28-26 43-60 43s-56-15-60-43c-5-34 17-64 60-83Z"/>
    <path class="detail" d="M130 69v110M103 82c-15 28-16 57-3 88m57-88c15 28 16 57 3 88"/>
  `;
}

function vegetableRoundRoot(index) {
  const crown = index === 16
    ? `<path class="outline" d="M104 62c-20-8-31-22-33-43 22 1 38 13 47 36m17 7c4-25 17-41 39-48 4 23-4 42-24 56"/>`
    : `<path class="outline" d="M107 61c-17-14-21-31-13-50 18 10 29 25 31 46m9 3c4-23 17-38 38-44 3 21-6 38-25 51"/>`;
  return `
    ${crown}
    <path class="outline" d="M130 57c38 0 63 24 61 59-2 31-24 55-61 70-37-15-59-39-61-70-2-35 23-59 61-59Z"/>
    <path class="detail" d="M96 94c22 10 45 10 69 0m-58 35c17 8 34 8 51 0"/>
    ${index === 16 ? `<path class="outline" d="M130 186v11m0-11-8 8m8-8 8 8"/>` : ""}
  `;
}

function vegetablePotato() {
  return `
    <path class="outline" d="M67 91c10-29 39-45 74-39 39 7 61 34 54 72-7 37-37 61-78 57-42-4-66-42-50-90Z"/>
    <circle class="detail" cx="102" cy="88" r="4"/><circle class="detail" cx="152" cy="80" r="4"/><circle class="detail" cx="132" cy="120" r="4"/><circle class="detail" cx="88" cy="139" r="4"/><circle class="detail" cx="165" cy="145" r="4"/>
  `;
}

function vegetableTuber(index) {
  if (index === 21) {
    return `
      <path class="outline" d="M130 51c-17-18-40-20-60-6 13 16 31 24 53 23m14-17c17-18 40-20 60-6-13 16-31 24-53 23"/>
      <path class="outline" d="M111 64c-10 31-26 60-47 86-12 15 2 36 20 28 25-12 39-49 44-112m21-2c10 31 26 60 47 86 12 15-2 36-20 28-25-12-39-49-44-112"/>
      <path class="detail" d="M92 105l17 7m-29 20 17 8m71-35-17 7m29 20-17 8"/>
    `;
  }
  if (index === 23) {
    return `
      <path class="outline" d="M132 68c-7-29 4-49 31-59 15 23 11 45-13 66"/>
      <path class="outline" d="M139 62c33-22 65-18 87 11-27 25-58 28-91 6"/>
      <path class="outline" d="M130 70c35 12 55 38 53 72-2 30-21 46-53 46s-51-16-53-46c-2-34 18-60 53-72Z"/>
      <path class="detail" d="M103 104c18 8 36 8 54 0m-49 33c15 7 30 7 45 0"/>
    `;
  }
  return `
    <path class="outline" d="M73 88c12-31 42-47 76-39 37 9 58 39 49 75-9 36-41 59-81 53-39-6-60-46-44-89Z"/>
    <path class="outline" d="M132 51c-6-23 3-39 26-48"/>
    <path class="detail" d="M98 85c18 7 37 7 56 0m-64 30c25 10 51 10 77 0m-66 31c18 7 37 7 56 0"/>
  `;
}

function vegetableCorn() {
  return `
    <ellipse class="outline" cx="130" cy="108" rx="42" ry="70"/>
    <path class="detail" d="M101 65h58M92 91h76m-80 27h84m-79 27h74M108 44v128m22-134v140m22-134v128"/>
    <path class="outline" d="M99 72c-27 8-43 28-48 61 5 25 20 43 47 53m63-114c27 8 43 28 48 61-5 25-20 43-47 53"/>
    <path class="detail" d="M61 126c14 9 27 22 38 39m100-39c-14 9-27 22-38 39"/>
  `;
}

function vegetablePeas() {
  return `
    <path class="outline" d="M34 119c25-45 63-64 112-56 35 6 61 24 80 53-25 42-64 61-113 54-35-5-61-22-79-51Z"/>
    <circle class="outline" cx="79" cy="118" r="17"/><circle class="outline" cx="115" cy="111" r="17"/><circle class="outline" cx="151" cy="113" r="17"/><circle class="outline" cx="187" cy="122" r="17"/>
    <path class="outline" d="M210 91c8-18 21-26 39-24-3 20-14 32-34 36"/>
  `;
}

function vegetableBeans() {
  return `
    <path class="outline" d="M38 90c31-25 63-21 88 12 22 29 50 36 85 22-8 37-34 57-69 52-32-4-51-28-72-46-13-12-26-14-40-6"/>
    <path class="outline" d="M44 70c23-18 48-14 68 12m38 8c19 26 42 33 69 20"/>
    <path class="detail" d="M75 113c8 6 16 6 24 0m19 27c8 6 16 6 24 0m22 12c8 6 16 6 24 0"/>
  `;
}

function vegetableOkra() {
  return `
    <path class="outline" d="M86 68c16-15 32-15 48 0-5 47-15 84-30 113-15-29-21-66-18-113Zm52-7c16-15 32-15 48 0 1 43-5 79-20 108-16-27-25-63-28-108Z"/>
    <path class="outline" d="M87 68 72 47l26 5m43 9-13-22 25 6"/>
    <path class="detail" d="M98 75l6 98m53-105 9 93M86 102h43m13-2h43m-96 35h34m24-3h34"/>
  `;
}

function vegetableMushroom() {
  return `
    <path class="outline" d="M49 101c7-42 38-69 81-69s74 27 81 69Z"/>
    <path class="outline" d="M105 101c2 23-4 47-17 71-7 12 3 24 17 24h50c14 0 24-12 17-24-13-24-19-48-17-71Z"/>
    <circle class="detail" cx="91" cy="77" r="8"/><circle class="detail" cx="130" cy="59" r="9"/><circle class="detail" cx="171" cy="80" r="8"/>
  `;
}

function vegetableArtichoke() {
  return `
    <path class="outline" d="M130 31c38 24 58 54 58 91 0 39-22 61-58 67-36-6-58-28-58-67 0-37 20-67 58-91Z"/>
    <path class="detail" d="M130 40v144M91 78c18 5 31 17 39 35m39-35c-18 5-31 17-39 35M80 116c22 4 39 15 50 33m50-33c-22 4-39 15-50 33M95 161c12 3 24 10 35 22m35-22c-12 3-24 10-35 22"/>
  `;
}

function vegetableCelery() {
  return `
    <path class="outline" d="M91 75c-21-11-30-29-25-51 22 5 37 19 44 41m20 8c-7-29 1-51 24-66 15 23 14 45-3 68m18 9c9-25 26-40 51-42-1 25-15 44-40 55"/>
    <path class="outline" d="M96 72h69l17 110H79Z"/>
    <path class="detail" d="M112 74 103 182m29-108-2 108m22-107 11 107M86 125h89m-84 29h88"/>
  `;
}

function vegetableFennel() {
  return `
    <path class="outline" d="M130 74c-8-28-4-52 13-72m-13 72c-24-23-47-31-70-24m70 24c24-23 47-31 70-24m-70 24c-4-30-17-50-39-60m39 60c4-30 17-50 39-60"/>
    <path class="outline" d="M130 70c32 14 50 39 48 72-2 29-20 45-48 45s-46-16-48-45c-2-33 16-58 48-72Z"/>
    <path class="detail" d="M130 77v104M102 97c18 13 27 34 28 63m28-63c-18 13-27 34-28 63"/>
  `;
}

function vegetableHerbs(index) {
  return `
    <path class="outline" d="M130 183V61m0 35c-27-4-44-19-51-44 25-3 42 8 51 34m0 28c27-4 44-19 51-44-25-3-42 8-51 34m0 36c-24-2-40-14-49-35 23-5 40 4 49 24m0 16c24-2 40-14 49-35-23-5-40 4-49 24"/>
    ${index === 32 ? `<path class="detail" d="M89 58c11 8 23 12 36 13m46 16c-11 8-23 12-36 13"/>` : `<path class="detail" d="M83 54c15 13 30 18 45 16m49 1c-15 13-30 18-45 16"/>`}
    <path class="outline" d="M96 183h68"/>
  `;
}

function vegetableWheelbarrow() {
  return `
    <path class="outline" d="M40 87h149l-21 65H65Z"/>
    <path class="detail" d="M51 108h128m-121 22h114M83 88v64m39-64v64m39-64v64"/>
    <circle class="outline" cx="119" cy="170" r="18"/>
    <path class="outline" d="M168 151h50m-14 0 24-29"/>
    <circle class="outline" cx="86" cy="72" r="23"/><path class="outline" d="M115 83c-4-18 2-31 18-40 14 12 17 26 8 42"/>
  `;
}

function vegetableMealScene(index) {
  if (index === 38) {
    return `
      <ellipse class="outline" cx="130" cy="148" rx="78" ry="28"/>
      <path class="outline" d="M68 87h124l-13 61H81Z"/>
      <path class="outline" d="M92 87c0-20 14-35 34-35 17 0 30 12 34 28"/>
      <path class="detail" d="M91 108h78m-72 20h66"/>
      <path class="outline" d="M109 41c-8-12-5-23 7-32m25 32c8-12 5-23-7-32"/>
    `;
  }
  if (index === 39) {
    return `
      <circle class="outline" cx="130" cy="108" r="82"/>
      <circle class="detail" cx="130" cy="108" r="58"/>
      <path class="outline" d="M92 112c14-24 34-32 58-24 14 5 26 15 35 30-18 22-41 28-67 18-11-4-20-12-26-24Z"/>
      <circle class="outline" cx="96" cy="77" r="17"/><path class="outline" d="M145 50c18 9 27 23 28 42"/>
    `;
  }
  return vegetableScene(index);
}

function vegetableRoot(index) {
  return `
    <path class="outline" d="M91 61c19-16 59-16 78 0-5 50-18 89-39 117-21-28-34-67-39-117Z"/>
    <path class="outline" d="M116 60c-17-12-24-30-18-50 18 9 29 24 31 45m3 0c3-24 15-39 36-45 3 20-5 37-23 50m-11-3c-8-25-4-44 12-57"/>
    <path class="detail" d="m101 91 16 5m-9 23 16 5m9-43 16 5m-19 57 16 4"/>
    ${index % 2 === 0 ? `<path class="texture" d="M130 178v11m0-11-8 7m8-7 8 7"/>` : ""}
  `;
}

function vegetableRound(index) {
  return `
    <path class="outline" d="M130 52c42 0 72 30 72 68s-30 62-72 62-72-24-72-62 30-68 72-68Z"/>
    <path class="outline" d="M130 58c-17-19-17-36 0-52 17 16 17 33 0 52Zm-2 1c-27-3-42-15-45-36 23-1 39 9 47 31m2 5c27-3 42-15 45-36-23-1-39 9-47 31"/>
    <path class="detail" d="M87 84c26 13 54 13 85 0M74 121c35 18 73 18 112 0M91 158c25-11 51-11 78 0"/>
    ${index % 2 ? `<path class="texture" d="M130 55v124"/>` : ""}
  `;
}

function vegetableLong(index) {
  return `
    <path class="outline" d="M43 116c17-34 47-52 90-53 35-1 64 13 85 42-17 37-50 57-95 58-38 1-65-15-80-47Z"/>
    <path class="outline" d="M204 95c9-18 22-25 39-21-2 18-11 29-29 33"/>
    <path class="detail" d="M70 105c31 12 67 14 108 6m-100 30c34 9 69 7 104-6"/>
    ${index === 6 ? `<circle class="texture" cx="96" cy="98" r="2.5"/><circle class="texture" cx="129" cy="128" r="2.5"/><circle class="texture" cx="164" cy="96" r="2.5"/><circle class="texture" cx="187" cy="126" r="2.5"/>` : `<path class="texture" d="M92 83c-9 16-11 35-5 57m35-70c-8 23-8 51 1 84m32-83c-7 23-6 48 4 73"/>`}
  `;
}

function vegetableLeafy(index) {
  return `
    <path class="outline" d="M130 174c-44 0-76-24-76-61 0-22 12-39 32-48-2-24 15-42 39-39 14-18 41-16 52 4 24 0 39 20 34 43 20 12 26 36 13 57-15 28-50 44-94 44Z"/>
    <path class="detail" d="M130 42v132M91 68c20 17 33 37 39 61m42-69c-20 18-33 41-42 69M67 103c26 8 47 20 63 37m67-49c-27 12-49 28-67 49"/>
    <path class="texture" d="M84 130c17 7 32 15 46 27m46-35c-18 9-33 21-46 35"/>
  `;
}

function vegetableBunch(index) {
  return `
    <path class="outline" d="M87 58c-18-12-26-29-22-49 21 5 34 18 39 40m17 8c-6-25 1-44 21-57 13 20 12 39-2 59m16 8c8-23 23-36 45-38-1 23-12 40-34 51"/>
    <path class="outline" d="M92 62c15-10 30-10 45 0 18-5 34 5 38 23 17 8 21 28 9 42-1 21-17 34-38 31-16 17-41 14-53-6-21-2-33-21-27-40-12-17-2-41 18-45Z"/>
    <path class="detail" d="M130 59v99M91 78c20 16 33 35 39 57m40-55c-20 16-33 35-40 55M72 110c25 4 44 13 58 25m57-25c-23 5-42 13-57 25"/>
    ${index === 24 ? `<path class="texture" d="M94 171h72M104 183h52"/>` : ""}
  `;
}

function vegetableScene(index) {
  return `
    <path class="outline" d="M37 87h186l-18 88H55Z"/>
    <path class="outline" d="M68 87c0-31 14-49 41-54 15 10 21 28 17 54m17 0c2-37 19-58 51-63 8 20 4 41-14 63"/>
    <path class="detail" d="M47 111h166m-161 24h156m-151 22h146M81 88v87m37-87v87m38-87v87m37-87v87"/>
    <circle class="outline" cx="103" cy="72" r="19"/>
    <path class="outline" d="M161 83c-6-17-2-30 12-40 16 13 18 27 7 42"/>
    ${index >= 38 ? `<path class="texture" d="M27 184h206"/>` : ""}
  `;
}

function renderHome(index) {
  if ([0, 2].includes(index)) return homeChair(index);
  if (index === 1) return homeObject(index);
  if (index === 4) return homeBed();
  if (index === 5) return homeBunkBed();
  if (index === 7) return homeDresser();
  if (index === 8) return homeLibrary();
  if (index === 9) return homeDesk();
  if ([10, 11].includes(index)) return homeLamp(index);
  if ([12, 13, 14, 15].includes(index)) return homeDecor(index);
  if ([16, 17, 18, 19].includes(index)) return homeUtility(index);
  if ([20, 21, 22, 23].includes(index)) return homeKitchenObject(index);
  if ([24, 25, 26, 27].includes(index)) return homeDish(index);
  if ([28, 29].includes(index)) return homeEntry(index);
  if ([3, 4, 5].includes(index)) return homeSofaBed(index);
  if ([6, 7, 8, 9, 16, 17].includes(index)) return homeStorage(index);
  if (index >= 30) return homeRoom(index);
  return homeKitchen(index);
}

function homeLibrary() {
  return `
    <path class="outline" d="M55 26h150v154H55Z"/>
    <path class="detail" d="M55 78h150M55 129h150M84 26v52m40-52v52m38-52v52M76 78v51m48-51v51m42-51v51M88 129v51m46-51v51m39-51v51"/>
    <path class="outline" d="M67 42h12v31H67Zm29-8h16v39H96Zm40 13h14v26h-14Zm35-10h20v36h-20Z"/>
    <path class="outline" d="M66 92h19v32H66Zm30-8h14v40H96Zm25 13h20v27h-20Zm32-7h15v34h-15Zm26 5h15v29h-15Z"/>
    <path class="outline" d="M70 142h15v33H70Zm27-6h20v39H97Zm31 12h14v27h-14Zm26-9h18v36h-18Zm29 7h12v29h-12Z"/>
  `;
}

function homeDesk() {
  return `
    <path class="outline" d="M44 85h172v32H44Z"/>
    <path class="outline" d="M61 117v66m138-66v66M83 117v45h94v-45"/>
    <path class="detail" d="M83 140h94M130 117v45"/>
    <path class="outline" d="M97 52h66v33H97Z"/>
    <path class="outline" d="M103 183v-31h54v31M92 183h76"/>
    <path class="detail" d="M114 68h32"/>
  `;
}

function homeLamp(index) {
  if (index === 10) {
    return `
      <path class="outline" d="M88 79h84l20 49H68Z"/>
      <path class="outline" d="M119 128v39m22-39v39M97 167h66"/>
      <path class="outline" d="M109 79c0-21 7-33 21-39 14 6 21 18 21 39"/>
      <path class="detail" d="M76 110h108"/>
    `;
  }
  return `
    <path class="outline" d="M90 56h80l19 47H71Z"/>
    <path class="outline" d="M124 103v65m12-65v65M97 168h66"/>
    <path class="outline" d="M109 56c0-22 7-35 21-41 14 6 21 19 21 41"/>
    <path class="detail" d="M79 87h102"/>
  `;
}

function homeDecor(index) {
  if (index === 12) {
    return `
      <circle class="outline" cx="130" cy="102" r="69"/>
      <path class="detail" d="M130 47v55l37 23M130 33v15m0 108v15M61 102h15m108 0h15"/>
      <path class="outline" d="M104 31c4-18 13-27 26-27s22 9 26 27"/>
    `;
  }
  if (index === 13) {
    return `
      <path class="outline" d="M71 19h118v166H71Z"/>
      <path class="detail" d="M87 35h86v134H87Z"/>
      <path class="texture" d="M98 58c18-15 39-18 64-8m-63 33c15-12 31-15 50-10"/>
      <path class="outline" d="M104 185v8m52-8v8"/>
    `;
  }
  if (index === 14) {
    return `
      <rect class="outline" x="43" y="48" width="174" height="112" rx="8"/>
      <path class="detail" d="M60 65h140v78H60Z"/>
      <path class="texture" d="m60 65 70 78 70-78m-140 78 70-78 70 78M95 65v78m70-78v78"/>
      <path class="outline" d="M65 160v17m130-17v17"/>
    `;
  }
  return `
    <path class="outline" d="M43 29h174v18H43Z"/>
    <path class="outline" d="M58 47v133h64V47m80 0v133h-64V47"/>
    <path class="detail" d="M74 49c11 25 11 56 0 93m32-93c-11 25-11 56 0 93m48-93c11 25 11 56 0 93m32-93c-11 25-11 56 0 93"/>
    <path class="outline" d="M122 47v133m16-133v133"/>
  `;
}

function homeUtility(index) {
  if (index === 16) {
    return `
      <path class="outline" d="M49 78h162v98H49Z"/>
      <path class="outline" d="M40 78h180l-21-39H61Z"/>
      <path class="detail" d="M73 97h114m-114 28h114m-114 28h114M130 78v98"/>
      <path class="outline" d="M117 91h26v18h-26Z"/>
    `;
  }
  if (index === 17) {
    return `
      <path class="outline" d="M54 82h152l-18 98H72Z"/>
      <path class="outline" d="M82 82c3-39 19-59 48-59s45 20 48 59"/>
      <path class="detail" d="M65 109h130M60 137h140M91 82v98m39-98v98m39-98v98"/>
      <path class="texture" d="M95 55c21 11 43 11 66 0"/>
    `;
  }
  if (index === 18) {
    return `
      <path class="outline" d="M36 87h188v40c0 31-25 56-56 56H92c-31 0-56-25-56-56Z"/>
      <path class="outline" d="M26 87h208"/>
      <path class="outline" d="M185 87V54c0-16 8-25 24-25"/>
      <path class="detail" d="M183 54h31m-31 14h31"/>
      <path class="outline" d="M62 183v9m136-9v9"/>
      <path class="texture" d="M63 113c16 8 31 8 47 0m21 11c17 8 34 8 51 0"/>
    `;
  }
  return `
    <path class="outline" d="M70 68h120v98H70Z"/>
    <ellipse class="outline" cx="130" cy="82" rx="53" ry="24"/>
    <ellipse class="detail" cx="130" cy="82" rx="30" ry="12"/>
    <path class="outline" d="M106 58c0-22 8-34 24-34 16 0 24 12 24 34"/>
    <path class="detail" d="M88 115h84m-42-9v60"/>
    <path class="outline" d="M70 166v18m120-18v18"/>
  `;
}

function homeKitchenObject(index) {
  if (index === 20) {
    return `
      <path class="outline" d="M63 43h134v138H63Z"/>
      <path class="detail" d="M63 89h134M83 108h94v55H83Z"/>
      <circle class="outline" cx="94" cy="65" r="16"/><circle class="outline" cx="166" cy="65" r="16"/>
      <circle class="detail" cx="92" cy="99" r="3"/><circle class="detail" cx="115" cy="99" r="3"/><circle class="detail" cx="145" cy="99" r="3"/><circle class="detail" cx="168" cy="99" r="3"/>
    `;
  }
  if (index === 21) {
    return `
      <rect class="outline" x="68" y="21" width="124" height="164" rx="8"/>
      <path class="detail" d="M68 89h124M130 21v164"/>
      <path class="outline" d="M112 52h9m18 0h9M112 118h9m18 0h9"/>
      <path class="texture" d="M84 105h30m-30 12h30m32-12h30m-30 12h30"/>
    `;
  }
  if (index === 22) {
    return `
      <path class="outline" d="M71 92c0-35 24-57 59-57 35 0 59 22 59 57v59H71Z"/>
      <ellipse class="outline" cx="130" cy="92" rx="59" ry="21"/>
      <path class="outline" d="M105 39c2-18 10-27 25-27s23 9 25 27"/>
      <path class="outline" d="M189 92h23c20 0 28 14 17 31-8 12-21 17-40 13"/>
      <path class="outline" d="M71 107 33 89c-5 21 7 34 38 39"/>
      <path class="detail" d="M91 119h78"/>
    `;
  }
  return `
    <path class="outline" d="M71 73h118v91H71Z"/>
    <ellipse class="outline" cx="130" cy="73" rx="59" ry="21"/>
    <ellipse class="detail" cx="130" cy="73" rx="37" ry="12"/>
    <path class="outline" d="M102 52c2-21 11-32 28-32s26 11 28 32"/>
    <path class="outline" d="M71 99H48c-17 0-24 13-17 28 7 14 20 20 40 16m118-44h23c17 0 24 13 17 28-7 14-20 20-40 16"/>
    <path class="detail" d="M93 111h74m-74 27h74"/>
  `;
}

function homeDish(index) {
  if (index === 24) {
    return `
      <path class="outline" d="M50 96h126c-6 48-26 72-63 72S56 144 50 96Z"/>
      <ellipse class="outline" cx="113" cy="96" rx="63" ry="20"/>
      <path class="outline" d="M188 48v109m0-109c17 0 26 10 26 27s-9 27-26 27"/>
      <path class="detail" d="M64 118h98"/>
    `;
  }
  if (index === 25) {
    return `
      <path class="outline" d="M66 54h116v111c0 12-10 22-22 22H88c-12 0-22-10-22-22Z"/>
      <ellipse class="outline" cx="124" cy="54" rx="58" ry="20"/>
      <path class="outline" d="M182 78h18c23 0 32 17 22 37-8 17-22 24-40 20"/>
      <path class="detail" d="M83 94h82m-82 29h82m-82 29h82"/>
    `;
  }
  if (index === 26) {
    return `
      <circle class="outline" cx="130" cy="104" r="82"/>
      <circle class="detail" cx="130" cy="104" r="58"/>
      <path class="texture" d="M95 83c21 13 44 13 69 0m-69 40c21-13 44-13 69 0"/>
    `;
  }
  return `
    <path class="outline" d="M88 78h84l-13 101h-58Z"/>
    <ellipse class="outline" cx="130" cy="78" rx="42" ry="15"/>
    <path class="outline" d="M130 78V35m0 18c-19-18-38-22-57-12 12 20 31 28 57 23m0-11c19-18 38-22 57-12-12 20-31 28-57 23"/>
    <circle class="outline" cx="103" cy="28" r="18"/><circle class="outline" cx="157" cy="28" r="18"/>
    <path class="detail" d="M111 99h38m-35 27h32"/>
  `;
}

function homeEntry(index) {
  if (index === 28) {
    return `
      <path class="outline" d="M72 25h116v161H72Z"/>
      <path class="detail" d="M91 45h78v121H91Z"/>
      <circle class="ink-fill" cx="153" cy="110" r="4"/>
      <path class="outline" d="M62 186h136"/>
    `;
  }
  return `
    <path class="outline" d="M57 32h146v134H57Z"/>
    <path class="detail" d="M130 32v134M57 99h146"/>
    <path class="outline" d="M67 166c17 16 38 24 63 24s46-8 63-24"/>
    <path class="texture" d="M78 54c12 8 25 8 38 0m28 0c12 8 25 8 38 0"/>
  `;
}

function homeBed() {
  return `
    <path class="outline" d="M44 78v102m172-102v102"/>
    <path class="outline" d="M44 105h172v56H44Z"/>
    <path class="outline" d="M44 73h58c15 0 27 12 27 27v5H44Z"/>
    <path class="detail" d="M65 84c18-7 34-6 49 4M44 137h172"/>
    <path class="outline" d="M65 161v21m130-21v21"/>
    <path class="texture" d="M139 116c15 8 31 8 48 0m-43 14c13 6 27 6 42 0"/>
  `;
}

function homeBunkBed() {
  return `
    <path class="outline" d="M54 37v145m152-145v145"/>
    <path class="outline" d="M54 55h152v43H54Zm0 66h152v43H54Z"/>
    <path class="detail" d="M73 55v43m0 23v43M54 86h152m-152 66h152"/>
    <path class="outline" d="M177 98v23m0 43v18"/>
    <path class="detail" d="M177 99h29m-29 17h29m-29 17h29m-29 17h29"/>
    <path class="outline" d="M78 70c14-8 30-8 47 0m-47 66c14-8 30-8 47 0"/>
  `;
}

function homeDresser() {
  return `
    <path class="outline" d="M64 42h132v132H64Z"/>
    <path class="detail" d="M64 82h132M64 125h132"/>
    <path class="outline" d="M81 174v14m98-14v14"/>
    <path class="detail" d="M113 62h34M113 103h34M113 146h34"/>
    <circle class="ink-fill" cx="130" cy="62" r="3"/>
    <circle class="ink-fill" cx="130" cy="103" r="3"/>
    <circle class="ink-fill" cx="130" cy="146" r="3"/>
  `;
}

function homeChair(index) {
  return `
    <path class="outline" d="M85 30h90v83H85Z"/>
    <path class="outline" d="M69 105h122v38H69Z"/>
    <path class="outline" d="M82 143v40m96-40v40M85 48h90M103 30v83m54-83v83"/>
    <path class="detail" d="M69 124h122M92 183H72m96 0h20"/>
    ${index === 2 ? `<path class="outline" d="M61 92c-17 0-27 13-25 31 2 17 13 27 33 30m122-61c17 0 27 13 25 31-2 17-13 27-33 30"/>` : ""}
  `;
}

function homeObject(index) {
  const mode = index % 4;
  if (mode === 0) {
    return `
      <path class="outline" d="M73 69h114v85H73Z"/>
      <circle class="outline" cx="130" cy="111" r="40"/>
      <path class="detail" d="M130 78v34l23 17M130 71v-9m0 99v-9m-48-41h9m78 0h9"/>
      <path class="outline" d="M94 69c3-21 15-32 36-32s33 11 36 32"/>
    `;
  }
  if (mode === 1) {
    return `
      <path class="outline" d="M91 51h78l22 55H69Z"/>
      <path class="outline" d="M119 106v62m22-62v62M99 168h62"/>
      <path class="detail" d="M78 83h104M109 51c0-20 7-32 21-38 14 6 21 18 21 38"/>
    `;
  }
  if (mode === 2) {
    return `
      <path class="outline" d="M69 40h122v125H69Z"/>
      <path class="detail" d="M85 55h90v95H85Z"/>
      <path class="outline" d="M95 165v20m70-20v20"/>
      <path class="texture" d="m85 55 90 95m0-95-90 95"/>
    `;
  }
  return `
    <path class="outline" d="M55 62h150v98H55Z"/>
    <path class="detail" d="M80 62v98m50-98v98m50-98v98M55 111h150"/>
    <path class="outline" d="M75 160v20m110-20v20"/>
    <circle class="detail" cx="118" cy="87" r="3"/><circle class="detail" cx="142" cy="87" r="3"/>
  `;
}

function homeSofaBed(index) {
  return `
    <path class="outline" d="M49 101c0-15 11-26 26-26 12 0 21 7 24 18h62c3-11 12-18 24-18 15 0 26 11 26 26v53H49Z"/>
    <path class="outline" d="M76 93V61c0-12 10-22 22-22h64c12 0 22 10 22 22v32"/>
    <path class="detail" d="M99 93v61m62-61v61M49 129h162"/>
    <path class="outline" d="M67 154v25m126-25v25"/>
    ${index === 4 ? `<path class="texture" d="M108 63c14 8 29 8 44 0m-48 18c17 8 34 8 51 0"/>` : ""}
  `;
}

function homeStorage(index) {
  return `
    <path class="outline" d="M65 27h130v145H65Z"/>
    <path class="detail" d="M130 27v145M77 46h41v45H77Zm65 0h41v45h-41ZM77 105h41v49H77Zm65 0h41v49h-41Z"/>
    <circle class="ink-fill" cx="122" cy="99" r="2.5"/><circle class="ink-fill" cx="138" cy="99" r="2.5"/>
    <path class="outline" d="M81 172v14m98-14v14"/>
    ${index === 8 ? `<path class="texture" d="M82 57h31m-31 10h31m34-10h31m-31 10h31"/>` : ""}
  `;
}

function homeKitchen(index) {
  return `
    <path class="outline" d="M75 70h110v92H75Z"/>
    <ellipse class="outline" cx="130" cy="69" rx="55" ry="20"/>
    <ellipse class="detail" cx="130" cy="69" rx="35" ry="11"/>
    <path class="outline" d="M103 49c1-19 10-29 27-29s26 10 27 29"/>
    <path class="detail" d="M89 96h82m-82 28h82M130 89v73"/>
    <path class="outline" d="M75 104H55c-13 0-19 10-15 22 5 13 16 18 35 15m110-37h20c13 0 19 10 15 22-5 13-16 18-35 15"/>
    ${index % 3 === 0 ? `<path class="texture" d="M111 179c12-7 25-7 38 0"/>` : ""}
  `;
}

function homeRoom(index) {
  return `
    <path class="outline" d="M31 42h198v132H31Z"/>
    <path class="outline" d="M51 112h91v43H51Zm17-33h57v33H68Z"/>
    <path class="outline" d="M168 85h39v70h-39Zm-6-18h51"/>
    <path class="detail" d="M84 112v43m42-43v43M51 137h91M175 155v18m25-18v18"/>
    <path class="outline" d="M151 174c-9-19-3-32 17-38m-17 38c12-17 29-22 51-15"/>
    ${index >= 38 ? `<path class="texture" d="M45 56h37m-37 12h37M191 55v21m-11-11h22"/>` : ""}
  `;
}

function renderBuilding(index) {
  if ([28, 29].includes(index)) return buildingTower(index);
  if ([30, 31, 33].includes(index)) return buildingInfrastructure(index);
  if (index >= 34) return buildingLandscape(index);
  if ([3, 4, 5, 6, 7, 8, 9, 10].includes(index)) return buildingCivic(index);
  if (index >= 11 && index <= 27) return buildingShop(index);
  return buildingHouse(index);
}

function buildingHouse(index) {
  return `
    <path class="outline" d="M45 93 130 27l85 66v82H45Z"/>
    <path class="outline" d="M28 98 130 18l102 80"/>
    <path class="outline" d="M67 104h42v71H67Zm72 7h51v41h-51Z"/>
    <path class="detail" d="M164 111v41m-25-20h51M84 137h8"/>
    <path class="outline" d="M183 67V38h20v45"/>
    <path class="texture" d="M36 176h188"/>
    ${index === 1 ? `<path class="outline" d="M46 93h168M130 27v66"/>` : ""}
  `;
}

function buildingCivic(index) {
  const symbol = {
    4: `<path class="outline" d="M103 48c10-3 19-1 27 6 8-7 17-9 27-6v25c-10-3-19-1-27 6-8-7-17-9-27-6Z"/><path class="detail" d="M130 54v25"/>`,
    5: `<path class="outline" d="M116 55h28M130 41v28"/>`,
    6: `<path class="outline" d="M111 47h38l-7 24h-24Z"/><path class="detail" d="M130 47V33m0 0 11-6m-11 6-8-9"/>`,
    7: `<path class="outline" d="M130 34c15 14 19 27 11 38-7 10-22 11-30 2-9-11-5-25 12-39-2 12 1 20 7 24 6-5 6-13 0-25Z"/>`,
    8: `<path class="outline" d="m130 37 18 8-4 22-14 12-14-12-4-22Z"/><path class="detail" d="m130 48 4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1Z"/>`,
    9: `<circle class="outline" cx="130" cy="56" r="21"/><path class="detail" d="M130 43v14l10 7"/>`,
    10: `<path class="outline" d="M106 43h48v33h-48Z"/><path class="detail" d="m106 45 24 18 24-18"/>`,
  }[index] ?? `<path class="outline" d="M116 55h28M130 41v28"/>`;

  return `
    <path class="outline" d="M36 79h188v94H36Z"/>
    <path class="outline" d="M26 79 130 25l104 54Z"/>
    <path class="outline" d="M54 92h27v63H54Zm42 0h27v63H96Zm42 0h27v63h-27Zm42 0h27v63h-27Z"/>
    <path class="detail" d="M36 155h188M25 173h210"/>
    ${symbol}
    ${index === 7 ? `<path class="detail" d="M91 104h78v51H91Zm13 0v51m26-51v51m26-51v51"/>` : ""}
    ${index === 3 ? `<path class="texture" d="M61 107h13m29 0h13m29 0h13m29 0h13"/>` : ""}
  `;
}

function buildingShop(index) {
  return `
    <path class="outline" d="M39 62h182v112H39Z"/>
    <path class="outline" d="M30 62h200l-14 38H44Z"/>
    <path class="detail" d="M48 62v38m36-38v38m36-38v38m36-38v38m36-38v38"/>
    <path class="outline" d="M61 116h62v58H61Zm85 0h51v40h-51Z"/>
    <path class="detail" d="M171 116v40M146 136h51"/>
    <path class="outline" d="M87 41h86v21H87Z"/>
    <path class="texture" d="M25 175h210"/>
  `;
}

function buildingTower(index) {
  return `
    <path class="outline" d="M79 58h102l18 119H61Z"/>
    <path class="outline" d="M97 58V31h66v27m-22-27V12"/>
    <path class="detail" d="M91 78h25v22H91Zm53 0h25v22h-25Zm-48 38h28v25H96Zm43 0h28v25h-28Z"/>
    <path class="outline" d="M114 177v-24h32v24"/>
    <path class="texture" d="M48 177h164"/>
    ${index === 29 ? `<path class="detail" d="M104 46h51"/>` : ""}
  `;
}

function buildingInfrastructure(index) {
  return `
    <path class="outline" d="M27 136c35-54 69-54 103 0 35-54 69-54 103 0v31H27Z"/>
    <path class="detail" d="M27 136h206M51 108v59m55-57v57m49-57v57m55-59v59"/>
    <path class="outline" d="M43 167v18m174-18v18"/>
    <path class="texture" d="M19 185h222"/>
    ${index === 31 ? `<path class="outline" d="M28 91h204M47 91v45m166-45v45"/><path class="detail" d="M71 91 51 65m138 26 20-26"/>` : ""}
  `;
}

function buildingLandscape(index) {
  return `
    <path class="outline" d="M30 165V92l52-38 48 35 43-29 57 42v63Z"/>
    <path class="detail" d="M45 111h33v54m13-57h26v35H91Zm60 16h31v41h-31Zm43-3h23v25h-23Z"/>
    <path class="outline" d="M28 165h204"/>
    <path class="outline" d="M119 165c6-35 24-56 54-64"/>
    <path class="texture" d="M50 47c11-18 27-25 48-21m80 22c12-16 27-21 45-14"/>
    ${index === 38 ? `<path class="detail" d="M25 181c23-8 46-8 69 0 24 8 48 8 72 0 23-8 46-8 69 0"/>` : ""}
  `;
}

function renderNature(index) {
  if (index <= 7) return natureWeather(index);
  if (index <= 13) return natureTree(index);
  if (index <= 19) return natureFlower(index);
  if (index <= 25) return natureWater(index);
  if (index <= 33) return natureLandscape(index);
  return natureWorld(index);
}

function natureWeather(index) {
  const sun = index === 0 || index === 6;
  return `
    ${sun ? `<circle class="outline" cx="80" cy="67" r="31"/><path class="detail" d="M80 21v17m0 58v17M34 67h17m58 0h17M48 35l12 12m40 40 12 12m0-64-12 12M60 87 48 99"/>` : ""}
    <path class="outline" d="M66 122c-19 0-31-10-31-25 0-16 13-26 31-25 6-24 36-34 55-17 12-19 43-15 49 7 23-3 39 10 39 29 0 20-17 31-41 31Z"/>
    ${index === 3 ? `<path class="outline" d="M53 147c24-35 51-35 77 0 26-35 53-35 78 0"/><path class="detail" d="M72 147c18-21 37-21 58 0 20-21 40-21 59 0"/>` : ""}
    ${index === 4 || index === 5 ? `<path class="detail" d="m73 139-9 24m43-24-9 24m43-24-9 24m43-24-9 24"/>` : ""}
    ${index === 7 ? `<path class="texture" d="m62 151 8-14 8 14 8-14 8 14m19 0 8-14 8 14 8-14 8 14m18 0 8-14 8 14"/>` : ""}
  `;
}

function natureTree(index) {
  return `
    <path class="outline" d="M111 171c9-31 10-57 3-79m34 79c-8-32-7-61 2-87M99 172h63"/>
    <path class="outline" d="M128 30c-12-19-39-18-50 1-22-5-40 12-36 34-19 10-22 37-6 51-4 24 18 42 40 34 14 20 43 20 57 1 20 11 46-2 47-25 24-7 32-34 16-51 10-22-6-47-30-47-7-21-33-29-52-14Z"/>
    <path class="detail" d="M128 56v115M90 79c19 12 32 28 38 48m42-54c-20 15-34 33-42 54M65 113c26 6 47 18 63 36m66-43c-27 9-49 23-66 43"/>
    ${index === 9 ? `<path class="texture" d="M80 45c10 8 21 8 32 0m33 8c10 8 21 8 32 0"/>` : ""}
  `;
}

function natureFlower(index) {
  return `
    <circle class="outline" cx="130" cy="73" r="22"/>
    <path class="outline" d="M130 51c-18-36-43-31-41-7 1 13 14 23 41 29m0-22c18-36 43-31 41-7-1 13-14 23-41 29m-22 0c-36-18-31-43-7-41 13 1 23 14 29 41m22 0c36-18 31-43 7-41-13 1-23 14-29 41m-21 8c-34 21-27 45-4 40 13-3 21-17 25-48m21 8c34 21 27 45 4 40-13-3-21-17-25-48"/>
    <path class="outline" d="M130 95v82"/>
    <path class="outline" d="M130 129c-24-15-43-13-55 6 16 20 34 20 55 0m0 18c22-17 42-17 58 0-15 21-35 22-58 6"/>
    <path class="texture" d="M92 178h76"/>
  `;
}

function natureWater(index) {
  return `
    <path class="outline" d="M27 126c20-13 40-13 60 0s40 13 60 0 40-13 60 0 40 13 60 0"/>
    <path class="detail" d="M27 148c20-13 40-13 60 0s40 13 60 0 40-13 60 0 40 13 60 0M35 171c17-9 34-9 51 0 18 9 36 9 54 0 17-9 34-9 51 0 17 8 34 8 50 0"/>
    <circle class="outline" cx="79" cy="61" r="29"/>
    <path class="outline" d="M27 121 76 72l32 33 31-28 66 46"/>
    <path class="detail" d="m76 72 11 29 21 4m31-28 13 37 53 9"/>
    ${index === 22 ? `<path class="texture" d="M115 106c5-31 19-52 42-63"/>` : ""}
  `;
}

function natureLandscape(index) {
  return `
    <path class="outline" d="M23 151 82 65l36 50 36-81 83 117Z"/>
    <path class="detail" d="m82 65 14 53 22-3m36-81 17 65 17-2M23 151h214"/>
    <circle class="outline" cx="55" cy="47" r="24"/>
    <path class="outline" d="M96 151c9-31 24-48 46-52 23 5 39 22 48 52"/>
    <path class="texture" d="M39 174c22-8 43-8 64 0m51 0c22-8 43-8 64 0"/>
    ${index === 28 ? `<path class="detail" d="M154 34c9 14 16 34 20 59"/>` : ""}
  `;
}

function natureWorld(index) {
  return `
    <circle class="outline" cx="130" cy="100" r="75"/>
    <path class="detail" d="M55 100h150M130 25c-28 21-43 46-43 75s15 54 43 75m0-150c28 21 43 46 43 75s-15 54-43 75M71 55c39 20 79 20 118 0M71 145c39-20 79-20 118 0"/>
    <path class="outline" d="M98 47c6 15 17 21 33 18l10 18 21 5-9 25-20 5-8 27-22-15-12-31-18-17Z"/>
    ${index === 39 ? `<path class="outline" d="M43 40c10-14 23-21 38-21m98 0c15 0 28 7 38 21M43 160c10 14 23 21 38 21m98 0c15 0 28-7 38-21"/>` : ""}
  `;
}

function renderPerson(index) {
  const props = personProp(index);

  return `
    <circle class="outline" cx="130" cy="55" r="30"/>
    <path class="outline" d="M102 47c2-24 16-36 35-32 16 3 26 17 23 36-12-8-23-17-31-27-7 12-16 20-27 23Z"/>
    <circle class="ink-fill" cx="119" cy="57" r="2.3"/><circle class="ink-fill" cx="141" cy="57" r="2.3"/>
    <path class="detail" d="M122 70c5 4 11 4 16 0"/>
    <path class="outline" d="M90 175c2-54 5-87 13-99 16 10 38 10 54 0 8 12 11 45 13 99Z"/>
    <path class="outline" d="M104 89 72 110l-20 42m104-63 32 21 20 42"/>
    <path class="detail" d="M112 94c11 8 24 8 36 0M130 88v87"/>
    <path class="outline" d="M108 175v13m44-13v13"/>
    ${props}
  `;
}

function personProp(index) {
  if ([0, 1, 22].includes(index)) return personBook();
  if ([2, 3, 4].includes(index)) return personMedical();
  if (index === 5) {
    return `${personMedical()}<path class="outline" d="M174 118c-7-10-19-5-15 5-11-1-13 12-3 16 4 13 22 13 26 0 10-4 8-17-3-16 4-10-8-15-15-5Z"/><circle class="ink-fill" cx="166" cy="121" r="2"/><circle class="ink-fill" cx="176" cy="121" r="2"/>`;
  }
  if (index === 6) {
    return `<path class="outline" d="M99 42c3-19 13-29 31-29s28 10 31 29m-69 0h76"/><path class="outline" d="M73 126c21-10 40-8 57 6v34H73Z"/><path class="detail" d="M87 139h29m-15-14v29"/><path class="outline" d="M166 106c19 20 19 41 0 62"/><path class="detail" d="M166 119h22v31h-22"/>`;
  }
  if (index === 7) {
    return `<path class="outline" d="M98 39c6-17 17-25 32-25s26 8 32 25m-70 0h76"/><path class="outline" d="m130 100 15 7-3 18-12 11-12-11-3-18Z"/><path class="detail" d="m130 108 3 6 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1Z"/><path class="outline" d="M67 134h29v31H67Zm97 0h29v31h-29Z"/>`;
  }
  if (index === 8) {
    return `<circle class="outline" cx="130" cy="133" r="31"/><circle class="outline" cx="130" cy="133" r="9"/><path class="detail" d="M130 102v62m-31-31h62m-53-22 44 44m0-44-44 44"/>`;
  }
  if ([9, 14].includes(index)) {
    return `<path class="outline" d="m77 114 23-23 18 18-23 23Zm41-5 54 54m-12-83 23 23-18 18-23-23Z"/><path class="detail" d="M87 104l10 10m53-24 23 23"/>`;
  }
  if (index === 10) {
    return `<path class="outline" d="M73 113h114v57H73Z"/><path class="detail" d="M92 127h77m-77 15h48m-48 15h66"/><path class="outline" d="m176 91 24 24-12 12-24-24Z"/>`;
  }
  if ([11, 12, 13].includes(index)) return personBuilder();
  if (index === 15) {
    return `<path class="outline" d="M130 171c-22-12-32-31-29-56 19 2 30 12 34 30m-5 26c22-12 32-31 29-56-19 2-30 12-34 30"/><path class="detail" d="M130 112v62"/>`;
  }
  if (index === 16) {
    return `<path class="outline" d="M79 130c18-22 38-29 61-20 12 5 22 13 31 25-18 22-38 29-61 20-12-5-22-13-31-25Zm92 5 22-18v36Z"/><circle class="ink-fill" cx="121" cy="127" r="2.5"/>`;
  }
  if ([17, 18].includes(index)) return personFood();
  if (index === 19) {
    return `<circle class="outline" cx="130" cy="136" r="29"/><circle class="detail" cx="130" cy="136" r="12"/><path class="outline" d="M130 107V87m-28 44-21-12m77 12 21-12m-49 46v20"/><path class="detail" d="M112 119l36 34m0-34-36 34"/>`;
  }
  if (index === 20) {
    return `<path class="outline" d="m85 108 45 35m-33-47 33 47m45-35-45 35m33-47-33 47"/><circle class="outline" cx="87" cy="102" r="10"/><circle class="outline" cx="173" cy="102" r="10"/>`;
  }
  if (index === 21) {
    return `<path class="outline" d="M75 124h110l-12 48H87Z"/><path class="outline" d="M98 124c2-24 13-36 32-36s30 12 32 36"/><circle class="detail" cx="107" cy="143" r="7"/><circle class="detail" cx="133" cy="151" r="7"/><circle class="detail" cx="157" cy="140" r="7"/>`;
  }
  if (index === 23) {
    return `<path class="outline" d="M91 113h78v48H91Z"/><path class="detail" d="M103 126h54m-54 13h42m-42 13h54"/><path class="outline" d="M181 95c10 0 18 8 18 18s-8 18-18 18-18-8-18-18 8-18 18-18Zm0 36v35"/>`;
  }
  if (index === 24) {
    return `<path class="outline" d="M75 109h110v65H75Z"/><circle class="outline" cx="130" cy="142" r="24"/><circle class="detail" cx="130" cy="142" r="9"/><path class="outline" d="M98 109l9-16h46l9 16m22 12h14"/>`;
  }
  if ([25, 26].includes(index)) {
    return `<path class="outline" d="M104 103v54c0 17-23 18-23 3 0-10 10-16 23-14m0-28 44-12v45c0 17-23 18-23 3 0-10 10-16 23-14v-56Z"/><path class="detail" d="M104 118l44-12"/>`;
  }
  if (index === 27 || index === 38) return personArtist();
  if (index === 28) {
    return `<circle class="outline" cx="130" cy="137" r="34"/><path class="detail" d="M130 103v68m-29-51 58 34m-58 0 58-34M130 103l18 18-18 16-18-16Z"/>`;
  }
  if (index === 29) {
    return `<circle class="outline" cx="130" cy="137" r="34"/><path class="detail" d="M105 114c17 14 33 14 50 0m-50 46c17-14 33-14 50 0M101 137h58"/>`;
  }
  if (index === 30) return personScience();
  if (index === 31) {
    return `<circle class="outline" cx="130" cy="137" r="37"/><circle class="detail" cx="130" cy="137" r="14"/><path class="outline" d="M130 90v18m0 58v18m-47-47h18m58 0h18m-80-33 13 13m40 40 13 13m0-66-13 13m-40 40-13 13"/>`;
  }
  if (index === 32) {
    return `<path class="outline" d="M74 137 119 126l20-36h13l-5 34 40 13c11 4 11 13 0 16l-42 4 2 25h-12l-16-24-34 2Z"/><path class="detail" d="M119 126l-10 18m38-20-2 33"/>`;
  }
  if (index === 33) {
    return `<circle class="outline" cx="130" cy="63" r="45"/><path class="detail" d="M94 61h72M108 31c14 7 29 7 44 0"/><path class="outline" d="M101 108h58l15 64H86Z"/><path class="detail" d="M112 132h36v25h-36Z"/>`;
  }
  if (index === 34) {
    return `<path class="outline" d="M130 170c-24-15-34-36-29-63 20 4 32 16 35 37m-6 26c24-15 34-36 29-63-20 4-32 16-35 37"/><path class="outline" d="M97 42h66l-12-22h-42Z"/><path class="detail" d="M130 108v65"/>`;
  }
  if (index === 35) {
    return `<path class="outline" d="m88 103 26 26m-13-39 26 26m-26 13-18 18m18-18 18 18"/><path class="outline" d="M129 97h44v18h-44Zm22 18v43m-26 0h52"/>`;
  }
  if (index === 36) {
    return `<path class="outline" d="M77 115h106v57H77Z"/><path class="outline" d="M106 115c0-17 8-25 24-25s24 8 24 25"/><path class="detail" d="M77 139h106m-64-4h22v14h-22"/>`;
  }
  if (index === 37) {
    return `<path class="outline" d="M75 103h110v65H75Z"/><path class="detail" d="M91 118h78v36H91Zm-31 50h140"/><path class="outline" d="m123 128-11 9 11 9m14-18 11 9-11 9"/>`;
  }
  return personDream();
}

function personBook() {
  return `<path class="outline" d="M76 111c20-7 38-3 54 11 16-14 34-18 54-11v42c-20-7-38-3-54 11-16-14-34-18-54-11Z"/><path class="detail" d="M130 122v42M88 124c11-2 21 0 30 7m24 0c9-7 19-9 30-7"/>`;
}

function personMedical() {
  return `<path class="outline" d="M112 96v23c0 17 8 28 18 28s18-11 18-28V96"/><circle class="outline" cx="148" cy="150" r="8"/><path class="detail" d="M120 103h20m-10-10v20M168 113h31v31h-31Z"/><path class="outline" d="M176 128h15m-8-8v16"/>`;
}

function personEmergency() {
  return `<path class="outline" d="M97 92h66v28H97Z"/><path class="detail" d="M112 92c2-13 8-19 18-19s16 6 18 19M130 120v41"/><path class="outline" d="M52 142h43v28H52Zm113 0h43v28h-43Z"/><path class="detail" d="M65 156h17m-9-8v17m105-9h17"/>`;
}

function personBuilder() {
  return `<path class="outline" d="M97 43c3-22 14-33 33-33s30 11 33 33m-73 0h80"/><path class="detail" d="M113 12v28m34-28v28"/><path class="outline" d="m68 112 28 28m-13-43 28 28M171 101l27 49m-10-55 19 35"/><path class="detail" d="M186 95 203 85"/>`;
}

function personFood() {
  return `<path class="outline" d="M98 37c-10-15 0-30 15-27 8-12 26-12 34 0 15-3 25 12 15 27Z"/><path class="outline" d="M72 125h116l-12 45H84Z"/><path class="detail" d="M87 140h86m-43-15v45"/><path class="outline" d="M180 111c-4-16 2-27 17-33m-17 33c11-11 23-15 36-10"/>`;
}

function personArtist() {
  return `<path class="outline" d="M64 128c11-33 34-47 66-42 32-5 55 9 66 42-9 11-23 12-43 4-6 31-40 31-46 0-20 8-34 7-43-4Z"/><circle class="detail" cx="97" cy="113" r="5"/><circle class="detail" cx="119" cy="104" r="5"/><circle class="detail" cx="145" cy="106" r="5"/><path class="outline" d="m176 94 26-32 9 8-27 32Z"/>`;
}

function personScience() {
  return `<path class="outline" d="M90 91h80l-12 81h-56Z"/><path class="detail" d="M111 91v29l-14 42m52-71v29l14 42M107 139h46"/><path class="outline" d="M188 94v45c0 18-11 28-27 28m27-73h14"/><circle class="detail" cx="188" cy="83" r="11"/><path class="texture" d="M111 151c12-8 25-8 38 0"/>`;
}

function personDream() {
  return `<path class="outline" d="M83 116c15-25 31-36 47-36s32 11 47 36l-20 44H103Z"/><path class="detail" d="m130 93 9 18 20 3-14 14 4 20-19-9-19 9 4-20-14-14 20-3Z"/><path class="texture" d="M62 76h18m-9-9v18m109-22h18m-9-9v18"/>`;
}

function renderFallback(index) {
  return `
    <rect class="outline" x="54" y="35" width="152" height="130" rx="24"/>
    <circle class="outline" cx="130" cy="100" r="44"/>
    <path class="detail" d="M89 100h82M130 59v82m-29-70 58 58m0-58-58 58"/>
    <text x="130" y="188" text-anchor="middle" font-size="11" fill="currentColor">${index + 1}</text>
  `;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function normalizeText(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr");
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
