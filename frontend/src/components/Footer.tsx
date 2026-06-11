import Link from "next/link";
import { Scissors, MapPin, Phone, Mail } from "lucide-react";

export default function Footer() {
  return (
    <footer className="w-full bg-[#070708] border-t border-dark-border py-12 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand & Description */}
          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-2">
              <Scissors className="h-5 w-5 text-white" />
              <span className="flex flex-col tracking-wider">
                <span className="text-md font-bold text-gold-gradient leading-tight">
                  Ottawa Loctician
                </span>
                <span className="text-[9px] font-extrabold text-white tracking-widest uppercase leading-none mt-0.5">
                  IWA LOCZ
                </span>
              </span>
            </Link>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Experience the pinnacle of premium dreadlocks, styling, and hair design. Our master stylists elevate your beauty, tailored exactly to you.
            </p>
          </div>

          {/* Quick Links */}
          <div className="space-y-3">
            <h3 className="text-white font-bold text-sm tracking-wider uppercase">
              Explore
            </h3>
            <ul className="space-y-2 text-sm text-zinc-400">
              <li>
                <Link href="/" className="hover:text-primary transition">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/services" className="hover:text-primary transition">
                  Services List
                </Link>
              </li>
              <li>
                <Link href="/book" className="hover:text-primary transition">
                  Book Appointment
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-primary transition">
                  Member Portal
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact info */}
          <div className="space-y-3">
            <h3 className="text-white font-bold text-sm tracking-wider uppercase">
              Contact Us
            </h3>
            <ul className="space-y-2.5 text-sm text-zinc-400">
              <li className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>K2B 8E7<br />Ottawa, ON, Canada</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary shrink-0" />
                <span>+1 343 996 2448</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary shrink-0" />
                <a href="mailto:bashiratarowora@gmail.com" className="hover:text-primary transition underline decoration-dotted">
                  bashiratarowora@gmail.com
                </a>
              </li>
            </ul>
          </div>

          {/* Hours */}
          <div className="space-y-3">
            <h3 className="text-white font-bold text-sm tracking-wider uppercase">
              Opening Hours
            </h3>
            <ul className="space-y-2 text-sm text-zinc-400">
              <li className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0">
                <span>Monday - Friday</span>
                <span className="text-zinc-300 text-xs sm:text-sm">9:00 AM - 8:00 PM</span>
              </li>
              <li className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0">
                <span>Saturday</span>
                <span className="text-zinc-300 text-xs sm:text-sm">9:00 AM - 6:00 PM</span>
              </li>
              <li className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0">
                <span>Sunday</span>
                <span className="text-zinc-300 text-xs sm:text-sm">10:00 AM - 4:00 PM</span>
              </li>
            </ul>
          </div>
        </div>

        <hr className="border-zinc-900 my-8" />

        <div className="flex flex-col md:flex-row justify-between items-center text-xs text-zinc-500 gap-4">
          <p>© {new Date().getFullYear()} Ottawa Loctician (IWA LOCZ). All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="#" className="hover:text-primary">Privacy Policy</Link>
            <Link href="#" className="hover:text-primary">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
