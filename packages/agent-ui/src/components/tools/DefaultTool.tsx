import { useState } from "react";
import { ChevronRight, Wrench, Loader2, Check, AlertCircle } from "lucide-react";
import type { ToolRendererProps } from "../../tools/registry";

const STATUS: Record<
  string,
  { label: string; tone: string; Icon: typeof Wrench }
> = {
  "input-streaming": { label: "Pending", tone: "text-muted-foreground", Icon: Loader2 },
  "input-available": { label: "Running", tone: "text-foreground", Icon: Loader2 },
  "output-available": { label: "Completed", tone: "text-emerald-600", Icon: Check },
  "output-error": { label: "Error", tone: "text-destructive", Icon: AlertCircle },
  "output-denied": { label: "Denied", tone: "text-orange-600", Icon: AlertCircle },
  "approval-requested": { label: "Awaiting approval", tone: "text-yellow-600", Icon: Wrench },
  "approval-responded": { label: "Responded", tone: "text-blue-600", Icon: Check },
};

export function DefaultTool({ part }: ToolRendererProps) {
  const [open, setOpen] = useState(false);
  const toolName = part.type.slice("tool-".length);
  const s = STATUS[part.state] ?? STATUS["input-streaming"];
  const isRunning = part.state === "input-available" || part.state === "input-streaming";

  return (
    <div className="my-2 rounded-lg border border-border bg-card text-card-foreground overflow-hidden max-w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors cursor-pointer"
      >
        <ChevronRight
          size={14}
          className={
            "shrink-0 transition-transform " + (open ? "rotate-90" : "")
          }
        />
        <Wrench size={14} className="shrink-0 text-muted-foreground" />
        <span className="font-mono text-[13px] font-medium truncate">{toolName}</span>
        <span
          className={
            "ml-auto inline-flex items-center gap-1 text-[11px] uppercase tracking-wider " +
            s.tone
          }
        >
          <s.Icon size={12} className={isRunning ? "animate-spin" : ""} />
          {s.label}
        </span>
      </button>

      {open && (
        <div className="border-t border-border bg-muted/40">
          {part.input !== undefined && (
            <div className="px-3 py-2">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                Parameters
              </div>
              <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                {JSON.stringify(part.input, null, 2)}
              </pre>
            </div>
          )}
          {part.output !== undefined && (
            <div className="px-3 py-2 border-t border-border">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                Result
              </div>
              <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                {typeof part.output === "string"
                  ? part.output
                  : JSON.stringify(part.output, null, 2)}
              </pre>
            </div>
          )}
          {part.errorText && (
            <div className="px-3 py-2 border-t border-destructive/30 bg-destructive/10 text-destructive">
              {part.errorText}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
