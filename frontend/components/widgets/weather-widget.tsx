"use client";
import { useEffect, useState } from "react";
import { api } from "../../lib/api-client";
import type { WeatherData } from "../../lib/types";

interface WeatherWidgetProps {
  sessionKey: string;
}

export function WeatherWidget({ sessionKey }: WeatherWidgetProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const data = await api.weather(sessionKey);
        setWeather(data);
      } catch (err) {
        console.error("Failed to fetch weather:", err);
        setWeather({
          air_temp_c: null,
          track_temp_c: null,
          humidity_pct: null,
          wind_speed_ms: null,
          wind_direction_deg: null,
          rainfall: null,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchWeather();
    const interval = setInterval(fetchWeather, 60000);
    return () => clearInterval(interval);
  }, [sessionKey]);

  if (loading || !weather) return null;

  const air = weather.air_temp_c !== null ? Math.round(weather.air_temp_c) : "—";
  const track =
    weather.track_temp_c !== null ? Math.round(weather.track_temp_c) : "—";
  const wind =
    weather.wind_speed_ms !== null
      ? weather.wind_speed_ms.toFixed(1)
      : "—";
  const rain = weather.rainfall ? "🌧" : "";

  return (
    <div className="flex items-center gap-3 text-xs text-f1-text-dim font-data whitespace-nowrap">
      <span>Air {air}°</span>
      <span>Track {track}°</span>
      <span>Wind {wind}m/s</span>
      {rain && <span>{rain}</span>}
    </div>
  );
}
