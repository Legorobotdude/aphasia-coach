import React from 'react';
import { Chart, type AxisOptions } from 'react-charts';

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
const RECOMMENDED_LATENCY_MIN_MS = 0;
const RECOMMENDED_LATENCY_MAX_MS = 3000;

export default function LatencyChart({ data }: LatencyChartProps) {
  const primaryAxis = React.useMemo(
    // TODO: The react-charts library expects formatters to have specific signatures with additional parameters.
    // Current workaround uses 'any' type to prevent TypeScript errors, but this should be properly typed
    // when the library's type definitions are more stable or when we better understand the required formatter signatures.
    // See: Line 118 linter error about expected arguments
    (): any => ({
      getValue: (datum: SessionData) => datum.date.toLocaleDateString([], { month: 'short', day: 'numeric' }),
      formatters: {
        scale: (value: string) => value || '-',
        tooltip: (value: string) => {
          if (!value) return 'Invalid Date';
          return (
            <>
              Session on <strong>{value}</strong>
            </>
          );
        },
      },
      scaleType: 'band' as const,
    }),
    []
  );

  const secondaryAxes = React.useMemo(
    (): any[] => [
      {
        getValue: (datum: SessionData) => datum.latencyMs,
        elementType: 'bar' as const,
        formatters: {
          tooltip: (value: number | null) => value !== null ? `${(value / 1000).toFixed(1)}s avg latency` : 'N/A',
          scale: (value: number | null) => value !== null ? `${value / 1000}s` : 'N/A',
        },
        min: 0,
      },
    ],
    []
  );

  const chartData = React.useMemo(
    () => [
      {
        label: 'Latency',
        data: data,
      },
    ],
    [data]
  );

  const getSeriesStyle = React.useCallback((_series: any) => {
    return {
      color: `url(#latencyGradient)`
    };
  }, []);

  const getDatumStyle = React.useCallback((datum: any) => {
    const latency = datum.originalDatum?.latencyMs;
    let color = '#d1d5db'; // Default gray
    if (latency !== undefined) {
        if (latency <= RECOMMENDED_LATENCY_MAX_MS) {
            color = '#22c55e'; // Green
        } else {
            color = '#facc15'; // Yellow
        }
    }
    return { fill: color };
  }, []);

  // TODO: Implement the visual 'recommended zone' band (0-3s) on the chart.

  return (
    <div className="p-4 border rounded shadow-sm bg-white h-64 md:h-80">
      <h2 className="text-lg font-semibold mb-2 text-center">Response Latency (Avg)</h2>
      {data && data.length > 0 ? (
        <>
          <svg width="0" height="0" style={{ position: 'absolute' }}>
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
                  const originalDatum = focusedDatum.originalDatum as SessionData;
                  const primaryValue = primaryAxis.getValue(originalDatum); 
                  const secondaryValue = secondaryAxes[0].getValue(originalDatum);

                  // Get formatted values using the defined formatters (if they exist)
                  const formattedPrimary = primaryAxis.formatters?.tooltip
                      ? primaryAxis.formatters.tooltip(primaryValue)
                      : primaryValue;

                  const formattedSecondary = secondaryAxes[0].formatters?.tooltip
                      ? secondaryAxes[0].formatters.tooltip(secondaryValue)
                      : secondaryValue;

                  return (
                    <div className="text-xs p-1 bg-gray-800 text-white rounded shadow">
                       {formattedPrimary} <br /> {/* Render potentially JSX primary label */}
                       Avg Latency: {formattedSecondary}
                    </div>
                  );
                }
              },
              getSeriesStyle,
              getDatumStyle,
            }}
          />
        </>
      ) : (
        <div className="flex items-center justify-center h-full text-gray-500">No session data yet.</div>
      )}
    </div>
  );
}
