/** Stub for src/share.ts — replaces browser/Vite-only module in Remotion builds. */
import type { DeathStats } from "@shared/protocol";

export function buildShareUrl(
  _type: "death" | "leaderboard" | "invite" | "challenge",
  _stats?: DeathStats,
  _roomCode?: string,
): string {
  return "";
}

export function copyRoomLink(_roomCode: string): void {}

export function httpFromWs(wsUrl: string): string {
  return wsUrl.replace(/^ws/, "http").replace(/\/ws$/, "");
}

export function buildCardUrl(
  _stats: DeathStats,
  _roomCode: string,
  _serverUrl: string,
): string {
  return "";
}
