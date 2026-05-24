import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Matica B2B Orders",
  description: "Pedidos corporativos de Matica Fresh Food"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
