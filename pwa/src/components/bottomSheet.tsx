// A panel that slides up from the bottom. Tapping outside it, or pressing Escape, closes it.
import { type ReactNode, useEffect, useRef } from "react";

export function BottomSheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="sheetBackdrop">
      <button type="button" className="sheetDismiss" aria-label="Close" onClick={onClose} />
      <div className="sheetPanel" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={panelRef}>
        <div className="sheetHandle" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}
