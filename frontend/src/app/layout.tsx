import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { siteName, siteUrl } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Ottawa Loctician (IWA LOCZ) - Premium Hair Styling & Design",
  description: "Book your premium hair care service online with Ottawa Loctician (IWA LOCZ). Experience Ottawa's top-tier dreadlocks and styling services.",
  keywords: "salon, hair booking, loctician, dreadlocks, Ottawa, haircut, styling",
  authors: [{ name: "Ottawa Loctician (IWA LOCZ) Team" }],
  openGraph: {
    type: "website",
    locale: "en_CA",
    url: siteUrl,
    siteName,
    title: "Ottawa Loctician (IWA LOCZ) - Premium Hair Styling & Design",
    description: "Book your premium hair care service online with Ottawa Loctician (IWA LOCZ). Experience Ottawa's top-tier dreadlocks and styling services.",
  },
  twitter: {
    card: "summary",
    title: "Ottawa Loctician (IWA LOCZ) - Premium Hair Styling & Design",
    description: "Book your premium hair care service online with Ottawa Loctician (IWA LOCZ).",
  },
  robots: { index: true, follow: true },
};

const salonJsonLd = {
  "@context": "https://schema.org",
  "@type": "HairSalon",
  name: siteName,
  url: siteUrl,
  description:
    "Premium dreadlocks, loc care and styling services in Ottawa. Book appointments online.",
  priceRange: "$$",
  areaServed: { "@type": "City", name: "Ottawa, Ontario" },
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      opens: "09:00",
      closes: "18:00",
    },
  ],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(salonJsonLd) }}
        />
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
