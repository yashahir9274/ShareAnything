import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { DialogProvider } from "@/components/dialogs";
import { SceneBackground } from "@/components/scene-background";
import { ThemeWatcher } from "@/components/theme-watcher";
import { THEME_BOOT_SCRIPT } from "@/lib/theme-boot";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const description =
  "Instant shared notes and files. Write together live, share anything with a link, and lock it with a password.";

export const metadata: Metadata = {
  // Absolute URLs for link previews; set PUBLIC_URL to your domain in production.
  metadataBase: new URL(process.env.PUBLIC_URL || "http://localhost:3000"),
  title: "ShareAnything — Instant shared notes & files",
  description,
  applicationName: "ShareAnything",
  openGraph: {
    type: "website",
    siteName: "ShareAnything",
    title: "ShareAnything — Instant shared notes & files",
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: "ShareAnything — Instant shared notes & files",
    description,
  },
  // Notes and files are private-by-link; keep them out of search engines.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#ff5c35",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${fraunces.variable} ${plexMono.variable} h-full antialiased`}
      // Browser extensions (e.g. ColorZilla's cz-shortcut-listen, Grammarly) add attributes
      // to <html>/<body> before React hydrates. This only ignores attribute differences on
      // these two elements, not their children.
      suppressHydrationWarning
    >
      <head>
        {/* Apply the saved/system theme before first paint (no flash). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans text-ink" suppressHydrationWarning>
        <ThemeWatcher />
        <SceneBackground />
        <DialogProvider>{children}</DialogProvider>
      </body>
    </html>
  );
}
