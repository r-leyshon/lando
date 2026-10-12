export function FlagPrompt({ iso }: { iso: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#9ed7ea]">
      <img
        src={`/flags/${iso.toLowerCase()}.svg`}
        alt="A mystery flag"
        draggable={false}
        className="chunky absolute inset-4 m-auto h-auto w-auto max-h-[calc(100%-2rem)] max-w-[calc(100%-2rem)] bg-paper object-contain"
      />
    </div>
  );
}
