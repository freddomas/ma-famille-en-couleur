import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/bree-serif/400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Ma famille en couleur — Coloriages à imprimer",
    template: "%s — Ma famille en couleur",
  },
  description:
    "Une bibliothèque créative enrichie chaque semaine : catalogues, images et coloriages à imprimer pour les enfants de 2 à 3 ans.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
    ],
  },
  openGraph: {
    locale: "fr_FR",
    type: "website",
    title: "Ma famille en couleur",
    description:
      "De nouveaux coloriages et de nouvelles catégories chaque semaine, prêts à imprimer.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#18594d",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
