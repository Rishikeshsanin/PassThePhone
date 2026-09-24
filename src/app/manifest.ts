import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PassThePhone",
    short_name: "PassThePhone",
    description: "Pick someone. Pass the turn. Find out what your friends really think.",
    start_url: "/",
    display: "standalone",
    background_color: "#08070d",
    theme_color: "#0b0b12",
    orientation: "portrait",
    categories: ["games", "social", "entertainment"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/maskable-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
