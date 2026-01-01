import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="min-h-[50vh] w-full flex items-center justify-center">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading...</span>
      </div>
    </div>
  );
}
