"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { api, getApiErrorMessage } from "@/lib/api";
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Copy,
  DollarSign,
  Gift,
  Loader2,
  Plus,
  Search,
  Wallet,
  X,
} from "lucide-react";

type GiftCardStatus = "ACTIVE" | "DEPLETED" | "VOID";

interface GiftCard {
  id: string;
  code: string;
  initialAmount: string;
  balance: string;
  currency: string;
  status: GiftCardStatus;
  recipientName: string | null;
  recipientEmail: string | null;
  notes: string | null;
  createdAt: string;
  createdBy?: { id: string; name: string; email: string } | null;
}

interface GiftCardSummary {
  active: number;
  depleted: number;
  void: number;
  total: number;
  activeBalance: number;
  totalIssued: number;
  totalRedeemed: number;
}

interface GiftCardResponse {
  cards: GiftCard[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    summary: GiftCardSummary;
  };
}

const STATUS_STYLES: Record<GiftCardStatus, string> = {
  ACTIVE: "bg-green-950/40 text-green-300 border-green-900/50",
  DEPLETED: "bg-zinc-900 text-zinc-400 border-zinc-800",
  VOID: "bg-red-950/40 text-red-300 border-red-900/50",
};

const STATUS_FILTERS = ["ALL", "ACTIVE", "DEPLETED", "VOID"] as const;

const EMPTY_FORM = {
  amount: "",
  recipientName: "",
  recipientEmail: "",
  notes: "",
};

const money = (value: number) => `$${value.toFixed(2)}`;

export default function AdminGiftCardsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isHydrated } = useAuthStore();

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_FILTERS)[number]>("ALL");
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [issuedCard, setIssuedCard] = useState<GiftCard | null>(null);
  const [voidingCard, setVoidingCard] = useState<GiftCard | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const limit = 20;

  useEffect(() => {
    if (isHydrated && (!user || user.role !== "ADMIN")) {
      router.push(user ? "/dashboard" : "/login?redirect=/admin/gift-cards");
    }
  }, [user, isHydrated, router]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-gift-cards", page, statusFilter, search],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit };
      if (statusFilter !== "ALL") params.status = statusFilter;
      if (search.trim()) params.search = search.trim();
      const res = await api.get("/gift-cards", { params });
      return {
        cards: res.data.data as GiftCard[],
        meta: res.data.meta as GiftCardResponse["meta"],
      };
    },
    enabled: !!user && user.role === "ADMIN",
  });

  const invalidateGiftCards = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-gift-cards"] });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, string | number> = {
        amount: Number(form.amount),
      };
      if (form.recipientName.trim()) payload.recipientName = form.recipientName.trim();
      if (form.recipientEmail.trim()) payload.recipientEmail = form.recipientEmail.trim();
      if (form.notes.trim()) payload.notes = form.notes.trim();
      const res = await api.post("/gift-cards", payload);
      return res.data.data as GiftCard;
    },
    onMutate: () => {
      setFormError(null);
      setActionError(null);
    },
    onSuccess: (card) => {
      setIssuedCard(card);
      setNotice(`Gift card ${card.code} issued.`);
      invalidateGiftCards();
    },
    onError: (err) => {
      setFormError(getApiErrorMessage(err, "Failed to issue the gift card."));
    },
  });

  const voidMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/gift-cards/${id}/void`);
      return res.data.data as GiftCard;
    },
    onMutate: () => {
      setActionError(null);
    },
    onSuccess: (card) => {
      setVoidingCard(null);
      setNotice(`Gift card ${card.code} voided.`);
      invalidateGiftCards();
    },
    onError: (err) => {
      setVoidingCard(null);
      setActionError(getApiErrorMessage(err, "Failed to void the gift card."));
    },
  });

  const summary: GiftCardSummary = data?.meta.summary || {
    active: 0,
    depleted: 0,
    void: 0,
    total: 0,
    activeBalance: 0,
    totalIssued: 0,
    totalRedeemed: 0,
  };
  const meta = data?.meta || {
    total: 0,
    page: 1,
    limit,
    totalPages: 1,
    summary,
  };

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    setForm(EMPTY_FORM);
    setFormError(null);
    setIssuedCard(null);
    setCopiedCode(null);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount < 5) {
      setFormError("Gift card amount must be at least $5.00.");
      return;
    }
    if (amount > 5000) {
      setFormError("Gift card amount cannot exceed $5,000.00.");
      return;
    }
    createMutation.mutate();
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

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
              <Gift className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
                Gift Cards
              </h1>
              <p className="text-sm text-zinc-400 mt-1">
                Issue stored-value cards and track balances, redemptions and voids.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setNotice(null);
              setIsCreateOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-black px-4 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Issue Gift Card
          </button>
        </div>

        {(error || actionError) && (
          <div
            role="alert"
            className="bg-red-950/30 border border-red-900/40 text-red-300 p-4 rounded-xl flex items-start gap-2 text-sm"
          >
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
            <span>
              {actionError || getApiErrorMessage(error, "Failed to load gift cards.")}
            </span>
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="bg-green-950/30 border border-green-900/40 text-green-300 p-3 rounded-lg flex items-start gap-2 text-xs"
          >
            <CheckCircle className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
            <span>{notice}</span>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            label="Active cards"
            value={summary.active.toString()}
            tone="text-green-300"
            icon={CheckCircle}
          />
          <SummaryCard
            label="Active balance"
            value={money(summary.activeBalance)}
            tone="text-primary"
            icon={Wallet}
          />
          <SummaryCard
            label="Total issued"
            value={money(summary.totalIssued)}
            tone="text-sky-300"
            icon={DollarSign}
          />
          <SummaryCard
            label="Redeemed"
            value={money(summary.totalRedeemed)}
            tone="text-amber-300"
            icon={Gift}
          />
        </div>

        <div className="glass-panel rounded-2xl border border-zinc-800 overflow-hidden">
          <div className="p-5 border-b border-zinc-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">Issued cards</h2>
              <p className="text-xs text-zinc-500 mt-1">
                {summary.total} card(s), {summary.void} voided.
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
                <Search className="h-4 w-4" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Code, name or email"
                  aria-label="Search gift cards"
                  className="w-44 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-300 outline-none focus:border-primary"
                />
              </label>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="animate-spin h-8 w-8 text-primary" />
            </div>
          ) : !data || data.cards.length === 0 ? (
            <div className="py-16 text-center text-sm text-zinc-500">
              No gift cards match this filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[10px] uppercase tracking-wider text-zinc-500 bg-zinc-950/50">
                  <tr>
                    <th className="px-5 py-3">Code</th>
                    <th className="px-5 py-3">Recipient</th>
                    <th className="px-5 py-3">Balance</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Issued</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {data.cards.map((card) => (
                    <tr key={card.id} className="hover:bg-zinc-900/30 transition">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-zinc-200">
                            {card.code}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyCode(card.code)}
                            aria-label={`Copy gift card code ${card.code}`}
                            className="text-zinc-500 hover:text-primary transition cursor-pointer"
                          >
                            {copiedCode === card.code ? (
                              <Check className="h-3.5 w-3.5 text-green-400" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                        {card.notes && (
                          <p className="text-[11px] text-zinc-500 mt-1 max-w-[220px] truncate">
                            {card.notes}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-zinc-200 font-semibold">
                          {card.recipientName || "Unassigned"}
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          {card.recipientEmail || "No recipient email"}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-zinc-300">
                        <p className="font-bold">{money(parseFloat(card.balance))}</p>
                        <p className="text-[11px] text-zinc-500">
                          of {money(parseFloat(card.initialAmount))}
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-bold ${STATUS_STYLES[card.status]}`}
                        >
                          {card.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-zinc-400 text-xs">
                        {new Date(card.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              setActionError(null);
                              setVoidingCard(card);
                            }}
                            disabled={card.status !== "ACTIVE"}
                            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-red-300 border border-red-900/40 hover:bg-red-950/40 px-2.5 py-1.5 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <Ban className="h-3.5 w-3.5" />
                            Void
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between px-5 py-4 border-t border-zinc-800 text-xs text-zinc-500">
            <span>
              Page {meta.page} of {Math.max(meta.totalPages, 1)} — {meta.total} card
              {meta.total === 1 ? "" : "s"}
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

      {isCreateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeCreateModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="issue-gift-card-title"
            className="glass-panel w-full max-w-md rounded-2xl border border-zinc-800 p-6 space-y-5 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-start border-b border-zinc-900 pb-3">
              <div>
                <h2
                  id="issue-gift-card-title"
                  className="text-lg font-extrabold text-white flex items-center gap-2"
                >
                  <Gift className="h-5 w-5 text-primary" />
                  {issuedCard ? "Gift Card Issued" : "Issue Gift Card"}
                </h2>
                {!issuedCard && (
                  <p className="text-xs text-zinc-500 mt-1">
                    Cards can be used for deposits or full appointment payments.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={closeCreateModal}
                aria-label="Close gift card dialog"
                className="text-zinc-500 hover:text-white transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {issuedCard ? (
              <div className="space-y-5">
                <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 space-y-2 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-primary font-bold">
                    Gift card code
                  </p>
                  <p className="font-mono text-lg font-extrabold text-white break-all">
                    {issuedCard.code}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {money(parseFloat(issuedCard.balance))} balance
                  </p>
                  <button
                    type="button"
                    onClick={() => copyCode(issuedCard.code)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary-hover transition cursor-pointer"
                  >
                    {copiedCode === issuedCard.code ? (
                      <>
                        <Check className="h-3.5 w-3.5" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Copy code
                      </>
                    )}
                  </button>
                </div>
                {issuedCard.recipientEmail && (
                  <p className="text-xs text-zinc-400 text-center">
                    The recipient was emailed at{" "}
                    <span className="text-zinc-200">{issuedCard.recipientEmail}</span>.
                  </p>
                )}
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="w-full bg-primary hover:bg-primary-hover text-black py-2.5 rounded-xl text-sm font-bold transition cursor-pointer"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {formError && (
                  <div
                    role="alert"
                    className="bg-red-950/40 border border-red-900/40 text-red-300 p-3 rounded-lg flex items-start gap-2 text-xs"
                  >
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                    <span>{formError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">
                    Amount (CAD) *
                  </label>
                  <input
                    required
                    type="number"
                    min="5"
                    max="5000"
                    step="0.01"
                    value={form.amount}
                    onChange={(event) =>
                      setForm({ ...form, amount: event.target.value })
                    }
                    placeholder="50.00"
                    className="w-full px-4 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950 text-white text-sm focus:outline-none focus:border-primary"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1">
                    Minimum $5.00, maximum $5,000.00.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">
                    Recipient name
                  </label>
                  <input
                    type="text"
                    value={form.recipientName}
                    onChange={(event) =>
                      setForm({ ...form, recipientName: event.target.value })
                    }
                    placeholder="Jane Doe"
                    className="w-full px-4 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950 text-white text-sm focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">
                    Recipient email
                  </label>
                  <input
                    type="email"
                    value={form.recipientEmail}
                    onChange={(event) =>
                      setForm({ ...form, recipientEmail: event.target.value })
                    }
                    placeholder="jane@example.com"
                    className="w-full px-4 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950 text-white text-sm focus:outline-none focus:border-primary"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1">
                    If provided, the code is emailed to the recipient and shown under
                    their active gift cards.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">
                    Notes
                  </label>
                  <textarea
                    rows={2}
                    value={form.notes}
                    onChange={(event) =>
                      setForm({ ...form, notes: event.target.value })
                    }
                    placeholder="Internal note, occasion, etc."
                    className="w-full px-4 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950 text-white text-sm focus:outline-none focus:border-primary"
                  />
                </div>

                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="w-full bg-primary hover:bg-primary-hover text-black py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="animate-spin h-4 w-4" />
                      Issuing...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Issue Gift Card
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {voidingCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-sm rounded-2xl border border-red-900/40 p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-red-950/40 border border-red-900/40 flex items-center justify-center shrink-0">
                <Ban className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-white">Void Gift Card?</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  {voidingCard.code} has{" "}
                  <span className="text-white font-semibold">
                    {money(parseFloat(voidingCard.balance))}
                  </span>{" "}
                  remaining. Voiding cannot be undone and forfeits that balance.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setVoidingCard(null)}
                disabled={voidMutation.isPending}
                className="flex-1 bg-transparent hover:bg-zinc-900 text-zinc-300 border border-zinc-700 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => voidMutation.mutate(voidingCard.id)}
                disabled={voidMutation.isPending}
                className="flex-1 bg-red-700 hover:bg-red-600 text-white py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {voidMutation.isPending ? (
                  <Loader2 className="animate-spin h-4 w-4" />
                ) : (
                  "Void Card"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
          {label}
        </span>
        <Icon className={`h-4 w-4 ${tone}`} />
      </div>
      <p className={`text-2xl sm:text-3xl font-extrabold mt-2 ${tone}`}>{value}</p>
    </div>
  );
}
