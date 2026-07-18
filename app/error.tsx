"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="app-error">
      <p className="app-error__label">L’atelier fait une pause</p>
      <h1>La page n’a pas pu être préparée.</h1>
      <p>Réessayez sans perdre votre sélection.</p>
      <button className="button button--primary" type="button" onClick={reset}>
        Réessayer
      </button>
    </main>
  );
}
