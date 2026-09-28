'use client';

import { useEffect } from 'react';

type ToastProps = {
  message: string;
  type?: 'success' | 'error';
  onClose: () => void;
};

export function Toast({ message, type = 'success', onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 rounded-xl px-4 py-3 text-sm shadow-lg ${
        type === 'success'
          ? 'bg-green-500 text-white'
          : 'bg-red-500 text-white'
      }`}
    >
      {message}
    </div>
  );
}