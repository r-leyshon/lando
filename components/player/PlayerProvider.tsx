"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { setMuted, unlockAudio } from "@/lib/sound";
import {
  createProfile,
  formatCode,
  loadProfile,
  normalizeCode,
  saveProfile,
  type Outcome,
  type Profile,
} from "@/lib/profile";
import type { GameMode } from "@/lib/boards";

type ProgressInput = {
  iso: string;
  outcome: Outcome;
  mode: GameMode;
  board: string;
  streak: number;
  runId: string;
  startedAt: number;
  completed: boolean;
};

type PlayerContextValue = {
  ready: boolean;
  profile: Profile | null;
  setProfile: (profile: Profile) => void;
  syncProgress: (profile: Profile, input: ProgressInput) => void;
  restore: (code: string) => Promise<string | null>;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error ?? "Lando could not save that.");
  return payload;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfileState] = useState<Profile | null>(null);

  useEffect(() => {
    setProfileState(loadProfile());
    setReady(true);
  }, []);

  useEffect(() => {
    setMuted(profile?.muted ?? false);
  }, [profile?.muted]);

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  function setProfile(next: Profile) {
    saveProfile(next);
    setProfileState(next);
  }

  function syncProgress(next: Profile, input: ProgressInput) {
    setProfile(next);
    void postJson("/api/progress", {
      playerId: next.id,
      nickname: next.nickname,
      recoveryCode: next.recoveryCode,
      ...input,
      durationMs: Date.now() - input.startedAt,
    }).catch(() => undefined);
  }

  async function restore(code: string) {
    const normalized = normalizeCode(code);
    if (!/^[A-Z0-9]{6}$/.test(normalized)) return "Codes look like this: ABC-123.";
    const local = loadProfile();
    if (local && local.recoveryCode === normalized) {
      setProfile({ ...local, seenCode: true });
      return null;
    }
    try {
      const response = await fetch("/api/players/restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recoveryCode: normalized }),
      });
      const payload = (await response.json()) as Profile & { error?: string; database?: boolean };
      if (!response.ok) {
        if (payload.database === false) {
          return "That code is not on this phone. A grown-up can connect the score database to move saves between devices.";
        }
        return payload.error ?? "Lando could not find that code.";
      }
      const restored: Profile = {
        id: payload.id,
        nickname: payload.nickname,
        recoveryCode: payload.recoveryCode,
        muted: Boolean(payload.muted),
        seenCode: true,
        stats: payload.stats ?? {},
        bestStreaks: payload.bestStreaks ?? {},
      };
      setProfile(restored);
      return null;
    } catch {
      return "Lando could not reach the score book just now.";
    }
  }

  return (
    <PlayerContext.Provider value={{ ready, profile, setProfile, syncProgress, restore }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const value = useContext(PlayerContext);
  if (!value) throw new Error("usePlayer must be used inside PlayerProvider");
  return value;
}

export function rememberPlayer(nickname: string) {
  const profile = createProfile(nickname);
  saveProfile(profile);
  void postJson("/api/players", {
    id: profile.id,
    nickname: profile.nickname,
    recoveryCode: profile.recoveryCode,
  }).catch(() => undefined);
  return profile;
}

export { formatCode };
