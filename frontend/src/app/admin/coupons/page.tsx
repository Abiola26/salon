"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { api, getApiErrorMessage } from "@/lib/api";
import {
  Tag,
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  X,
  Percent,
  DollarSign,
} from "lucide-react";

interface Coupon {
  id: string;
  code: string;
  discountType: "PERCENTAGE" | "FLAT";
  discountValue: string;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  maxUsage: number | null;
  usageCount: number;
}

interface CouponFormData {
  code: string;
  discountType: "PERCENTAGE" | "FLAT";
  discountValue: string;
  isActive: boolean;
  startDate: string;
  endDate: string;
  maxUsage: string;
}

const emptyForm: CouponFormData = {
  code: "",
  discountType: "PERCENTAGE",
  discountValue: "",
  isActive: true,
  startDate: "",
  endDate: "",
  maxUsage: "",
};

export default function AdminCouponsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isHydrated } = useAuthStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [form, setForm] = useState<CouponFormData>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (isHydrated && (!user || user.role !== "ADMIN")) {
      router.push(user ? "/dashboard" : "/login?redirect=/admin/coupons");
    }
  }, [user, isHydrated, router]);

  const { data: couponsResponse, isLoading } = useQuery({
    queryKey: ["admin-coupons"],
    queryFn: async () => {
      const res = await api.get("/coupons");
      return res.data;
    },
    enabled: !!user && user.role === "ADMIN",
  });
  const coupons: Coupon[] = couponsResponse?.data || [];

  const createMutation = useMutation({
    mutationFn: (data: object) => api.post("/coupons", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
      closeModal();
    },
    onError: (err: unknown) => {
      setFormError(getApiErrorMessage(err, "Failed to create coupon"));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) =>
      api.put(`/coupons/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
      closeModal();
    },
    onError: (err: unknown) => {
      setFormError(getApiErrorMessage(err, "Failed to update coupon"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/coupons/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
      setDeleteId(null);
    },
    onError: (err: unknown) => {
      console.error(getApiErrorMessage(err, "Failed to delete coupon"));
    },
  });

  const openCreate = () => {
    setEditingCoupon(null);
    setForm(emptyForm);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEdit = (c: Coupon) => {
    setEditingCoupon(c);
    setForm({
      code: c.code,
      discountType: c.discountType,
      discountValue: parseFloat(c.discountValue).toString(),
      isActive: c.isActive,
      startDate: c.startDate ? c.startDate.substring(0, 10) : "",
      endDate: c.endDate ? c.endDate.substring(0, 10) : "",
      maxUsage: c.maxUsage !== null ? c.maxUsage.toString() : "",
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCoupon(null);
    setForm(emptyForm);
    setFormError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim()) {
      setFormError("Coupon code is required");
      return;
    }
    if (!form.discountValue || parseFloat(form.discountValue) <= 0) {
      setFormError("Discount value must be a positive number");
      return;
    }

    const payload = {
      code: form.code.trim().toUpperCase(),
      discountType: form.discountType,
      discountValue: parseFloat(form.discountValue),
      isActive: form.isActive,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      maxUsage: form.maxUsage ? parseInt(form.maxUsage) : null,
    };

    if (editingCoupon) {
      updateMutation.mutate({ id: editingCoupon.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isMutating = createMutation.isPending || updateMutation.isPending;

  const isExpired = (c: Coupon) =>
    c.endDate && new Date(c.endDate) < new Date();
  const isExhausted = (c: Coupon) =>
    c.maxUsage !== null && c.usageCount >= c.maxUsage;

  if (!isHydrated || !user || user.role !== "ADMIN") {
    return (
      <div className="flex-grow flex items-center justify-center bg-dark-bg">
        <Loader2 className="animate-spin h-8 w-8 text-primary" />
      </div>
    );
  }

  return (
    <div className="bg-dark-bg min-h-screen py-10 px-4 sm:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
              <Tag className="h-7 w-7 text-primary" />
              Promo Coupons
            </h1>
            <p className="text-zinc-500 text-sm mt-1">
              Create and manage discount codes for your clients.
            </p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-black font-bold px-4 py-2.5 rounded-xl text-sm transition cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Add Coupon
          </button>
        </div>

        {/* Coupons Table */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin h-8 w-8 text-primary" />
          </div>
        ) : coupons.length === 0 ? (
          <div className="glass-panel p-12 rounded-2xl text-center border border-zinc-800">
            <Tag className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400 font-semibold">No coupons yet</p>
            <p className="text-zinc-600 text-sm mt-1">
              Create your first promo code to attract clients.
            </p>
          </div>
        ) : (
          <div className="glass-panel rounded-2xl border border-zinc-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900/60 text-zinc-400 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-6 py-3">Code</th>
                    <th className="text-left px-6 py-3">Discount</th>
                    <th className="text-center px-6 py-3">Usage</th>
                    <th className="text-left px-6 py-3">Validity</th>
                    <th className="text-center px-6 py-3">Status</th>
                    <th className="text-right px-6 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {coupons.map((c) => {
                    const expired = isExpired(c);
                    const exhausted = isExhausted(c);
                    const effective = c.isActive && !expired && !exhausted;

                    return (
                      <tr
                        key={c.id}
                        className="hover:bg-zinc-900/30 transition"
                      >
                        <td className="px-6 py-4">
                          <span className="font-mono font-extrabold text-primary text-base tracking-widest">
                            {c.code}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            {c.discountType === "PERCENTAGE" ? (
                              <Percent className="h-4 w-4 text-primary" />
                            ) : (
                              <DollarSign className="h-4 w-4 text-primary" />
                            )}
                            <span className="font-bold text-white">
                              {c.discountType === "PERCENTAGE"
                                ? `${parseFloat(c.discountValue)}% off`
                                : `$${parseFloat(c.discountValue).toFixed(2)} off`}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center text-zinc-300">
                          {c.usageCount}
                          {c.maxUsage !== null && (
                            <span className="text-zinc-600">
                              /{c.maxUsage}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs text-zinc-400">
                          {c.startDate
                            ? `${new Date(c.startDate).toLocaleDateString()} –`
                            : "Any start –"}
                          {c.endDate
                            ? ` ${new Date(c.endDate).toLocaleDateString()}`
                            : " No expiry"}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {effective ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-950/30 border border-green-900/30 px-2 py-0.5 rounded-full">
                              <CheckCircle className="h-3 w-3" /> Active
                            </span>
                          ) : expired ? (
                            <span className="inline-flex items-center gap-1 text-xs text-orange-400 bg-orange-950/30 border border-orange-900/30 px-2 py-0.5 rounded-full">
                              Expired
                            </span>
                          ) : exhausted ? (
                            <span className="inline-flex items-center gap-1 text-xs text-red-400 bg-red-950/30 border border-red-900/30 px-2 py-0.5 rounded-full">
                              <XCircle className="h-3 w-3" /> Exhausted
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-full">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEdit(c)}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-primary hover:bg-zinc-800 transition cursor-pointer"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setDeleteId(c.id)}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-950/30 transition cursor-pointer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-md rounded-2xl border border-zinc-700 p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-white">
                {editingCoupon ? "Edit Coupon" : "Create Coupon"}
              </h2>
              <button
                onClick={closeModal}
                className="text-zinc-400 hover:text-white transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <div className="bg-red-950/40 border border-red-900/40 text-red-300 p-3 rounded-lg flex items-start gap-2 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">
                  Coupon Code *
                </label>
                <input
                  required
                  type="text"
                  value={form.code}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      code: e.target.value.toUpperCase().replace(/\s/g, ""),
                    })
                  }
                  placeholder="WELCOME10"
                  className="w-full px-4 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950 text-white text-sm font-mono tracking-widest focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">
                    Discount Type *
                  </label>
                  <select
                    value={form.discountType}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        discountType: e.target.value as "PERCENTAGE" | "FLAT",
                      })
                    }
                    className="w-full px-3 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950 text-white text-sm focus:outline-none focus:border-primary"
                  >
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FLAT">Flat Amount ($)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">
                    Discount Value *
                  </label>
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.discountValue}
                    onChange={(e) =>
                      setForm({ ...form, discountValue: e.target.value })
                    }
                    placeholder={
                      form.discountType === "PERCENTAGE" ? "10" : "20.00"
                    }
                    className="w-full px-3 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950 text-white text-sm focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) =>
                      setForm({ ...form, startDate: e.target.value })
                    }
                    className="w-full px-3 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950 text-white text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) =>
                      setForm({ ...form, endDate: e.target.value })
                    }
                    className="w-full px-3 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950 text-white text-sm focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">
                  Max Usage (leave blank for unlimited)
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.maxUsage}
                  onChange={(e) =>
                    setForm({ ...form, maxUsage: e.target.value })
                  }
                  placeholder="100"
                  className="w-full px-4 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950 text-white text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex items-center gap-3">
                <label className="text-xs font-semibold text-zinc-400">
                  Active
                </label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) =>
                      setForm({ ...form, isActive: e.target.checked })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-zinc-700 rounded-full peer peer-checked:bg-primary transition-colors duration-200 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-5" />
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isMutating}
                  className="flex-1 bg-primary hover:bg-primary-hover text-black py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {isMutating ? (
                    <Loader2 className="animate-spin h-4 w-4" />
                  ) : (
                    <span>
                      {editingCoupon ? "Save Changes" : "Create Coupon"}
                    </span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-sm rounded-2xl border border-red-900/40 p-6 space-y-5">
            <h2 className="text-lg font-extrabold text-white">
              Delete Coupon?
            </h2>
            <p className="text-zinc-400 text-sm">
              This will permanently remove the coupon code. Previously used
              discounts will remain on their appointments.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteId)}
                disabled={deleteMutation.isPending}
                className="flex-1 bg-red-700 hover:bg-red-600 text-white py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="animate-spin h-4 w-4" />
                ) : (
                  "Delete"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
