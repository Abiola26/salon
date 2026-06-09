"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import { useRouter } from "next/navigation";
import {
  User as UserIcon,
  Mail,
  Phone,
  Shield,
  Trash2,
  Edit,
  Search,
  Award,
  Loader2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  UserCheck
} from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "ADMIN" | "CUSTOMER";
  loyaltyPoints: number;
  createdAt: string;
}

export default function UserManagementPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user: currentUser, isHydrated } = useAuthStore();

  // Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("ALL");
  const [page, setPage] = useState(1);
  const limit = 10;

  // Modals States
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedUserProfile, setSelectedUserProfile] = useState<User | null>(null);

  // Edit fields
  const [editRole, setEditRole] = useState<"ADMIN" | "CUSTOMER">("CUSTOMER");
  const [editPoints, setEditPoints] = useState(0);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");

  // Redirect if not admin
  useEffect(() => {
    if (isHydrated && (!currentUser || currentUser.role !== "ADMIN")) {
      router.push(currentUser ? "/dashboard" : "/login?redirect=/admin/users");
    }
  }, [currentUser, isHydrated, router]);

  // Fetch Users
  const { data: usersResponse, isLoading, error } = useQuery({
    queryKey: ["admin-users-list", page, filterRole],
    queryFn: async () => {
      const roleQuery = filterRole !== "ALL" ? `&role=${filterRole}` : "";
      const res = await api.get(`/users?page=${page}&limit=${limit}${roleQuery}`);
      return res.data;
    },
    enabled: !!currentUser && currentUser.role === "ADMIN",
  });

  const users: User[] = usersResponse?.data || [];
  const meta = usersResponse?.meta || { total: 0, page: 1, limit: 10, totalPages: 1 };

  // Set initial edit fields
  useEffect(() => {
    if (editUser) {
      setEditRole(editUser.role);
      setEditPoints(editUser.loyaltyPoints);
      setEditName(editUser.name);
      setEditEmail(editUser.email);
      setEditPhone(editUser.phone || "");
    }
  }, [editUser]);

  // Mutations
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.put(`/users/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users-list"] });
      setEditUser(null);
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || "Failed to update user");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/users/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users-list"] });
      setDeleteId(null);
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || "Failed to delete user");
    },
  });

  // Client side search filtering
  const filteredUsers = users.filter((u) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      u.name.toLowerCase().includes(searchLower) ||
      u.email.toLowerCase().includes(searchLower) ||
      (u.phone && u.phone.includes(searchTerm))
    );
  });

  const handleUpdateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    updateMutation.mutate({
      id: editUser.id,
      data: {
        role: editRole,
        loyaltyPoints: editPoints,
        name: editName,
        email: editEmail,
        phone: editPhone || null,
      },
    });
  };

  if (!isHydrated || !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-bg">
        <Loader2 className="animate-spin h-8 w-8 text-primary" />
      </div>
    );
  }

  return (
    <div className="w-full bg-dark-bg min-h-screen py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="border-b border-zinc-900 pb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
              User <span className="text-gold-gradient">Management</span>
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Search customers and admins, update user profiles, adjust loyalty rewards, or delete accounts.
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 bg-zinc-950/20 border border-zinc-900 p-4 rounded-2xl">
          {/* Search Box */}
          <div className="flex-1 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search by name, email or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-950 border border-zinc-850 rounded-xl text-sm text-white placeholder-zinc-550 focus:outline-none focus:border-primary transition"
            />
          </div>

          {/* Role Filter */}
          <div className="w-full md:w-48">
            <select
              value={filterRole}
              onChange={(e) => {
                setFilterRole(e.target.value);
                setPage(1);
              }}
              className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-850 rounded-xl text-sm text-white focus:outline-none focus:border-primary transition cursor-pointer"
            >
              <option value="ALL">All Roles</option>
              <option value="CUSTOMER">Customers</option>
              <option value="ADMIN">Admins</option>
            </select>
          </div>
        </div>

        {/* User Table Grid */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <Loader2 className="animate-spin h-8 w-8 text-primary" />
            <span className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Loading user database...</span>
          </div>
        ) : error ? (
          <div className="glass-panel text-center py-10 border-red-900/40 text-red-400">
            Failed to load users list. Please check authorization.
          </div>
        ) : (
          <div className="space-y-6">
            <div className="glass-panel overflow-hidden border border-dark-border rounded-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-900 bg-zinc-950/45 text-xs text-zinc-400 font-bold uppercase tracking-wider">
                      <th className="py-4 px-6">User Profile</th>
                      <th className="py-4 px-6">Contact Info</th>
                      <th className="py-4 px-6">System Role</th>
                      <th className="py-4 px-6">Loyalty Points</th>
                      <th className="py-4 px-6">Joined Date</th>
                      <th className="py-4 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900/60 text-sm text-zinc-300">
                    {filteredUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-zinc-900/15 transition">
                        {/* Profile Details */}
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-zinc-950 border border-zinc-850 flex items-center justify-center shrink-0">
                              <UserIcon className="h-4.5 w-4.5 text-primary" />
                            </div>
                            <div>
                              <button
                                onClick={() => setSelectedUserProfile(u)}
                                className="font-bold text-white hover:text-primary transition leading-tight text-left cursor-pointer"
                                title="View User Profile Details"
                              >
                                {u.name}
                              </button>
                              <p className="text-[10px] text-zinc-500 font-mono mt-0.5">{u.id}</p>
                            </div>
                          </div>
                        </td>

                        {/* Contact details */}
                        <td className="py-4 px-6 space-y-1">
                          <div className="flex items-center gap-2 text-xs text-zinc-400">
                            <Mail className="h-3.5 w-3.5 text-zinc-500" />
                            <span>{u.email}</span>
                          </div>
                          {u.phone && (
                            <div className="flex items-center gap-2 text-xs text-zinc-400">
                              <Phone className="h-3.5 w-3.5 text-zinc-500" />
                              <span>{u.phone}</span>
                            </div>
                          )}
                        </td>

                        {/* Role */}
                        <td className="py-4 px-6">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
                              u.role === "ADMIN"
                                ? "bg-primary/15 text-primary border border-primary/20"
                                : "bg-zinc-900 text-zinc-400 border border-zinc-800"
                            }`}
                          >
                            <Shield className="h-3 w-3" />
                            {u.role}
                          </span>
                        </td>

                        {/* Loyalty Points */}
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-1.5 font-semibold text-white">
                            <Award className="h-4.5 w-4.5 text-primary" />
                            <span>{u.loyaltyPoints} pts</span>
                          </div>
                        </td>

                        {/* Created At */}
                        <td className="py-4 px-6 text-zinc-400 text-xs">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-zinc-550" />
                            <span>{new Date(u.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</span>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-2.5">
                            <button
                              onClick={() => setEditUser(u)}
                              disabled={u.id === currentUser.id}
                              className="p-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Edit User Profile"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteId(u.id)}
                              disabled={u.id === currentUser.id}
                              className="p-2 bg-red-950/20 hover:bg-red-900/40 border border-red-900/20 text-red-400 transition rounded-xl cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Delete User"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {filteredUsers.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center py-16 text-zinc-550">
                          <UserIcon className="h-8 w-8 text-primary mx-auto mb-2 opacity-45" />
                          <p className="font-bold text-zinc-450">No users found matching requirements</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {meta.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-zinc-900 pt-4">
                <p className="text-xs text-zinc-500">
                  Showing page <span className="font-bold text-zinc-350">{meta.page}</span> of{" "}
                  <span className="font-bold text-zinc-350">{meta.totalPages}</span> ({meta.total} users total)
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                    className="p-2 bg-zinc-950 hover:bg-zinc-900 border border-zinc-850 rounded-xl text-zinc-400 hover:text-white transition cursor-pointer disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    disabled={page === meta.totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="p-2 bg-zinc-950 hover:bg-zinc-900 border border-zinc-850 rounded-xl text-zinc-400 hover:text-white transition cursor-pointer disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Edit User Profile Modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-md rounded-2xl border border-dark-border p-6 space-y-6">
            <div className="flex justify-between items-center border-b border-zinc-900 pb-3">
              <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-primary" />
                Edit Profile
              </h2>
              <button
                onClick={() => setEditUser(null)}
                className="text-zinc-500 hover:text-white transition text-xs font-bold"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleUpdateSubmit} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">
                  Full Name
                </label>
                <input
                  required
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-zinc-850 rounded-xl bg-zinc-950 text-white text-sm focus:outline-none focus:border-primary"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">
                  Email Address
                </label>
                <input
                  required
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-4 py-2.5 border border-zinc-850 rounded-xl bg-zinc-950 text-white text-sm focus:outline-none focus:border-primary"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="e.g. +1 343 996 2448"
                  className="w-full px-4 py-2.5 border border-zinc-850 rounded-xl bg-zinc-950 text-white text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Role selection */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">
                    System Role
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as any)}
                    className="w-full px-4 py-2.5 border border-zinc-850 rounded-xl bg-zinc-950 text-white text-sm focus:outline-none focus:border-primary cursor-pointer"
                  >
                    <option value="CUSTOMER">CUSTOMER</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </div>

                {/* Loyalty Points */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1 flex items-center gap-1">
                    <Award className="h-3.5 w-3.5 text-primary" />
                    Loyalty Points
                  </label>
                  <input
                    required
                    type="number"
                    min={0}
                    value={editPoints}
                    onChange={(e) => setEditPoints(parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 border border-zinc-850 rounded-xl bg-zinc-950 text-white text-sm focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-zinc-900/60">
                <button
                  type="button"
                  onClick={() => setEditUser(null)}
                  className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="flex-1 bg-primary hover:bg-primary-hover text-black py-2.5 rounded-xl text-xs font-extrabold transition duration-300 flex items-center justify-center gap-1 cursor-pointer"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="animate-spin h-4.5 w-4.5" />
                  ) : (
                    "Save Changes"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-sm rounded-2xl border border-red-900/40 p-6 space-y-5">
            <h2 className="text-lg font-extrabold text-white">
              Delete User?
            </h2>
            <p className="text-zinc-400 text-sm">
              Are you sure you want to permanently delete this user account? All booking records, details, and loyalty balances will be deleted from the database.
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
                  "Delete User"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selected User Details Profile Modal */}
      {selectedUserProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-sm rounded-2xl border border-zinc-900 p-6 space-y-6">
            <div className="flex justify-between items-center border-b border-zinc-900 pb-3">
              <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                <UserIcon className="h-5 w-5 text-primary" />
                User Profile Details
              </h2>
              <button
                onClick={() => setSelectedUserProfile(null)}
                className="text-zinc-500 hover:text-white transition text-xs font-bold"
              >
                Close
              </button>
            </div>

            <div className="space-y-4.5 text-sm">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">User ID</span>
                <div className="flex items-center justify-between bg-zinc-950 px-3 py-2 border border-zinc-900 rounded-xl">
                  <span className="font-mono text-xs text-zinc-300 truncate max-w-[200px]">{selectedUserProfile.id}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(selectedUserProfile.id);
                      alert("User ID copied to clipboard!");
                    }}
                    className="text-[10px] text-primary hover:underline cursor-pointer"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Full Name</span>
                <p className="font-semibold text-white bg-zinc-950/40 border border-zinc-950 px-3 py-2 rounded-xl">{selectedUserProfile.name}</p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Email Address</span>
                <p className="font-semibold text-white bg-zinc-950/40 border border-zinc-950 px-3 py-2 rounded-xl">{selectedUserProfile.email}</p>
              </div>

              {selectedUserProfile.phone && (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Phone Number</span>
                  <p className="font-semibold text-white bg-zinc-950/40 border border-zinc-950 px-3 py-2 rounded-xl">{selectedUserProfile.phone}</p>
                </div>
              )}

              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">System Role</span>
                <div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/10 border border-primary/20 text-primary text-xs font-bold rounded-full uppercase">
                    {selectedUserProfile.role}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Loyalty Points Balance</span>
                <div className="flex items-center gap-1.5 font-semibold text-white bg-zinc-950/40 border border-zinc-950 px-3 py-2 rounded-xl">
                  <Award className="h-4.5 w-4.5 text-primary" />
                  <span>{selectedUserProfile.loyaltyPoints} points</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Joined Date</span>
                <p className="font-semibold text-white bg-zinc-950/40 border border-zinc-950 px-3 py-2 rounded-xl">
                  {new Date(selectedUserProfile.createdAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>

            <button
              onClick={() => setSelectedUserProfile(null)}
              className="w-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Close Details
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
