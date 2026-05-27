import { Outlet } from "react-router-dom";
import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { MobileHeader } from "./components/MobileHeader";

export function App() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex h-full w-full bg-background text-foreground">
      {/* Desktop sidebar — visible md+ */}
      <aside className="hidden md:flex md:w-[260px] md:shrink-0 md:flex-col border-r border-border">
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          onClick={() => setDrawerOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <aside
            className="absolute left-0 top-0 bottom-0 w-[280px] max-w-[80%] flex flex-col bg-background border-r border-border shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <MobileHeader onMenuClick={() => setDrawerOpen(true)} />
        <Outlet />
      </main>
    </div>
  );
}
