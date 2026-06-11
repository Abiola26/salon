"use client";

import { useState } from "react";
import {
  useStripe,
  useElements,
  CardElement,
} from "@stripe/react-stripe-js";
import { Loader2, ShieldCheck, AlertCircle } from "lucide-react";

interface CheckoutFormProps {
  clientSecret: string;
  amount: number;
  currency: string;
  paymentType: "DEPOSIT" | "FULL";
  onSuccess: (paymentIntentId: string) => void;
  onCancel: () => void;
}

export default function CheckoutForm({
  clientSecret,
  amount,
  paymentType,
  onSuccess,
  onCancel,
}: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setLoading(true);
    setError(null);

    const cardElement = elements.getElement(CardElement);

    if (!cardElement) {
      setLoading(false);
      return;
    }

    try {
      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        {
          payment_method: {
            card: cardElement,
          },
        }
      );

      if (stripeError) {
        setError(stripeError.message || "An error occurred with your payment.");
        setLoading(false);
      } else if (paymentIntent && paymentIntent.status === "succeeded") {
        onSuccess(paymentIntent.id);
      } else {
        setError("Payment processing failed or is pending.");
        setLoading(false);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(message);
      setLoading(false);
    }
  };

  const formattedAmount = (amount / 100).toFixed(2);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800 space-y-2">
        <div className="flex justify-between items-center text-sm">
          <span className="text-zinc-400">Payment Authorization</span>
          <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">
            {paymentType}
          </span>
        </div>
        <div className="flex justify-between items-baseline">
          <span className="text-zinc-200 font-bold">Amount Due Now</span>
          <span className="text-2xl font-extrabold text-primary">
            ${formattedAmount}
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-900/40 text-red-300 p-4 rounded-xl flex items-start gap-2.5 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-400 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-medium text-zinc-300">
          Card Details
        </label>
        <div className="px-4 py-4 border border-zinc-800 rounded-xl bg-zinc-950/80 focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary transition">
          <CardElement
            options={{
              style: {
                base: {
                  fontSize: "16px",
                  color: "#ffffff",
                  fontFamily: "Geist, sans-serif",
                  "::placeholder": {
                    color: "#71717a",
                  },
                },
                invalid: {
                  color: "#ef4444",
                  iconColor: "#ef4444",
                },
              },
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-zinc-500 justify-center">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <span>Secure 256-bit SSL encrypted Stripe payment</span>
      </div>

      <div className="flex gap-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="flex-1 bg-transparent hover:bg-zinc-900 text-zinc-300 border border-zinc-700 py-3.5 rounded-xl font-bold transition text-sm cursor-pointer disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={!stripe || loading}
          className="flex-1 bg-primary hover:bg-primary-hover text-black py-3.5 rounded-xl font-bold transition duration-300 text-sm shadow-lg shadow-primary/10 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin h-4 w-4" />
              <span>Processing...</span>
            </>
          ) : (
            <span>Pay ${formattedAmount}</span>
          )}
        </button>
      </div>
    </form>
  );
}
