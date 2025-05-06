import React from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isToday } from 'date-fns';

// TODO: Fetch real data (streak count, session completion days) in parent component
interface StreakWidgetProps {
  currentStreak: number;
  // Map where key is 'YYYY-MM-DD' and value is true if a session was completed
  completedDays: Map<string, boolean>; 
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function StreakWidget({ currentStreak, completedDays }: StreakWidgetProps) {
  const today = new Date();
  const firstDayOfMonth = startOfMonth(today);
  const lastDayOfMonth = endOfMonth(today);
  const daysInMonth = eachDayOfInterval({ start: firstDayOfMonth, end: lastDayOfMonth });

  // Get the day of the week for the first day (0=Sun, 1=Mon, ...)
  const startingDayIndex = getDay(firstDayOfMonth);

  // Create blank elements for days before the start of the month
  const prefixDays = Array.from({ length: startingDayIndex }).map((_, i) => (
    <div key={`prefix-${i}`} className="h-10 w-10 border border-transparent"></div> // Placeholder div
  ));

  return (
    <div className="p-4 border rounded shadow-sm bg-white">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-semibold">Daily Streak</h2>
        <div className="text-right">
          <div className="text-3xl font-bold">{currentStreak}</div>
          <div className="text-sm text-gray-500">day{currentStreak !== 1 ? 's' : ''}</div>
        </div>
      </div>
      <div className="text-center font-medium mb-2">
        {format(today, 'MMMM yyyy')}
      </div>
      {/* Heatmap Grid */}
      <div className="grid grid-cols-7 gap-1 text-xs text-center mb-1">
        {DAY_NAMES.map((day: string) => <div key={day} className="font-semibold text-gray-600">{day}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {prefixDays}
        {daysInMonth.map((day: Date) => {
          const dateString = format(day, 'yyyy-MM-dd');
          const isCompleted = completedDays.get(dateString) ?? false;
          const isCurrentDay = isToday(day);

          let bgColor = 'bg-gray-200'; // Default: No session
          if (isCompleted) {
             bgColor = 'bg-green-500'; // Completed session
          }
          // Special styling for today
          let borderStyle = 'border border-gray-300';
          if(isCurrentDay) {
              borderStyle = 'border-2 border-blue-500'; // Highlight today
              if (!isCompleted) {
                 bgColor = 'bg-gray-100'; // Slightly different bg for today if not completed
              }
          }

          return (
            <div
              key={dateString}
              className={`h-10 w-10 rounded ${bgColor} ${borderStyle} flex items-center justify-center text-gray-700`}
              title={`${format(day, 'MMM d')}${isCompleted ? ' - Session Completed' : ''}`}
            >
                {/* Optionally display day number */}
                 {/* {format(day, 'd')} */} 
            </div>
          );
        })}
      </div>
    </div>
  );
} 