/**
 * MediaRegistry.ts
 * Adapted from ViBe (vicharanashala/vibe) lib/MediaRegistry.ts.
 *
 * Central registry for tracking and cleanly releasing active MediaStreams
 * across pre-flight diagnostics and active proctoring components.
 */

const mediaRegister = new Map<string, MediaStream>();

export function registerStream(id: string, stream: MediaStream): void {
  const existing = mediaRegister.get(id);
  if (existing && existing !== stream) {
    existing.getTracks().forEach((t) => t.stop());
  }
  mediaRegister.set(id, stream);
}

export function getStream(id: string): MediaStream | undefined {
  return mediaRegister.get(id);
}

export function unRegisterStream(id: string): void {
  const stream = mediaRegister.get(id);
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    mediaRegister.delete(id);
  }
}

export function stopAllStreams(): void {
  for (const [id, stream] of mediaRegister.entries()) {
    stream.getTracks().forEach((t) => t.stop());
    mediaRegister.delete(id);
  }
  mediaRegister.clear();
}

