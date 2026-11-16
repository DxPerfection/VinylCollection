// Folds a screen's header away while you scroll down a list and brings it back as soon as you scroll up
import { type RefObject, useEffect, useState } from "react";

const nearTop = 40; // always open this close to the top
const nudge = 6; // ignore smaller moves so a resting finger doesn't flicker it

// Whether the header should be folded after the list moved from lastTop to top
export function nextFolded(folded: boolean, top: number, lastTop: number): boolean {
  if (top < nearTop) return false;
  if (top - lastTop > nudge) return true;
  if (lastTop - top > nudge) return false;
  return folded;
}

export function useFoldOnScroll(scroller: RefObject<HTMLElement | null>): boolean {
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    let lastTop = element.scrollTop;
    const onScroll = () => {
      const top = element.scrollTop;
      // When the list can't scroll any further (the bottom bounce), keep things as they are
      const atBottom = top + element.clientHeight >= element.scrollHeight - 2;
      if (Math.abs(top - lastTop) <= nudge && top >= nearTop) return;
      if (!atBottom || top < lastTop) setFolded((current) => nextFolded(current, top, lastTop));
      lastTop = top;
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, [scroller]);
  return folded;
}
