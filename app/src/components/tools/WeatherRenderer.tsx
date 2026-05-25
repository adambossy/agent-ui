import type { ToolRendererProps } from "../../tools/registry";

type WeatherOutput = {
  location: string;
  temperatureC: number;
  temperatureF: number;
  condition: string;
  high: number;
  low: number;
  sunrise: string;
  sunset: string;
  hourly: Array<{ hour: string; temp: number; icon: string }>;
};

export function WeatherRenderer({ part }: ToolRendererProps) {
  if (part.state === "input-streaming" || part.state === "input-available") {
    const loc = (part.input as { location?: string } | undefined)?.location ?? "…";
    return (
      <div className="my-3 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
        <span className="pulse-dot">●</span>{" "}
        <span>Fetching weather for {loc}…</span>
      </div>
    );
  }

  if (part.state === "output-error") {
    return (
      <div className="my-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        Weather lookup failed: {part.errorText ?? "unknown error"}
      </div>
    );
  }

  const w = part.output as WeatherOutput | undefined;
  if (!w) return null;

  return (
    <div
      className="my-3 rounded-2xl px-4 py-4 text-white shadow-md overflow-hidden max-w-[420px]"
      style={{
        background:
          "linear-gradient(135deg, #4a90e2 0%, #4ea1ff 45%, #6ab7ff 100%)",
      }}
    >
      <div className="flex items-start justify-between text-sm/5">
        <div>
          <div className="font-medium">{w.location}</div>
          <div className="opacity-80 text-xs mt-0.5">{w.condition}</div>
        </div>
        <div className="text-right text-xs opacity-80">
          <div>H: {w.high}°</div>
          <div>L: {w.low}°</div>
        </div>
      </div>

      <div className="mt-2 flex items-end gap-2">
        <span className="text-5xl font-light leading-none">
          {Math.round(w.temperatureC)}
        </span>
        <span className="text-sm pb-2 opacity-80">°C · {Math.round(w.temperatureF)}°F</span>
      </div>

      <div className="mt-4 rounded-xl bg-white/15 px-3 py-2.5 backdrop-blur-sm">
        <div className="text-[11px] opacity-80 mb-1.5">Hourly forecast</div>
        <div className="flex gap-3 overflow-x-auto">
          {w.hourly.map((h) => (
            <div key={h.hour} className="flex flex-col items-center text-xs min-w-[42px]">
              <span className="opacity-80">{h.hour}</span>
              <span className="my-1">☁︎</span>
              <span className="font-medium">{h.temp}°</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex justify-between text-[11px] opacity-80">
        <span>Sunrise: {w.sunrise}</span>
        <span>Sunset: {w.sunset}</span>
      </div>
    </div>
  );
}
