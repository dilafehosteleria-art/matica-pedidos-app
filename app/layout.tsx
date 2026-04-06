import "./globals.css";

export const metadata = {
  title: "Matica Pedidos",
  description: "App de pedidos para empresas"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
