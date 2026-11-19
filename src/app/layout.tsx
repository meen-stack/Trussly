import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const grotesk = Space_Grotesk({ variable: "--font-grotesk", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "BuildTrace: see your construction site from anywhere", template: "%s · BuildTrace" },
  description:
    "Daily site reports, photo evidence, milestone sign-off and budget against actual spend, so developers and investors catch overruns early.",
};

export const viewport: Viewport = { themeColor: "#1f2a37" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${grotesk.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
