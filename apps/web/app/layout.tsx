import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Sidebar } from "@/components/Sidebar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Vigía — Seguimiento contractual",
  description: "Control y seguimiento de expedientes contractuales",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${inter.variable} ${jetbrainsMono.variable} flex font-sans`}>
        <Sidebar />
        <main className="min-h-screen flex-1 overflow-y-auto">{children}</main>
      </body>
    </html>
  );
}
