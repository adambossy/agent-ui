import { Menu } from "lucide-react";

type Props = { onMenuClick: () => void };

export function MobileHeader({ onMenuClick }: Props) {
  return (
    <header className="md:hidden flex items-center gap-2 px-3 h-12 border-b border-border bg-background sticky top-0 z-30">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open sidebar"
        className="inline-flex items-center justify-center w-11 h-11 -ml-2 rounded-md hover:bg-accent"
      >
        <Menu size={20} />
      </button>
      <span className="font-semibold text-sm">Agent UI</span>
    </header>
  );
}
