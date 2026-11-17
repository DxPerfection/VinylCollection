// Last.fm in the screens: logging and deleting plays, the Plays tab, and the Account section
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LastFmSection } from "../src/components/lastFmSection";
import { Toast } from "../src/components/toast";
import type { RecordView } from "../src/lib/collectionView";
import type { PlayRow } from "../src/lib/records";
import { useActions } from "../src/lib/useActions";
import { samplePlays, sampleRecords } from "./sampleData";

vi.mock("../src/lib/supabaseClient", () => ({ getSupabase: () => ({}) }));
vi.mock("../src/lib/plays", async (original) => ({
  ...(await original<typeof import("../src/lib/plays")>()),
  insertPlay: vi.fn(async (_supabase: unknown, row: Omit<PlayRow, "id">) => ({ ...row, id: 77 })),
  deletePlay: vi.fn(async () => undefined),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const record = { ...sampleRecords[0], playCount: 0, lastPlayed: null } as unknown as RecordView;

function hooks(sent = false) {
  return {
    link: { name: "harunemre", sessionKey: "sk", connectedAt: "2026-11-17T14:00:00Z" },
    queueForPlay: vi.fn(() => "queued" as const),
    dropForPlay: vi.fn(() => ({ queued: null, sent })),
    restore: vi.fn(),
  };
}

describe("logging and deleting with Last.fm connected", () => {
  it("queues the play's tracks, and Undo takes them off again", async () => {
    const lastFm = hooks();
    const showToast = vi.fn();
    const { result } = renderHook(() => useActions(() => {}, showToast, lastFm));
    const playedAt = new Date("2026-11-17T14:00:00Z");
    await act(async () => { await result.current.logPlay(record, "Side A", playedAt); });
    expect(lastFm.queueForPlay).toHaveBeenCalledWith(expect.objectContaining({ id: 77 }), record, "Side A", playedAt, "The Bends (Side A)");
    expect(showToast).toHaveBeenCalledWith("Logged The Bends (Side A)", expect.anything());
    await act(async () => { await showToast.mock.calls[0][1].undo(); });
    expect(lastFm.dropForPlay).toHaveBeenCalledWith(expect.objectContaining({ id: 77 }));
  });

  it("says when a play is too old for Last.fm", async () => {
    const lastFm = { ...hooks(), queueForPlay: vi.fn(() => "tooOld" as const) };
    const showToast = vi.fn();
    const { result } = renderHook(() => useActions(() => {}, showToast, lastFm));
    await act(async () => { await result.current.logPlay(record, "Full album", new Date("2026-10-01T10:00:00Z")); });
    expect(showToast.mock.calls[0][0]).toBe("Logged The Bends (too old for Last.fm)");
  });

  it("points to Last.fm after deleting a play that was scrobbled", async () => {
    const lastFm = hooks(true);
    const showToast = vi.fn();
    const { result } = renderHook(() => useActions(() => {}, showToast, lastFm));
    await act(async () => { await result.current.removePlay(samplePlays[1]); });
    expect(showToast.mock.calls[0][0]).toBe("Removed Rust In Peace. It's still on Last.fm");
    expect(showToast.mock.calls[0][1].link.href).toContain("https://www.last.fm/user/harunemre/library?from=2026-10-25");
  });
});

describe("what shows on screen", () => {
  it("shows a link in the message", () => {
    render(<Toast toast={{ id: 1, text: "Removed it", link: { href: "https://www.last.fm/user/x/library", label: "Last.fm" } }} onDone={() => {}} />);
    expect(screen.getByRole("link", { name: "Last.fm" }).getAttribute("href")).toBe("https://www.last.fm/user/x/library");
  });

  it("offers to connect, and once connected says what is waiting", () => {
    const connect = vi.fn(async () => {});
    const base = { queue: [], lastSentAt: null, sending: false, connect, disconnect: vi.fn(), sendNow: vi.fn() };
    const { rerender } = render(<LastFmSection {...base} link={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect Last.fm" }));
    expect(connect).toHaveBeenCalled();

    const queued = { id: "q", playId: 1, playKey: "k", label: "Discovery", playedAt: "", sendAfter: 0, tries: 0,
      scrobbles: [{ artist: "Daft Punk", track: "One More Time", timestamp: 1 }, { artist: "Daft Punk", track: "Aerodynamic", timestamp: 2 }] };
    rerender(<LastFmSection {...base} queue={[queued]} link={{ name: "harunemre", sessionKey: "sk", connectedAt: "" }} />);
    expect(screen.getByText(/Scrobbling as harunemre/)).toBeTruthy();
    expect(screen.getByText(/2 tracks from 1 play waiting/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send now" }));
    expect(base.sendNow).toHaveBeenCalled();

    rerender(<LastFmSection {...base} link={{ name: "harunemre", sessionKey: "sk", connectedAt: "", needsReconnect: true }} />);
    expect(screen.getByRole("button", { name: "Connect again" })).toBeTruthy();
  });
});
