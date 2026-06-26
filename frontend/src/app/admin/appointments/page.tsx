"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { api, getApiErrorMessage } from "@/lib/api";
import {
  Calendar as CalendarIcon,
  Clock,
  Scissors,
  User,
  Check,
  X,
  Loader2,
  AlertCircle,
  Filter,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
} from "lucide-react";
import Calendar from "@/components/Calendar";

interface Service {
  id: string;
  name: string;
  duration: number;
  price: string;
}

interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
}

interface Appointment {
  id: string;
  appointmentDate: string;
  appointmentTime: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  amountPaid: string;
  notes?: string | null;
  user: Customer;
  service: Service;
}

interface Slot {
  time: string;
  available: boolean;
}

export default function AdminAppointmentsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isHydrated } = useAuthStore();

  // Filters State
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterPayment, setFilterPayment] = useState<string>("ALL");
  const [filterDate, setFilterDate] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const limit = 10;

  // Actions states
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);

  // Rescheduling states
  const [reschedulingAppt, setReschedulingAppt] = useState<Appointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<Date>(new Date());
  const [rescheduleTime, setRescheduleTime] = useState<string | null>(null);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  // Local helper to format Date to YYYY-MM-DD
  const formatLocalDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Redirect if not admin
  useEffect(() => {
    if (isHydrated && (!user || user.role !== "ADMIN")) {
      router.push(user ? "/dashboard" : "/login?redirect=/admin/appointments");
    }
  }, [user, isHydrated, router]);

  // Fetch appointments with query params
  const { data: appointmentsResponse, isLoading, refetch } = useQuery({
    queryKey: ["admin-appointments", filterStatus, filterPayment, filterDate, page],
    queryFn: async () => {
      const params: {
        page: number;
        limit: number;
        status?: string;
        paymentStatus?: string;
        date?: string;
      } = {
        page,
        limit,
      };
      if (filterStatus !== "ALL") params.status = filterStatus;
      if (filterPayment !== "ALL") params.paymentStatus = filterPayment;
      if (filterDate) params.date = filterDate;

      const res = await api.get("/appointments", { params });
      return res.data;
    },
    enabled: !!user && user.role === "ADMIN",
  });

  const appointments: Appointment[] = appointmentsResponse?.data || [];
  const meta = appointmentsResponse?.meta || { total: 0, totalPages: 1 };

  // Reschedule Slots Query
  const formattedRescheduleDate = formatLocalDate(rescheduleDate);
  const { data: slotsResponse, isLoading: slotsLoading } = useQuery({
    queryKey: ["admin-reschedule-slots", formattedRescheduleDate, reschedulingAppt?.service?.id],
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

  useEffect(() => {
    setRescheduleTime(null);
  }, [rescheduleDate]);

  // Mutations
  const handleConfirm = async (id: string) => {
    setConfirmingId(id);
    try {
      await api.patch(`/appointments/${id}/confirm`);
      queryClient.invalidateQueries({ queryKey: ["admin-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    } catch (err: unknown) {
      console.error(getApiErrorMessage(err, "Failed to confirm appointment."));
    } finally {
      setConfirmingId(null);
    }
  };

  const handleCancel = async (id: string) => {
    setCancellingId(id);
    try {
      await api.delete(`/appointments/${id}`);
      queryClient.invalidateQueries({ queryKey: ["admin-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    } catch (err: unknown) {
      console.error(getApiErrorMessage(err, "Failed to cancel appointment."));
    } finally {
      setCancellingId(null);
    }
  };

  interface RescheduleMutationBody {
    appointmentDate: string;
    appointmentTime: string;
  }

  interface RescheduleMutationContext {
    previous: unknown;
  }

  const rescheduleMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: RescheduleMutationBody }) => {
      const res = await api.put(`/appointments/${id}`, body);
      return res.data;
    },
    onMutate: async ({ id, body }) => {
      await queryClient.cancelQueries({ queryKey: ["admin-appointments"] });
      const key = ["admin-appointments", filterStatus, filterPayment, filterDate, page];
      const previous = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (old: { data: Appointment[] } | undefined) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((a) =>
            a.id === id ? { ...a, appointmentDate: body.appointmentDate, appointmentTime: body.appointmentTime } : a
          ),
        };
      });
      return { previous } satisfies RescheduleMutationContext;
    },
    onError: (err: unknown, _variables, context) => {
      setRescheduleError(getApiErrorMessage(err, "Failed to reschedule appointment."));
      if ((context as RescheduleMutationContext | undefined)?.previous) {
        const key = ["admin-appointments", filterStatus, filterPayment, filterDate, page];
        queryClient.setQueryData(key, (context as RescheduleMutationContext).previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onSuccess: () => {
      setReschedulingAppt(null);
    },
  });

  const handleRescheduleSubmit = () => {
    if (!reschedulingAppt || !rescheduleTime) return;
    setRescheduleError(null);
    rescheduleMutation.mutate({
      id: reschedulingAppt.id,
      body: { appointmentDate: formattedRescheduleDate, appointmentTime: rescheduleTime },
    });
  };

  const clearFilters = () => {
    setFilterStatus("ALL");
    setFilterPayment("ALL");
    setFilterDate("");
    setPage(1);
  };

  if (!isHydrated || !user) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center py-20 bg-dark-bg text-zinc-400 gap-4">
        <Loader2 className="animate-spin h-10 w-10 text-primary" />
        <p className="text-sm">Retrieving administrative credentials...</p>
      </div>
    );
  }

  return (
    <div className="w-full bg-dark-bg min-h-screen py-10 px-4 sm:px-6 lg:px-8 text-white">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Title */}
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Manage Salon <span className="text-gold-gradient">Appointments</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Browse booking logs, reschedule time slots, confirm pending customers, and cancel orders.
          </p>
        </div>

        {/* Filters Toolbar */}
        <div className="glass-panel p-6 rounded-2xl border border-zinc-900 space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-primary">
            <Filter className="h-4 w-4" />
            <span>Search Filters</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Status Filter */}
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400 font-semibold">Appointment Status</label>
              <select
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs focus:outline-none focus:border-primary text-zinc-200"
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING">PENDING</option>
                <option value="CONFIRMED">CONFIRMED</option>
                <option value="CANCELLED">CANCELLED</option>
                <option value="COMPLETED">COMPLETED</option>
              </select>
            </div>

            {/* Payment Filter */}
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400 font-semibold">Payment Status</label>
              <select
                value={filterPayment}
                onChange={(e) => {
                  setFilterPayment(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs focus:outline-none focus:border-primary text-zinc-200"
              >
                <option value="ALL">All Payments</option>
                <option value="UNPAID">UNPAID</option>
                <option value="PARTIAL">PARTIAL</option>
                <option value="PAID">PAID</option>
              </select>
            </div>

            {/* Date Picker */}
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400 font-semibold">Specific Date</label>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => {
                  setFilterDate(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs focus:outline-none focus:border-primary text-zinc-200"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-zinc-900/60">
            <button
              onClick={clearFilters}
              className="px-4 py-2 bg-transparent hover:bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Reset Filters
            </button>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-primary hover:bg-primary-hover text-black font-extrabold rounded-xl text-xs transition cursor-pointer"
            >
              Apply Filter Search
            </button>
          </div>
        </div>

        {/* Loading Indicator */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="animate-spin h-10 w-10 text-primary" />
            <p className="text-sm text-zinc-400">Loading bookings ledger...</p>
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* Table wrapper */}
            <div className="glass-panel rounded-2xl overflow-hidden border border-zinc-900/60">
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-zinc-950/80 border-b border-zinc-900 text-zinc-400 font-bold">
                      <th className="p-4">Customer</th>
                      <th className="p-4">Service</th>
                      <th className="p-4">Schedule</th>
                      <th className="p-4">Payment</th>
                      <th className="p-4">Notes</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900/40">
                    {appointments.map((appt) => {
                      const amountPaid = parseFloat(appt.amountPaid);
                      const totalCost = parseFloat(appt.service.price);
                      const remaining = totalCost - amountPaid;

                      return (
                        <tr key={appt.id} className="hover:bg-zinc-950/15 transition duration-150">
                          {/* Customer */}
                          <td className="p-4">
                            <div className="flex items-center gap-2.5">
                              <div className="h-8 w-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                                <User className="h-4 w-4 text-primary" />
                              </div>
                              <div className="flex flex-col">
                                <span className="font-bold text-white text-sm">
                                  {appt.user.name}
                                </span>
                                <span className="text-[10px] text-zinc-500">{appt.user.email}</span>
                                {appt.user.phone && (
                                  <span className="text-[9px] text-zinc-500">{appt.user.phone}</span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Service */}
                          <td className="p-4">
                            <div className="flex items-center gap-1.5">
                              <Scissors className="h-3.5 w-3.5 text-primary shrink-0" />
                              <div className="flex flex-col">
                                <span className="font-semibold text-zinc-200">
                                  {appt.service.name}
                                </span>
                                <span className="text-[10px] text-zinc-500">
                                  {appt.service.duration} mins • ${totalCost.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Schedule */}
                          <td className="p-4">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1 text-zinc-300">
                                <CalendarIcon className="h-3.5 w-3.5 text-primary opacity-60" />
                                <span className="font-semibold">
                                  {new Date(appt.appointmentDate).toLocaleDateString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-zinc-400">
                                <Clock className="h-3.5 w-3.5 text-primary opacity-60" />
                                <span>{appt.appointmentTime}</span>
                              </div>
                            </div>
                          </td>

                          {/* Payment */}
                          <td className="p-4">
                            <div className="flex flex-col gap-1">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold w-fit ${
                                  appt.paymentStatus === "PAID"
                                    ? "bg-green-950/20 text-green-400 border border-green-900/20"
                                    : appt.paymentStatus === "PARTIAL"
                                    ? "bg-[#E60654]/10 text-[#E60654] border border-[#E60654]/20"
                                    : "bg-red-950/20 text-red-400 border border-red-900/20"
                                }`}
                              >
                                {appt.paymentStatus}
                              </span>
                              <span className="text-[10px] text-zinc-500">
                                Paid: ${amountPaid.toFixed(2)}
                              </span>
                              {remaining > 0 && (
                                <span className="text-[9px] text-zinc-500">
                                  Bal: ${remaining.toFixed(2)}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Notes */}
                          <td className="p-4 max-w-xs">
                            {appt.notes ? (
                              <div className="flex items-start gap-1.5 text-zinc-400 bg-zinc-950/30 p-2 rounded-lg border border-zinc-900/50">
                                <MessageSquare className="h-3.5 w-3.5 text-primary shrink-0 opacity-50 mt-0.5" />
                                <span className="line-clamp-2 leading-relaxed text-[10px]">
                                  {appt.notes}
                                </span>
                              </div>
                            ) : (
                              <span className="text-zinc-600 italic">None</span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="p-4">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                                appt.status === "CONFIRMED"
                                  ? "bg-green-500/10 text-green-400 border border-green-500/20 shadow-sm shadow-green-500/5"
                                  : appt.status === "PENDING"
                                  ? "bg-[#E60654]/10 text-[#E60654] border border-[#E60654]/20"
                                  : appt.status === "CANCELLED"
                                  ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                  : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                              }`}
                            >
                              {appt.status}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="p-4 text-right">
                            <div className="flex justify-end gap-2">
                              {appt.status === "PENDING" && (
                                <button
                                  disabled={!!confirmingId}
                                  onClick={() => handleConfirm(appt.id)}
                                  className="h-8 w-8 rounded-lg bg-green-950/40 hover:bg-green-900 border border-green-900 text-green-400 flex items-center justify-center transition cursor-pointer"
                                  title="Confirm Appointment"
                                >
                                  {confirmingId === appt.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Check className="h-4 w-4" />
                                  )}
                                </button>
                              )}
                              {appt.status !== "CANCELLED" && appt.status !== "COMPLETED" && (
                                <>
                                  <button
                                    onClick={() => {
                                      setReschedulingAppt(appt);
                                      setRescheduleDate(new Date(appt.appointmentDate));
                                    }}
                                    className="h-8 px-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-bold transition text-[10px] cursor-pointer"
                                    title="Reschedule"
                                  >
                                    Reschedule
                                  </button>
                                  <button
                                    disabled={!!cancellingId}
                                    onClick={() => setCancelConfirmId(appt.id)}
                                    className="h-8 w-8 rounded-lg bg-red-950/40 hover:bg-red-900/80 border border-red-900/40 text-red-400 flex items-center justify-center transition cursor-pointer"
                                    title="Cancel Appointment"
                                  >
                                    {cancellingId === appt.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <X className="h-4 w-4" />
                                    )}
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {appointments.length === 0 && (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-zinc-500">
                          <AlertCircle className="h-6 w-6 text-zinc-600 mx-auto mb-2" />
                          <p className="font-bold">No appointments matched current filter criteria.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination Controls */}
            {meta.totalPages > 1 && (
              <div className="flex justify-between items-center text-xs text-zinc-400 pt-2 px-2">
                <span>
                  Showing page <strong>{page}</strong> of <strong>{meta.totalPages}</strong> ({meta.total} total bookings)
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                    className="p-2 border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 rounded-xl transition cursor-pointer disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    disabled={page === meta.totalPages}
                    onClick={() => setPage(page + 1)}
                    className="p-2 border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 rounded-xl transition cursor-pointer disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

        {/* RESCHEDULE MODAL */}
        {reschedulingAppt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 text-white">
            <div className="bg-dark-card border border-primary/20 p-6 rounded-2xl max-w-2xl w-full space-y-6 overflow-y-auto max-h-[90vh] animate-zoomIn relative">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary/30"></div>

              <div className="flex justify-between items-start border-b border-zinc-900 pb-3">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <CalendarIcon className="h-5 w-5 text-primary" />
                    Admin Reschedule Override
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Shift schedule date or time for customer{" "}
                    <strong className="text-zinc-200">{reschedulingAppt.user.name}</strong>
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

              {/* Date picker - reusable Calendar component */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  Select New Date
                </label>
                <div>
                  {/* Lightweight calendar that shows next 14 days */}
                  <Calendar
                    selectedDate={rescheduleDate}
                    onSelectDate={(d: Date) => setRescheduleDate(d)}
                    days={14}
                  />
                </div>
              </div>

              {/* Slots selection */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  Select Time Slot ({formattedRescheduleDate})
                </label>

                {slotsLoading ? (
                  <div className="flex gap-2.5 overflow-x-auto py-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={i}
                        className="w-24 h-10 rounded-xl bg-zinc-950/30 animate-pulse border border-zinc-900/40"
                        aria-hidden
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex gap-2.5 overflow-x-auto py-2 sm:grid sm:grid-cols-5 sm:gap-2.5">
                    {slots.length === 0 && (
                      <div className="col-span-full py-6 text-center text-zinc-500 text-xs">
                        No availability found for this date.
                      </div>
                    )}

                    {slots.map((slot, idx) => {
                      const isSelected = rescheduleTime === slot.time;
                      return (
                        <button
                          key={idx}
                          disabled={!slot.available}
                          aria-disabled={!slot.available}
                          aria-pressed={isSelected}
                          aria-label={`Select time ${slot.time} ${slot.available ? 'available' : 'unavailable'}`}
                          onClick={() => setRescheduleTime(slot.time)}
                          onKeyDown={(e) => {
                            if ((e.key === "Enter" || e.key === " ") && slot.available) {
                              e.preventDefault();
                              setRescheduleTime(slot.time);
                            }
                          }}
                          className={`min-w-[5.5rem] py-2 px-3 rounded-xl text-sm font-bold border transition text-center cursor-pointer touch-manipulation ${
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
                  </div>
                )}
              </div>

              {/* Submit / Cancel */}
              <div className="flex gap-4 pt-4 border-t border-zinc-900/60">
                <button
                  disabled={rescheduleMutation.isPending}
                  onClick={() => setReschedulingAppt(null)}
                  className="flex-1 bg-transparent hover:bg-zinc-900 text-zinc-300 border border-zinc-800 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  disabled={!rescheduleTime || rescheduleMutation.isPending}
                  onClick={handleRescheduleSubmit}
                  className="flex-1 bg-primary hover:bg-primary-hover text-black py-2.5 rounded-xl text-xs font-extrabold transition duration-300 shadow-lg shadow-primary/10 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {rescheduleMutation.isPending ? (
                    <Loader2 className="animate-spin h-4 w-4" />
                  ) : (
                    <span>Confirm Reschedule</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cancel Confirmation Modal */}
        {cancelConfirmId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="glass-panel w-full max-w-sm rounded-2xl border border-red-900/40 p-6 space-y-5">
              <h2 className="text-lg font-extrabold text-white">
                Cancel Appointment?
              </h2>
              <p className="text-zinc-400 text-sm">
                Are you sure you want to cancel this booking? This action will refund any loyalty points used and mark the appointment as cancelled.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setCancelConfirmId(null)}
                  className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer"
                >
                  Keep Booking
                </button>
                <button
                  onClick={async () => {
                    const idToCancel = cancelConfirmId;
                    setCancelConfirmId(null);
                    await handleCancel(idToCancel);
                  }}
                  className="flex-1 bg-red-700 hover:bg-red-600 text-white py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  Confirm Cancel
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
