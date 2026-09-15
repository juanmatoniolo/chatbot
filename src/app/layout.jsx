// src/app/layout.jsx
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

export const metadata = {
  metadataBase: new URL("https://tudominio.com"),
  title: {
    default: "Consulta Clínica | Asistente interno",
    template: "%s | Consulta Clínica",
  },
  description: "Asistente inteligente para consultar pacientes, facturas, siniestros, UTI y cirugías.",
  robots: { index: false, follow: false },
  applicationName: "Consulta Clínica",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Consulta Clínica",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}