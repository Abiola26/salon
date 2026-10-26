import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Book an Appointment",
  description:
    "Reserve your appointment online — pick a service, stylist and time slot in seconds with Ottawa Loctician (IWA LOCZ).",
  alternates: { canonical: "/book" },
  openGraph: {
    title: "Book an Appointment | Ottawa Loctician (IWA LOCZ)",
    description:
      "Reserve your appointment online — pick a service, stylist and time slot in seconds.",
    url: "/book",
  },
};

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return children;
}
