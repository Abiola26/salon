"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, Scissors, User as UserIcon, LogOut, LayoutDashboard, Calendar, Settings, ChevronDown } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isAdminDropdownOpen, setIsAdminDropdownOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isHydrated } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  // Close dropdown on navigation
  useEffect(() => {
    setIsAdminDropdownOpen(false);
  }, [pathname]);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = () => {
    logout();
    router.push("/");
    setIsOpen(false);
  };

  const activeLinkClass = "text-primary border-b-2 border-primary font-medium px-1 py-2";
  const inactiveLinkClass = "text-zinc-300 hover:text-primary transition duration-200 px-1 py-2";

  const isLinkActive = (path: string) => pathname === path;

  return (
    <nav className="sticky top-0 z-50 w-full glass-panel border-b border-dark-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          {/* Logo */}
          <div className="flex-shrink-0 flex items-center">
            <Link href="/" className="flex items-center gap-2.5">
              <Scissors className="h-6 w-6 text-primary" />
              <span className="flex flex-col tracking-wider">
                <span className="text-lg font-bold text-gold-gradient leading-tight">
                  Ottawa Loctician
                </span>
                <span className="text-[10px] font-extrabold text-primary tracking-widest uppercase leading-none mt-0.5">
                  IWA LOCZ
                </span>
              </span>
            </Link>
          </div>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center space-x-8">
            <Link href="/" className={isLinkActive("/") ? activeLinkClass : inactiveLinkClass}>
              Home
            </Link>
            <Link href="/services" className={isLinkActive("/services") ? activeLinkClass : inactiveLinkClass}>
              Services
            </Link>
            <Link href="/book" className={isLinkActive("/book") ? activeLinkClass : inactiveLinkClass}>
              Book Now
            </Link>

            {mounted && isHydrated && user && (
              <>
                {user.role === "CUSTOMER" ? (
                  <Link href="/dashboard" className={isLinkActive("/dashboard") ? activeLinkClass : inactiveLinkClass}>
                    My Bookings
                  </Link>
                ) : (
                  <div className="relative">
                    <button
                      onClick={() => setIsAdminDropdownOpen(!isAdminDropdownOpen)}
                      className={`flex items-center gap-1.5 transition duration-200 px-1 py-2 cursor-pointer font-medium text-sm ${
                        pathname.startsWith("/admin")
                          ? "text-primary border-b-2 border-primary"
                          : "text-zinc-300 hover:text-primary"
                      }`}
                    >
                      <span>Admin Control</span>
                      <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isAdminDropdownOpen ? "rotate-180" : ""}`} />
                    </button>

                    {isAdminDropdownOpen && (
                      <div className="absolute left-0 mt-2 w-52 rounded-xl bg-zinc-950/95 border border-zinc-900 shadow-2xl p-2 z-50 flex flex-col space-y-1 backdrop-blur-md">
                        <Link
                          href="/admin"
                          className="px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-900 rounded-lg transition"
                        >
                          Analytics Dashboard
                        </Link>
                        <Link
                          href="/admin/appointments"
                          className="px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-900 rounded-lg transition"
                        >
                          Appointments List
                        </Link>
                        <Link
                          href="/admin/services"
                          className="px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-900 rounded-lg transition"
                        >
                          Services Catalog
                        </Link>
                        <Link
                          href="/admin/staff"
                          className="px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-900 rounded-lg transition"
                        >
                          Stylist Roster
                        </Link>
                        <Link
                          href="/admin/coupons"
                          className="px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-900 rounded-lg transition"
                        >
                          Promo Coupons
                        </Link>
                        <Link
                          href="/admin/users"
                          className="px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-900 rounded-lg transition"
                        >
                          User Management
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* User Actions */}
          <div className="hidden md:flex items-center space-x-4">
            {mounted && isHydrated && user ? (
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setIsProfileOpen(true)}
                  className="flex items-center gap-2 text-zinc-300 bg-zinc-900 hover:bg-zinc-850 px-3 py-1.5 rounded-full border border-zinc-800 text-sm cursor-pointer transition active:scale-95"
                  title="View Profile by ID"
                >
                  <UserIcon className="h-4 w-4 text-primary" />
                  <span>{user.name}</span>
                  <span className="text-xs text-primary bg-dark-gold/30 px-2 py-0.5 rounded-full font-semibold uppercase">
                    {user.role}
                  </span>
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 text-zinc-400 hover:text-red-400 transition text-sm cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Logout</span>
                </button>
              </div>
            ) : (
              mounted && (
                <Link
                  href="/login"
                  className="bg-primary hover:bg-primary-hover text-black font-semibold px-5 py-2 rounded-full transition duration-300 text-sm"
                >
                  Login
                </Link>
              )
            )}
          </div>

          {/* Mobile hamburger menu */}
          <div className="flex md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-zinc-300 hover:text-primary p-2 cursor-pointer"
            >
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Nav Menu */}
      {isOpen && (
        <div className="md:hidden glass-panel border-b border-dark-border py-4 px-2 space-y-3">
          <Link
            href="/"
            onClick={() => setIsOpen(false)}
            className="block text-zinc-300 hover:text-primary px-3 py-2 rounded-md font-medium"
          >
            Home
          </Link>
          <Link
            href="/services"
            onClick={() => setIsOpen(false)}
            className="block text-zinc-300 hover:text-primary px-3 py-2 rounded-md font-medium"
          >
            Services
          </Link>
          <Link
            href="/book"
            onClick={() => setIsOpen(false)}
            className="block text-zinc-300 hover:text-primary px-3 py-2 rounded-md font-medium"
          >
            Book Now
          </Link>

          {mounted && isHydrated && user && (
            <>
              {user.role === "CUSTOMER" ? (
                <Link
                  href="/dashboard"
                  onClick={() => setIsOpen(false)}
                  className="block text-zinc-300 hover:text-primary px-3 py-2 rounded-md font-medium"
                >
                  My Bookings
                </Link>
              ) : (
                <>
                  <Link
                    href="/admin"
                    onClick={() => setIsOpen(false)}
                    className="block text-zinc-300 hover:text-primary px-3 py-2 rounded-md font-medium"
                  >
                    Admin Dashboard
                  </Link>
                  <Link
                    href="/admin/appointments"
                    onClick={() => setIsOpen(false)}
                    className="block text-zinc-300 hover:text-primary px-3 py-2 rounded-md font-medium"
                  >
                    Manage Appointments
                  </Link>
                  <Link
                    href="/admin/services"
                    onClick={() => setIsOpen(false)}
                    className="block text-zinc-300 hover:text-primary px-3 py-2 rounded-md font-medium"
                  >
                    Manage Services
                  </Link>
                  <Link
                    href="/admin/staff"
                    onClick={() => setIsOpen(false)}
                    className="block text-zinc-300 hover:text-primary px-3 py-2 rounded-md font-medium"
                  >
                    Stylist Roster
                  </Link>
                  <Link
                    href="/admin/coupons"
                    onClick={() => setIsOpen(false)}
                    className="block text-zinc-300 hover:text-primary px-3 py-2 rounded-md font-medium"
                  >
                    Promo Coupons
                  </Link>
                  <Link
                    href="/admin/users"
                    onClick={() => setIsOpen(false)}
                    className="block text-zinc-300 hover:text-primary px-3 py-2 rounded-md font-medium"
                  >
                    User Management
                  </Link>
                </>
              )}
            </>
          )}

          <hr className="border-zinc-800 my-2" />

          {mounted && isHydrated && user ? (
            <div className="px-3 space-y-3">
              <div className="text-zinc-400 text-sm">
                Signed in as <span className="text-primary">{user.name}</span>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 bg-red-950/40 text-red-400 hover:bg-red-900/60 border border-red-900/40 py-2 rounded-md transition text-sm cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          ) : (
            mounted && (
              <div className="px-3">
                <Link
                  href="/login"
                  onClick={() => setIsOpen(false)}
                  className="block text-center bg-primary hover:bg-primary-hover text-black font-semibold py-2 rounded-md transition duration-300 text-sm"
                >
                  Login
                </Link>
              </div>
            )
          )}
        </div>
      )}

      {/* Personal Profile Modal */}
      {isProfileOpen && user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-sm rounded-2xl border border-zinc-900 p-6 space-y-6">
            <div className="flex justify-between items-center border-b border-zinc-900 pb-3">
              <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                <UserIcon className="h-5 w-5 text-primary" />
                Personal Profile
              </h2>
              <button
                onClick={() => setIsProfileOpen(false)}
                className="text-zinc-500 hover:text-white transition text-xs font-bold"
              >
                Close
              </button>
            </div>

            <div className="space-y-4.5 text-sm">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">User ID</span>
                <div className="flex items-center justify-between bg-zinc-950 px-3 py-2 border border-zinc-900 rounded-xl">
                  <span className="font-mono text-xs text-zinc-300 truncate max-w-[200px]">{user.id}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(user.id);
                      alert("User ID copied to clipboard!");
                    }}
                    className="text-[10px] text-primary hover:underline cursor-pointer"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Full Name</span>
                <p className="font-semibold text-white bg-zinc-950/40 border border-zinc-950 px-3 py-2 rounded-xl">{user.name}</p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Email Address</span>
                <p className="font-semibold text-white bg-zinc-950/40 border border-zinc-950 px-3 py-2 rounded-xl">{user.email}</p>
              </div>

              {user.phone && (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Phone Number</span>
                  <p className="font-semibold text-white bg-zinc-950/40 border border-zinc-950 px-3 py-2 rounded-xl">{user.phone}</p>
                </div>
              )}

              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Account Role</span>
                <div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/10 border border-primary/20 text-primary text-xs font-bold rounded-full uppercase">
                    {user.role}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsProfileOpen(false)}
              className="w-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Close Profile
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
