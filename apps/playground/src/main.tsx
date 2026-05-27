import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { App } from "./App";
import { ChatScreen } from "./screens/ChatScreen";
// Side-effect: every extension's index.ts calls registerLiveComponent at
// module top level. The host's import graph is the live-component registry.
import "./extensions";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          <Route path="/" element={<ChatScreen />} />
          <Route path="/c/:sessionId" element={<ChatScreen />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
