import { useEffect, useRef, useState } from "react";
import { ChevronRight, Brain } from "lucide-react";
import { Markdown } from "./Markdown";

type Props = {
  text: string;
  isStreaming: boolean;
};

const AUTO_CLOSE_MS = 1000;

export function Reasoning({ text, isStreaming }: Props) {
  const [open, setOpen] = useState(true);
  const startedAt = useRef<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const closedOnce = useRef(false);

  useEffect(() => {
    if (isStreaming && startedAt.current === null) {
      startedAt.current = Date.now();
      setOpen(true);
    }
    if (!isStreaming && startedAt.current !== null && duration === null) {
      setDuration(Math.ceil((Date.now() - startedAt.current) / 1000));
    }
  }, [isStreaming, duration]);

  useEffect(() => {
    if (!isStreaming && duration !== null && !closedOnce.current) {
      const t = setTimeout(() => {
        setOpen(false);
        closedOnce.current = true;
      }, AUTO_CLOSE_MS);
      return () => clearTimeout(t);
    }
  }, [isStreaming, duration]);

  const label = isStreaming
    ? "Thinking…"
    : duration !== null
      ? `Thought for ${duration}s`
      : "Thought";

  return (
    <div className="my-2 text-sm text-muted-foreground">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded hover:bg-accent text-[13px] cursor-pointer"
      >
        <ChevronRight
          size={13}
          className={"transition-transform " + (open ? "rotate-90" : "")}
        />
        <Brain size={13} />
        <span className={isStreaming ? "streaming-caret" : ""}>{label}</span>
      </button>
      {open && (
        <div className="mt-1.5 ml-6 pl-3 border-l-2 border-border leading-relaxed text-[13px]">
          <Markdown isStreaming={isStreaming}>{text}</Markdown>
        </div>
      )}
    </div>
  );
}
