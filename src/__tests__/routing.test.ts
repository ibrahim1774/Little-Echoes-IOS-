import { destinationFor } from '@/lib/routing';
import type { ChildProfile, ParentProfile } from '@/types';

const user = { id: 'u', email: 'a@b.com' };
const parent = { id: 'p' } as ParentProfile;
const child = { id: 'c' } as ChildProfile;

describe('destinationFor', () => {
  it('sends signed-out users to onboarding even if local data or a subscription exists', () => {
    expect(destinationFor({ user: null, parent, children: [child], isPaid: true })).toBe('/onboarding');
  });
  it('walks setup in order', () => {
    expect(destinationFor({ user, parent: null, children: [], isPaid: false })).toBe('/setup/parent');
    expect(destinationFor({ user, parent, children: [], isPaid: false })).toBe('/setup/child');
  });
  it('finishes setup before the paywall even for subscribers', () => {
    expect(destinationFor({ user, parent: null, children: [], isPaid: true })).toBe('/setup/parent');
  });
  it('gates the app behind the paywall', () => {
    expect(destinationFor({ user, parent, children: [child], isPaid: false })).toBe('/paywall');
    expect(destinationFor({ user, parent, children: [child], isPaid: true })).toBe('/home');
  });
});
