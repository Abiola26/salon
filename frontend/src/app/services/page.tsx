"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import Link from "next/link";
import { Scissors, Clock, DollarSign, Loader2, Sparkles, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";

interface Service {
  id: string;
  name: string;
  description: string;
  duration: number; // minutes
  price: string; // Decimal string
  image?: string | null;
  isActive: boolean;
}

export default function ServicesPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: servicesResponse, isLoading, error } = useQuery({
    queryKey: ["services-list"],
    queryFn: async () => {
      const response = await api.get("/services");
      // Clean up response data mapping
      return response.data;
    },
    enabled: mounted,
  });

  const services: Service[] = servicesResponse?.data || [];

  return (
    <div className="w-full bg-dark-bg min-h-screen py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-12">
        
        {/* Header */}
        <div className="text-center space-y-4 max-w-xl mx-auto">
          <div className="inline-flex items-center gap-1.5 bg-dark-gold/20 border border-primary/20 px-3.5 py-1 rounded-full text-xs font-semibold tracking-wider text-primary uppercase">
            <Sparkles className="h-3 w-3" />
            Our Services Menu
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Exquisite Salon Treatments
          </h1>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Browse our curated collection of luxury hair, color, and treatment services designed to elevate and refine your style.
          </p>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="animate-spin h-10 w-10 text-primary" />
            <p className="text-sm text-zinc-400">Loading our signature menu...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="max-w-md mx-auto bg-red-950/20 border border-red-900/40 p-4 rounded-xl flex items-start gap-3 text-red-300">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400 mt-0.5" />
            <div>
              <h4 className="font-bold text-sm">Failed to load services</h4>
              <p className="text-xs text-zinc-400 mt-1">
                There was a problem loading the services menu. Please check your internet connection or refresh.
              </p>
            </div>
          </div>
        )}

        {/* Services Grid */}
        {mounted && !isLoading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {services.map((service) => (
              <div
                key={service.id}
                className="glass-card rounded-2xl p-6 flex flex-col justify-between h-full relative overflow-hidden"
              >
                {/* Accent glow on top */}
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/30 to-transparent"></div>

                <div className="space-y-4">
                  {/* Service Image / Icon placeholder */}
                  <div className="h-10 w-10 rounded-xl bg-dark-gold/20 border border-primary/25 flex items-center justify-center">
                    <Scissors className="h-5 w-5 text-primary" />
                  </div>

                  <div>
                    <h3 className="text-xl font-bold text-white tracking-tight">
                      {service.name}
                    </h3>
                    <p className="text-zinc-400 text-sm mt-2 leading-relaxed">
                      {service.description}
                    </p>
                  </div>
                </div>

                <div className="mt-8 pt-4 border-t border-zinc-900/80 flex flex-col gap-4">
                  {/* Price and duration */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-zinc-300 text-sm">
                      <Clock className="h-4 w-4 text-primary shrink-0" />
                      <span>{service.duration} mins</span>
                    </div>
                    <div className="flex items-center text-xl font-extrabold text-primary">
                      <DollarSign className="h-5 w-5 shrink-0 -mr-0.5" />
                      <span>{parseFloat(service.price).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Book CTA */}
                  <Link
                    href={`/book?serviceId=${service.id}`}
                    className="w-full block text-center bg-primary hover:bg-primary-hover text-black font-extrabold py-3 rounded-xl transition duration-300 text-sm cursor-pointer"
                  >
                    Book Appointment
                  </Link>
                </div>
              </div>
            ))}

            {services.length === 0 && (
              <div className="col-span-full text-center py-16 text-zinc-400 space-y-2">
                <Scissors className="h-8 w-8 text-primary mx-auto mb-2 opacity-50" />
                <p className="font-bold">No active services found</p>
                <p className="text-xs text-zinc-500">Please contact our salon administrator to configure services.</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
