/** Only one thing should sound at a time: whoever starts playing stops the previous owner. */
export interface PlaybackOwner {
  stop: () => void;
}

let current: PlaybackOwner | null = null;

export function claimPlayback(owner: PlaybackOwner): void {
  const prev = current;
  current = owner;
  if (prev && prev !== owner) {
    try {
      prev.stop();
    } catch {
      // player already released
    }
  }
}

export function releasePlayback(owner: PlaybackOwner): void {
  if (current === owner) current = null;
}

export function stopCurrentPlayback(): void {
  const prev = current;
  current = null;
  try {
    prev?.stop();
  } catch {
    // player already released
  }
}
