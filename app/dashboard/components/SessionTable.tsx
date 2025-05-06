import React from 'react';
import { format } from 'date-fns';

// TODO: Replace with actual session data type from lib/types/firestore.ts
// TODO: Fetch real data in parent component and pass as props
interface Session {
  id: string; // Need ID for key and potentially for modal
  date: Date; // Renamed from startedAt
  accuracy: number;
  latencyMs: number;
  durationSec: number;
}

interface SessionTableProps {
  sessions: Session[];
}

const MAX_SESSIONS_TO_SHOW = 10;

export default function SessionTable({ sessions }: SessionTableProps) {

  const handleRowClick = (sessionId: string) => {
    console.log(`Row clicked, session ID: ${sessionId}`);
    // TODO: Implement lazy-loaded Session Detail Modal display
    // alert(`Show details for session: ${sessionId}`); // Placeholder interaction
  };

  const sessionsToShow = sessions.slice(0, MAX_SESSIONS_TO_SHOW);

  return (
    <div className="p-4 border rounded shadow-sm bg-white overflow-x-auto">
      <h2 className="text-lg font-semibold mb-3">Recent Sessions</h2>
      {sessionsToShow.length > 0 ? (
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Accuracy
              </th>
              <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Avg Latency
              </th>
              <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Duration
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sessionsToShow.map((session) => (
              <tr key={session.id} onClick={() => handleRowClick(session.id)} className="hover:bg-gray-50 cursor-pointer">
                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                  {format(session.date, 'MMM d, yyyy')}
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                  {(session.accuracy * 100).toFixed(0)}%
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                  {session.latencyMs.toFixed(0)} ms
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                  {(session.durationSec / 60).toFixed(1)} min
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="text-gray-500 italic">No sessions recorded yet.</div>
      )}
    </div>
  );
} 