import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;

// SecureStore values are capped near 2 KB and a Supabase session is larger,
// so the session is split across numbered keys.
const CHUNK = 1800;
const keyFor = (key: string, i: number) => `${key.replace(/[^A-Za-z0-9._-]/g, '_')}.${i}`;

const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = Number(await SecureStore.getItemAsync(keyFor(key, 0)));
    if (!count) return null;
    const parts: string[] = [];
    for (let i = 1; i <= count; i++) {
      const part = await SecureStore.getItemAsync(keyFor(key, i));
      if (part == null) return null;
      parts.push(part);
    }
    return parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    const previous = Number(await SecureStore.getItemAsync(keyFor(key, 0))) || 0;
    const count = Math.ceil(value.length / CHUNK);
    for (let i = 1; i <= count; i++) {
      await SecureStore.setItemAsync(keyFor(key, i), value.slice((i - 1) * CHUNK, i * CHUNK));
    }
    await SecureStore.setItemAsync(keyFor(key, 0), String(count));
    for (let i = count + 1; i <= previous; i++) await SecureStore.deleteItemAsync(keyFor(key, i));
  },
  async removeItem(key: string): Promise<void> {
    const count = Number(await SecureStore.getItemAsync(keyFor(key, 0))) || 0;
    for (let i = 0; i <= count; i++) await SecureStore.deleteItemAsync(keyFor(key, i));
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
