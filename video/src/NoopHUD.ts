import type { LeaderboardEntry, PlayerState } from "@shared/protocol";

/** Drop-in HUD replacement that draws nothing and creates no DOM elements. */
export class NoopHUD {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setLeaderboard(_entries: LeaderboardEntry[]) {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setPlayerStats(_mass: number, _kills: number) {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setRoomCode(_code: string) {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  addKillEvent(_killer: string, _victim: string) {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  showKillToast(_victim: string, _room: string) {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  showSnapshotToast(_handle: string, _room: string) {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setupKeyListeners(_room: string) {}
  destroy() {}
  draw(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _ctx: CanvasRenderingContext2D,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _w: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _h: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _players: PlayerState[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _localId: string,
  ) {}
}
