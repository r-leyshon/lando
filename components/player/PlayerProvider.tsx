"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { setMuted, unlockAudio } from "@/lib/sound";
import {
  loadProfile,
  mergeProfiles,
  saveProfile,
  snapshotAhead,
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

export type Gate = "checking" | "in" | "out" | "offline";

type PlayerContextValue = {
  ready: boolean;
  gate: Gate;
  profile: Profile | null;
  setProfile: (profile: Profile) => void;
  syncProgress: (profile: Profile, input: ProgressInput) => void;
  refresh: () => Promise<void>;
  signIn: (credential: string) => Promise<string | null>;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [gate, setGate] = useState<Gate>("checking");
  const [profile, setProfileState] = useState<Profile | null>(null);
  const generation = useRef(0);
  const refreshFlight = useRef<Promise<void> | null>(null);

  const setProfile = useCallback((next: Profile) => {
    saveProfile(next);
    setProfileState(next);
  }, []);

  const refresh = useCallback(async () => {
    if (refreshFlight.current) return refreshFlight.current;
    const gen = ++generation.current;
    const flight = runRefresh(gen);
    refreshFlight.current = flight;
    try {
      await flight;
    } finally {
      if (refreshFlight.current === flight) refreshFlight.current = null;
    }
  }, []);

  async function runRefresh(gen: number) {
    const cached = loadProfile();
    if (cached) setProfileState((current) => current ?? cached);
    try {
      const response = await fetch("/api/me", { cache: "no-store" });
      if (generation.current !== gen) return;
      if (response.status === 401) {
        setGate("out");
        setReady(true);
        return;
      }
      if (!response.ok) throw new Error("score book");
      const remote = (await response.json()) as Profile;
      if (generation.current !== gen) return;
      let merged = mergeProfiles(cached, remote);
      if (snapshotAhead(cached, remote)) {
        const saved = await fetch("/api/me", {
          method: "POST",
          headers: { "content-type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ stats: merged.stats, bestStreaks: merged.bestStreaks }),
        });
        if (saved.ok) merged = mergeProfiles(cached, (await saved.json()) as Profile);
      }
      if (generation.current !== gen) return;
      merged = { ...merged, muted: cached?.muted ?? false };
      saveProfile(merged);
      setProfileState(merged);
      setGate("in");
    } catch {
      if (generation.current !== gen) return;
      setGate(cached ? "offline" : "offline");
    } finally {
      if (generation.current === gen) setReady(true);
    }
  }

  useEffect(() => {
    const cached = loadProfile();
    if (cached) setProfileState(cached);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setMuted(profile?.muted ?? false);
  }, [profile?.muted]);

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  function syncProgress(next: Profile, input: ProgressInput) {
    setProfile(next);
    const stat = next.stats[input.iso];
    void fetch("/api/progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        iso: input.iso,
        outcome: input.outcome,
        mode: input.mode,
        board: input.board,
        streak: input.streak,
        runId: input.runId,
        startedAt: input.startedAt,
        completed: input.completed,
        durationMs: Date.now() - input.startedAt,
        correct: stat?.correct ?? 0,
        miss: stat?.miss ?? 0,
        nearMiss: stat?.nearMiss ?? 0,
        struggle: stat?.struggle ?? 0,
      }),
    }).catch(() => undefined);
  }

  async function signIn(credential: string) {
    generation.current += 1;
    const local = loadProfile();
    try {
      const response = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          credential,
          local: local
            ? { id: local.id, recoveryCode: local.recoveryCode, stats: local.stats, bestStreaks: local.bestStreaks }
            : null,
        }),
      });
      const payload = (await response.json().catch(() => null)) as (Profile & { error?: string }) | null;
      if (!response.ok || !payload?.id) return payload?.error ?? "I could not sign in with Google.";
      const merged = mergeProfiles(local, payload);
      merged.muted = local?.muted ?? false;
      setProfile(merged);
      setGate("in");
      setReady(true);
      return null;
    } catch {
      return "I could not sign in with Google.";
    }
  }

  return (
    <PlayerContext.Provider value={{ ready, gate, profile, setProfile, syncProgress, refresh, signIn }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const value = useContext(PlayerContext);
  if (!value) throw new Error("usePlayer must be used inside PlayerProvider");
  return value;
}
