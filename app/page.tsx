import Script from "next/script";

function Brand({ footer = false }: { footer?: boolean }) {
  return (
    <span className={`brand${footer ? " brand--footer" : ""}`}>
      <span className="brand__mark" aria-hidden="true">
        <svg viewBox="0 0 42 42">
          <path d="M8 27c7-1 8-13 15-14 5-1 9 3 11 8-5 0-8 2-10 7-4 8-11 7-16-1Z" />
          <path d="M11 15c4 0 7-3 8-8 4 3 5 7 3 11" />
          <circle cx="27" cy="19" r="1.7" />
        </svg>
      </span>
      <span>
        <strong>Ma famille</strong>
        <small>en couleur</small>
      </span>
    </span>
  );
}

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#catalogues">
        Aller aux catalogues
      </a>

      <header className="site-header">
        <a className="brand-link" href="#" aria-label="Ma famille en couleur, accueil">
          <Brand />
        </a>

        <nav className="site-nav" aria-label="Navigation principale">
          <a href="#catalogues">Les catalogues</a>
          <a href="#atelier">L’atelier</a>
          <a className="header-note" href="#nouveautes">
            <span aria-hidden="true">✦</span>
            Nouveautés chaque semaine
          </a>
        </nav>
      </header>

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero__copy">
            <p className="hero__signal">
              La bibliothèque créative des 2–3 ans
              <span>Actualisée chaque semaine</span>
            </p>
            <h1 id="hero-title">
              Un monde à découvrir,
              <em>une couleur à la fois.</em>
            </h1>
            <p className="hero__lead">
              Des coloriages soignés, éducatifs et prêts à imprimer. Chaque catalogue
              contient 10 pages A4 avec 4 dessins aux traits clairs, pensés pour les
              petites mains.
            </p>

            <div className="hero__actions">
              <a className="button button--primary" href="#catalogues">
                Explorer les catalogues
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="m7 4 6 6-6 6" />
                </svg>
              </a>
              <div className="hero__proof" aria-label="Contenu de la bibliothèque">
                <span>
                  <strong id="catalogue-count">10</strong> catalogues
                </span>
                <span>
                  <strong id="page-count">100</strong> pages
                </span>
                <span>
                  <strong id="drawing-count">400</strong> dessins
                </span>
              </div>
            </div>
          </div>

          <div className="hero__art" aria-hidden="true">
            <div className="sun-orbit" />
            <span className="scribble scribble--one" />
            <span className="scribble scribble--two" />
            <div className="paper-stack paper-stack--back" />
            <div className="paper-stack paper-stack--middle" />
            <article className="hero-sheet">
              <div className="hero-sheet__top">
                <span>MON ATELIER CRÉATIF</span>
                <span>ENSEMBLE</span>
              </div>
              <div id="hero-drawing" className="hero-sheet__drawing" />
              <div className="hero-sheet__caption">
                <strong>Créer ensemble</strong>
                <span>Imagine • Dessine • Colorie</span>
              </div>
            </article>
            <div className="pencil pencil--coral" />
            <div className="pencil pencil--blue" />
          </div>
        </section>

        <section className="trust-strip" aria-label="Avantages">
          <div>
            <span className="trust-strip__icon" aria-hidden="true">
              A4
            </span>
            <p>
              <strong>Prêt à imprimer</strong>
              <small>Mise en page optimisée</small>
            </p>
          </div>
          <div>
            <span className="trust-strip__icon" aria-hidden="true">
              ✎
            </span>
            <p>
              <strong>Traits nets et ouverts</strong>
              <small>Adaptés aux petites mains</small>
            </p>
          </div>
          <div>
            <span className="trust-strip__icon" aria-hidden="true">
              40
            </span>
            <p>
              <strong>40 dessins par thème</strong>
              <small>10 planches progressives</small>
            </p>
          </div>
          <div>
            <span className="trust-strip__icon" aria-hidden="true">
              ♡
            </span>
            <p>
              <strong>Contenu bienveillant</strong>
              <small>Sans publicité ni inscription</small>
            </p>
          </div>
        </section>

        <section
          id="nouveautes"
          className="weekly-promise section-shell"
          aria-labelledby="weekly-title"
        >
          <div className="weekly-promise__stamp" aria-hidden="true">
            <span>Rendez-vous</span>
            <strong>Chaque semaine</strong>
            <small>52 semaines de découvertes</small>
          </div>
          <div className="weekly-promise__copy">
            <p className="weekly-promise__lead">Une bibliothèque qui ne cesse de grandir</p>
            <h2 id="weekly-title">
              Chaque semaine, une nouvelle raison de sortir les crayons.
            </h2>
            <p>
              Nous garantissons une mise à jour hebdomadaire du contenu : de nouvelles
              catégories à explorer et de nouvelles images à colorier. Votre enfant
              retrouve ses thèmes préférés, tout en découvrant régulièrement de nouveaux
              univers adaptés à sa curiosité.
            </p>
            <div className="weekly-promise__benefits" aria-label="Notre engagement">
              <span>Nouvelles catégories</span>
              <span>Nouvelles images</span>
              <span>Nouvelles découvertes</span>
            </div>
          </div>
        </section>

        <section id="catalogues" className="library section-shell" aria-labelledby="library-title">
          <div className="section-heading">
            <div>
              <p className="section-heading__label">La collection</p>
              <h2 id="library-title">Choisis ton prochain voyage</h2>
            </div>
            <p>
              Dix univers complets à parcourir. Ouvre un catalogue pour feuilleter ses
              pages et lancer une impression propre en un clic.
            </p>
          </div>

          <div className="library-toolbar">
            <div className="search-box">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </svg>
              <label className="sr-only" htmlFor="catalogue-search">
                Rechercher un catalogue
              </label>
              <input
                id="catalogue-search"
                type="search"
                autoComplete="off"
                placeholder="Rechercher un thème…"
              />
            </div>
            <p id="library-result-count" aria-live="polite" />
          </div>

          <div id="catalogue-list" className="catalogue-grid" aria-live="polite" />
          <p id="empty-state" className="empty-state" hidden>
            Aucun thème ne correspond à cette recherche.
          </p>
        </section>

        <section id="atelier" className="atelier-section" aria-labelledby="atelier-title">
          <div className="section-shell">
            <div className="catalogue-viewer__back">
              <button id="close-catalogue" className="button button--paper" type="button">
                <span aria-hidden="true">←</span>
                Retour vers les catalogues
              </button>
            </div>

            <div className="section-heading section-heading--light">
              <div>
                <p className="section-heading__label">L’atelier d’impression</p>
                <h2 id="atelier-title">Feuillette, choisis, imprime.</h2>
              </div>
              <p>
                Une planche contient exactement quatre dessins. Imprime la page affichée
                ou le catalogue complet de dix pages.
              </p>
            </div>

            <div className="workspace">
              <aside className="workspace__sidebar" aria-label="Liste des catalogues">
                <div className="workspace__sidebar-head">
                  <span>Bibliothèque</span>
                  <small id="sidebar-count">10 thèmes</small>
                </div>
                <div id="catalogue-menu" className="catalogue-menu" />
              </aside>

              <section className="viewer" aria-live="polite" tabIndex={-1}>
                <div id="catalogue-info" className="viewer__head" />

                <div className="viewer__toolbar">
                  <div className="page-nav-wrap">
                    <button
                      id="previous-page"
                      className="icon-button"
                      type="button"
                      aria-label="Page précédente"
                    >
                      <svg viewBox="0 0 20 20" aria-hidden="true">
                        <path d="m12.5 4-6 6 6 6" />
                      </svg>
                    </button>
                    <div id="page-list" className="page-list" aria-label="Choisir une page" />
                    <button
                      id="next-page"
                      className="icon-button"
                      type="button"
                      aria-label="Page suivante"
                    >
                      <svg viewBox="0 0 20 20" aria-hidden="true">
                        <path d="m7.5 4 6 6-6 6" />
                      </svg>
                    </button>
                  </div>

                  <div className="print-actions">
                    <button id="print-page" className="button button--paper" type="button">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                        <path d="M7 14h10v7H7z" />
                      </svg>
                      Cette page
                    </button>
                    <button id="print-catalogue" className="button button--ink" type="button">
                      Imprimer les 10 pages
                    </button>
                  </div>
                </div>

                <div id="page-viewer" className="page-viewer" />
              </section>
            </div>
          </div>
        </section>

        <section className="guide section-shell" aria-labelledby="guide-title">
          <div className="guide__intro">
            <p className="section-heading__label">Un petit rituel créatif</p>
            <h2 id="guide-title">Trois gestes, des heures d’imagination.</h2>
          </div>
          <ol className="guide__steps">
            <li>
              <span>01</span>
              <div>
                <strong>Choisir</strong>
                <p>Laisse l’enfant sélectionner le thème qui éveille sa curiosité.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Imprimer</strong>
                <p>Une page pour un moment rapide, ou le catalogue entier pour plus tard.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Créer</strong>
                <p>Crayons, feutres ou peinture : il n’existe pas de mauvaise couleur.</p>
              </div>
            </li>
          </ol>
        </section>
      </main>

      <footer className="site-footer">
        <Brand footer />
        <p>
          De nouveaux coloriages chaque semaine, pensés avec soin pour les enfants
          curieux.
        </p>
        <a href="#catalogues">Retour aux catalogues ↑</a>
      </footer>

      <div id="status-toast" className="status-toast" role="status" aria-live="polite" />
      <div id="print-area" className="print-area" aria-hidden="true" />

      <Script src="/catalogue-runtime.js" strategy="afterInteractive" />
    </>
  );
}
