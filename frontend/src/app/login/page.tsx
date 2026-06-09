"use client";

import { useState, useEffect, Suspense } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { api } from "@/lib/api";
import { Scissors, Loader2, AlertCircle } from "lucide-react";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginValues = z.infer<typeof loginSchema>;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuth, user } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      const redirectUrl = searchParams.get("redirect") || (user.role === "ADMIN" ? "/admin" : "/dashboard");
      router.push(redirectUrl);
    }
  }, [user, router, searchParams]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginValues) => {
    setError(null);
    setLoading(true);

    try {
      const response = await api.post("/auth/login", data);
      const { user: loggedInUser, accessToken, refreshToken } = response.data.data;

      // Save to Zustand store
      setAuth(loggedInUser, accessToken, refreshToken);

      // Redirect user
      const redirectUrl = searchParams.get("redirect") || (loggedInUser.role === "ADMIN" ? "/admin" : "/dashboard");
      router.push(redirectUrl);
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
        "Invalid email or password. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center py-16 px-4 sm:px-6 lg:px-8 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900 via-dark-bg to-dark-bg">
      <div className="max-w-md w-full space-y-8 glass-panel p-8 rounded-2xl shadow-2xl relative overflow-hidden">
        {/* Subtle gold circle accent background */}
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-primary/5 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex flex-col items-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-dark-gold/20 border border-primary/20 mb-3">
            <Scissors className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-center text-3xl font-extrabold text-white tracking-tight">
            Welcome back
          </h2>
          <p className="mt-2 text-center text-sm text-zinc-400">
            Sign in to manage your appointments
          </p>
        </div>

        {error && (
          <div className="bg-red-950/40 border border-red-900/40 text-red-300 p-4 rounded-lg flex items-start gap-2.5 text-sm animate-shake">
            <AlertCircle className="h-5 w-5 shrink-0 text-red-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-zinc-300 mb-1">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                {...register("email")}
                className="appearance-none block w-full px-4 py-3 border border-zinc-800 rounded-xl bg-zinc-900/60 placeholder-zinc-500 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition text-sm"
              />
              {errors.email && (
                <p className="mt-1.5 text-xs text-red-400">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-zinc-300 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                {...register("password")}
                className="appearance-none block w-full px-4 py-3 border border-zinc-800 rounded-xl bg-zinc-900/60 placeholder-zinc-500 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition text-sm"
              />
              {errors.password && (
                <p className="mt-1.5 text-xs text-red-400">{errors.password.message}</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="text-zinc-500 text-xs">
              Demo Admin: <span className="text-primary">admin@salon.com / Admin@123456</span>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-3.5 px-4 border border-transparent text-sm font-bold rounded-xl text-black bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all duration-300 shadow-lg shadow-primary/10 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <Loader2 className="animate-spin h-5 w-5" />
              ) : (
                "Sign In"
              )}
            </button>
          </div>
        </form>

        <p className="text-center text-sm text-zinc-400 mt-4">
          Don&apos;t have an account?{" "}
          <Link
            href={`/register${searchParams.get("redirect") ? `?redirect=${searchParams.get("redirect")}` : ""}`}
            className="font-medium text-primary hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>}>
      <LoginForm />
    </Suspense>
  );
}
