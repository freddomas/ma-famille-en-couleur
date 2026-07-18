export default function Loading() {
  return (
    <main className="loading-screen" aria-live="polite" aria-busy="true">
      <span className="loading-screen__mark" aria-hidden="true">
        MF
      </span>
      <p>Nous préparons l’atelier…</p>
    </main>
  );
}
