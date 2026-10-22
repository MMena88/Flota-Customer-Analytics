import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Puma Comercial | El Salvador",
  description: "Clientes, oportunidades y decisiones comerciales con información actualizada.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
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
