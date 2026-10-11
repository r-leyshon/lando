import { Suspense } from "react";
import { LeaderboardScreen } from "@/components/leaderboard/LeaderboardScreen";

export default function Page() {
  return (
    <Suspense fallback={<div className="h-dvh bg-sea" />}>
      <LeaderboardScreen />
    </Suspense>
  );
}
