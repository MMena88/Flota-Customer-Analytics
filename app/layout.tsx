import type { Metadata } from "next";
import "./globals.css";
import "./redesign.css";

export const metadata: Metadata = {
  title: "Puma Flota | Inteligencia comercial",
  description: "Clientes, oportunidades y decisiones comerciales con información actualizada.",
  icons: {
    icon: "/brand/puma-flota.png",
    shortcut: "/brand/puma-flota.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
