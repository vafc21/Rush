"use client";
import { ReactNode } from "react";

export function Modal({ open, onClose, title, children }: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-panel p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h2 className="mb-4 text-lg font-bold text-white">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
