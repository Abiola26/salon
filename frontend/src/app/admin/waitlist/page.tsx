"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api, getApiErrorMessage } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { parseLocalDate } from "@/lib/date";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Send,
  Users,
  XCircle,
} from "lucide-react";

type WaitlistStatus = "WAITING" | "NOTIFIED" | "CONVERTED" | "CANCELLED";

interface WaitlistEntry {
  id: string;
  preferredDate: string;
  preferredTime: string | null;
  notes: string | null;
  status: WaitlistStatus;
  notifiedAt: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string };
  service: { id: string; name: string; duration: number; price: string };
  staff: { id: string; name: string } | null;
}

interface WaitlistSummary {
  waiting: number;
  notified: number;
  converted: number;
  cancelled: number;
  total: number;
}

interface WaitlistResponse {
  entries: WaitlistEntry[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    summary: WaitlistSummary;
  };
}

const STATUS_STYLES: Record<WaitlistStatus, string> = {
  WAITING: "bg-amber-950/40 text-amber-300 border-amber-900/50",
  NOTIFIED: "bg-green-950/40 text-green-300 border-green-900/50",
  CONVERTED: "bg-sky-950/40 text-sky-300 border-sky-900/50",
  CANCELLED: "bg-zinc-900 text-zinc-400 border-zinc-800",
};

const STATUS_FILTERS = ["ALL", "WAITING", "NOTIFIED", "CONVERTED", "CANCELLED"] as const;

export default function AdminWaitlistPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isHydrated } = useAuthStore();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("WAITING");
  const [dateFilter, setDateFilter] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const limit = 20;

  useEffect(() => {
    if (isHydrated && (!user || user.role !== "ADMIN")) {
      router.push(user ? "/dashboard" : "/login?redirect=/admin/waitlist");
    }
  }, [user, isHydrated, router]);

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(dateFilter);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-waitlist", page, statusFilter, dateFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit };
      if (statusFilter !== "ALL") params.status = statusFilter;
      if (validDate) params.date = dateFilter;
      const res = await api.get("/waitlist", { params });
      return {
        entries: res.data.data as WaitlistEntry[],
        meta: res.data.meta as WaitlistResponse["meta"],
      };
    },
    enabled: !!user && user.role === "ADMIN",
  });

  const invalidateWaitlist = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-waitlist"] });

  const notifyMutation = useMutation({
    mutationFn: async (entryId: string) => {
      await api.patch(`/waitlist/${entryId}/notify`);
    },
    onMutate: () => {
      setNotice(null);
      setActionError(null);
    },
    onSuccess: () => {
      setNotice("Waitlist customer notified by email.");
      invalidateWaitlist();
    },
    onError: (err) => {
      setActionError(getApiErrorMessage(err, "Failed to notify the waitlist customer."));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (entryId: string) => {
      await api.delete(`/waitlist/${entryId}`);
    },
    onMutate: () => {
      setNotice(null);
      setActionError(null);
    },
    onSuccess: () => {
      setNotice("Waitlist entry cancelled.");
      invalidateWaitlist();
    },
    onError: (err) => {
      setActionError(getApiErrorMessage(err, "Failed to cancel the waitlist entry."));
    },
  });

  const summary: WaitlistSummary = data?.meta.summary || {
    waiting: 0,
    notified: 0,
    converted: 0,
    cancelled: 0,
    total: 0,
  };
  const meta = data?.meta || { total: 0, page: 1, limit, totalPages: 1, summary };

  if (!isHydrated || !user || user.role !== "ADMIN") {
    return (
      <div className="flex-grow flex flex-col items-center justify-center py-20 bg-dark-bg text-zinc-400 gap-4">
        <Loader2 className="animate-spin h-10 w-10 text-primary" />
        <p className="text-sm">Verifying admin access...</p>
      </div>
    );
  }

  return (
    <div className="w-full bg-dark-bg min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Bell className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Waitlist</h1>
              <p className="text-sm text-zinc-400 mt-1">
                Customers waiting for a fully booked service or date. Cancellations notify the
                oldest match automatically.
              </p>
            </div>
          </div>
        </div>

        {(error || actionError) && (
          <div
            role="alert"
            className="bg-red-950/30 border border-red-900/40 text-red-300 p-4 rounded-xl flex items-start gap-2 text-sm"
          >
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
            <span>
              {actionError || getApiErrorMessage(error, "Failed to load waitlist entries.")}
            </span>
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="bg-green-950/30 border border-green-900/40 text-green-300 p-3 rounded-lg flex items-start gap-2 text-xs"
          >
            <Send className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
            <span>{notice}</span>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard label="Waiting" value={summary.waiting} tone="text-amber-300" />
          <SummaryCard label="Notified" value={summary.notified} tone="text-green-300" />
          <SummaryCard label="Converted" value={summary.converted} tone="text-sky-300" />
          <SummaryCard label="Cancelled" value={summary.cancelled} tone="text-zinc-400" />
        </div>

        <div className="glass-panel rounded-2xl border border-zinc-800 overflow-hidden">
          <div className="p-5 border-b border-zinc-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">Waitlist entries</h2>
              <p className="text-xs text-zinc-500 mt-1">
                {summary.waiting + summary.notified} active request(s) across all dates.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {STATUS_FILTERS.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    setStatusFilter(status);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                    statusFilter === status
                      ? "bg-primary text-black border-primary"
                      : "bg-zinc-900/50 text-zinc-400 border-zinc-800 hover:text-white"
                  }`}
                >
                  {status}
                </button>
              ))}
              <label className="flex items-center gap-2 text-[11px] text-zinc-500">
                <CalendarClock className="h-4 w-4" />
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(event) => {
                    setDateFilter(event.target.value);
                    setPage(1);
                  }}
                  aria-label="Filter waitlist by date"
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-300 outline-none focus:border-primary"
                />
              </label>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="animate-spin h-8 w-8 text-primary" />
            </div>
          ) : !data || data.entries.length === 0 ? (
            <div className="py-16 text-center text-sm text-zinc-500">
              No waitlist entries match this filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[10px] uppercase tracking-wider text-zinc-500 bg-zinc-950/50">
                  <tr>
                    <th className="px-5 py-3">Customer</th>
                    <th className="px-5 py-3">Service</th>
                    <th className="px-5 py-3">Preferred</th>
                    <th className="px-5 py-3">Stylist</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {data.entries.map((entry) => {
                    const actionable =
                      entry.status === "WAITING" || entry.status === "NOTIFIED";
                    return (
                      <tr key={entry.id} className="hover:bg-zinc-900/30 transition">
                        <td className="px-5 py-3">
                          <p className="text-zinc-200 font-semibold">{entry.user.name}</p>
                          <p className="text-[11px] text-zinc-500">{entry.user.email}</p>
                        </td>
                        <td className="px-5 py-3 text-zinc-300">
                          <p>{entry.service.name}</p>
                          <p className="text-[11px] text-zinc-500">
                            {entry.service.duration} min · ${entry.service.price}
                          </p>
                        </td>
                        <td className="px-5 py-3 text-zinc-300">
                          <p>
                            {parseLocalDate(entry.preferredDate).toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </p>
                          <p className="text-[11px] text-zinc-500">
                            {entry.preferredTime || "Any time"}
                          </p>
                          {entry.notes && (
                            <p className="text-[11px] text-zinc-500 mt-1 max-w-[220px] truncate">
                              &ldquo;{entry.notes}&rdquo;
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-3 text-zinc-400">
                          {entry.staff?.name || "Any stylist"}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-bold ${STATUS_STYLES[entry.status]}`}
                          >
                            {entry.status}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => notifyMutation.mutate(entry.id)}
                              disabled={!actionable || notifyMutation.isPending}
                              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-primary border border-primary/30 hover:bg-primary/10 px-2.5 py-1.5 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            >
                              <Send className="h-3.5 w-3.5" />
                              Notify
                            </button>
                            <button
                              type="button"
                              onClick={() => cancelMutation.mutate(entry.id)}
                              disabled={!actionable || cancelMutation.isPending}
                              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-red-300 border border-red-900/40 hover:bg-red-950/40 px-2.5 py-1.5 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between px-5 py-4 border-t border-zinc-800 text-xs text-zinc-500">
            <span>
              Page {meta.page} of {Math.max(meta.totalPages, 1)} — {meta.total} entr
              {meta.total === 1 ? "y" : "ies"}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
                disabled={meta.page <= 1}
                className="p-2 rounded-lg border border-zinc-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setPage((current) =>
                    Math.min(current + 1, Math.max(meta.totalPages, 1))
                  )
                }
                disabled={meta.page >= meta.totalPages}
                className="p-2 rounded-lg border border-zinc-800 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
          {label}
        </span>
        <Users className={`h-4 w-4 ${tone}`} />
      </div>
      <p className={`text-3xl font-extrabold mt-2 ${tone}`}>{value}</p>
    </div>
  );
}
