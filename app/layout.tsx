import type { Metadata, Viewport } from "next";
import { Nunito, Press_Start_2P } from "next/font/google";
import { PlayerProvider } from "@/components/player/PlayerProvider";
import "./globals.css";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-nunito",
});

const pixel = Press_Start_2P({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-pixel-face",
});

export const metadata: Metadata = {
  title: "Lando",
  description: "A geography game about naming the countries of the world.",
  applicationName: "Lando",
  appleWebApp: { capable: true, title: "Lando" },
};

export const viewport: Viewport = {
  themeColor: "#79c3de",
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${nunito.variable} ${pixel.variable} h-full`}>
      <body className="min-h-full bg-sea font-sans text-ink antialiased">
        <PlayerProvider>{children}</PlayerProvider>
      </body>
    </html>
  );
}
