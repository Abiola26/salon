"use client";

import Link from "next/link";
import { Scissors, Star, Calendar, Award, Shield, Sparkles, MapPin, Phone, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";

interface Review {
  id: string;
  rating: number;
  comment: string;
  user: {
    name: string;
  };
  service: {
    name: string;
  };
}

export default function Home() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch reviews from backend
  const { data: reviewsResponse, isLoading } = useQuery({
    queryKey: ["public-reviews"],
    queryFn: () => api.get("/reviews"),
    enabled: mounted,
  });

  const reviews: Review[] = reviewsResponse?.data?.data || [];

  // Fallback reviews in case database is empty or seeding is fresh
  const fallbackReviews = [
    {
      id: "f1",
      rating: 5,
      comment: "Ottawa Loctician (IWA LOCZ) is absolute perfection! The atmosphere is incredibly professional, and my loctician did a phenomenal job on my loc install. Highly recommend!",
      user: { name: "Sarah Jenkins" },
      service: { name: "Signature Loc Install & Style" },
    },
    {
      id: "f2",
      rating: 5,
      comment: "I've been going to Ottawa Loctician (IWA LOCZ) for months now. The attention to detail is unmatched, the booking system is super fast, and the customer service is outstanding.",
      user: { name: "Marcus Thompson" },
      service: { name: "Master Men's Grooming" },
    },
    {
      id: "f3",
      rating: 5,
      comment: "The glassmorphic design and the premium services really set this place apart. It feels like a boutique retreat. Complete pampering!",
      user: { name: "Elena Rostova" },
      service: { name: "Keratin Smooth Treatment" },
    },
  ];

  const displayReviews = reviews.length > 0 ? reviews.slice(0, 3) : fallbackReviews;

  return (
    <div className="w-full flex flex-col bg-dark-bg min-h-screen">
      {/* Hero Section */}
      <section className="relative py-28 md:py-40 px-4 overflow-hidden flex flex-col items-center justify-center border-b border-dark-border bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-900/60 via-dark-bg to-dark-bg">
        {/* Decorative elements */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute top-10 right-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="max-w-4xl mx-auto text-center space-y-8 relative z-10">
          <div className="inline-flex items-center gap-2 bg-dark-gold/20 border border-primary/20 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wider text-primary uppercase animate-pulse">
            <Sparkles className="h-3.5 w-3.5" />
            Ottawa Premium Loc Styling
          </div>

          <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white leading-none">
            Unveil Your True <br />
            <span className="text-gold-gradient">Radiant Elegance</span>
          </h1>

          <p className="max-w-xl mx-auto text-base sm:text-lg text-zinc-400 leading-relaxed">
            Experience the gold standard in premium hair dressing, luxury coloring, and master styling. Indulge in an atmosphere designed to pamper.
          </p>

          <div className="flex flex-col sm:flex-row justify-center items-center gap-4 pt-4">
            <Link
              href="/book"
              className="w-full sm:w-auto bg-primary hover:bg-primary-hover text-black font-extrabold px-8 py-4 rounded-full transition duration-300 text-base shadow-lg shadow-primary/20 flex items-center justify-center gap-2 hover:scale-[1.02] transform cursor-pointer"
            >
              <Calendar className="h-5 w-5" />
              Book Appointment
            </Link>
            <Link
              href="/services"
              className="w-full sm:w-auto bg-transparent hover:bg-zinc-900 text-zinc-200 border border-zinc-700 hover:border-zinc-500 px-8 py-4 rounded-full transition duration-300 text-base flex items-center justify-center gap-2 cursor-pointer"
            >
              View Services Menu
            </Link>
          </div>
        </div>
      </section>

      {/* Highlights Section */}
      <section className="py-20 px-4 max-w-7xl mx-auto w-full">
        <div className="text-center space-y-3 mb-16">
          <h2 className="text-primary font-bold text-xs tracking-widest uppercase">
            The Ottawa Loctician Standard
          </h2>
          <p className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Why Discerning Clients Choose Us
          </p>
          <div className="w-16 h-1 bg-primary mx-auto rounded-full mt-2"></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Card 1 */}
          <div className="glass-card p-8 rounded-2xl space-y-4 hover:-translate-y-1 transform transition duration-300">
            <div className="h-12 w-12 rounded-xl bg-dark-gold/20 border border-primary/20 flex items-center justify-center">
              <Award className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-xl font-bold text-white">Master Stylists</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Our team consists of award-winning master colorists and stylists trained globally, bringing top runway trends and timeless luxury to you.
            </p>
          </div>

          {/* Card 2 */}
          <div className="glass-card p-8 rounded-2xl space-y-4 hover:-translate-y-1 transform transition duration-300">
            <div className="h-12 w-12 rounded-xl bg-dark-gold/20 border border-primary/20 flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-xl font-bold text-white">Premium Products</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              We use only organic, sulfate-free, premium hair care brands like Oribe and Kérastase to ensure your hair maintains its natural, healthy glow.
            </p>
          </div>

          {/* Card 3 */}
          <div className="glass-card p-8 rounded-2xl space-y-4 hover:-translate-y-1 transform transition duration-300">
            <div className="h-12 w-12 rounded-xl bg-dark-gold/20 border border-primary/20 flex items-center justify-center">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-xl font-bold text-white">Secure Deposits</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Book with total peace of mind. We use Stripe to process secure credit card bookings. Pay a small deposit now, and settle the rest later.
            </p>
          </div>
        </div>
      </section>

      {/* Testimonials / Reviews Section */}
      <section className="py-20 bg-[#070708] border-t border-b border-dark-border px-4">
        <div className="max-w-7xl mx-auto w-full">
          <div className="text-center space-y-3 mb-16">
            <h2 className="text-primary font-bold text-xs tracking-widest uppercase">
              Client Testimonials
            </h2>
            <p className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Words From Our Community
            </p>
            <div className="w-16 h-1 bg-primary mx-auto rounded-full mt-2"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {displayReviews.map((rev) => (
              <div key={rev.id} className="glass-card p-8 rounded-2xl space-y-4 flex flex-col justify-between">
                <div className="space-y-4">
                  {/* Rating Stars */}
                  <div className="flex gap-1">
                    {Array.from({ length: rev.rating }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                    ))}
                  </div>
                  <p className="text-zinc-300 text-sm italic leading-relaxed">
                    &ldquo;{rev.comment}&rdquo;
                  </p>
                </div>
                <div className="pt-4 border-t border-zinc-800 mt-4 flex justify-between items-center text-xs">
                  <span className="font-bold text-white">{rev.user.name}</span>
                  <span className="text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded-full">
                    {rev.service?.name || "Salon Service"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Location, Hours, Contact Info */}
      <section className="py-20 px-4 max-w-7xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        <div className="space-y-6">
          <h2 className="text-primary font-bold text-xs tracking-widest uppercase">
            Visit Ottawa Loctician
          </h2>
          <h3 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Our Oasis in Ottawa
          </h3>
          <p className="text-zinc-400 leading-relaxed text-sm">
            Escape the bustle of the city. Ottawa Loctician (IWA LOCZ) offers a calm, luxury styling experience. Walk-ins are welcome but scheduled appointments are highly recommended to ensure we have a master stylist ready to serve you.
          </p>

          <div className="space-y-4 text-sm text-zinc-300">
            <div className="flex items-center gap-3">
              <MapPin className="h-5 w-5 text-primary shrink-0" />
              <span>K2B 8E7 - Ottawa, ON, Canada</span>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="h-5 w-5 text-primary shrink-0" />
              <span>+1 343 996 2448</span>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p>Mon - Fri: 9:00 AM - 8:00 PM</p>
                <p>Sat: 9:00 AM - 6:00 PM | Sun: 10:00 AM - 4:00 PM</p>
              </div>
            </div>
          </div>
        </div>

        {/* Styled Frame / Visual element */}
        <div className="w-full h-80 rounded-2xl border border-dark-border relative overflow-hidden bg-zinc-950 flex flex-col items-center justify-center p-8 text-center space-y-4">
          {/* Decorative radial gradients for luxury vibe */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-dark-gold/15 via-transparent to-transparent pointer-events-none"></div>
          <Scissors className="h-10 w-10 text-primary animate-pulse" />
          <h4 className="text-xl font-bold text-white">Ready for a Transformation?</h4>
          <p className="text-xs text-zinc-400 max-w-xs leading-relaxed">
            Find the perfect date and time slot with our multi-step booking planner. Settle deposit securely with Stripe.
          </p>
          <Link
            href="/book"
            className="bg-primary hover:bg-primary-hover text-black font-extrabold px-6 py-2.5 rounded-full transition duration-300 text-sm flex items-center gap-2 cursor-pointer"
          >
            Book Now
          </Link>
        </div>
      </section>
    </div>
  );
}
