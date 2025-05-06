'use client';

import React from 'react';

interface ProgressRingProps {
  currentStep: number;
  totalSteps: number;
  radius?: number;
  strokeWidth?: number;
}

/**
 * Displays a circular progress ring indicating session progress.
 */
export default function ProgressRing({ 
  currentStep, 
  totalSteps, 
  radius = 50, 
  strokeWidth = 8 
}: ProgressRingProps) {

  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  
  // Ensure progress doesn't exceed 100% or go below 0%
  const progress = Math.min(1, Math.max(0, totalSteps > 0 ? currentStep / totalSteps : 0));
  const strokeDashoffset = circumference - progress * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: radius * 2, height: radius * 2 }}>
      <svg
        height={radius * 2}
        width={radius * 2}
        className="transform -rotate-90"
      >
        {/* Background Circle */}
        <circle
          stroke="#e5e7eb" // gray-200
          fill="transparent"
          strokeWidth={strokeWidth}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        {/* Progress Circle */}
        <circle
          stroke="#3b82f6" // blue-500
          fill="transparent"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference + ' ' + circumference}
          style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.35s ease-out' }}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
      </svg>
      {/* Text in the Center */}
      <span className="absolute text-lg font-semibold text-gray-700 dark:text-gray-300">
        {`${currentStep}/${totalSteps}`}
      </span>
    </div>
  );
} 