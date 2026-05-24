import { cn } from "../utils/helpers";

export default function Button({
  children,
  onClick,
  variant = "primary",
  className = "",
  disabled = false,
}) {
  const base =
    "font-bold rounded-lg transition-all flex items-center justify-center gap-2 " +
    "disabled:opacity-50 disabled:cursor-not-allowed active:scale-95";

  const variants = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white shadow-md py-3 px-4 w-full",
    danger:  "bg-red-500 hover:bg-red-600 text-white shadow-lg py-3 px-4 w-full",
    ghost:   "bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 py-2 px-3 text-xs",
    dark:    "bg-slate-700 hover:bg-slate-800 text-white py-2 px-3 text-xs",
    teal:    "bg-teal-600 hover:bg-teal-700 text-white py-3.5 px-4 w-full border-b-4 border-teal-800",
    white:   "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 shadow py-3 px-4 w-full",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(base, variants[variant], className)}
    >
      {children}
    </button>
  );
}