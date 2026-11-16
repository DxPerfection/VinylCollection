// The short message above the tab bar after a save, with Undo when the save can be taken back
import { useEffect, useRef } from "react";

export interface ToastMessage {
  id: number;
  text: string;
  undo?: () => void;
  isError?: boolean;
}

const showForMs = 6000;

export function Toast({ toast, onDone }: { toast: ToastMessage; onDone: () => void }) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const timer = window.setTimeout(() => doneRef.current(), showForMs);
    return () => window.clearTimeout(timer);
  }, [toast.id]);

  return (
    <div className={toast.isError ? "toast toastError" : "toast"} role="status" aria-live="polite">
      <span className="toastText">{toast.text}</span>
      {toast.undo && (
        <button type="button" className="toastUndo" onClick={() => { toast.undo?.(); onDone(); }}>Undo</button>
      )}
    </div>
  );
}
