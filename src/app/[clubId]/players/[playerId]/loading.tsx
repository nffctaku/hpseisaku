import Image from "next/image";

export default function Loading() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Image
          src="/favicon.png"
          alt="Loading"
          width={64}
          height={64}
          className="opacity-90 animate-pulse"
          priority
        />
        <p className="text-sm text-muted-foreground">読み込み中</p>
      </div>
    </main>
  );
}
