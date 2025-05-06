'use client';

import React, { useState, useEffect, useRef } from 'react';

interface LatencyTickerProps {
  isActive: boolean; // Controls whether the timer runs
  onTick?: (elapsedSeconds: number) => void; // Optional callback for each second
}

/**
 * Displays a simple elapsed time ticker (seconds).
 */
export default function LatencyTicker({ isActive, onTick }: LatencyTickerProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isActive) {
      // Start timer
      setElapsedSeconds(0); // Reset on activation
      intervalRef.current = setInterval(() => {
        setElapsedSeconds((prevSeconds) => {
          const newSeconds = prevSeconds + 1;
          if (onTick) {
            onTick(newSeconds);
          }
          return newSeconds;
        });
      }, 1000);
    } else {
      // Clear timer if active
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // Don't reset seconds here, parent might want the final value
    }

    // Cleanup function
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isActive, onTick]);

  // Format seconds into MM:SS if needed, or just display seconds
  // const minutes = Math.floor(elapsedSeconds / 60);
  // const seconds = elapsedSeconds % 60;
  // const displayTime = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  return (
    <div className="text-sm text-gray-600 dark:text-gray-400 font-mono mt-2">
      Recording time: {elapsedSeconds}s
    </div>
  );
} 