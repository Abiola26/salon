"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { api } from "@/lib/api";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Users,
  DollarSign,
  Star,
  Scissors,
  Loader2,
  AlertCircle,
  ChevronRight,
  ClipboardList,
  CheckCircle,
} from "lucide-react";
import Link from "next/link";

interface DashboardData {
  overview: {
    totalAppointments: number;
    totalCustomers: number;
    totalRevenue: number;
    thisMonthRevenue: number;
    lastMonthRevenue: number;
    revenueGrowth: number;
    overallAverageRating: number | null;
    totalReviews: number;
  };
  appointmentsByStatus: {
    [key: string]: number;
  };
  monthlyRevenue: Array<{
    month: number;
    monthName: string;
    revenue: number;
    count: number;
  }>;
  topServices: Array<{
    id: string;
    name: string;
    price: string;
    bookingCount: number;
    averageRating: number | null;
    reviewCount: number;
  }>;
  recentAppointments: Array<{
    id: string;
    appointmentDate: string;
    appointmentTime: string;
    status: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
    paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
    notes?: string | null;
    user: {
      id: string;
      name: string;
      email: string;
    };
    service: {
      id: string;
      name: string;
      price: string;
    };
  }>;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user, isHydrated } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Redirect non-admin users
  useEffect(() => {
    if (isHydrated && (!user || user.role !== "ADMIN")) {
      router.push(user ? "/dashboard" : "/login?redirect=/admin");
    }
  }, [user, isHydrated, router]);

  // Fetch Dashboard Stats
  const { data: statsResponse, isLoading, error } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const res = await api.get("/analytics/dashboard");
      return res.data;
    },
    enabled: mounted && !!user && user.role === "ADMIN",
  });

  const stats: DashboardData | null = statsResponse?.data || null;

  if (!isHydrated || !mounted || isLoading) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center py-20 bg-dark-bg text-zinc-400 gap-4">
        <Loader2 className="animate-spin h-10 w-10 text-primary" />
        <p className="text-sm">Initiating manager panel...</p>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="w-full min-h-screen bg-dark-bg flex items-center justify-center p-4">
        <div className="max-w-md bg-red-950/20 border border-red-900/40 p-6 rounded-2xl flex items-start gap-4 text-red-300">
          <AlertCircle className="h-6 w-6 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <h3 className="font-bold text-base text-white">Analytics Loading Error</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              There was a problem querying the administrator analytics server. Ensure your backend connection is online and try reloading.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-red-900 hover:bg-red-800 text-white font-bold py-1.5 px-4 rounded-xl text-xs transition cursor-pointer"
            >
              Retry Connection
            </button>
          </div>
        </div>
      </div>
    );
  }

  const overview = stats.overview;

  // Prepare chart colors
  const statusColors = {
    CONFIRMED: "#10b981", // green-500
    PENDING: "#E60654", // custom theme pink
    CANCELLED: "#ef4444", // red-500
    COMPLETED: "#6366f1", // indigo-500
  };

  const statusData = Object.entries(stats.appointmentsByStatus).map(([status, count]) => ({
    name: status,
    value: count,
    color: statusColors[status as keyof typeof statusColors] || "#8e7a53",
  }));

  const monthlyChartData = stats.monthlyRevenue;
  const topServicesChartData = stats.topServices.map((s) => ({
    name: s.name,
    bookings: s.bookingCount,
    revenue: s.bookingCount * parseFloat(s.price),
  }));

  // Service Revenue Distribution (sorted by revenue)
  const serviceRevenueData = [...topServicesChartData].sort((a, b) => b.revenue - a.revenue);

  // Calculate appointment completion rate
  const completedAppts = stats.appointmentsByStatus['COMPLETED'] || 0;
  const totalAppts = overview.totalAppointments;
  const completionRate = totalAppts > 0 ? ((completedAppts / totalAppts) * 100).toFixed(1) : 0;

  return (
    <div className="w-full bg-dark-bg min-h-screen py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Title */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-900 pb-6">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">
              Ottawa Loctician <span className="text-gold-gradient">Analytics</span>
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Executive business metrics, sales curves, service popularity, and salon scheduling status.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/admin/appointments"
              className="bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 font-bold px-4 py-2.5 rounded-xl text-xs transition flex items-center gap-1.5"
            >
              <ClipboardList className="h-4 w-4 text-primary" />
              Manage Bookings
            </Link>
            <Link
              href="/admin/services"
              className="bg-primary hover:bg-primary-hover text-black font-extrabold px-4 py-2.5 rounded-xl text-xs transition flex items-center gap-1.5"
            >
              <Scissors className="h-4 w-4" />
              Manage Catalog
            </Link>
          </div>
        </div>

        {/* 4 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Revenue Card */}
          <div className="glass-card p-6 rounded-2xl space-y-4 relative overflow-hidden">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                Gross Revenue
              </span>
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <DollarSign className="h-4 w-4 text-emerald-400" />
              </div>
            </div>
            <div className="space-y-1">
              <h3 className="text-2xl font-extrabold text-white">
                ${overview.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
              <div className="flex items-center gap-1.5 text-xs">
                {overview.revenueGrowth >= 0 ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-0.5">
                    <TrendingUp className="h-3.5 w-3.5" />
                    +{overview.revenueGrowth}%
                  </span>
                ) : (
                  <span className="text-red-400 font-bold flex items-center gap-0.5">
                    <TrendingDown className="h-3.5 w-3.5" />
                    {overview.revenueGrowth}%
                  </span>
                )}
                <span className="text-zinc-500">vs last month</span>
              </div>
            </div>
          </div>

          {/* Appointments Card */}
          <div className="glass-card p-6 rounded-2xl space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                Total Bookings
              </span>
              <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Calendar className="h-4 w-4 text-primary" />
              </div>
            </div>
            <div className="space-y-1">
              <h3 className="text-2xl font-extrabold text-white">
                {overview.totalAppointments.toLocaleString()}
              </h3>
              <p className="text-xs text-zinc-500">Scheduled appointments overall</p>
            </div>
          </div>

          {/* Customers Card */}
          <div className="glass-card p-6 rounded-2xl space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                Unique Clients
              </span>
              <div className="h-8 w-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                <Users className="h-4 w-4 text-indigo-400" />
              </div>
            </div>
            <div className="space-y-1">
              <h3 className="text-2xl font-extrabold text-white">
                {overview.totalCustomers.toLocaleString()}
              </h3>
              <p className="text-xs text-zinc-500">Registered client profiles</p>
            </div>
          </div>

          {/* Reviews Card */}
          <div className="glass-card p-6 rounded-2xl space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                Client Rating
              </span>
              <div className="h-8 w-8 rounded-lg bg-[#E60654]/10 border border-[#E60654]/20 flex items-center justify-center">
                <Star className="h-4 w-4 text-[#E60654] fill-[#E60654]/20" />
              </div>
            </div>
            <div className="space-y-1">
              <h3 className="text-2xl font-extrabold text-white">
                {overview.overallAverageRating ? `${overview.overallAverageRating} / 5.0` : "N/A"}
              </h3>
              <p className="text-xs text-zinc-500">
                Based on {overview.totalReviews} verified client reviews
              </p>
            </div>
          </div>

          {/* Completion Rate Card */}
          <div className="glass-card p-6 rounded-2xl space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                Completion Rate
              </span>
              <div className="h-8 w-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <CheckCircle className="h-4 w-4 text-blue-400" />
              </div>
            </div>
            <div className="space-y-1">
              <h3 className="text-2xl font-extrabold text-white">
                {completionRate}%
              </h3>
              <p className="text-xs text-zinc-500">
                {completedAppts} of {totalAppts} appointments completed
              </p>
            </div>
          </div>

        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Revenue Area Chart */}
          <div className="glass-card p-6 rounded-2xl lg:col-span-2 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-900/60 pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Monthly Income Curve
              </h3>
              <span className="text-[10px] text-zinc-500">Historical Annual breakdown</span>
            </div>
            <div className="h-72 w-full text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyChartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#E60654" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#E60654" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1c1c20" />
                  <XAxis dataKey="monthName" stroke="#71717a" />
                  <YAxis stroke="#71717a" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#141417", borderColor: "#2D0211", borderRadius: "10px", color: "#fff" }}
                    formatter={(val) => [`$${Number(val).toFixed(2)}`, "Revenue"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#E60654"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorRevenue)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Booking status Pie chart */}
          <div className="glass-card p-6 rounded-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-900/60 pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Booking Breakdowns
              </h3>
              <span className="text-[10px] text-zinc-500">Status counts</span>
            </div>
            <div className="h-72 w-full text-xs flex flex-col justify-between items-center">
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={65}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: "#141417", borderColor: "#27272a", borderRadius: "8px", color: "#fff" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              
              {/* Legend List */}
              <div className="grid grid-cols-2 gap-4 w-full px-2 text-[10px] text-zinc-400">
                {statusData.map((item) => (
                  <div key={item.name} className="flex items-center gap-1.5 justify-start">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    ></span>
                    <span>
                      {item.name}: <strong>{item.value}</strong>
                    </span>
                  </div>
                ))}
                {statusData.length === 0 && (
                  <span className="col-span-2 text-center text-zinc-600">No scheduled appointments</span>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Additional Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Monthly Appointments Bar Chart */}
          <div className="glass-card p-6 rounded-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-900/60 pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Monthly Appointment Volume
              </h3>
              <span className="text-[10px] text-zinc-500">Booking frequency</span>
            </div>
            <div className="h-72 w-full text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1c1c20" />
                  <XAxis dataKey="monthName" stroke="#71717a" />
                  <YAxis stroke="#71717a" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#141417", borderColor: "#2D0211", borderRadius: "10px", color: "#fff" }}
                    formatter={(val) => [Number(val), "Bookings"]}
                  />
                  <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Service Revenue Distribution Bar Chart */}
          <div className="glass-card p-6 rounded-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-900/60 pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Service Revenue Mix
              </h3>
              <span className="text-[10px] text-zinc-500">Top earners</span>
            </div>
            <div className="h-72 w-full text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={serviceRevenueData}
                  margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1c1c20" />
                  <XAxis type="number" stroke="#71717a" />
                  <YAxis dataKey="name" type="category" stroke="#71717a" width={120} interval={0} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#141417", borderColor: "#2D0211", borderRadius: "10px", color: "#fff" }}
                    formatter={(val) => [`$${Number(val).toFixed(2)}`, "Revenue"]}
                  />
                  <Bar dataKey="revenue" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

        {/* Bottom Row: Top Services & Recent appointments */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Top Services Popularity */}
          <div className="glass-card p-6 rounded-2xl space-y-4 lg:col-span-1">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider border-b border-zinc-900/60 pb-3">
              Popular Treatments
            </h3>
            <div className="space-y-4">
              {stats.topServices.slice(0, 5).map((service, idx) => (
                <div key={service.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 font-bold w-4">#{idx + 1}</span>
                    <div className="flex flex-col">
                      <span className="font-bold text-white">{service.name}</span>
                      <span className="text-[10px] text-zinc-500">
                        ${parseFloat(service.price).toFixed(2)} • {service.reviewCount} reviews
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-extrabold text-primary bg-dark-gold/20 border border-primary/20 px-2 py-0.5 rounded-full">
                      {service.bookingCount} bookings
                    </span>
                  </div>
                </div>
              ))}
              {stats.topServices.length === 0 && (
                <div className="text-center py-12 text-zinc-600 text-xs">No active service data</div>
              )}
            </div>
          </div>

          {/* Recent Bookings List */}
          <div className="glass-card p-6 rounded-2xl lg:col-span-2 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-900/60 pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Recent Scheduling Log
              </h3>
              <Link
                href="/admin/appointments"
                className="text-xs text-primary hover:underline font-bold flex items-center gap-0.5"
              >
                Log View <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-zinc-900/80 text-zinc-500 pb-2">
                    <th className="py-2.5 font-semibold">Client</th>
                    <th className="py-2.5 font-semibold">Service</th>
                    <th className="py-2.5 font-semibold">Schedule Date</th>
                    <th className="py-2.5 font-semibold">Payment</th>
                    <th className="py-2.5 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900/40">
                  {stats.recentAppointments.slice(0, 5).map((appt) => (
                    <tr key={appt.id} className="hover:bg-zinc-950/20 transition-colors">
                      <td className="py-3 pr-2">
                        <div className="flex flex-col">
                          <span className="font-bold text-zinc-200">{appt.user.name}</span>
                          <span className="text-[10px] text-zinc-500">{appt.user.email}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-2 font-medium text-zinc-300">
                        {appt.service.name}
                      </td>
                      <td className="py-3 pr-2">
                        <div className="flex flex-col">
                          <span className="text-zinc-300 font-semibold">
                            {new Date(appt.appointmentDate).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                          <span className="text-[10px] text-zinc-500">{appt.appointmentTime}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-2">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            appt.paymentStatus === "PAID"
                              ? "bg-green-950/20 text-green-400"
                              : appt.paymentStatus === "PARTIAL"
                              ? "bg-[#E60654]/10 text-[#E60654]"
                              : "bg-red-950/20 text-red-400"
                          }`}
                        >
                          {appt.paymentStatus}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            appt.status === "CONFIRMED"
                              ? "bg-green-500/10 text-green-400 border border-green-500/20"
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
                    </tr>
                  ))}
                  {stats.recentAppointments.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-zinc-600">
                        No appointments booked yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
