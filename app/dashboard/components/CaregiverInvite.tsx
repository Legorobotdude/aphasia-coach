import React, { useState } from 'react';

// TODO: Replace with actual invite data type from lib/types/firestore.ts
// TODO: Fetch real invites data in parent component and pass as props
interface Invite {
  id: string;
  email: string;
  role: string;
  status: 'pending' | 'accepted'; // Example statuses
}

interface CaregiverInviteProps {
  invites: Invite[];
}

export default function CaregiverInvite({ invites }: CaregiverInviteProps) {
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Family Member'); // Default role
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    console.log(`Submitting invite for: ${email}, Role: ${role}`);

    try {
      // TODO: Implement actual Firestore write using addDoc
      // Example structure based on build plan:
      // await addDoc(collection(db, 'users', uid, 'invites'), {
      //   email,
      //   role,
      //   createdAt: serverTimestamp(),
      //   status: 'pending'
      // });
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000)); 

      console.log('Invite submitted successfully (simulated)');
      // Reset form and hide
      setEmail('');
      setRole('Family Member');
      setShowInviteForm(false);

    } catch (err) {
      console.error("Error submitting invite:", err);
      setError('Failed to send invite. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 border rounded shadow-sm bg-white">
      <h2 className="text-lg font-semibold mb-3">Caregiver Access</h2>

      {!showInviteForm && (
        <button
          onClick={() => setShowInviteForm(true)}
          className="w-full px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          Invite Caregiver
        </button>
      )}

      {showInviteForm && (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Caregiver&apos;s Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="caregiver@example.com"
            />
          </div>
          <div>
            <label htmlFor="role" className="block text-sm font-medium text-gray-700">
              Relationship
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            >
              <option>Family Member</option>
              <option>Friend</option>
              <option>Speech Therapist</option>
              <option>Doctor</option>
              <option>Other</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={() => setShowInviteForm(false)}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm border border-gray-300 rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        </form>
      )}

      {/* Placeholder for listing existing invites */} 
      <div className="mt-4 pt-4 border-t border-gray-200">
          <h3 className="text-md font-semibold text-gray-700 mb-2">Existing Invites</h3>
          {invites.length > 0 ? (
              <ul className="text-sm text-gray-600 space-y-1">
                  {invites.map(invite => (
                      <li key={invite.id}>{invite.email} ({invite.role}) - <span className={invite.status === 'pending' ? 'text-yellow-600' : 'text-green-600'}>{invite.status}</span></li>
                  ))}
              </ul>
          ) : (
             <p className="text-sm text-gray-500 italic">No invites sent yet.</p>
          )}
      </div>
    </div>
  );
} 