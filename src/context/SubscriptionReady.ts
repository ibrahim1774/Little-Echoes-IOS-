import { createContext, useContext } from 'react';

/** True once Superwall has reported a subscription status (or timed out). */
export const SubscriptionReadyContext = createContext(false);

export function useSubscriptionReady(): boolean {
  return useContext(SubscriptionReadyContext);
}
