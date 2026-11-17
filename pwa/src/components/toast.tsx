// The short message above the tab bar after a save, with Undo when the save can be taken back
import { useEffect, useRef } from "react";

export interface ToastMessage {
  id: number;
  text: string;
  undo?: () => void;
  isError?: boolean;
  link?: { href: string; label: string }; // opens in a new tab, e.g. that day on Last.fm
}

const showForMs = 6000;
const showWithLinkMs = 10000;

export function Toast({ toast, onDone }: { toast: ToastMessage; onDone: () => void }) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const timer = window.setTimeout(() => doneRef.current(), toast.link ? showWithLinkMs : showForMs);
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.link]);

  return (
    <div className={toast.isError ? "toast toastError" : "toast"} role="status" aria-live="polite">
      <span className="toastText">{toast.text}</span>
      {toast.link && (
        <a className="toastUndo toastLink" href={toast.link.href} target="_blank" rel="noreferrer">{toast.link.label}</a>
      )}
      {toast.undo && (
        <button type="button" className="toastUndo" onClick={() => { toast.undo?.(); onDone(); }}>Undo</button>
      )}
    </div>
  );
}
