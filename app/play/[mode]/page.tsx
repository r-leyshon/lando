import { Suspense } from "react";
import { notFound } from "next/navigation";
import { GameScreen } from "@/components/game/GameScreen";
import { isMode } from "@/lib/boards";

async function PlayPage({ params }: { params: Promise<{ mode: string }> }) {
  const { mode } = await params;
  if (!isMode(mode)) notFound();
  return <GameScreen mode={mode} />;
}

export default function Page({ params }: { params: Promise<{ mode: string }> }) {
  return (
    <Suspense fallback={<div className="h-dvh bg-sea" />}>
      <PlayPage params={params} />
    </Suspense>
  );
}
