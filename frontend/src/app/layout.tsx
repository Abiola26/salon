import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ottawa Loctician (IWA LOCZ) - Premium Hair Styling & Design",
  description: "Book your premium hair care service online with Ottawa Loctician (IWA LOCZ). Experience Ottawa's top-tier dreadlocks and styling services.",
  keywords: "salon, hair booking, loctician, dreadlocks, Ottawa, haircut, styling",
  authors: [{ name: "Ottawa Loctician (IWA LOCZ) Team" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-dark-bg text-foreground" suppressHydrationWarning>
        <Providers>
          <Navbar />
          <main className="flex-grow flex flex-col w-full">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
