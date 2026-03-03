import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nostr Teams",
  description: "Decentralized collaboration powered by NOSTR",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
