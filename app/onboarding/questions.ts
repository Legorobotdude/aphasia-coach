export const QUESTIONS = [
  { id: 1, label: 'work', prompt: 'Tell me about your most recent job.' },
  { id: 2, label: 'family', prompt: 'Who do you live with and what roles do they play in your life?' },
  { id: 3, label: 'hobbies', prompt: 'What activities do you enjoy in your free time?' },
  { id: 4, label: 'culture', prompt: 'Are there any cultural traditions that are important to you?' },
  { id: 5, label: 'routine', prompt: 'Walk me through a typical morning.' },
  { id: 6, label: 'goals', prompt: 'What are your main goals for recovery?' }
] satisfies readonly { id: number; label: string; prompt: string; }[]; 