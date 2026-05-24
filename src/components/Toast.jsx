import { useEffect } from "react";

export default function Toast({ message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="absolute bottom-20 left-4 right-4 z-50 bg-slate-800 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-2xl animate-bounce">
      {message}
    </div>
  );
}