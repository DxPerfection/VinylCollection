// A record cover, or a drawn record when there is no cover or it will not load
import { useState } from "react";

import { DiscArt } from "./icons";

export function CoverArt({ url, className = "" }: { url: string | null | undefined; className?: string }) {
  const [failed, setFailed] = useState(false);
  const usable = Boolean(url && /^https?:\/\//.test(url)) && !failed;
  return (
    <div className={`cover ${className}`}>
      {usable ? (
        <img src={url ?? ""} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <DiscArt />
      )}
    </div>
  );
}
