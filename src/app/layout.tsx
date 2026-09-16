import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PassThePhone — Pick someone. Pass the turn.",
  description:
    "A real-time party game for friend groups. Pick someone, pass the turn, and find out what your friends really think.",
  applicationName: "PassThePhone",
  openGraph: {
    title: "PassThePhone",
    description: "Pick someone. Pass the turn. Find out what your friends really think.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0b12",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
