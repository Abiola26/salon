"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api, getApiErrorMessage } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Mail,
  Send,
  Smartphone,
} from "lucide-react";

type QueueStatus = "PENDING" | "SENT" | "FAILED";

interface QueueCounts {
  pending: number;
  sent: number;
  failed: number;
  total: number;
}

interface ReminderStats {
  rangeDays: number;
  upcomingAppointments: number;
  email: { sent: number; pending: number; optedOut: number };
  sms: {
    sent: number;
    pending: number;
    optedOut: number;
    missingPhone: number;
  };
}

interface EmailQueueRow {
  id: string;
  to: string;
  subject: string;
  status: QueueStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
}

interface NotificationSummary {
  emailQueue: QueueCounts;
  reminders: ReminderStats;
  recentFailures: EmailQueueRow[];
}

interface QueueResponse {
  notifications: EmailQueueRow[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

const STATUS_STYLES: Record<QueueStatus, string> = {
  PENDING: "bg-amber-950/40 text-amber-300 border-amber-900/50",
  SENT: "bg-green-950/40 text-green-300 border-green-900/50",
  FAILED: "bg-red-950/40 text-red-300 border-red-900/50",
};

export default function AdminNotificationsPage() {
  const router = useRouter();
  const { user, isHydrated } = useAuthStore();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<QueueStatus | "ALL">("ALL");
  const limit = 10;

  useEffect(() => {
    if (isHydrated && (!user || user.role !== "ADMIN")) {
      router.push(user ? "/dashboard" : "/login?redirect=/admin/notifications");
    }
  }, [user, isHydrated, router]);

  const { data: summary, isLoading: summaryLoading, error: summaryError } = useQuery({
    queryKey: ["admin-notification-summary"],
    queryFn: async () => {
      const res = await api.get("/notifications/summary");
      return res.data.data as NotificationSummary;
    },
    enabled: !!user && user.role === "ADMIN",
    refetchInterval: 60_000,
  });

  const { data: queue, isLoading: queueLoading, error: queueError } = useQuery({
    queryKey: ["admin-notification-queue", page, statusFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit };
      if (statusFilter !== "ALL") params.status = statusFilter;
      const res = await api.get("/notifications/queue", { params });
      return res.data.data as QueueResponse;
    },
    enabled: !!user && user.role === "ADMIN",
  });

  const meta = queue?.meta || { total: 0, page: 1, limit, totalPages: 1 };

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
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
                Notifications
              </h1>
              <p className="text-sm text-zinc-400 mt-1">
                Email queue health and reminder coverage for the next{" "}
                {summary?.reminders.rangeDays ?? 7} days.
              </p>
            </div>
          </div>
        </div>

        {(summaryError || queueError) && (
          <div
            role="alert"
            className="bg-red-950/30 border border-red-900/40 text-red-300 p-4 rounded-xl flex items-start gap-2 text-sm"
          >
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
            <span>
              {getApiErrorMessage(
                summaryError || queueError,
                "Failed to load notification data."
              )}
            </span>
          </div>
        )}

        {summaryLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin h-8 w-8 text-primary" />
          </div>
        ) : (
          summary && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <QueueCard
                  label="Queued emails"
                  value={summary.emailQueue.pending}
                  icon={<Clock className="h-5 w-5 text-amber-400" />}
                  accent="border-amber-900/30 bg-amber-950/10"
                />
                <QueueCard
                  label="Delivered"
                  value={summary.emailQueue.sent}
                  icon={<Send className="h-5 w-5 text-green-400" />}
                  accent="border-green-900/30 bg-green-950/10"
                />
                <QueueCard
                  label="Failed"
                  value={summary.emailQueue.failed}
                  icon={<AlertTriangle className="h-5 w-5 text-red-400" />}
                  accent="border-red-900/30 bg-red-950/10"
                />
                <QueueCard
                  label="Upcoming visits"
                  value={summary.reminders.upcomingAppointments}
                  icon={<CalendarClock className="h-5 w-5 text-primary" />}
                  accent="border-primary/20 bg-primary/5"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <ReminderCard
                  icon={<Mail className="h-5 w-5 text-primary" />}
                  title="Email reminders"
                  sent={summary.reminders.email.sent}
                  pending={summary.reminders.email.pending}
                  optedOut={summary.reminders.email.optedOut}
                />
                <ReminderCard
                  icon={<Smartphone className="h-5 w-5 text-primary" />}
                  title="SMS reminders"
                  sent={summary.reminders.sms.sent}
                  pending={summary.reminders.sms.pending}
                  optedOut={summary.reminders.sms.optedOut}
                  footnote={
                    summary.reminders.sms.missingPhone > 0
                      ? `${summary.reminders.sms.missingPhone} upcoming visit(s) have no phone number on file.`
                      : null
                  }
                />
              </div>

              {summary.recentFailures.length > 0 && (
                <div className="glass-panel rounded-2xl border border-red-900/30 bg-red-950/10 p-5">
                  <p className="text-sm font-bold text-red-300 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Recent email failures
                  </p>
                  <ul className="mt-3 space-y-2">
                    {summary.recentFailures.map((failure) => (
                      <li
                        key={failure.id}
                        className="text-xs text-zinc-400 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-t border-red-900/20 pt-2 first:border-0 first:pt-0"
                      >
                        <span className="text-zinc-300">
                          {failure.to} â€” {failure.subject}
                        </span>
                        <span className="text-red-400/80">
                          {failure.attempts} attempt(s):{" "}
                          {failure.lastError || "unknown error"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )
        )}

        <div className="glass-panel rounded-2xl border border-zinc-800 overflow-hidden">
          <div className="p-5 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">Email queue</h2>
              <p className="text-xs text-zinc-500 mt-1">
                Newest first. Retries run every 2 minutes up to 3 attempts.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["ALL", "PENDING", "SENT", "FAILED"] as const).map((status) => (
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
            </div>
          </div>

          {queueLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="animate-spin h-8 w-8 text-primary" />
            </div>
          ) : !queue || queue.notifications.length === 0 ? (
            <div className="py-16 text-center text-sm text-zinc-500">
              No emails match this filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[10px] uppercase tracking-wider text-zinc-500 bg-zinc-950/50">
                  <tr>
                    <th className="px-5 py-3">Recipient</th>
                    <th className="px-5 py-3">Subject</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Attempts</th>
                    <th className="px-5 py-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {queue.notifications.map((email) => (
                    <tr key={email.id} className="hover:bg-zinc-900/30 transition">
                      <td className="px-5 py-3 text-zinc-300">{email.to}</td>
                      <td className="px-5 py-3 text-zinc-400 max-w-[280px]">
                        <span className="line-clamp-2">{email.subject}</span>
                        {email.lastError && (
                          <span className="block text-[10px] text-red-400/80 mt-1">
                            {email.lastError}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-bold ${STATUS_STYLES[email.status]}`}
                        >
                          {email.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-zinc-400">{email.attempts}</td>
                      <td className="px-5 py-3 text-zinc-500 text-xs">
                        {new Date(email.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between px-5 py-4 border-t border-zinc-800 text-xs text-zinc-500">
            <span>
              Page {meta.page} of {Math.max(meta.totalPages, 1)} â€” {meta.total}{" "}
              email(s)
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

function QueueCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  accent: string;
}) {
  return (
    <div className={`rounded-2xl border p-5 ${accent}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
          {label}
        </span>
        {icon}
      </div>
      <p className="text-3xl font-extrabold text-white mt-2">{value}</p>
    </div>
  );
}

function ReminderCard({
  icon,
  title,
  sent,
  pending,
  optedOut,
  footnote,
}: {
  icon: ReactNode;
  title: string;
  sent: number;
  pending: number;
  optedOut: number;
  footnote?: string | null;
}) {
  return (
    <div className="glass-panel rounded-2xl border border-zinc-800 p-5 space-y-4">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-bold text-white">{title}</h3>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-zinc-950/50 border border-zinc-900 p-3">
          <p className="text-xl font-extrabold text-green-400">{sent}</p>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 mt-1">
            Sent
          </p>
        </div>
        <div className="rounded-xl bg-zinc-950/50 border border-zinc-900 p-3">
          <p className="text-xl font-extrabold text-amber-400">{pending}</p>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 mt-1">
            Pending
          </p>
        </div>
        <div className="rounded-xl bg-zinc-950/50 border border-zinc-900 p-3">
          <p className="text-xl font-extrabold text-zinc-400">{optedOut}</p>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 mt-1">
            Opted out
          </p>
        </div>
      </div>
      {footnote && <p className="text-[11px] text-amber-400/80">{footnote}</p>}
    </div>
  );
}
