import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SpriteDesk } from "@/components/dev/SpriteDesk";

export const metadata: Metadata = {
  title: "Sprite desk",
  robots: { index: false, follow: false },
};

async function Desk({
  searchParams,
}: {
  searchParams: Promise<{ sheet?: string; row?: string; frame?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  return <SpriteDesk sheet={params.sheet} row={params.row} frame={params.frame} />;
}

export default function SpriteDeskPage({
  searchParams,
}: {
  searchParams: Promise<{ sheet?: string; row?: string; frame?: string }>;
}) {
  return (
    <Suspense fallback={<main className="grid min-h-dvh place-items-center bg-sea font-extrabold">Opening the sprite desk…</main>}>
      <Desk searchParams={searchParams} />
    </Suspense>
  );
}
