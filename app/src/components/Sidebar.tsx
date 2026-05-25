import { Link, useLocation } from "react-router-dom";
import { Plus, MessageSquare } from "lucide-react";

type Props = { onNavigate?: () => void };

export function Sidebar({ onNavigate }: Props) {
  const location = useLocation();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-3 border-b border-border">
        <span className="font-semibold text-sm tracking-wide">Agent UI</span>
        <Link
          to="/"
          onClick={onNavigate}
          aria-label="New chat"
          className="inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-accent"
        >
          <Plus size={18} />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        <p className="px-2 pt-2 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
          Recent
        </p>
        <ul>
          {[{ id: "demo-1", title: "Weather in San Francisco" }].map((s) => {
            const active = location.pathname === `/c/${s.id}`;
            return (
              <li key={s.id}>
                <Link
                  to={`/c/${s.id}`}
                  onClick={onNavigate}
                  className={
                    "flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-accent " +
                    (active ? "bg-accent" : "")
                  }
                >
                  <MessageSquare size={14} className="text-muted-foreground" />
                  <span className="truncate">{s.title}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="px-3 py-3 border-t border-border text-[11px] text-muted-foreground">
        mock backend · phase 1
      </div>
    </div>
  );
}
