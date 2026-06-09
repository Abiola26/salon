"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { api } from "@/lib/api";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import CheckoutForm from "@/components/CheckoutForm";
import {
  Calendar as CalendarIcon,
  Clock,
  Scissors,
  CreditCard,
  AlertCircle,
  CheckCircle,
  Loader2,
  Trash2,
  XCircle,
  Sparkles,
  ChevronRight,
  MessageSquare,
  HelpCircle,
  Star,
  Gift,
} from "lucide-react";

// Load Stripe
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

interface Appointment {
  id: string;
  appointmentDate: string; // ISO String
  appointmentTime: string; // HH:MM
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  amountPaid: string;
  notes?: string | null;
  service: Service;
}

interface Slot {
  time: string;
  available: boolean;
}

export default function CustomerDashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isHydrated } = useAuthStore();

  const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");

  // State for cancel modal
  const [cancellingAppt, setCancellingAppt] = useState<Appointment | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  // State for rescheduling
  const [reschedulingAppt, setReschedulingAppt] = useState<Appointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<Date>(new Date());
  const [rescheduleTime, setRescheduleTime] = useState<string | null>(null);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  // State for paying remaining balance
  const [payingAppt, setPayingAppt] = useState<Appointment | null>(null);
  const [paymentClientSecret, setPaymentClientSecret] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);

  // State for reviews
  const [reviewingAppt, setReviewingAppt] = useState<Appointment | null>(null);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>("");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Local helper to format Date to YYYY-MM-DD
  const formatLocalDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getDayName = (date: Date) => {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  };

  const getMonthName = (date: Date) => {
    return date.toLocaleDateString("en-US", { month: "short" });
  };

  // Redirect to login if user not authenticated
  useEffect(() => {
    if (isHydrated && !user) {
      router.push("/login?redirect=/dashboard");
    } else if (isHydrated && user && user.role === "ADMIN") {
      router.push("/admin");
    }
  }, [user, isHydrated, router]);

  // Fetch customer appointments
  const { data: appointmentsResponse, isLoading: listLoading, refetch } = useQuery({
    queryKey: ["appointments"],
    queryFn: async () => {
      const res = await api.get("/appointments");
      return res.data;
    },
    enabled: !!user,
  });

  const allAppointments: Appointment[] = appointmentsResponse?.data || [];

  // Fetch user profile (includes loyalty points)
  const { data: userProfileResponse } = useQuery({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const res = await api.get("/users/me");
      return res.data;
    },
    enabled: !!user,
  });
  const loyaltyPoints: number = userProfileResponse?.data?.loyaltyPoints || 0;

  // Fetch customer reviews
  const { data: myReviewsResponse } = useQuery({
    queryKey: ["my-reviews"],
    queryFn: async () => {
      const res = await api.get("/reviews/my");
      return res.data;
    },
    enabled: !!user,
  });

  const myReviews = myReviewsResponse?.data || [];
  const reviewedApptIds = new Set<string>(
    myReviews.map((r: any) => r.appointmentId)
  );

  const handleReviewSubmit = async () => {
    if (!reviewingAppt) return;
    setReviewLoading(true);
    setReviewError(null);
    try {
      await api.post("/reviews", {
        appointmentId: reviewingAppt.id,
        rating: reviewRating,
        comment: reviewComment,
      });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["my-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["public-reviews"] });
      setReviewingAppt(null);
      setReviewRating(5);
      setReviewComment("");
    } catch (err: any) {
      setReviewError(
        err.response?.data?.message || "Failed to submit review. Please try again."
      );
    } finally {
      setReviewLoading(false);
    }
  };

  // Sort and filter appointments
  const getFilteredAppointments = () => {
    const now = new Date();
    // Reset hours to compare dates easily
    now.setHours(0, 0, 0, 0);

    const upcoming = allAppointments.filter((appt) => {
      if (appt.status === "CANCELLED") return false;
      const apptDate = new Date(appt.appointmentDate);
      return apptDate >= now && appt.status !== "COMPLETED";
    });

    const past = allAppointments.filter((appt) => {
      const apptDate = new Date(appt.appointmentDate);
      return apptDate < now || appt.status === "CANCELLED" || appt.status === "COMPLETED";
    });

    // Sort upcoming ascending, past descending
    upcoming.sort((a, b) => {
      const dateDiff = new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime();
      if (dateDiff !== 0) return dateDiff;
      return a.appointmentTime.localeCompare(b.appointmentTime);
    });

    past.sort((a, b) => {
      const dateDiff = new Date(b.appointmentDate).getTime() - new Date(a.appointmentDate).getTime();
      if (dateDiff !== 0) return dateDiff;
      return b.appointmentTime.localeCompare(a.appointmentTime);
    });

    return activeTab === "upcoming" ? upcoming : past;
  };

  const displayedAppts = getFilteredAppointments();

  // Available Slots query for rescheduling
  const formattedRescheduleDate = formatLocalDate(rescheduleDate);
  const { data: slotsResponse, isLoading: slotsLoading } = useQuery({
    queryKey: ["reschedule-slots", formattedRescheduleDate, reschedulingAppt?.service?.id],
    queryFn: async () => {
      if (!reschedulingAppt) return null;
      const res = await api.get("/appointments/available-slots", {
        params: {
          date: formattedRescheduleDate,
          serviceId: reschedulingAppt.service.id,
        },
      });
      return res.data;
    },
    enabled: !!reschedulingAppt,
  });

  const slots: Slot[] = slotsResponse?.data?.slots || [];

  // Reset time slot when rescheduling date changes
  useEffect(() => {
    setRescheduleTime(null);
  }, [rescheduleDate]);

  // Cancel Appointment Mutation
  const handleCancelSubmit = async () => {
    if (!cancellingAppt) return;
    setCancelLoading(true);
    try {
      await api.delete(`/appointments/${cancellingAppt.id}`);
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setCancellingAppt(null);
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to cancel appointment.");
    } finally {
      setCancelLoading(false);
    }
  };

  // Reschedule Appointment Mutation
  const handleRescheduleSubmit = async () => {
    if (!reschedulingAppt || !rescheduleTime) return;
    setRescheduleLoading(true);
    setRescheduleError(null);
    try {
      await api.put(`/appointments/${reschedulingAppt.id}`, {
        appointmentDate: formattedRescheduleDate,
        appointmentTime: rescheduleTime,
      });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setReschedulingAppt(null);
    } catch (err: any) {
      setRescheduleError(
        err.response?.data?.message || "Failed to reschedule. The slot may have been taken."
      );
    } finally {
      setRescheduleLoading(false);
    }
  };

  // Settle Outstanding Balance Payment Intent Creation
  const handlePayBalance = async (appt: Appointment) => {
    setPayingAppt(appt);
    setPaymentLoading(true);
    setPaymentError(null);
    try {
      // Settle full remaining amount
      const intentRes = await api.post("/payments/create-intent", {
        appointmentId: appt.id,
        paymentType: "FULL",
      });

      const { clientSecret, amount } = intentRes.data.data;
      setPaymentClientSecret(clientSecret);
      setPaymentAmount(amount);
    } catch (err: any) {
      setPaymentError(err.response?.data?.message || "Failed to start payment.");
    } finally {
      setPaymentLoading(false);
    }
  };

  const handlePayBalanceSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["appointments"] });
    setPayingAppt(null);
    setPaymentClientSecret(null);
  };

  // Generate date options for rescheduling (next 14 days)
  const getRescheduleDays = () => {
    const list = [];
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(today.getDate() + i);
      list.push(d);
    }
    return list;
  };
  const rescheduleDays = getRescheduleDays();

  if (!isHydrated || !user) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center py-20 bg-dark-bg text-zinc-400 gap-4">
        <Loader2 className="animate-spin h-10 w-10 text-primary" />
        <p className="text-sm">Accessing member portal...</p>
      </div>
    );
  }

  return (
    <div className="w-full bg-dark-bg min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Welcome Header */}
        <div className="glass-panel p-8 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none"></div>
          <div>
            <div className="inline-flex items-center gap-1.5 bg-dark-gold/20 border border-primary/20 px-3 py-1 rounded-full text-xs font-bold text-primary mb-3">
              <Sparkles className="h-3 w-3 animate-pulse" />
              Customer Portal
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">
              Welcome back, {user.name}
            </h1>
            <p className="text-zinc-400 text-xs mt-1">
              Manage appointments, reschedule timings, and settle booking balances securely.
            </p>
          </div>
          <button
            onClick={() => router.push("/book")}
            className="bg-primary hover:bg-primary-hover text-black font-extrabold px-6 py-3 rounded-xl transition duration-300 text-sm shadow-lg shadow-primary/10 cursor-pointer"
          >
            Book New Appointment
          </button>
        </div>

        {/* Loyalty Points Card */}
        <div className="glass-panel p-5 rounded-2xl border border-amber-900/30 bg-amber-950/10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-amber-900/30 border border-amber-800/40 flex items-center justify-center shrink-0">
              <Gift className="h-6 w-6 text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Loyalty Points Balance</p>
              <p className="text-2xl font-extrabold text-white">
                {loyaltyPoints}{" "}
                <span className="text-base font-semibold text-amber-400">pts</span>
              </p>
              <p className="text-zinc-500 text-[10px] mt-0.5">
                Worth ${loyaltyPoints.toFixed(2)} — redeemable on your next booking (max 50% discount)
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push("/book")}
            className="shrink-0 text-xs text-amber-400 border border-amber-800/40 hover:bg-amber-950/40 px-4 py-2 rounded-xl transition font-bold cursor-pointer"
          >
            Redeem Now
          </button>
        </div>


        <div className="flex gap-4 border-b border-zinc-800 pb-2.5">
          <button
            onClick={() => setActiveTab("upcoming")}
            className={`pb-2 text-sm font-bold border-b-2 transition duration-200 cursor-pointer ${
              activeTab === "upcoming"
                ? "text-primary border-primary"
                : "text-zinc-500 border-transparent hover:text-zinc-300"
            }`}
          >
            Upcoming Reservations
          </button>
          <button
            onClick={() => setActiveTab("past")}
            className={`pb-2 text-sm font-bold border-b-2 transition duration-200 cursor-pointer ${
              activeTab === "past"
                ? "text-primary border-primary"
                : "text-zinc-500 border-transparent hover:text-zinc-300"
            }`}
          >
            Past & Cancelled
          </button>
        </div>

        {/* Appointments List */}
        {listLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="animate-spin h-10 w-10 text-primary" />
            <p className="text-sm text-zinc-400">Loading appointments...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {displayedAppts.map((appt) => {
              const servicePrice = parseFloat(appt.service.price);
              const amountPaid = parseFloat(appt.amountPaid);
              const remainingBalance = servicePrice - amountPaid;
              const percentPaid = Math.min(100, Math.round((amountPaid / servicePrice) * 100));

              return (
                <div
                  key={appt.id}
                  className="glass-card rounded-2xl p-6 border border-zinc-900/60 relative overflow-hidden grid grid-cols-1 md:grid-cols-4 gap-6 items-center"
                >
                  {/* Left Column: Date & Time */}
                  <div className="flex flex-col space-y-2 border-b md:border-b-0 md:border-r border-zinc-800/60 pb-4 md:pb-0 md:pr-6">
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                      <CalendarIcon className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-semibold">
                        {new Date(appt.appointmentDate).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-zinc-300">
                      <Clock className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-bold">{appt.appointmentTime}</span>
                    </div>
                    <div className="pt-2">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wider uppercase border ${
                          appt.status === "CONFIRMED"
                            ? "bg-green-950/20 text-green-400 border-green-900/40"
                            : appt.status === "PENDING"
                            ? "bg-[#E60654]/10 text-[#E60654] border-[#E60654]/20"
                            : appt.status === "CANCELLED"
                            ? "bg-red-950/20 text-red-400 border-red-900/40"
                            : "bg-zinc-800 text-zinc-400 border-zinc-700"
                        }`}
                      >
                        {appt.status}
                      </span>
                    </div>
                  </div>

                  {/* Middle Left: Service Summary */}
                  <div className="md:col-span-2 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-dark-gold/20 border border-primary/20 flex items-center justify-center shrink-0">
                        <Scissors className="h-4 w-4 text-primary" />
                      </div>
                      <h3 className="text-lg font-bold text-white tracking-tight">
                        {appt.service.name}
                      </h3>
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed max-w-md">
                      {appt.service.description}
                    </p>
                    {appt.notes && (
                      <div className="bg-zinc-950/40 border border-zinc-900 p-2.5 rounded-xl text-xs text-zinc-500 flex gap-2">
                        <MessageSquare className="h-4 w-4 text-primary opacity-60 shrink-0 mt-0.5" />
                        <span>&ldquo;{appt.notes}&rdquo;</span>
                      </div>
                    )}

                    {/* Payment Progress Bar */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-zinc-500">
                          Settle: ${amountPaid.toFixed(2)} paid of ${servicePrice.toFixed(2)}
                        </span>
                        <span
                          className={`font-bold ${
                            appt.paymentStatus === "PAID" ? "text-green-400" : "text-primary"
                          }`}
                        >
                          {appt.paymentStatus} ({percentPaid}%)
                        </span>
                      </div>
                      <div className="w-full bg-zinc-950 rounded-full h-1.5 overflow-hidden border border-zinc-900">
                        <div
                          className={`h-full rounded-full ${
                            appt.paymentStatus === "PAID" ? "bg-green-500" : "bg-primary"
                          }`}
                          style={{ width: `${percentPaid}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Actions */}
                  <div className="flex flex-col gap-2.5 md:pl-6">
                    {appt.status !== "CANCELLED" && appt.status !== "COMPLETED" && (
                      <>
                        {appt.paymentStatus !== "PAID" && (
                          <button
                            onClick={() => handlePayBalance(appt)}
                            className="w-full bg-primary hover:bg-primary-hover text-black py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-primary/5"
                          >
                            <CreditCard className="h-3.5 w-3.5" />
                            Settle Balance (${remainingBalance.toFixed(2)})
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setReschedulingAppt(appt);
                            setRescheduleDate(new Date(appt.appointmentDate));
                            setRescheduleTime(null);
                          }}
                          className="w-full bg-transparent hover:bg-zinc-900 text-zinc-300 border border-zinc-700 hover:border-zinc-500 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <CalendarIcon className="h-3.5 w-3.5" />
                          Reschedule Date
                        </button>
                        <button
                          onClick={() => setCancellingAppt(appt)}
                          className="w-full bg-transparent hover:bg-red-950/20 text-zinc-400 border border-transparent hover:border-red-900/40 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                          Cancel Reservation
                        </button>
                      </>
                    )}
                    {appt.status === "CANCELLED" && (
                      <div className="text-center text-xs text-zinc-500 flex items-center justify-center gap-1.5 py-4">
                        <XCircle className="h-4 w-4 text-red-500" />
                        <span>Reservation Cancelled</span>
                      </div>
                    )}
                    {appt.status === "COMPLETED" && (
                      <div className="w-full">
                        {reviewedApptIds.has(appt.id) ? (
                          <div className="flex flex-col gap-1 w-full text-center py-2">
                            <span className="text-xs text-green-400 font-bold flex items-center justify-center gap-1">
                              <CheckCircle className="h-4 w-4" /> Reviewed
                            </span>
                            <span className="text-[10px] text-zinc-500">Thank you for your feedback!</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setReviewingAppt(appt);
                              setReviewRating(5);
                              setReviewComment("");
                              setReviewError(null);
                            }}
                            className="w-full bg-primary hover:bg-primary-hover text-black py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-primary/5"
                          >
                            <Star className="h-3.5 w-3.5" />
                            Write a Review
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {displayedAppts.length === 0 && (
              <div className="glass-panel p-16 rounded-2xl text-center text-zinc-500 space-y-4">
                <Scissors className="h-10 w-10 text-primary mx-auto opacity-50 mb-2" />
                <h3 className="font-extrabold text-white">No Appointments Listed</h3>
                <p className="text-xs text-zinc-400 max-w-xs mx-auto leading-relaxed">
                  {activeTab === "upcoming"
                    ? "You do not have any upcoming beauty reservations currently scheduled."
                    : "Your completed or cancelled bookings history is currently empty."}
                </p>
                {activeTab === "upcoming" && (
                  <button
                    onClick={() => router.push("/book")}
                    className="bg-primary hover:bg-primary-hover text-black font-extrabold px-6 py-2.5 rounded-xl transition duration-300 text-xs cursor-pointer inline-block"
                  >
                    Book Your First IWA LOCZ Service
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* MODAL 1: CONFIRM CANCELLATION */}
        {cancellingAppt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-dark-card border border-red-900/30 p-6 rounded-2xl max-w-md w-full space-y-6 animate-zoomIn relative">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-red-600/50"></div>
              
              <div className="flex gap-3 items-start">
                <div className="h-10 w-10 rounded-full bg-red-950/40 border border-red-900/40 flex items-center justify-center shrink-0">
                  <XCircle className="h-6 w-6 text-red-400" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-white">Cancel Appointment</h3>
                  <p className="text-xs text-zinc-400">
                    Are you certain you wish to cancel your reservation for{" "}
                    <strong className="text-zinc-200">{cancellingAppt.service.name}</strong> on{" "}
                    {new Date(cancellingAppt.appointmentDate).toLocaleDateString("en-US")} at{" "}
                    {cancellingAppt.appointmentTime}?
                  </p>
                </div>
              </div>

              <div className="bg-zinc-950/40 p-4 rounded-xl border border-zinc-900/80 text-[11px] text-zinc-500 leading-relaxed">
                ⚠️ <strong>Cancellation Policy:</strong> Cancellations must be made at least 48 hours in advance of the appointment. Late cancellations or no-shows forfeit the $30 deposit.
              </div>

              <div className="flex gap-4">
                <button
                  disabled={cancelLoading}
                  onClick={() => setCancellingAppt(null)}
                  className="flex-1 bg-transparent hover:bg-zinc-900 text-zinc-300 border border-zinc-800 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Keep Booking
                </button>
                <button
                  disabled={cancelLoading}
                  onClick={handleCancelSubmit}
                  className="flex-1 bg-red-950/60 hover:bg-red-900/80 border border-red-900 text-red-200 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {cancelLoading ? (
                    <Loader2 className="animate-spin h-4 w-4" />
                  ) : (
                    <span>Confirm Cancel</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 2: RESCHEDULE APPOINTMENT */}
        {reschedulingAppt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-dark-card border border-primary/20 p-6 rounded-2xl max-w-2xl w-full space-y-6 overflow-y-auto max-h-[90vh] animate-zoomIn relative">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary/30"></div>

              <div className="flex justify-between items-start border-b border-zinc-900 pb-3">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <CalendarIcon className="h-5 w-5 text-primary" />
                    Reschedule Appointment
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Select a new day and slot for <strong className="text-zinc-200">{reschedulingAppt.service.name}</strong>
                  </p>
                </div>
                <button
                  onClick={() => setReschedulingAppt(null)}
                  className="text-zinc-500 hover:text-white transition text-xs font-bold"
                >
                  Close
                </button>
              </div>

              {rescheduleError && (
                <div className="bg-red-950/40 border border-red-900/40 text-red-300 p-3 rounded-lg flex items-start gap-2 text-xs">
                  <AlertCircle className="h-4.5 w-4.5 text-red-400 shrink-0 mt-0.5" />
                  <span>{rescheduleError}</span>
                </div>
              )}

              {/* Date slider picker */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  Select New Date
                </label>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                  {rescheduleDays.map((date, idx) => {
                    const isSelected =
                      formatLocalDate(date) === formatLocalDate(rescheduleDate);
                    return (
                      <button
                        key={idx}
                        onClick={() => setRescheduleDate(date)}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border shrink-0 w-16 transition duration-200 cursor-pointer ${
                          isSelected
                            ? "bg-primary text-black border-primary font-bold shadow-md shadow-primary/10"
                            : "bg-zinc-950/20 text-zinc-400 border-zinc-900 hover:border-zinc-800"
                        }`}
                      >
                        <span className="text-[10px] tracking-wider uppercase font-semibold">
                          {getDayName(date)}
                        </span>
                        <span className="text-base font-extrabold mt-0.5">
                          {date.getDate()}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Slots selection */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  Select Time Slot ({formattedRescheduleDate})
                </label>

                {slotsLoading ? (
                  <div className="flex flex-col items-center justify-center py-8 space-y-2">
                    <Loader2 className="animate-spin h-6 w-6 text-primary" />
                    <span className="text-xs text-zinc-500">Checking timings...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
                    {slots.map((slot, idx) => {
                      const isSelected = rescheduleTime === slot.time;
                      return (
                        <button
                          key={idx}
                          disabled={!slot.available}
                          onClick={() => setRescheduleTime(slot.time)}
                          className={`py-2 px-1 rounded-xl text-xs font-bold border transition text-center cursor-pointer ${
                            isSelected
                              ? "bg-primary text-black border-primary shadow-md"
                              : slot.available
                              ? "bg-zinc-950/20 text-white border-zinc-800 hover:border-primary/40"
                              : "bg-zinc-950/80 text-zinc-700 border-zinc-950 cursor-not-allowed opacity-35"
                          }`}
                        >
                          {slot.time}
                        </button>
                      );
                    })}
                    {slots.length === 0 && (
                      <div className="col-span-full py-6 text-center text-zinc-500 text-xs">
                        No availability found for this date.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Submit / Cancel */}
              <div className="flex gap-4 pt-4 border-t border-zinc-900/60">
                <button
                  disabled={rescheduleLoading}
                  onClick={() => setReschedulingAppt(null)}
                  className="flex-1 bg-transparent hover:bg-zinc-900 text-zinc-300 border border-zinc-800 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  disabled={!rescheduleTime || rescheduleLoading}
                  onClick={handleRescheduleSubmit}
                  className="flex-1 bg-primary hover:bg-primary-hover text-black py-2.5 rounded-xl text-xs font-extrabold transition duration-300 shadow-lg shadow-primary/10 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {rescheduleLoading ? (
                    <Loader2 className="animate-spin h-4 w-4" />
                  ) : (
                    <span>Confirm Reschedule</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 3: PAY OUTSTANDING BALANCE */}
        {payingAppt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-dark-card border border-primary/20 p-6 rounded-2xl max-w-md w-full space-y-6 animate-zoomIn relative">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary/30"></div>

              <div className="flex justify-between items-start border-b border-zinc-900 pb-3">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    Settle Outstanding Balance
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Pay the remaining balance for <strong className="text-zinc-200">{payingAppt.service.name}</strong>
                  </p>
                </div>
                <button
                  onClick={() => {
                    setPayingAppt(null);
                    setPaymentClientSecret(null);
                  }}
                  className="text-zinc-500 hover:text-white transition text-xs font-bold"
                >
                  Close
                </button>
              </div>

              {paymentLoading && (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <Loader2 className="animate-spin h-8 w-8 text-primary" />
                  <span className="text-xs text-zinc-500">Retrieving secure checkout details...</span>
                </div>
              )}

              {paymentError && (
                <div className="bg-red-950/40 border border-red-900/40 text-red-300 p-3 rounded-lg flex items-start gap-2 text-xs">
                  <AlertCircle className="h-4.5 w-4.5 text-red-400 shrink-0 mt-0.5" />
                  <span>{paymentError}</span>
                </div>
              )}

              {paymentClientSecret && (
                <div className="glass-panel p-4 rounded-xl border border-zinc-800/80">
                  <Elements stripe={stripePromise} options={{ clientSecret: paymentClientSecret }}>
                    <CheckoutForm
                      clientSecret={paymentClientSecret}
                      amount={paymentAmount}
                      currency="usd"
                      paymentType="FULL"
                      onSuccess={handlePayBalanceSuccess}
                      onCancel={() => {
                        setPayingAppt(null);
                        setPaymentClientSecret(null);
                      }}
                    />
                  </Elements>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODAL 4: WRITE A REVIEW */}
        {reviewingAppt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 text-white">
            <div className="bg-dark-card border border-primary/20 p-6 rounded-2xl max-w-md w-full space-y-6 overflow-y-auto max-h-[90vh] animate-zoomIn relative">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary/30"></div>

              <div className="flex justify-between items-start border-b border-zinc-900 pb-3">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Star className="h-5 w-5 text-primary" />
                    Write a Review
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Share your experience for <strong className="text-zinc-200">{reviewingAppt.service.name}</strong>
                  </p>
                </div>
                <button
                  onClick={() => {
                    setReviewingAppt(null);
                    setReviewError(null);
                  }}
                  className="text-zinc-500 hover:text-white transition text-xs font-bold"
                >
                  Close
                </button>
              </div>

              {reviewError && (
                <div className="bg-red-950/40 border border-red-900/40 text-red-300 p-3 rounded-lg flex items-start gap-2 text-xs">
                  <AlertCircle className="h-4.5 w-4.5 text-red-400 shrink-0 mt-0.5" />
                  <span>{reviewError}</span>
                </div>
              )}

              <div className="space-y-4">
                {/* Star Rating Selector */}
                <div className="space-y-2 text-center">
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider text-left">
                    Your Rating
                  </label>
                  <div className="flex justify-center gap-2 py-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setReviewRating(star)}
                        className="p-1 transition hover:scale-110 cursor-pointer"
                      >
                        <Star
                          className={`h-8 w-8 transition ${
                            star <= reviewRating
                              ? "fill-primary text-primary"
                              : "text-zinc-700"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-zinc-400 font-semibold block">
                    {reviewRating === 5
                      ? "Excellent! Perfect styling."
                      : reviewRating === 4
                      ? "Very Good. Highly satisfied."
                      : reviewRating === 3
                      ? "Good. Satisfied with service."
                      : reviewRating === 2
                      ? "Fair. Could be improved."
                      : "Poor. Unsatisfied."}
                  </span>
                </div>

                {/* Comment Text Area */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider">
                    Your Feedback
                  </label>
                  <textarea
                    rows={4}
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="Describe your appointment, the stylist, and the overall experience..."
                    className="w-full px-4 py-3 border border-zinc-800 rounded-xl bg-zinc-950 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-primary transition"
                  ></textarea>
                </div>

                {/* Buttons */}
                <div className="flex gap-4 pt-4 border-t border-zinc-900/60">
                  <button
                    disabled={reviewLoading}
                    onClick={() => {
                      setReviewingAppt(null);
                      setReviewError(null);
                    }}
                    className="flex-1 bg-transparent hover:bg-zinc-900 text-zinc-300 border border-zinc-800 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={reviewLoading}
                    onClick={handleReviewSubmit}
                    className="flex-1 bg-primary hover:bg-primary-hover text-black py-2.5 rounded-xl text-xs font-extrabold transition duration-300 shadow-lg shadow-primary/10 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {reviewLoading ? (
                      <Loader2 className="animate-spin h-4 w-4" />
                    ) : (
                      <span>Submit Review</span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
