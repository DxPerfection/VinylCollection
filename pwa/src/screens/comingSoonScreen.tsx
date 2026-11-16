// A tab that is not built yet points to the same section of the current app
import { ExternalIcon } from "../components/icons";
import { oldAppLink } from "../lib/config";

interface ComingSoonProps {
  title: string;
  what: string;
  oldSection: string;
}

export function ComingSoonScreen({ title, what, oldSection }: ComingSoonProps) {
  return (
    <div className="screen">
      <header className="screenHeader">
        <h1>{title}</h1>
      </header>
      <div className="scrollArea">
        <div className="card">
          <p>{what}</p>
          <p className="muted small">This part of the new app is coming in a later update. Until then it is in the current app.</p>
          <a className="primaryButton" href={oldAppLink(oldSection)} target="_blank" rel="noreferrer">
            Open in the current app <ExternalIcon />
          </a>
        </div>
      </div>
    </div>
  );
}
