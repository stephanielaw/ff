"use client";

import { useEffect, useState } from "react";

interface ToastProps {
  message: string;
  type?: "success" | "error" | "warning";
  onClose: () => void;
}

export function Toast({ message, type = "success", onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const styles = {
    success: "bg-primary text-white",
    error: "bg-danger text-white",
    warning: "bg-warning text-white",
  };

  return (
    <div
      className={`fixed bottom-20 left-4 right-4 max-w-sm mx-auto z-50 rounded-xl px-4 py-3 border border-[rgba(255,255,255,0.08)] flex items-center gap-3 ${styles[type]}`}
    >
      <span className="flex-1 text-sm font-medium">{message}</span>
      <button
        onClick={onClose}
        className="flex-shrink-0 opacity-80 hover:opacity-100"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "warning";
  } | null>(null);

  function showToast(
    message: string,
    type: "success" | "error" | "warning" = "success"
  ) {
    setToast({ message, type });
  }

  function hideToast() {
    setToast(null);
  }

  return { toast, showToast, hideToast };
}
