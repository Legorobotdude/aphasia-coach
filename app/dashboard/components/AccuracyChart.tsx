'use client'; // Ensure this is client-side

import React from 'react';
import { Chart, type AxisOptions } from 'react-charts'; // Import AxisOptions

// TODO: Replace with actual session data type from lib/types/firestore.ts
// TODO: Fetch real data in parent component and pass as props
interface SessionData {
  date: Date; // Ensure this matches the data from DashboardPage
  accuracy: number;
  sessionNumber?: number; // Made optional
}

interface AccuracyChartProps {
  data: SessionData[];
}

export default function AccuracyChart({ data }: AccuracyChartProps) {
  const primaryAxis = React.useMemo(
    (): AxisOptions<SessionData> => ({ // Add type annotation here
      getValue: (datum: SessionData) => datum.date,
      formatters: {
        tooltip: (value: unknown) => { // Use unknown type for safety
            // Check if value is a valid Date object
            if (value instanceof Date && !isNaN(value.getTime())) {
                return value.toLocaleDateString(); // Format if valid
            }
            return 'Invalid Date'; // Fallback for tooltip if not valid
        },
        scale: (value: unknown) => { // Use unknown type for safety
             // Check if value is a valid Date object
            if (value instanceof Date && !isNaN(value.getTime())) {
                return value.toLocaleDateString([], { month: 'short', day: 'numeric' }); // Format if valid
            }
            return '-'; // Fallback for scale labels if not valid
        },
      },
    }),
    []
  );

  const secondaryAxes = React.useMemo(
    (): AxisOptions<SessionData>[] => [ // Add type annotation here
      {
        getValue: (datum: SessionData) => datum.accuracy * 100, // Display as percentage
        elementType: 'line' as const,
        formatters: {
          tooltip: (value: number | null) => value !== null ? `${value.toFixed(0)}% accuracy` : 'N/A',
          scale: (value: number | null) => value !== null ? `${value}%` : 'N/A',
        },
        // Define min/max for percentage scale
        min: 0,
        max: 100,
        // TODO: Implement goal line (85%) visualization separately if needed
        hardMin: 0, // Ensure scale starts at 0
        hardMax: 100, // Ensure scale goes to 100
        // secondaryAxisId: 'accuracyAxis', // Removed: Not needed unless multiple secondary axes
      },
    ],
    []
  );

  const chartData = React.useMemo(
    () => [
      {
        label: 'Accuracy',
        data: data,
        // secondaryAxisId: 'accuracyAxis', // Removed reference
      },
    ],
    [data]
  );

  const getSeriesStyle = React.useCallback(() => {
    return {
      stroke: '#3b82f6', // Blue color for the line
      lineWidth: 2,
    };
  }, []);

  const getDatumStyle = React.useCallback(() => {
    return {
      r: 4, // Radius of data points
      fill: '#3b82f6',
    };
  }, []);

  // TODO: Revisit implementing the 85% goal line using annotations or other features.

  return (
    <div className="p-4 border rounded shadow-sm bg-white h-64 md:h-80"> {/* Ensure height */}
      <h2 className="text-lg font-semibold mb-2 text-center">Accuracy Trend</h2>
      {data && data.length > 0 ? (
        <Chart
          options={{
            data: chartData,
            primaryAxis,
            secondaryAxes,
            tooltip: {
              render: ({ focusedDatum }) => { // Use focusedDatum
                // Check if focusedDatum and originalDatum exist before accessing properties
                if (!focusedDatum?.originalDatum) return null;
                const originalDatum = focusedDatum.originalDatum as SessionData;
                // Ensure date is valid before formatting
                const dateString = (originalDatum.date instanceof Date && !isNaN(originalDatum.date.getTime()))
                                   ? originalDatum.date.toLocaleDateString()
                                   : 'N/A';
                return (
                  <div className="text-xs p-1 bg-gray-800 text-white rounded shadow">
                    {/* Check if sessionNumber exists before displaying */}
                    {originalDatum.sessionNumber !== undefined ? `Session #${originalDatum.sessionNumber} - ` : ''}
                    {dateString}<br/>
                    Accuracy: {(originalDatum.accuracy * 100).toFixed(0)}%
                  </div>
                );
              }
            },
            getSeriesStyle,
            getDatumStyle,
            // Dark mode handling could be added here if needed
          }}
        />
      ) : (
        <div className="flex items-center justify-center h-full text-gray-500">No session data yet.</div>
      )}
    </div>
  );
}