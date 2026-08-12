import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { PwaRegister } from "@/components/PwaRegister";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Remetum",
  description: "Conversas com estilo.",
  applicationName: "Remetum",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Remetum",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0B0D",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={manrope.variable}>
      <body className={`${manrope.className} min-h-full antialiased`}>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
