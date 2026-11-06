import type { Metadata } from "next";
import "./globals.css";
import SmoothScroll from "@/components/SmoothScroll";

export const metadata: Metadata = {
  title: "The Alpha Gym | Train Beyond Limits — Kashipur",
  description: "Explore The Alpha Gym in Patel Nagar, Kashipur. Strength training, expert guidance and a community built around progress. Call to book a free trial.",
  keywords: ["The Alpha Gym", "Gym in Kashipur", "Patel Nagar gym", "strength training"],
  openGraph: {
    title: "The Alpha Gym — Train Beyond Limits",
    description: "A new standard of strength. Explore The Alpha Gym, Kashipur.",
    type: "website"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
