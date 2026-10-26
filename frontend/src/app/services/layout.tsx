import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Services & Pricing",
  description:
    "Browse dreadlocks, loc maintenance and styling services with prices and durations, then book online with Ottawa Loctician (IWA LOCZ).",
  alternates: { canonical: "/services" },
  openGraph: {
    title: "Services & Pricing | Ottawa Loctician (IWA LOCZ)",
    description:
      "Browse dreadlocks, loc maintenance and styling services with prices and durations, then book online.",
    url: "/services",
  },
};

export default function ServicesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
