import React, { useEffect } from 'react';

interface ToastProps {
  message: string | null;
  duration?: number;
  onClose?: () => void;
}

export default function Toast({ message, duration = 4000, onClose }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => onClose?.(), duration);
    return () => clearTimeout(t);
  }, [message, duration, onClose]);

  if (!message) return null;

  return (
    <div className="fixed right-6 bottom-6 z-50">
      <div className="bg-gray-900 text-white px-4 py-2 rounded shadow-lg border border-gray-700">
        {message}
      </div>
    </div>
  );
}
