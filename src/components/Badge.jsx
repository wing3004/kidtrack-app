import { cn } from "../utils/helpers";

export default function Badge({ children, color = "blue" }) {
  const colors = {
    blue:  "bg-blue-100 text-blue-700",
    green: "bg-green-100 text-green-700",
    red:   "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-700",
    slate: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", colors[color])}>
      {children}
    </span>
  );
}