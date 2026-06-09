"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import confetti from "canvas-confetti";
import { useAuthStore } from "@/store/useAuthStore";
import { api } from "@/lib/api";
import CheckoutForm from "@/components/CheckoutForm";
import {
  Scissors,
  Calendar as CalendarIcon,
  Clock,
  User,
  CreditCard,
  CheckCircle,
  Loader2,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  Lock,
  MessageSquare,
  Tag,
  Star,
  Sparkles,
  Users,
  Gift,
} from "lucide-react";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""
);

interface Service {
  id: string;
  name: string;
  description: string;
  duration: number;
  price: string;
}

interface Staff {
  id: string;
  name: string;
  bio: string | null;
  image: string | null;
  services: { id: string; name: string }[];
}

interface Slot {
  time: string;
  available: boolean;
}

interface CouponResult {
  couponId: string;
  code: string;
  discountType: "PERCENTAGE" | "FLAT";
  discountValue: number;
  discountAmount: number;
}

function BookingWizardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, setAuth, isHydrated } = useAuthStore();

  // Steps: 1=Service, 2=Date&Time, 3=Stylist, 4=Confirm&Auth, 5=Pay, 6=Success
  const [step, setStep] = useState(1);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null | "any">(
    "any"
  );
  const [notes, setNotes] = useState("");
  const [paymentType, setPaymentType] = useState<"DEPOSIT" | "FULL">("DEPOSIT");

  // Cancellation policy
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const [showFullPolicy, setShowFullPolicy] = useState(false);

  // Coupon state
  const [couponCode, setCouponCode] = useState("");
  const [couponResult, setCouponResult] = useState<CouponResult | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponApplied, setCouponApplied] = useState(false);

  // Loyalty points state
  const [redeemPoints, setRedeemPoints] = useState(false);
  const [userLoyaltyPoints, setUserLoyaltyPoints] = useState(0);

  // Auth sub-states
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authPhone, setAuthPhone] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Booking process states
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);

  const formatLocalDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Fetch Services
  const { data: servicesResponse, isLoading: servicesLoading } = useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const res = await api.get("/services");
      return res.data;
    },
  });
  const services: Service[] = servicesResponse?.data || [];

  // Fetch Staff for selected service
  const { data: staffResponse, isLoading: staffLoading } = useQuery({
    queryKey: ["staff", selectedService?.id],
    queryFn: async () => {
      if (!selectedService) return null;
      const res = await api.get("/staff", {
        params: { serviceId: selectedService.id },
      });
      return res.data;
    },
    enabled: !!selectedService,
  });
  const staffList: Staff[] = staffResponse?.data || [];

  // Handle service pre-selection via URL param
  const preSelectedId = searchParams.get("serviceId");
  useEffect(() => {
    if (services.length > 0 && preSelectedId && !selectedService) {
      const found = services.find((s) => s.id === preSelectedId);
      if (found) {
        setSelectedService(found);
        setStep(2);
      }
    }
  }, [services, preSelectedId, selectedService]);

  // Fetch user loyalty points when logged in
  useEffect(() => {
    if (user && step === 4) {
      api
        .get("/users/me")
        .then((res) => {
          setUserLoyaltyPoints(res.data?.data?.loyaltyPoints || 0);
        })
        .catch(() => {});
    }
  }, [user, step]);

  // Fetch Available Slots
  const formattedDate = formatLocalDate(selectedDate);
  const staffIdParam =
    selectedStaff && selectedStaff !== "any" ? selectedStaff.id : undefined;

  const {
    data: slotsResponse,
    isLoading: slotsLoading,
  } = useQuery({
    queryKey: ["slots", formattedDate, selectedService?.id, staffIdParam],
    queryFn: async () => {
      if (!selectedService) return null;
      const res = await api.get("/appointments/available-slots", {
        params: {
          date: formattedDate,
          serviceId: selectedService.id,
          ...(staffIdParam && { staffId: staffIdParam }),
        },
      });
      return res.data;
    },
    enabled: !!selectedService,
  });
  const slots: Slot[] = slotsResponse?.data?.slots || [];

  // Reset time slot when date changes
  useEffect(() => {
    setSelectedTime(null);
  }, [selectedDate]);

  // Computed price breakdown
  const servicePrice = parseFloat(selectedService?.price || "0");
  const couponDiscount = couponApplied && couponResult ? couponResult.discountAmount : 0;
  const loyaltyDiscount =
    redeemPoints && userLoyaltyPoints > 0
      ? Math.min(
          userLoyaltyPoints * 1.0,
          (servicePrice - couponDiscount) * 0.5
        )
      : 0;
  const totalDiscount = couponDiscount + loyaltyDiscount;
  const finalPrice = Math.max(0, servicePrice - totalDiscount);
  const depositAmount = Math.min(30, finalPrice);
  const amountToPay = paymentType === "DEPOSIT" ? depositAmount : finalPrice;

  const getNextDays = () => {
    const list = [];
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(today.getDate() + i);
      list.push(d);
    }
    return list;
  };
  const dates = getNextDays();

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponError(null);
    setCouponLoading(true);
    setCouponApplied(false);
    setCouponResult(null);
    try {
      const res = await api.post("/coupons/validate", {
        code: couponCode.trim(),
        servicePrice: servicePrice,
      });
      const result: CouponResult = res.data?.data;
      setCouponResult(result);
      setCouponApplied(true);
    } catch (err: any) {
      setCouponError(
        err.response?.data?.message || "Invalid or expired coupon code."
      );
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setCouponApplied(false);
    setCouponResult(null);
    setCouponCode("");
    setCouponError(null);
  };

  const handleInlineAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      if (authMode === "login") {
        const res = await api.post("/auth/login", {
          email: authEmail,
          password: authPassword,
        });
        const { user: loggedInUser, accessToken, refreshToken } = res.data.data;
        setAuth(loggedInUser, accessToken, refreshToken);
      } else {
        const res = await api.post("/auth/register", {
          name: authName,
          email: authEmail,
          password: authPassword,
          phone: authPhone || undefined,
        });
        const { user: registeredUser, accessToken, refreshToken } =
          res.data.data;
        setAuth(registeredUser, accessToken, refreshToken);
      }
    } catch (err: any) {
      setAuthError(
        err.response?.data?.message ||
          "Authentication failed. Please verify credentials."
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const handleCreateAppointment = async () => {
    if (!selectedService || !selectedTime) return;
    setBookingError(null);
    setBookingLoading(true);
    try {
      const staffId =
        selectedStaff && selectedStaff !== "any" ? selectedStaff.id : undefined;

      const appointmentRes = await api.post("/appointments", {
        serviceId: selectedService.id,
        appointmentDate: formattedDate,
        appointmentTime: selectedTime,
        notes: notes || undefined,
        ...(staffId && { staffId }),
        ...(couponApplied && couponResult && { couponCode: couponResult.code }),
        redeemPoints: redeemPoints && userLoyaltyPoints > 0,
      });

      const appt = appointmentRes.data.data;
      setAppointmentId(appt.id);

      // Compute amount net of discounts
      const netAmount = amountToPay;
      const intentRes = await api.post("/payments/create-intent", {
        appointmentId: appt.id,
        paymentType,
      });

      const { clientSecret: secret, amount } = intentRes.data.data;
      setClientSecret(secret);
      setPaymentAmount(amount);
      setStep(5);
    } catch (err: any) {
      setBookingError(
        err.response?.data?.message ||
          "Failed to establish booking. Please try another time."
      );
    } finally {
      setBookingLoading(false);
    }
  };

  const handlePaymentSuccess = () => {
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 },
      colors: ["#E60654", "#FFD3E2", "#C20443", "#FFFFFF"],
    });
    setStep(6);
  };

  const getDayName = (date: Date) =>
    date.toLocaleDateString("en-US", { weekday: "short" });
  const getMonthName = (date: Date) =>
    date.toLocaleDateString("en-US", { month: "short" });

  const stepLabels = [
    { num: 1, label: "Service", icon: Scissors },
    { num: 2, label: "Schedule", icon: CalendarIcon },
    { num: 3, label: "Stylist", icon: Users },
    { num: 4, label: "Confirm", icon: User },
    { num: 5, label: "Payment", icon: CreditCard },
    { num: 6, label: "Done", icon: CheckCircle },
  ];

  return (
    <div className="w-full bg-dark-bg min-h-screen py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Title */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Book Your{" "}
            <span className="text-gold-gradient">IWA LOCZ Experience</span>
          </h1>
          <p className="text-zinc-400 text-sm max-w-md mx-auto">
            Reserve custom-tailored styling, premium coloring, and wellness
            treatments instantly.
          </p>
        </div>

        {/* Step Indicators */}
        <div className="glass-panel p-4 rounded-2xl flex items-center justify-between overflow-x-auto gap-2">
          {stepLabels.map((s) => {
            const Icon = s.icon;
            const isActive = step === s.num;
            const isCompleted = step > s.num;
            return (
              <div
                key={s.num}
                className={`flex items-center gap-1.5 shrink-0 ${
                  isActive
                    ? "text-primary"
                    : isCompleted
                    ? "text-primary/70"
                    : "text-zinc-500"
                }`}
              >
                <div
                  className={`h-7 w-7 rounded-full border flex items-center justify-center text-xs font-bold transition ${
                    isActive
                      ? "bg-primary text-black border-primary shadow-lg shadow-primary/20"
                      : isCompleted
                      ? "bg-dark-gold/30 text-primary border-primary/40"
                      : "bg-zinc-900 text-zinc-500 border-zinc-800"
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle className="h-3.5 w-3.5" />
                  ) : (
                    s.num
                  )}
                </div>
                <span className="text-xs font-semibold hidden sm:block">
                  {s.label}
                </span>
                {s.num < 6 && (
                  <ChevronRight className="h-3 w-3 text-zinc-700" />
                )}
              </div>
            );
          })}
        </div>

        {/* ─── STEP 1: SERVICE CHOICE ─── */}
        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Scissors className="h-5 w-5 text-primary" />
              1. Choose a Luxury Treatment
            </h2>
            {servicesLoading ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <Loader2 className="animate-spin h-10 w-10 text-primary" />
                <p className="text-sm text-zinc-400">Loading catalog...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {services.map((service) => (
                  <button
                    key={service.id}
                    onClick={() => {
                      setSelectedService(service);
                      setSelectedStaff("any");
                      setStep(2);
                    }}
                    className={`text-left glass-card p-6 rounded-2xl relative overflow-hidden transition-all duration-300 border flex flex-col justify-between cursor-pointer ${
                      selectedService?.id === service.id
                        ? "border-primary bg-dark-gold/10"
                        : "border-zinc-900/60 hover:border-primary/40 bg-zinc-950/20"
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex justify-between items-start">
                        <span className="text-lg font-bold text-white">
                          {service.name}
                        </span>
                        <span className="text-lg font-extrabold text-primary">
                          ${parseFloat(service.price).toFixed(2)}
                        </span>
                      </div>
                      <p className="text-zinc-400 text-xs leading-relaxed line-clamp-3">
                        {service.description}
                      </p>
                    </div>
                    <div className="flex justify-between items-center mt-6 pt-4 border-t border-zinc-900/80 text-xs text-zinc-400 w-full">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-primary" />
                        <span>{service.duration} mins</span>
                      </div>
                      <span className="text-primary font-bold flex items-center gap-1">
                        Select <ChevronRight className="h-3 w-3" />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── STEP 2: DATE & TIME SELECT ─── */}
        {step === 2 && selectedService && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-primary" />
                2. Select Date & Time
              </h2>
              <button
                onClick={() => setStep(1)}
                className="text-xs text-zinc-400 hover:text-primary transition"
              >
                Change Service ({selectedService.name})
              </button>
            </div>

            {/* Date Slider */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-zinc-300">
                Choose Booking Date
              </label>
              <div className="flex gap-2.5 overflow-x-auto pb-3 pt-1 scrollbar-thin">
                {dates.map((date, idx) => {
                  const isSelected =
                    formatLocalDate(date) === formatLocalDate(selectedDate);
                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedDate(date)}
                      className={`flex flex-col items-center justify-center p-3.5 rounded-xl border shrink-0 w-20 transition duration-300 cursor-pointer ${
                        isSelected
                          ? "bg-primary text-black border-primary font-bold shadow-lg shadow-primary/15"
                          : "bg-zinc-950/40 text-zinc-400 border-zinc-900 hover:border-zinc-700"
                      }`}
                    >
                      <span className="text-xs font-semibold tracking-wider uppercase">
                        {getDayName(date)}
                      </span>
                      <span className="text-lg font-extrabold mt-1">
                        {date.getDate()}
                      </span>
                      <span className="text-[10px] opacity-75 mt-0.5">
                        {getMonthName(date)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Available Slots Grid */}
            <div className="space-y-4">
              <label className="block text-sm font-medium text-zinc-300">
                Available Slots for{" "}
                {selectedDate.toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </label>

              {slotsLoading ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <Loader2 className="animate-spin h-8 w-8 text-primary" />
                  <p className="text-xs text-zinc-500">
                    Checking slot availability...
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {slots.map((slot, idx) => {
                    const isSelected = selectedTime === slot.time;
                    return (
                      <button
                        key={idx}
                        disabled={!slot.available}
                        onClick={() => setSelectedTime(slot.time)}
                        className={`py-3 px-2 rounded-xl text-sm font-bold border transition text-center cursor-pointer ${
                          isSelected
                            ? "bg-primary text-black border-primary shadow-md"
                            : slot.available
                            ? "bg-zinc-950/20 text-white border-zinc-800 hover:border-primary/50"
                            : "bg-zinc-950/80 text-zinc-600 border-zinc-950 cursor-not-allowed opacity-35"
                        }`}
                      >
                        <Clock className="h-3.5 w-3.5 inline-block -mt-0.5 mr-1 text-primary opacity-60" />
                        {slot.time}
                      </button>
                    );
                  })}
                  {slots.length === 0 && (
                    <div className="col-span-full py-8 text-center text-zinc-500 text-sm">
                      No availability found for this date. Please try another
                      day.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-4 pt-4 border-t border-zinc-900/60">
              <button
                onClick={() => setStep(1)}
                className="flex-1 bg-transparent hover:bg-zinc-900 text-zinc-300 border border-zinc-700 py-3.5 rounded-xl font-bold transition text-sm cursor-pointer"
              >
                Back
              </button>
              <button
                disabled={!selectedTime}
                onClick={() => setStep(3)}
                className="flex-1 bg-primary hover:bg-primary-hover text-black py-3.5 rounded-xl font-bold transition duration-300 text-sm shadow-lg shadow-primary/10 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 3: SELECT STYLIST ─── */}
        {step === 3 && selectedService && selectedTime && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                3. Choose Your Stylist
              </h2>
              <button
                onClick={() => setStep(2)}
                className="text-xs text-zinc-400 hover:text-primary transition"
              >
                ← Back to Schedule
              </button>
            </div>

            <p className="text-zinc-500 text-xs">
              Select a preferred stylist or let us auto-assign the first
              available expert for your treatment.
            </p>

            {staffLoading ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-3">
                <Loader2 className="animate-spin h-8 w-8 text-primary" />
                <p className="text-xs text-zinc-500">Loading stylists...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* "Any Stylist" card */}
                <button
                  onClick={() => setSelectedStaff("any")}
                  className={`p-5 rounded-2xl border text-left transition cursor-pointer flex items-center gap-4 ${
                    selectedStaff === "any"
                      ? "border-primary bg-dark-gold/10"
                      : "border-zinc-800 bg-zinc-950/20 hover:border-zinc-700"
                  }`}
                >
                  <div className="h-14 w-14 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                    <Sparkles className="h-7 w-7 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold text-white text-sm">Any Stylist</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Auto-assign the first available expert
                    </p>
                    {selectedStaff === "any" && (
                      <span className="inline-block mt-1.5 text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">
                        Selected
                      </span>
                    )}
                  </div>
                </button>

                {staffList.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedStaff(s)}
                    className={`p-5 rounded-2xl border text-left transition cursor-pointer flex items-center gap-4 ${
                      selectedStaff !== "any" &&
                      (selectedStaff as Staff)?.id === s.id
                        ? "border-primary bg-dark-gold/10"
                        : "border-zinc-800 bg-zinc-950/20 hover:border-zinc-700"
                    }`}
                  >
                    <div className="h-14 w-14 rounded-full overflow-hidden border border-zinc-700 shrink-0">
                      {s.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={s.image}
                          alt={s.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full bg-zinc-800 flex items-center justify-center">
                          <User className="h-6 w-6 text-zinc-500" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-sm">{s.name}</p>
                      {s.bio && (
                        <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">
                          {s.bio}
                        </p>
                      )}
                      {selectedStaff !== "any" &&
                        (selectedStaff as Staff)?.id === s.id && (
                          <span className="inline-block mt-1.5 text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">
                            Selected
                          </span>
                        )}
                    </div>
                  </button>
                ))}

                {staffList.length === 0 && (
                  <div className="col-span-full glass-panel p-6 rounded-xl text-center text-zinc-500 text-sm border border-zinc-800">
                    No dedicated stylists for this service — we'll assign our
                    best available expert.
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-4 pt-4 border-t border-zinc-900/60">
              <button
                onClick={() => setStep(2)}
                className="flex-1 bg-transparent hover:bg-zinc-900 text-zinc-300 border border-zinc-700 py-3.5 rounded-xl font-bold transition text-sm cursor-pointer"
              >
                Back
              </button>
              <button
                onClick={() => setStep(4)}
                className="flex-1 bg-primary hover:bg-primary-hover text-black py-3.5 rounded-xl font-bold transition duration-300 text-sm shadow-lg shadow-primary/10 flex items-center justify-center gap-2 cursor-pointer"
              >
                Continue <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 4: CONFIRM & AUTH ─── */}
        {step === 4 && selectedService && selectedTime && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              4. Review & Client Profile
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Summary + Discount Panel */}
              <div className="space-y-4 md:col-span-1">
                {/* Appointment Summary */}
                <div className="glass-panel p-5 rounded-2xl border border-primary/20 space-y-3 h-fit">
                  <h3 className="font-extrabold text-xs text-primary tracking-wider uppercase">
                    Order Summary
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="block text-xs text-zinc-500">Service</span>
                      <span className="font-bold text-white">
                        {selectedService.name}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs text-zinc-500">Date & Time</span>
                      <span className="font-bold text-zinc-200">
                        {selectedDate.toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        at {selectedTime}
                      </span>
                    </div>
                    {selectedStaff && selectedStaff !== "any" && (
                      <div>
                        <span className="block text-xs text-zinc-500">Stylist</span>
                        <span className="font-bold text-zinc-200">
                          {(selectedStaff as Staff).name}
                        </span>
                      </div>
                    )}
                    <hr className="border-zinc-800" />

                    {/* Price Breakdown */}
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Service Price</span>
                        <span className="text-white font-semibold">
                          ${servicePrice.toFixed(2)}
                        </span>
                      </div>
                      {couponApplied && couponResult && (
                        <div className="flex justify-between text-green-400">
                          <span>Coupon ({couponResult.code})</span>
                          <span>-${couponDiscount.toFixed(2)}</span>
                        </div>
                      )}
                      {redeemPoints && loyaltyDiscount > 0 && (
                        <div className="flex justify-between text-amber-400">
                          <span>Points Discount</span>
                          <span>-${loyaltyDiscount.toFixed(2)}</span>
                        </div>
                      )}
                      <hr className="border-zinc-800" />
                      <div className="flex justify-between">
                        <span className="text-zinc-300 font-semibold">
                          Final Price
                        </span>
                        <span className="text-primary font-extrabold text-base">
                          ${finalPrice.toFixed(2)}
                        </span>
                      </div>
                      {paymentType === "DEPOSIT" && (
                        <div className="flex justify-between text-zinc-500">
                          <span>Due now ($30 deposit)</span>
                          <span className="text-white">
                            ${depositAmount.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Coupon Code Panel (only if logged in) */}
                {user && (
                  <div className="glass-panel p-5 rounded-2xl border border-zinc-800 space-y-3">
                    <h3 className="font-extrabold text-xs text-zinc-300 tracking-wider uppercase flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5 text-primary" />
                      Promo Code
                    </h3>
                    {couponApplied && couponResult ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between bg-green-950/30 border border-green-900/40 rounded-lg px-3 py-2">
                          <div>
                            <p className="text-green-400 font-bold text-xs">
                              {couponResult.code} applied!
                            </p>
                            <p className="text-green-300/70 text-[10px]">
                              {couponResult.discountType === "PERCENTAGE"
                                ? `${couponResult.discountValue}% off`
                                : `$${couponResult.discountValue} off`}{" "}
                              — saves ${couponDiscount.toFixed(2)}
                            </p>
                          </div>
                          <button
                            onClick={handleRemoveCoupon}
                            className="text-[10px] text-red-400 hover:text-red-300 font-bold ml-2"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={couponCode}
                          onChange={(e) =>
                            setCouponCode(e.target.value.toUpperCase())
                          }
                          onKeyDown={(e) =>
                            e.key === "Enter" && handleApplyCoupon()
                          }
                          placeholder="Enter code (e.g. WELCOME10)"
                          className="flex-1 px-3 py-2 border border-zinc-800 rounded-lg bg-zinc-950 text-white text-xs focus:outline-none focus:border-primary placeholder-zinc-600"
                        />
                        <button
                          onClick={handleApplyCoupon}
                          disabled={couponLoading || !couponCode.trim()}
                          className="bg-primary hover:bg-primary-hover text-black px-3 py-2 rounded-lg text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                        >
                          {couponLoading ? (
                            <Loader2 className="animate-spin h-3.5 w-3.5" />
                          ) : (
                            "Apply"
                          )}
                        </button>
                      </div>
                    )}
                    {couponError && (
                      <p className="text-red-400 text-[10px]">{couponError}</p>
                    )}
                  </div>
                )}

                {/* Loyalty Points Panel (only if logged in + has points) */}
                {user && userLoyaltyPoints > 0 && (
                  <div className="glass-panel p-5 rounded-2xl border border-zinc-800 space-y-3">
                    <h3 className="font-extrabold text-xs text-zinc-300 tracking-wider uppercase flex items-center gap-1.5">
                      <Gift className="h-3.5 w-3.5 text-amber-400" />
                      Loyalty Points
                    </h3>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white text-sm font-bold">
                          {userLoyaltyPoints} pts available
                        </p>
                        <p className="text-zinc-500 text-[10px]">
                          Worth ${userLoyaltyPoints.toFixed(2)} (max 50% of
                          price)
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={redeemPoints}
                          onChange={(e) => setRedeemPoints(e.target.checked)}
                          className="sr-only peer"
                          id="redeem-points-toggle"
                        />
                        <div className="w-10 h-5 bg-zinc-700 rounded-full peer peer-checked:bg-primary transition-colors duration-200 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-5"></div>
                      </label>
                    </div>
                    {redeemPoints && loyaltyDiscount > 0 && (
                      <p className="text-amber-400 text-[10px] font-semibold">
                        ✨ Saving ${loyaltyDiscount.toFixed(2)} with{" "}
                        {Math.floor(loyaltyDiscount)} points
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Client Auth / Details card */}
              <div className="glass-card p-6 rounded-2xl space-y-6 md:col-span-2">
                {isHydrated && !user ? (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center border-b border-zinc-900 pb-3">
                      <span className="text-sm font-bold text-white">
                        {authMode === "login"
                          ? "Sign in to secure booking"
                          : "Create account to continue"}
                      </span>
                      <button
                        onClick={() =>
                          setAuthMode(
                            authMode === "login" ? "register" : "login"
                          )
                        }
                        className="text-xs text-primary hover:underline font-semibold"
                      >
                        {authMode === "login"
                          ? "Register instead"
                          : "Sign in instead"}
                      </button>
                    </div>

                    {authError && (
                      <div className="bg-red-950/40 border border-red-900/40 text-red-300 p-3 rounded-lg flex items-start gap-2 text-xs">
                        <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                        <span>{authError}</span>
                      </div>
                    )}

                    <form onSubmit={handleInlineAuth} className="space-y-4">
                      {authMode === "register" && (
                        <>
                          <div>
                            <label className="block text-xs font-semibold text-zinc-400 mb-1">
                              Full Name
                            </label>
                            <input
                              required
                              type="text"
                              value={authName}
                              onChange={(e) => setAuthName(e.target.value)}
                              placeholder="Jane Doe"
                              className="w-full px-4 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950 text-white text-sm focus:outline-none focus:border-primary"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-zinc-400 mb-1">
                              Phone (Optional)
                            </label>
                            <input
                              type="tel"
                              value={authPhone}
                              onChange={(e) => setAuthPhone(e.target.value)}
                              placeholder="+1 (555) 000-0000"
                              className="w-full px-4 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950 text-white text-sm focus:outline-none focus:border-primary"
                            />
                          </div>
                        </>
                      )}

                      <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-1">
                          Email Address
                        </label>
                        <input
                          required
                          type="email"
                          value={authEmail}
                          onChange={(e) => setAuthEmail(e.target.value)}
                          placeholder="jane@example.com"
                          className="w-full px-4 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950 text-white text-sm focus:outline-none focus:border-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-1">
                          Password
                        </label>
                        <input
                          required
                          type="password"
                          value={authPassword}
                          onChange={(e) => setAuthPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-4 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950 text-white text-sm focus:outline-none focus:border-primary"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={authLoading}
                        className="w-full bg-primary hover:bg-primary-hover text-black py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {authLoading ? (
                          <Loader2 className="animate-spin h-4 w-4" />
                        ) : (
                          <span>
                            {authMode === "login"
                              ? "Sign In & Continue"
                              : "Create Account"}
                          </span>
                        )}
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                      <span className="text-sm text-zinc-400">
                        Logged in as:{" "}
                        <strong className="text-white">{user?.name}</strong>
                      </span>
                      <span className="text-[10px] text-zinc-500 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-full">
                        Secure Client Profile
                      </span>
                    </div>

                    {bookingError && (
                      <div className="bg-red-950/40 border border-red-900/40 text-red-300 p-3.5 rounded-xl flex items-start gap-2.5 text-xs">
                        <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                        <span>{bookingError}</span>
                      </div>
                    )}

                    {/* Deposit Toggle Options */}
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-zinc-300">
                        Select Payment Authorization Option
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <button
                          onClick={() => setPaymentType("DEPOSIT")}
                          className={`p-4 rounded-xl border text-left flex flex-col justify-between transition h-28 cursor-pointer ${
                            paymentType === "DEPOSIT"
                              ? "bg-dark-gold/10 border-primary"
                              : "bg-zinc-950/20 border-zinc-900 hover:border-zinc-800"
                          }`}
                        >
                          <div className="flex justify-between items-center w-full">
                            <span className="text-xs font-bold text-white">
                              Deposit Only
                            </span>
                            <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-extrabold uppercase">
                              $30 Deposit
                            </span>
                          </div>
                          <span className="text-lg font-extrabold text-primary">
                            ${depositAmount.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            Pay deposit now, settle remainder at salon.
                          </span>
                        </button>

                        <button
                          onClick={() => setPaymentType("FULL")}
                          className={`p-4 rounded-xl border text-left flex flex-col justify-between transition h-28 cursor-pointer ${
                            paymentType === "FULL"
                              ? "bg-dark-gold/10 border-primary"
                              : "bg-zinc-950/20 border-zinc-900 hover:border-zinc-800"
                          }`}
                        >
                          <div className="flex justify-between items-center w-full">
                            <span className="text-xs font-bold text-white">
                              Full Pre-Payment
                            </span>
                            <span className="text-[10px] bg-green-950/40 text-green-400 px-1.5 py-0.5 rounded font-extrabold uppercase">
                              Complete
                            </span>
                          </div>
                          <span className="text-lg font-extrabold text-primary">
                            ${finalPrice.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            Fully settle appointment now.
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-zinc-300 flex items-center gap-1.5">
                        <MessageSquare className="h-4 w-4 text-primary opacity-80" />
                        Special Requests or Notes
                      </label>
                      <textarea
                        rows={3}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Add styling notes, hair history, or accessibility requirements here..."
                        className="w-full px-4 py-3 border border-zinc-800 rounded-xl bg-zinc-950 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-primary transition"
                      ></textarea>
                    </div>

                    {/* ── Cancellation Policy ── */}
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-sm font-bold text-white">Booking Policies</span>
                      </div>
                      <div className="text-xs text-zinc-400 leading-relaxed space-y-1.5">
                        <p>
                          • <span className="text-white font-semibold">Deposit:</span> A $30 deposit is required to secure all appointments.
                        </p>
                        <p>
                          • <span className="text-white font-semibold">Cancellation:</span> Must cancel 48 hours in advance.
                        </p>
                        <p>
                          • <span className="text-white font-semibold">Punctuality:</span> Arrive on time. A 16-minute grace period is allowed.{" "}
                          <button
                            type="button"
                            onClick={() => setShowFullPolicy(true)}
                            className="text-primary underline decoration-dotted hover:decoration-solid font-semibold cursor-pointer"
                          >
                            See full policy
                          </button>
                        </p>
                      </div>

                      {/* Agreement Checkbox */}
                      <label
                        htmlFor="agree-policy"
                        className="flex items-start gap-3 cursor-pointer group mt-1"
                      >
                        <div className="relative mt-0.5">
                          <input
                            id="agree-policy"
                            type="checkbox"
                            checked={agreedToPolicy}
                            onChange={(e) => setAgreedToPolicy(e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className={`h-4 w-4 rounded border-2 flex items-center justify-center transition-all duration-200 ${
                            agreedToPolicy
                              ? "bg-primary border-primary"
                              : "bg-zinc-900 border-zinc-600 group-hover:border-primary/60"
                          }`}>
                            {agreedToPolicy && (
                              <svg className="h-2.5 w-2.5 text-black" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-zinc-300 leading-relaxed">
                          I have read and agreed to the cancellation policy of{" "}
                          <span className="font-bold text-white">Ottawa Loctician (IWA LOCZ)</span>.
                        </span>
                      </label>
                    </div>

                    {/* Submit CTA */}
                    <button
                      onClick={handleCreateAppointment}
                      disabled={bookingLoading || !agreedToPolicy}
                      className="w-full bg-primary hover:bg-primary-hover text-black py-4 rounded-xl text-sm font-extrabold transition duration-300 shadow-lg shadow-primary/10 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {bookingLoading ? (
                        <>
                          <Loader2 className="animate-spin h-4 w-4" />
                          <span>Establishing Reservation...</span>
                        </>
                      ) : (
                        <>
                          <Lock className="h-4 w-4" />
                          <span>
                            Book Reservation & Pay $
                            {amountToPay.toFixed(2)}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Back Navigation */}
            <div className="flex gap-4 pt-4 border-t border-zinc-900/60">
              <button
                disabled={bookingLoading}
                onClick={() => setStep(3)}
                className="w-full md:w-1/3 bg-transparent hover:bg-zinc-900 text-zinc-300 border border-zinc-700 py-3.5 rounded-xl font-bold transition text-sm cursor-pointer"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 5: PAYMENT ─── */}
        {step === 5 && selectedService && selectedTime && clientSecret && (
          <div className="max-w-md mx-auto space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold text-white flex items-center justify-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                5. Secure Checkout
              </h2>
              <p className="text-zinc-400 text-xs">
                Authorize payment securely via Stripe.
              </p>
            </div>

            <div className="glass-panel p-6 rounded-2xl border border-primary/25">
              <Elements stripe={stripePromise} options={{ clientSecret }}>
                <CheckoutForm
                  clientSecret={clientSecret}
                  amount={paymentAmount}
                  currency="usd"
                  paymentType={paymentType}
                  onSuccess={handlePaymentSuccess}
                  onCancel={() => setStep(4)}
                />
              </Elements>
            </div>
          </div>
        )}

        {/* ─── STEP 6: SUCCESS ─── */}
        {step === 6 && selectedService && selectedTime && (
          <div className="max-w-md mx-auto glass-panel p-8 rounded-2xl border border-primary/30 text-center space-y-6 relative overflow-hidden">
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

            <div className="flex justify-center">
              <div className="h-16 w-16 bg-primary/10 border border-primary/30 rounded-full flex items-center justify-center">
                <CheckCircle className="h-10 w-10 text-primary animate-pulse" />
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-extrabold text-white">
                Booking Confirmed!
              </h2>
              <p className="text-xs text-zinc-400">
                A confirmation email has been dispatched. We look forward to
                pampering you.
              </p>
            </div>

            <div className="bg-zinc-950/80 p-4 rounded-xl border border-zinc-900 space-y-3 text-sm text-left">
              <div className="flex justify-between">
                <span className="text-zinc-500 text-xs">Treatment</span>
                <span className="font-bold text-white">
                  {selectedService.name}
                </span>
              </div>
              {selectedStaff && selectedStaff !== "any" && (
                <div className="flex justify-between">
                  <span className="text-zinc-500 text-xs">Stylist</span>
                  <span className="font-bold text-zinc-200">
                    {(selectedStaff as Staff).name}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-zinc-500 text-xs">Scheduled Date</span>
                <span className="font-bold text-zinc-200">
                  {selectedDate.toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 text-xs">Time Slot</span>
                <span className="font-bold text-zinc-200">{selectedTime}</span>
              </div>
              {totalDiscount > 0 && (
                <div className="flex justify-between text-green-400">
                  <span className="text-xs">Total Savings</span>
                  <span className="font-bold">-${totalDiscount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-zinc-900">
                <span className="text-zinc-500 text-xs">Authorized Paid</span>
                <span className="font-extrabold text-primary">
                  ${(paymentAmount / 100).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Loyalty points earned indicator */}
            <div className="bg-amber-950/20 border border-amber-900/30 rounded-xl p-3 text-xs text-amber-300 flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-400 shrink-0" />
              <span>
                You'll earn{" "}
                <strong>
                  {Math.floor((paymentAmount / 100) * 0.1)} loyalty points
                </strong>{" "}
                for this visit — redeemable on your next booking!
              </span>
            </div>

            <div className="space-y-3 pt-2">
              <button
                onClick={() => router.push("/dashboard")}
                className="w-full bg-primary hover:bg-primary-hover text-black py-3 rounded-xl font-bold transition text-sm cursor-pointer"
              >
                Go to My Bookings
              </button>
              <button
                onClick={() => {
                  setSelectedService(null);
                  setSelectedTime(null);
                  setNotes("");
                  setSelectedStaff("any");
                  setCouponCode("");
                  setCouponResult(null);
                  setCouponApplied(false);
                  setRedeemPoints(false);
                  setStep(1);
                }}
                className="w-full bg-transparent hover:bg-zinc-900 text-zinc-400 border border-zinc-800 py-3 rounded-xl font-bold transition text-sm cursor-pointer"
              >
                Book Another Appointment
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Full Cancellation Policy Modal */}
      {showFullPolicy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-md rounded-2xl border border-zinc-800 p-6 space-y-5">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-primary shrink-0" />
                <h2 className="text-lg font-extrabold text-white">Cancellation Policy</h2>
              </div>
              <button
                onClick={() => setShowFullPolicy(false)}
                className="text-zinc-500 hover:text-white transition text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 text-xs sm:text-sm text-zinc-400 leading-relaxed max-h-[60vh] overflow-y-auto pr-1">
              {/* Deposit Policy */}
              <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 space-y-2">
                <h3 className="text-white font-bold text-xs uppercase tracking-wider">Deposit Policy</h3>
                <p>
                  A <span className="text-white font-semibold">$30 deposit</span> is required to secure all appointments. Your appointment is not confirmed until the deposit is received.
                </p>
              </div>

              {/* Cancellation Policy */}
              <div className="bg-red-950/20 border border-red-900/30 rounded-xl p-4 space-y-2">
                <h3 className="text-red-400 font-bold text-xs uppercase tracking-wider">Cancellation Policy</h3>
                <p>
                  You must cancel or reschedule at least <span className="text-white font-semibold">48 hours in advance</span> of your scheduled appointment time.
                </p>
                <p>
                  Cancellations within 48 hours or failure to arrive for your session (<span className="text-white font-semibold">No-Shows</span>) will result in full forfeiture of the $30 deposit.
                </p>
              </div>

              {/* Punctuality Policy */}
              <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 space-y-2">
                <h3 className="text-white font-bold text-xs uppercase tracking-wider">Punctuality Policy</h3>
                <p>
                  Please arrive on time. A <span className="text-white font-semibold">16-minute grace period</span> is allowed. Arriving after the 16-minute grace period may result in cancellation of your appointment and forfeiture of the deposit.
                </p>
              </div>

              {/* How to Manage Bookings */}
              <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 space-y-2 text-zinc-400">
                <h3 className="text-white font-bold text-xs uppercase tracking-wider">How to Cancel or Reschedule</h3>
                <p>
                  Log in to your dashboard and visit <span className="text-primary font-semibold">My Bookings</span> to cancel or reschedule. For urgent assistance, email us at{" "}
                  <a href="mailto:bashiratarowora@gmail.com" className="text-primary underline decoration-dotted">
                    bashiratarowora@gmail.com
                  </a>{" "}
                  or call{" "}
                  <a href="tel:+13439962448" className="text-primary underline decoration-dotted">
                    +1 343 996 2448
                  </a>.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowFullPolicy(false)}
              className="w-full bg-primary hover:bg-primary-hover text-black py-2.5 rounded-xl text-xs font-extrabold transition cursor-pointer"
            >
              Understood — Close Policy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BookingWizardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-grow flex flex-col items-center justify-center py-20 bg-dark-bg text-zinc-400 gap-4">
          <Loader2 className="animate-spin h-10 w-10 text-primary" />
          <p className="text-sm">Initiating checkout portal...</p>
        </div>
      }
    >
      <BookingWizardContent />
    </Suspense>
  );
}
