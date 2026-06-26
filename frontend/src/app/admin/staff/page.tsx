"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { api, getApiErrorMessage } from "@/lib/api";
import {
  Users,
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  X,
  User,
  Scissors,
} from "lucide-react";

interface Service {
  id: string;
  name: string;
}

interface Staff {
  id: string;
  name: string;
  bio: string | null;
  image: string | null;
  isActive: boolean;
  services: Service[];
  _count: { appointments: number };
}

interface StaffFormData {
  name: string;
  bio: string;
  image: string;
  isActive: boolean;
  serviceIds: string[];
}

const emptyForm: StaffFormData = {
  name: "",
  bio: "",
  image: "",
  isActive: true,
  serviceIds: [],
};

export default function AdminStaffPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isHydrated } = useAuthStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [form, setForm] = useState<StaffFormData>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (isHydrated && (!user || user.role !== "ADMIN")) {
      router.push(user ? "/dashboard" : "/login?redirect=/admin/staff");
    }
  }, [user, isHydrated, router]);

  // Fetch staff
  const { data: staffResponse, isLoading } = useQuery({
    queryKey: ["admin-staff"],
    queryFn: async () => {
      const res = await api.get("/staff");
      return res.data;
    },
    enabled: !!user && user.role === "ADMIN",
  });
  const staffList: Staff[] = staffResponse?.data || [];

  // Fetch services (for the multi-select)
  const { data: servicesResponse } = useQuery({
    queryKey: ["services-list"],
    queryFn: async () => {
      const res = await api.get("/services");
      return res.data;
    },
    enabled: !!user && user.role === "ADMIN",
  });
  const services: Service[] = servicesResponse?.data || [];

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: StaffFormData) => api.post("/staff", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-staff"] });
      closeModal();
    },
    onError: (err: unknown) => {
      setFormError(getApiErrorMessage(err, "Failed to create staff member"));
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: StaffFormData }) =>
      api.put(`/staff/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-staff"] });
      closeModal();
    },
    onError: (err: unknown) => {
      setFormError(getApiErrorMessage(err, "Failed to update staff member"));
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/staff/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-staff"] });
      setDeleteId(null);
    },
    onError: (err: unknown) => {
      console.error(getApiErrorMessage(err, "Failed to delete staff member"));
    },
  });

  const openCreate = () => {
    setEditingStaff(null);
    setForm(emptyForm);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEdit = (staff: Staff) => {
    setEditingStaff(staff);
    setForm({
      name: staff.name,
      bio: staff.bio || "",
      image: staff.image || "",
      isActive: staff.isActive,
      serviceIds: staff.services.map((s) => s.id),
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingStaff(null);
    setForm(emptyForm);
    setFormError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError("Name is required");
      return;
    }
    if (editingStaff) {
      updateMutation.mutate({ id: editingStaff.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const toggleService = (id: string) => {
    setForm((prev) => ({
      ...prev,
      serviceIds: prev.serviceIds.includes(id)
        ? prev.serviceIds.filter((s) => s !== id)
        : [...prev.serviceIds, id],
    }));
  };

  const isMutating =
    createMutation.isPending || updateMutation.isPending;

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
              <Users className="h-7 w-7 text-primary" />
              Stylist Roster
            </h1>
            <p className="text-zinc-500 text-sm mt-1">
              Manage your team of stylists and their service specializations.
            </p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-black font-bold px-4 py-2.5 rounded-xl text-sm transition cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Add Stylist
          </button>
        </div>

        {/* Staff Table */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin h-8 w-8 text-primary" />
          </div>
        ) : staffList.length === 0 ? (
          <div className="glass-panel p-12 rounded-2xl text-center border border-zinc-800">
            <Users className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400 font-semibold">No stylists yet</p>
            <p className="text-zinc-600 text-sm mt-1">
              Add your first stylist to get started.
            </p>
          </div>
        ) : (
          <div className="glass-panel rounded-2xl border border-zinc-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900/60 text-zinc-400 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-6 py-3">Stylist</th>
                    <th className="text-left px-6 py-3">Services</th>
                    <th className="text-center px-6 py-3">Bookings</th>
                    <th className="text-center px-6 py-3">Status</th>
                    <th className="text-right px-6 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {staffList.map((s) => (
                    <tr key={s.id} className="hover:bg-zinc-900/30 transition">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full overflow-hidden border border-zinc-700 shrink-0">
                            {s.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={s.image}
                                alt={s.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="h-full w-full bg-zinc-800 flex items-center justify-center">
                                <User className="h-5 w-5 text-zinc-500" />
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-white">{s.name}</p>
                            {s.bio && (
                              <p className="text-zinc-500 text-xs line-clamp-1 max-w-xs">
                                {s.bio}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {s.services.length === 0 ? (
                            <span className="text-zinc-600 text-xs">None</span>
                          ) : (
                            s.services.map((svc) => (
                              <span
                                key={svc.id}
                                className="text-[10px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full border border-zinc-700"
                              >
                                {svc.name}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center text-zinc-300 font-semibold">
                        {s._count.appointments}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {s.isActive ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-950/30 border border-green-900/30 px-2 py-0.5 rounded-full">
                            <CheckCircle className="h-3 w-3" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-red-400 bg-red-950/30 border border-red-900/30 px-2 py-0.5 rounded-full">
                            <XCircle className="h-3 w-3" /> Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(s)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-primary hover:bg-zinc-800 transition cursor-pointer"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleteId(s.id)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-950/30 transition cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-lg rounded-2xl border border-zinc-700 p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-white">
                {editingStaff ? "Edit Stylist" : "Add New Stylist"}
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
                  Full Name *
                </label>
                <input
                  required
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Sophia Laurent"
                  className="w-full px-4 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950 text-white text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">
                  Bio / Specialization
                </label>
                <textarea
                  rows={3}
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  placeholder="Award-winning colorist with 10+ years..."
                  className="w-full px-4 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950 text-white text-sm focus:outline-none focus:border-primary resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">
                  Profile Image URL
                </label>
                <input
                  type="url"
                  value={form.image}
                  onChange={(e) => setForm({ ...form, image: e.target.value })}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full px-4 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950 text-white text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-2">
                  <Scissors className="h-3.5 w-3.5 inline mr-1 text-primary" />
                  Services Offered
                </label>
                <div className="flex flex-wrap gap-2">
                  {services.map((svc) => {
                    const isSelected = form.serviceIds.includes(svc.id);
                    return (
                      <button
                        key={svc.id}
                        type="button"
                        onClick={() => toggleService(svc.id)}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition cursor-pointer ${
                          isSelected
                            ? "bg-primary/20 border-primary text-primary font-bold"
                            : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                        }`}
                      >
                        {isSelected && (
                          <CheckCircle className="h-3 w-3 inline mr-1" />
                        )}
                        {svc.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-xs font-semibold text-zinc-400">
                  Active Status
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
                <span className="text-xs text-zinc-500">
                  {form.isActive ? "Active" : "Inactive"}
                </span>
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
                      {editingStaff ? "Save Changes" : "Create Stylist"}
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
              Delete Stylist?
            </h2>
            <p className="text-zinc-400 text-sm">
              This will permanently remove the stylist. Their past appointments
              will remain on record.
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
