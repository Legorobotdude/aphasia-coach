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

// Define types for chart axes
type PrimaryAxisOptions = {
  getValue: (datum: SessionData) => string;
  formatters: {
    scale: (value: string) => string;
    tooltip: (value: string) => React.ReactNode;
  };
  scaleType: "band";
};

type SecondaryAxisOptions = {
  getValue: (datum: SessionData) => number;
  elementType: "bar";
  formatters: {
    tooltip: (value: number | null) => string;
    scale: (value: number | null) => string;
  };
  min: number;
};

export default function LatencyChart({ data }: LatencyChartProps) {
  const primaryAxis = React.useMemo(
    (): PrimaryAxisOptions => ({
      getValue: (datum: SessionData) =>
        datum.date.toLocaleDateString([], { month: "short", day: "numeric" }),
      formatters: {
        scale: (value: string) => value || "-",
        tooltip: (value: string) => {
          if (!value) return "Invalid Date";
          return (
            <>
              Session on <strong>{value}</strong>
            </>
          );
        },
      },
      scaleType: "band",
    }),
    [],
  );

  const secondaryAxes = React.useMemo(
    (): SecondaryAxisOptions[] => [
      {
        getValue: (datum: SessionData) => datum.latencyMs,
        elementType: "bar",
        formatters: {
          tooltip: (value: number | null) =>
            value !== null
              ? `${(value / 1000).toFixed(1)}s avg latency`
              : "N/A",
          scale: (value: number | null) =>
            value !== null ? `${value / 1000}s` : "N/A",
        },
        min: 0,
      },
    ],
    [],
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

  type SeriesStyle = {
    color: string;
  };

  const getSeriesStyle = React.useCallback((): SeriesStyle => {
    return {
      color: `url(#latencyGradient)`,
    };
  }, []);

  type DatumStyle = {
    fill: string;
  };

  interface DatumWithOriginalDatum {
    originalDatum?: SessionData;
  }

  const getDatumStyle = React.useCallback(
    (datum: DatumWithOriginalDatum): DatumStyle => {
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

                  const formattedSecondary = secondaryAxes[0].formatters
                    ?.tooltip
                    ? secondaryAxes[0].formatters.tooltip(secondaryValue)
                    : secondaryValue;

                  return (
                    <div className="text-xs p-1 bg-gray-800 text-white rounded shadow">
                      {formattedPrimary} <br />{" "}
                      {/* Render potentially JSX primary label */}
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
