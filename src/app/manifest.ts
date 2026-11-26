import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ShareAnything",
    short_name: "ShareAnything",
    description: "Instant shared notes and files. Write together live and share anything with a link.",
    start_url: "/",
    display: "standalone",
    background_color: "#e4e9ee",
    theme_color: "#ff5c35",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
