/**
 * Words for the onboarding funnel. `{name}` becomes the child's first name, or
 * "your little one" before we know it. Copy stays gender-neutral: we never ask.
 */
export interface PainChoice {
  id: string;
  text: string;
  reply: string;
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
    { id: 'fast', text: "It's all going so fast", reply: "Every parent feels it. You can't slow it down, but you can keep it." },
    { id: 'not-baby', text: "They're already not a baby anymore", reply: "That little voice is still in there. Let's catch it before it changes again." },
    { id: 'cant-remember', text: "I can't remember what they were like a year ago", reply: "You're not alone. That's exactly what we're here to fix." },
    { id: 'need-me', text: "One day they won't need me the same way", reply: "But you'll always be able to hear them like this." },
  ],
};

export const PAIN_FORGOTTEN: PainQuestion = {
  id: 'forgotten',
  title: 'What have you already forgotten?',
  choices: [
    { id: 'baby-voice', text: 'How their voice sounded as a baby', reply: "It changes quietly, then all at once. Today's voice is next." },
    { id: 'first-words', text: 'Their first real words', reply: "You can't get those back, but every word from today on, you can." },
    { id: 'funny', text: 'The funny way they used to say things', reply: "Those mispronunciations are gone before you notice. We'll save the next ones." },
    { id: 'scared', text: "I'm scared to even think about it", reply: "Then let's make sure you never have to wonder again." },
  ],
};

export const PAIN_PHASE: PainQuestion = {
  id: 'phase',
  title: 'How does it feel when you realise a phase is over?',
  choices: [
    { id: 'heartbroken', text: "Heartbroken; I didn't know it was the last time", reply: "You never know it's the last time. That's why every time counts." },
    { id: 'guilty', text: "Guilty that I didn't capture it", reply: 'No guilt. Ten seconds a day is all it takes from here.' },
    { id: 'proud-sad', text: 'Proud but sad at the same time', reply: 'Both are love. Keep the proud, and soften the sad.' },
    { id: 'avoid', text: 'I try not to think about it', reply: "You won't have to. We'll remember it for you." },
  ],
};

export const PAIN_FUTURE: PainQuestion = {
  id: 'future',
  title: 'What do you want {name} to have one day?',
  choices: [
    { id: 'loved', text: 'Proof of how loved they were', reply: 'Every recording says: someone was listening.' },
    { id: 'own-voice', text: 'Their own voice growing up', reply: 'From tiny words to big stories, all in one place.' },
    { id: 'gift', text: "A gift for when they're grown", reply: 'Imagine handing them this at 18.' },
    { id: 'their-kids', text: 'Something to show their own kids', reply: 'One day, their kids will hear them at this age.' },
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
