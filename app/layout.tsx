import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EvoWorld — Simulatore di evoluzione planetaria",
  description:
    "EvoWorld è un simulatore autonomo di vita artificiale ed evoluzione planetaria: crea le regole, avvia la simulazione, osserva l'evoluzione.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
