import type { Metadata } from "next";
import "@fontsource/poppins/latin-400.css";
import "@fontsource/poppins/latin-500.css";
import "@fontsource/poppins/latin-600.css";
import "@fontsource/poppins/latin-700.css";
import "./globals.css";
import "./board-account.css";
import "./refinements.css";
import "leaflet/dist/leaflet.css";
import "./arena.css";
import "./feed-polish.css";
import "./charcoal-theme.css";
import "./social.css";
import "./v31.css";
import "./v32.css";
import "./v33.css";

export const metadata: Metadata = {
  title: "Chess Burger",
  description: "Competitive chess, live.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/cburger_logo.png", type: "image/png" }],
    shortcut: [{ url: "/cburger_logo.png", type: "image/png" }],
    apple: [{ url: "/cburger_logo.png", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
