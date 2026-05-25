import type { ToolRendererProps } from "../../tools/registry";

type HourlyRow = { hour: string; temp: number; icon?: string };

// Mock shape: hand-built in src/mock/turns/weather.ts.
type MockShape = {
  location: string;
  temperatureC: number;
  temperatureF: number;
  condition: string;
  high: number;
  low: number;
  sunrise: string;
  sunset: string;
  hourly: HourlyRow[];
};

// Template shape: raw open-meteo response, decorated with `cityName`.
type OpenMeteoShape = {
  cityName?: string;
  current?: { temperature_2m?: number; time?: string };
  current_units?: { temperature_2m?: string };
  hourly?: { time?: string[]; temperature_2m?: number[] };
  hourly_units?: { temperature_2m?: string };
  daily?: { sunrise?: string[]; sunset?: string[] };
  timezone?: string;
  error?: string;
};

type Normalized = {
  location: string;
  temperatureC: number;
  temperatureF: number;
  condition: string | null;
  high: number | null;
  low: number | null;
  sunrise: string | null;
  sunset: string | null;
  hourly: HourlyRow[];
};

function looksLikeMock(o: unknown): o is MockShape {
  return (
    !!o &&
    typeof o === "object" &&
    Array.isArray((o as MockShape).hourly) &&
    typeof (o as MockShape).temperatureC === "number"
  );
}

function normalize(output: unknown): Normalized | null {
  if (!output || typeof output !== "object") return null;
  if (looksLikeMock(output)) {
    const m = output as MockShape;
    return {
      location: m.location,
      temperatureC: m.temperatureC,
      temperatureF: m.temperatureF,
      condition: m.condition,
      high: m.high,
      low: m.low,
      sunrise: m.sunrise,
      sunset: m.sunset,
      hourly: m.hourly,
    };
  }
  const o = output as OpenMeteoShape;
  if (o.error) return null;
  const c = o.current?.temperature_2m;
  if (typeof c !== "number") return null;
  const times = o.hourly?.time ?? [];
  const temps = o.hourly?.temperature_2m ?? [];
  const rows: HourlyRow[] = [];
  for (let i = 0; i < Math.min(6, times.length); i++) {
    const t = temps[i];
    if (typeof t !== "number") continue;
    const hour = i === 0 ? "Now" : timeOfDay(times[i]);
    rows.push({ hour, temp: Math.round(t) });
  }
  const high = temps.length ? Math.round(Math.max(...temps.slice(0, 24))) : null;
  const low = temps.length ? Math.round(Math.min(...temps.slice(0, 24))) : null;
  return {
    location: o.cityName ?? "Location",
    temperatureC: c,
    temperatureF: c * (9 / 5) + 32,
    condition: null,
    high,
    low,
    sunrise: extractHm(o.daily?.sunrise?.[0]),
    sunset: extractHm(o.daily?.sunset?.[0]),
    hourly: rows,
  };
}

function timeOfDay(iso?: string): string {
  if (!iso) return "";
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return "";
  const h = parseInt(m[1], 10);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}${suffix}`;
}

function extractHm(iso?: string): string | null {
  if (!iso) return null;
  const m = /T(\d{2}:\d{2})/.exec(iso);
  if (!m) return null;
  const [h, mm] = m[1].split(":").map((x) => parseInt(x, 10));
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${mm.toString().padStart(2, "0")} ${suffix}`;
}

export function WeatherRenderer({ part }: ToolRendererProps) {
  if (part.state === "input-streaming" || part.state === "input-available") {
    const loc =
      (part.input as { location?: string; city?: string } | undefined)?.location ??
      (part.input as { location?: string; city?: string } | undefined)?.city ??
      "…";
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

  const w = normalize(part.output);
  if (!w) {
    return (
      <div className="my-3 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
        Weather returned no data.
      </div>
    );
  }

  return (
    <div
      className="my-3 rounded-2xl px-4 py-4 text-white shadow-md overflow-hidden max-w-[420px]"
      style={{
        background: "linear-gradient(135deg, #4a90e2 0%, #4ea1ff 45%, #6ab7ff 100%)",
      }}
    >
      <div className="flex items-start justify-between text-sm/5">
        <div>
          <div className="font-medium">{w.location}</div>
          {w.condition && <div className="opacity-80 text-xs mt-0.5">{w.condition}</div>}
        </div>
        {(w.high !== null || w.low !== null) && (
          <div className="text-right text-xs opacity-80">
            {w.high !== null && <div>H: {w.high}°</div>}
            {w.low !== null && <div>L: {w.low}°</div>}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-end gap-2">
        <span className="text-5xl font-light leading-none">{Math.round(w.temperatureC)}</span>
        <span className="text-sm pb-2 opacity-80">
          °C · {Math.round(w.temperatureF)}°F
        </span>
      </div>

      {w.hourly.length > 0 && (
        <div className="mt-4 rounded-xl bg-white/15 px-3 py-2.5 backdrop-blur-sm">
          <div className="text-[11px] opacity-80 mb-1.5">Hourly forecast</div>
          <div className="flex gap-3 overflow-x-auto">
            {w.hourly.map((h, i) => (
              <div key={i} className="flex flex-col items-center text-xs min-w-[42px]">
                <span className="opacity-80">{h.hour}</span>
                <span className="my-1">☁︎</span>
                <span className="font-medium">{h.temp}°</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(w.sunrise || w.sunset) && (
        <div className="mt-3 flex justify-between text-[11px] opacity-80">
          {w.sunrise && <span>Sunrise: {w.sunrise}</span>}
          {w.sunset && <span>Sunset: {w.sunset}</span>}
        </div>
      )}
    </div>
  );
}
