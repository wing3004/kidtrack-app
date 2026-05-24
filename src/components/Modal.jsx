export default function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div
      className="absolute inset-0 z-50 bg-black/60 flex items-end"
      onClick={onClose}
    >
      <div
        className="bg-white w-full rounded-t-2xl p-5 max-h-[78%] overflow-y-auto no-scroll"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-slate-800 text-base">{title}</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}