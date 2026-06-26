"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuthStore } from "@/store/useAuthStore";
import { api, getApiErrorMessage } from "@/lib/api";
import {
  Scissors,
  Plus,
  Edit2,
  Trash2,
  Loader2,
  AlertCircle,
  Clock,
  DollarSign,
} from "lucide-react";

interface Service {
  id: string;
  name: string;
  description: string;
  duration: number;
  price: string;
  isActive: boolean;
}

// Zod Validation Schema matching backend expectations
const serviceFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  description: z.string().min(5, "Description must be at least 5 characters").max(500),
  duration: z
    .number({ message: "Duration must be a number" })
    .int()
    .min(5, "Duration must be at least 5 minutes")
    .max(480, "Duration cannot exceed 8 hours"),
  price: z.string().refine(
    (val) => {
      const parsed = parseFloat(val);
      return !isNaN(parsed) && parsed > 0;
    },
    { message: "Price must be a valid positive number" }
  ),
  isActive: z.boolean(),
});

type ServiceFormValues = z.infer<typeof serviceFormSchema>;

export default function AdminServicesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isHydrated } = useAuthStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Redirect if not admin
  useEffect(() => {
    if (isHydrated && (!user || user.role !== "ADMIN")) {
      router.push(user ? "/dashboard" : "/login?redirect=/admin/services");
    }
  }, [user, isHydrated, router]);

  // Fetch all services
  const { data: servicesResponse, isLoading, error } = useQuery({
    queryKey: ["admin-services-list"],
    queryFn: async () => {
      const res = await api.get("/services");
      return res.data;
    },
    enabled: !!user && user.role === "ADMIN",
  });

  const services: Service[] = servicesResponse?.data || [];

  // Form Setup
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: {
      name: "",
      description: "",
      duration: 30,
      price: "",
      isActive: true,
    },
  });

  // Reset form when modal opens/closes or edit changes
  useEffect(() => {
    if (editingService) {
      setValue("name", editingService.name);
      setValue("description", editingService.description);
      setValue("duration", editingService.duration);
      setValue("price", parseFloat(editingService.price).toFixed(2));
      setValue("isActive", editingService.isActive);
    } else {
      reset({
        name: "",
        description: "",
        duration: 30,
        price: "",
        isActive: true,
      });
    }
  }, [editingService, setValue, reset, isModalOpen]);

  // Handle Form Submission (Create or Update)
  const onSubmit = async (data: ServiceFormValues) => {
    setFormError(null);
    try {
      if (editingService) {
        // Update API
        await api.put(`/services/${editingService.id}`, data);
      } else {
        // Create API
        await api.post("/services", data);
      }
      queryClient.invalidateQueries({ queryKey: ["admin-services-list"] });
      queryClient.invalidateQueries({ queryKey: ["services"] });
      setIsModalOpen(false);
      setEditingService(null);
    } catch (err: unknown) {
      setFormError(getApiErrorMessage(err, "Operation failed. Please try again."));
    }
  };

  // Toggle Active State
  const handleToggleActive = async (service: Service) => {
    setLoadingActionId(service.id);
    try {
      await api.put(`/services/${service.id}`, {
        isActive: !service.isActive,
      });
      queryClient.invalidateQueries({ queryKey: ["admin-services-list"] });
      queryClient.invalidateQueries({ queryKey: ["services"] });
    } catch (err: unknown) {
      console.error(getApiErrorMessage(err, "Failed to update status."));
    } finally {
      setLoadingActionId(null);
    }
  };

  // Delete Service
  const handleDelete = async (id: string) => {
    setLoadingActionId(id);
    try {
      await api.delete(`/services/${id}`);
      queryClient.invalidateQueries({ queryKey: ["admin-services-list"] });
      queryClient.invalidateQueries({ queryKey: ["services"] });
    } catch (err: unknown) {
      console.error(getApiErrorMessage(err, "Failed to delete service."));
    } finally {
      setLoadingActionId(null);
    }
  };

  if (!isHydrated || !user) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center py-20 bg-dark-bg text-zinc-400 gap-4">
        <Loader2 className="animate-spin h-10 w-10 text-primary" />
        <p className="text-sm">Retrieving administration credentials...</p>
      </div>
    );
  }

  return (
    <div className="w-full bg-dark-bg min-h-screen py-8 sm:py-10 px-4 sm:px-6 lg:px-8 text-white">
      <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">
        
        {/* Title */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 border-b border-zinc-900 pb-5 sm:pb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Manage Salon <span className="text-gold-gradient">Services Catalog</span>
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Add new services, configure treatment pricing, duration guidelines, and visibility controls.
            </p>
          </div>
          <button
            onClick={() => {
              setEditingService(null);
              setIsModalOpen(true);
            }}
            className="bg-primary hover:bg-primary-hover text-black font-extrabold px-5 py-2.5 sm:px-6 sm:py-3 rounded-xl transition duration-300 text-xs shadow-lg shadow-primary/10 flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Plus className="h-4 w-4" />
            Add New Service
          </button>
        </div>

        {/* Loading Catalog */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="animate-spin h-10 w-10 text-primary" />
            <p className="text-sm text-zinc-400">Loading catalog matrix...</p>
          </div>
        ) : error ? (
          <div className="bg-red-950/20 border border-red-900/40 p-4 rounded-xl flex items-start gap-3 text-red-300">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400 mt-0.5" />
            <div>
              <h4 className="font-bold text-sm">Failed to load services</h4>
              <p className="text-xs text-zinc-400 mt-1">
                There was a problem loading the service list. Please check your backend connection.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {services.map((service) => (
              <div
                key={service.id}
                className={`glass-card rounded-2xl p-6 border flex flex-col justify-between h-full relative overflow-hidden transition duration-300 ${
                  service.isActive ? "border-zinc-900/60" : "border-zinc-950 opacity-60 bg-zinc-950/10"
                }`}
              >
                {/* Active Indicator Glow Line */}
                <div
                  className={`absolute top-0 left-0 right-0 h-[2px] ${
                    service.isActive
                      ? "bg-gradient-to-r from-transparent via-primary/30 to-transparent"
                      : "bg-transparent"
                  }`}
                ></div>

                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="h-8 w-8 rounded-lg bg-dark-gold/20 border border-primary/20 flex items-center justify-center">
                      <Scissors className="h-4 w-4 text-primary" />
                    </div>
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-extrabold tracking-wider uppercase ${
                        service.isActive
                          ? "bg-green-950/40 text-green-400 border border-green-900/30"
                          : "bg-zinc-900 text-zinc-500 border border-zinc-800"
                      }`}
                    >
                      {service.isActive ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-white tracking-tight">
                      {service.name}
                    </h3>
                    <p className="text-zinc-400 text-xs mt-2 leading-relaxed min-h-[3rem] line-clamp-3">
                      {service.description}
                    </p>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-zinc-900/80 flex flex-col gap-4">
                  {/* Price & Duration */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-zinc-300 text-xs">
                      <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span>{service.duration} mins</span>
                    </div>
                    <div className="flex items-center text-lg font-extrabold text-primary">
                      <DollarSign className="h-4 w-4 shrink-0 -mr-0.5" />
                      <span>{parseFloat(service.price).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Actions buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingService(service);
                        setIsModalOpen(true);
                      }}
                      className="flex-1 bg-zinc-900 hover:bg-zinc-850 text-zinc-300 border border-zinc-800 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Edit2 className="h-3.5 w-3.5 text-primary" />
                      Edit
                    </button>
                    <button
                      disabled={loadingActionId === service.id}
                      onClick={() => handleToggleActive(service)}
                      className={`px-3 border py-2 rounded-xl text-xs font-bold transition flex items-center justify-center cursor-pointer ${
                        service.isActive
                          ? "bg-transparent border-zinc-800 hover:border-zinc-650 text-zinc-400"
                          : "bg-dark-gold/15 border-primary/20 hover:border-primary text-primary"
                      }`}
                      title={service.isActive ? "Deactivate Service" : "Activate Service"}
                    >
                      {loadingActionId === service.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : service.isActive ? (
                        <span>Suspend</span>
                      ) : (
                        <span>Activate</span>
                      )}
                    </button>
                    <button
                      disabled={loadingActionId === service.id}
                      onClick={() => setDeleteId(service.id)}
                      className="px-3 bg-red-950/20 hover:bg-red-900/40 border border-red-900/20 text-red-400 py-2 rounded-xl transition flex items-center justify-center cursor-pointer"
                      title="Delete Service"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {services.length === 0 && (
              <div className="col-span-full text-center py-16 text-zinc-500 space-y-2">
                <Scissors className="h-8 w-8 text-primary mx-auto mb-2 opacity-50" />
                <p className="font-bold">Services catalog is currently empty</p>
                <p className="text-xs text-zinc-500">Configure new luxury treatments to enable scheduling.</p>
              </div>
            )}
          </div>
        )}

        {/* CREATE / EDIT MODAL */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-dark-card border border-primary/20 p-6 rounded-2xl max-w-md w-full space-y-6 animate-zoomIn relative">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary/30"></div>

              <div className="flex justify-between items-start border-b border-zinc-900 pb-3">
                <h3 className="text-lg font-bold text-white">
                  {editingService ? "Update Treatment Details" : "Create Service Catalog Item"}
                </h3>
                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingService(null);
                  }}
                  className="text-zinc-500 hover:text-white transition text-xs font-bold"
                >
                  Close
                </button>
              </div>

              {formError && (
                <div className="bg-red-950/40 border border-red-900/40 text-red-300 p-3 rounded-lg flex items-start gap-2 text-xs">
                  <AlertCircle className="h-4.5 w-4.5 text-red-400 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">
                    Treatment Title
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="Signature Cut & Blowdry"
                    {...register("name")}
                    className="w-full px-4 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950 text-white text-sm focus:outline-none focus:border-primary"
                  />
                  {errors.name && (
                    <p className="mt-1 text-xs text-red-400">{errors.name.message}</p>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">
                    Description
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Indulge in a premium conditioning rinse, customized scissor styling, and professional hot tool finish."
                    {...register("description")}
                    className="w-full px-4 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950 text-white text-sm focus:outline-none focus:border-primary"
                  ></textarea>
                  {errors.description && (
                    <p className="mt-1 text-xs text-red-400">{errors.description.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Duration */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1">
                      Duration (Mins)
                    </label>
                    <input
                      required
                      type="number"
                      placeholder="60"
                      {...register("duration", { valueAsNumber: true })}
                      className="w-full px-4 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950 text-white text-sm focus:outline-none focus:border-primary"
                    />
                    {errors.duration && (
                      <p className="mt-1 text-xs text-red-400">{errors.duration.message}</p>
                    )}
                  </div>

                  {/* Price */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1">
                      Pricing ($)
                    </label>
                    <input
                      required
                      type="text"
                      placeholder="85.00"
                      {...register("price")}
                      className="w-full px-4 py-2.5 border border-zinc-800 rounded-xl bg-zinc-950 text-white text-sm focus:outline-none focus:border-primary"
                    />
                    {errors.price && (
                      <p className="mt-1 text-xs text-red-400">{errors.price.message}</p>
                    )}
                  </div>
                </div>

                {/* Is Active check */}
                <div className="flex items-center justify-between bg-zinc-950/40 border border-zinc-900 p-3 rounded-xl">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-zinc-200">Catalog Visibility</span>
                    <span className="text-[10px] text-zinc-500">
                      Control if customers can book this service
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    {...register("isActive")}
                    className="h-4.5 w-4.5 accent-primary bg-zinc-950 border-zinc-800 rounded focus:ring-0 focus:ring-offset-0"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-primary hover:bg-primary-hover text-black py-3 rounded-xl text-sm font-extrabold transition duration-300 shadow-lg shadow-primary/10 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isSubmitting ? (
                    <Loader2 className="animate-spin h-4 w-4" />
                  ) : (
                    <span>
                      {editingService ? "Update Treatment" : "Add Service Offer"}
                    </span>
                  )}
                </button>
              </form>
            </div>
          </div>
        )}

      </div>

      {/* Delete Confirm Modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-sm rounded-2xl border border-red-900/40 p-6 space-y-5">
            <h2 className="text-lg font-extrabold text-white">
              Delete Service?
            </h2>
            <p className="text-zinc-400 text-sm">
              Are you sure you want to permanently delete this service? All booking history associated with it will remain, but new bookings cannot select this service.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const idToDelete = deleteId;
                  setDeleteId(null);
                  await handleDelete(idToDelete);
                }}
                className="flex-1 bg-red-700 hover:bg-red-600 text-white py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
