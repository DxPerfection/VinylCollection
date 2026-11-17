// Turning plays into scrobbles, and the waiting list on the phone
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  dropQueued, LastFmProblem, libraryDayUrl, markSent, nextDueAt, oldestMs, playStatus, putBack, queuePlay, readQueue, scrobblesFor,
  sendQueued, tooOld, tracksForPart, wasSent, type Scrobble,
} from "../src/lib/lastFm";
import { playKey } from "../src/lib/offline";
import type { PlayRow } from "../src/lib/records";
import { sampleRecord } from "./sampleData";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

const discovery = sampleRecord(1, {
  Artist: "Daft Punk", AlbumName: "Discovery", DurationMins: 60,
  Tracklist: "One More Time | Aerodynamic | Digital Love | Harder, Better, Faster, Stronger | Crescendolls | Nightvision",
});

describe("which tracks a play covers", () => {
  it("takes every track for a full album and halves for the sides", () => {
    expect(tracksForPart(discovery, "Full album")).toHaveLength(6);
    expect(tracksForPart(discovery, "Side A").map((item) => item.number)).toEqual([1, 2, 3]);
    expect(tracksForPart(discovery, "Side B").map((item) => item.track)).toEqual(["Harder, Better, Faster, Stronger", "Crescendolls", "Nightvision"]);
  });

  it("splits by the saved side lengths, and gives an odd track to the last side", () => {
    const double = { ...discovery, SideMins: "A:10|B:10|C:20|D:20" };
    expect(tracksForPart(double, "Side A").map((item) => item.number)).toEqual([1]);
    expect(tracksForPart(double, "Side B").map((item) => item.number)).toEqual([2]);
    expect(tracksForPart(double, "Side C").map((item) => item.number)).toEqual([3, 4]);
    expect(tracksForPart(double, "Side D").map((item) => item.number)).toEqual([5, 6]);
    const odd = { ...discovery, Tracklist: "a | b | c" };
    expect(tracksForPart(odd, "Side A").map((item) => item.track)).toEqual(["a", "b"]);
    expect(tracksForPart(odd, "Side B").map((item) => item.track)).toEqual(["c"]);
  });

  it("has nothing to send without a tracklist or artist", () => {
    expect(scrobblesFor({ ...discovery, Tracklist: "" }, "Full album", new Date())).toEqual([]);
    expect(scrobblesFor({ ...discovery, Artist: null }, "Full album", new Date())).toEqual([]);
  });
});

describe("track times", () => {
  it("start at the logged time and follow each other over the play's minutes", () => {
    const start = new Date("2026-11-17T14:00:00Z");
    const scrobbles = scrobblesFor(discovery, "Side B", start);
    const startSeconds = start.getTime() / 1000;
    expect(scrobbles.map((item) => item.timestamp - startSeconds)).toEqual([0, 600, 1200]); // 30 minutes over 3 tracks
    expect(scrobbles[0]).toMatchObject({ artist: "Daft Punk", album: "Discovery", track: "Harder, Better, Faster, Stronger", duration: 600, trackNumber: 4 });
  });

  it("knows when a play is too old for Last.fm", () => {
    const now = Date.parse("2026-11-17T14:00:00Z");
    expect(tooOld(scrobblesFor(discovery, "Full album", new Date(now - oldestMs - 60000)), now)).toBe(true);
    expect(tooOld(scrobblesFor(discovery, "Full album", new Date(now - 13 * 86400000)), now)).toBe(false);
  });

  it("links to that day in the Last.fm library", () => {
    expect(libraryDayUrl("harunemre", new Date(2026, 10, 7, 20, 0))).toBe("https://www.last.fm/user/harunemre/library?from=2026-11-07&rangetype=1day");
  });
});

const play: PlayRow = { id: 50, Date: "2026-11-17T14:00:00+00:00", AlbumName: "Discovery", DurationMins: 60, VinylID: 1 };
const start = Date.parse("2026-11-17T14:00:00Z");

function queueDiscovery(sendAfter = start + 8000) {
  return queuePlay({
    playId: play.id, playKey: playKey(play), label: "Discovery", playedAt: new Date(start).toISOString(),
    scrobbles: scrobblesFor(discovery, "Full album", new Date(start)), sendAfter,
  });
}

const accepting = () => vi.fn(async (list: Scrobble[]) => ({ accepted: list.length, ignored: 0, ignoredCodes: [] }));

describe("the waiting list", () => {
  it("can take a play off and put it back", () => {
    const queued = queueDiscovery();
    expect(playStatus(play, readQueue())).toBe("waiting");
    expect(dropQueued({ ...play, id: 999 })?.id).toBe(queued.id); // found by its details after getting a new id
    expect(readQueue()).toEqual([]);
    putBack(queued);
    expect(readQueue()).toHaveLength(1);
  });

  it("waits for the Undo message to go", async () => {
    queueDiscovery();
    const send = accepting();
    await sendQueued(send, start + 5000);
    expect(send).not.toHaveBeenCalled();
  });

  it("sends only the tracks that have played, then the rest later", async () => {
    queueDiscovery();
    const send = accepting();
    // 10 minutes a track: at 25 minutes in, tracks 1 to 3 have half played
    const first = await sendQueued(send, start + 25 * 60000);
    expect(send.mock.calls[0][0].map((item) => item.trackNumber)).toEqual([1, 2, 3]);
    expect(first).toMatchObject({ tracks: 3, sentPlays: [], problem: null });
    expect(readQueue()[0].scrobbles).toHaveLength(3);
    expect(wasSent(play)).toBe(true);
    expect(nextDueAt()).toBe(start + 34 * 60000); // track 4 counts 4 minutes in

    const second = await sendQueued(send, start + 2 * 3600000);
    expect(send.mock.calls[1][0].map((item) => item.trackNumber)).toEqual([4, 5, 6]);
    expect(second.sentPlays).toEqual(["Discovery"]);
    expect(readQueue()).toEqual([]);
    expect(playStatus(play, [])).toBe("sent");
  });

  it("keeps everything when there's no signal or Last.fm is slow", async () => {
    queueDiscovery();
    const send = vi.fn(async () => { throw new LastFmProblem("timeout", "slow"); });
    const result = await sendQueued(send, start + 2 * 3600000);
    expect(result.problem?.kind).toBe("timeout");
    expect(readQueue()[0].scrobbles).toHaveLength(6);
  });

  it("gives up on a play Last.fm refuses three times", async () => {
    queueDiscovery();
    const send = vi.fn(async () => { throw new LastFmProblem("refused", "Invalid parameters"); });
    await sendQueued(send, start + 2 * 3600000);
    await sendQueued(send, start + 2 * 3600000);
    expect(readQueue()[0].tries).toBe(2);
    const result = await sendQueued(send, start + 2 * 3600000);
    expect(result.dropped).toEqual(["Discovery"]);
    expect(readQueue()).toEqual([]);
  });

  it("drops a play that waited more than two weeks", async () => {
    queueDiscovery();
    const send = accepting();
    const result = await sendQueued(send, start + 15 * 86400000);
    expect(send).not.toHaveBeenCalled();
    expect(result.dropped).toEqual(["Discovery"]);
  });

  it("remembers only the newest 500 sent plays", () => {
    for (let index = 0; index < 505; index += 1) markSent(`key${index}`, index);
    expect(wasSent({ ...play, Date: "x" })).toBe(false);
    expect(Object.keys(JSON.parse(localStorage.getItem("lastFmSent") ?? "{}"))).toHaveLength(500);
  });
});
