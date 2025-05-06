import React from "react";
import { Chart } from "react-charts";

// TODO: Replace with actual session data type from lib/types/firestore.ts
// TODO: Fetch real data in parent component and pass as props
interface SessionData {
  date: Date;
  latencyMs: number;
  sessionNumber?: number; // Made optional
}

interface LatencyChartProps {
  data: SessionData[];
}

// Define the recommended zone (0-3 seconds)
const RECOMMENDED_LATENCY_MAX_MS = 3000;

// Let react-charts handle its own typing by using inferred types
export default function LatencyChart({ data }: LatencyChartProps) {
  const primaryAxis = React.useMemo(
    () => ({
      getValue: (datum: SessionData) =>
        datum.date.toLocaleDateString([], { month: "short", day: "numeric" }),
      formatters: {
        // @ts-expect-error - react-charts has complex typing that's difficult to match exactly
        scale: (value) => value || "-",
        // @ts-expect-error - react-charts has complex typing that's difficult to match exactly
        tooltip: (value) => {
          if (!value) return "Invalid Date";
          return `Session on ${value}`;
        },
      },
      scaleType: "band" as const,
    }),
    []
  );

  const secondaryAxes = React.useMemo(
    () => [
      {
        getValue: (datum: SessionData) => datum.latencyMs,
        elementType: "bar" as const,
        formatters: {
          // @ts-expect-error - react-charts has complex typing that's difficult to match exactly
          tooltip: (value) =>
            value !== null
              ? `${(value / 1000).toFixed(1)}s avg latency`
              : "N/A",
          // @ts-expect-error - react-charts has complex typing that's difficult to match exactly
          scale: (value) =>
            value !== null ? `${value / 1000}s` : "N/A",
        },
        min: 0,
      },
    ],
    []
  );

  const chartData = React.useMemo(
    () => [
      {
        label: "Latency",
        data: data,
      },
    ],
    [data],
  );

  const getSeriesStyle = React.useCallback(() => {
    return {
      color: `url(#latencyGradient)`,
    };
  }, []);

  const getDatumStyle = React.useCallback(
    (datum: { originalDatum?: SessionData }) => {
      const latency = datum.originalDatum?.latencyMs;
      let color = "#d1d5db"; // Default gray
      if (latency !== undefined) {
        if (latency <= RECOMMENDED_LATENCY_MAX_MS) {
          color = "#22c55e"; // Green
        } else {
          color = "#facc15"; // Yellow
        }
      }
      return { fill: color };
    },
    [],
  );

  // TODO: Implement the visual 'recommended zone' band (0-3s) on the chart.

  return (
    <div className="p-4 border rounded shadow-sm bg-white h-64 md:h-80">
      <h2 className="text-lg font-semibold mb-2 text-center">
        Response Latency (Avg)
      </h2>
      {data && data.length > 0 ? (
        <>
          <svg width="0" height="0" style={{ position: "absolute" }}>
            <defs>
              <linearGradient id="latencyGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#facc15" />
                <stop offset="100%" stopColor="#22c55e" />
              </linearGradient>
            </defs>
          </svg>
          <Chart
            options={{
              data: chartData,
              primaryAxis,
              secondaryAxes,
              tooltip: {
                render: ({ focusedDatum }) => {
                  if (!focusedDatum?.originalDatum) return null;
                  const originalDatum =
                    focusedDatum.originalDatum as SessionData;
                  const primaryValue = primaryAxis.getValue(originalDatum);
                  const secondaryValue =
                    secondaryAxes[0].getValue(originalDatum);

                  // Get formatted values using the defined formatters (if they exist)
                  const formattedPrimary = primaryAxis.formatters?.tooltip
                    ? primaryAxis.formatters.tooltip(primaryValue)
                    : primaryValue;

                  // No need for optional chaining since we know formatters exists
                  const formattedSecondary = secondaryAxes[0].formatters.tooltip(secondaryValue) || secondaryValue;

                  return (
                    <div className="text-xs p-1 bg-gray-800 text-white rounded shadow">
                      {formattedPrimary} <br />
                      Avg Latency: {formattedSecondary}
                    </div>
                  );
                },
              },
              getSeriesStyle,
              getDatumStyle,
            }}
          />
        </>
      ) : (
        <div className="flex items-center justify-center h-full text-gray-500">
          No session data yet.
        </div>
      )}
    </div>
  );
}
