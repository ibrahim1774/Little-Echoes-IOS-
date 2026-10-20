/**
 * Media files on this device. Everything lives under <documents>/media so
 * recordings survive app restarts and are easy to wipe on sign-out.
 */
import { Directory, File, Paths } from 'expo-file-system';

function mediaDir(): Directory {
  const dir = new Directory(Paths.document, 'media');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Move a freshly recorded temp file into permanent storage. Returns the new URI. */
export function persistMedia(tempUri: string, id: string, ext: string): string {
  const dest = new File(mediaDir(), `${id}.${ext}`);
  if (dest.exists) dest.delete();
  new File(tempUri).move(dest);
  return dest.uri;
}

export function mediaFile(id: string, ext: string): File {
  return new File(mediaDir(), `${id}.${ext}`);
}

/**
 * Stored paths include the app's container folder, which iOS can change (e.g. on reinstall or
 * update). Media always lives in <documents>/media, so a stale path is mapped there by file name.
 */
export function resolveMediaUri(uri: string): string {
  try {
    if (new File(uri).exists) return uri;
    const name = uri.split('/media/').pop();
    if (name && name !== uri && !name.includes('/')) {
      const current = new File(mediaDir(), name);
      if (current.exists) return current.uri;
    }
  } catch {
    // fall through
  }
  return uri;
}

export function fileExists(uri: string | undefined): boolean {
  if (!uri) return false;
  try {
    return new File(resolveMediaUri(uri)).exists;
  } catch {
    return false;
  }
}

export function deleteFile(uri: string | undefined): void {
  if (!uri) return;
  try {
    const f = new File(resolveMediaUri(uri));
    if (f.exists) f.delete();
  } catch {
    // already gone
  }
}

export async function readBytes(uri: string): Promise<ArrayBuffer> {
  return new File(resolveMediaUri(uri)).arrayBuffer();
}

/** Download a remote URL into media storage. Returns the local URI. */
export async function downloadTo(url: string, id: string, ext: string): Promise<string> {
  const dest = mediaFile(id, ext);
  if (dest.exists) dest.delete();
  const file = await File.downloadFileAsync(url, dest);
  return file.uri;
}

export function deleteAllMedia(): void {
  try {
    const dir = new Directory(Paths.document, 'media');
    if (dir.exists) dir.delete();
  } catch {
    // nothing to remove
  }
}
