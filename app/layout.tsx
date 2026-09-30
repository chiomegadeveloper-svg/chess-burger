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
import "./puzzles.css";
import "./feed-polish.css";
import "./charcoal-theme.css";
import "./social.css";
import "./v31.css";
import "./v32.css";
import "./v33.css";
import "./v34.css";
import "./v35.css";
import "./v36.css";
import "./v37.css";
import "./v38.css";
import "./v39.css";
import "./v40.css";
import "./v41.css";
import "./v42.css";
import "./v43.css";
import "./v44.css";
import "./v45.css";
import "./gameplay.css";
import "./v46.css";
import "./feed-banner-shop.css";
import "./v47.css";
import "./grand-arena.css";
import "./vanguard-card.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://chessburger.site"),
  title: "Chess Burger | Play Chess Online, vs CPU & Chess Puzzles",
  applicationName: "Chess Burger",
  description: "Play chess online, challenge the computer, solve chess puzzles and Chess Math quizzes, and join arenas and tournaments in Chess Burger.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Chess Burger",
    url: "/",
    title: "Chess Burger | Play Chess Online, vs CPU & Chess Puzzles",
    description: "Play chess online, challenge the computer, solve chess puzzles and Chess Math quizzes, and join arenas and tournaments in Chess Burger.",
    images: ["/cburger_logo.png"],
  },
  twitter: { card: "summary", title: "Chess Burger | Play Chess Online, vs CPU & Chess Puzzles", description: "Play chess online, challenge the computer, solve chess puzzles and Chess Math quizzes, and join arenas and tournaments in Chess Burger.", images: ["/cburger_logo.png"] },
  manifest: "/manifest.webmanifest",
  verification: {
    google: "BpKi2gFy5TX5I_hDZ9zG2BDrM0KUrdLMk40B1jq-tKI",
  },
  icons: {
    icon: [{ url: "/chess-burger-icon.svg", type: "image/svg+xml" }, { url: "/cburger_logo.png", type: "image/png" }],
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
