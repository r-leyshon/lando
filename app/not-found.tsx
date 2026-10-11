import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-sea px-6 text-center">
      <div>
        <h1 className="font-pixel text-sm">Off the map</h1>
        <p className="mt-3 font-extrabold">That page is not one of Lando&apos;s games.</p>
        <Link href="/" className="chunky mt-4 inline-flex min-h-12 items-center bg-pick px-4 font-extrabold">
          Back home
        </Link>
      </div>
    </main>
  );
}
