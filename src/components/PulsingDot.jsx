import { cn } from "../utils/helpers";

export default function PulsingDot({ color = "bg-green-500" }) {
  return (
    <span className="relative flex h-3 w-3 flex-shrink-0">
      <span
        className={cn(
          "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
          color.replace("500", "400")
        )}
      />
      <span className={cn("relative inline-flex rounded-full h-3 w-3", color)} />
    </span>
  );
}