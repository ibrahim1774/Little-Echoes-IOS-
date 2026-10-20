/**
 * Words for the onboarding funnel. `{name}` becomes the child's first name, or
 * "your little one" before we know it. Copy stays gender-neutral: we never ask.
 */
export interface PainChoice {
  id: string;
  text: string;
}

export interface PainQuestion {
  id: string;
  title: string;
  choices: PainChoice[];
}

export const PAIN_GROWING: PainQuestion = {
  id: 'growing',
  title: "What's the hardest part of watching them grow up?",
  choices: [
    { id: 'fast', text: "It's all going so fast" },
    { id: 'not-baby', text: "They're already not a baby anymore" },
    { id: 'cant-remember', text: "I can't remember what they were like a year ago" },
    { id: 'need-me', text: "One day they won't need me the same way" },
  ],
};

export const PAIN_FORGOTTEN: PainQuestion = {
  id: 'forgotten',
  title: 'What have you already forgotten?',
  choices: [
    { id: 'baby-voice', text: 'How their voice sounded as a baby' },
    { id: 'first-words', text: 'Their first real words' },
    { id: 'funny', text: 'The funny way they used to say things' },
    { id: 'scared', text: "I'm scared to even think about it" },
  ],
};

export const PAIN_PHASE: PainQuestion = {
  id: 'phase',
  title: 'How does it feel when you realise a phase is over?',
  choices: [
    { id: 'heartbroken', text: "Heartbroken; I didn't know it was the last time" },
    { id: 'guilty', text: "Guilty that I didn't capture it" },
    { id: 'proud-sad', text: 'Proud but sad at the same time' },
    { id: 'avoid', text: 'I try not to think about it' },
  ],
};

export const PAIN_FUTURE: PainQuestion = {
  id: 'future',
  title: 'What do you want {name} to have one day?',
  choices: [
    { id: 'loved', text: 'Proof of how loved they were' },
    { id: 'own-voice', text: 'Their own voice growing up' },
    { id: 'gift', text: "A gift for when they're grown" },
    { id: 'their-kids', text: 'Something to show their own kids' },
  ],
};

/** The paywall's headline, built from the last answer. */
const HEADLINES: Record<string, string> = {
  loved: 'Give {name} proof of how loved they were',
  'own-voice': "Keep {name}'s voice, from tiny words to big stories",
  gift: 'Start a gift {name} can open at 18',
  'their-kids': "One day, {name}'s kids will hear them at this age",
};

export function withName(text: string, name: string | undefined): string {
  const n = name?.trim();
  if (n) return text.replace(/\{name\}/g, n);
  // "{name}'s" reads as "your little one's"; a leading {name} is capitalised.
  return text.replace(/^\{name\}/, 'Your little one').replace(/\{name\}/g, 'your little one');
}

export function paywallHeadline(futureChoice: string | undefined, name: string | undefined): string {
  return withName(HEADLINES[futureChoice ?? ''] ?? "Keep {name}'s voice forever", name);
}

export const REMINDER_TIMES: { time: string; label: string; icon: string }[] = [
  { time: '08:00', label: 'Morning', icon: '🌅' },
  { time: '16:00', label: 'After school', icon: '🎒' },
  { time: '18:00', label: 'Dinner time', icon: '🍝' },
  { time: '19:30', label: 'Bedtime', icon: '🌙' },
];

export const EVERY_DAY = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
