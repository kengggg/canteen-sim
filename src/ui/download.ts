import { signal } from '@preact/signals';

/**
 * Offering a file. Inside the claude.ai viewer, page-started downloads are blocked, so files go through the
 * `downloads` capability (the viewer confirms each save). A standalone copy of the page uses an ordinary link.
 * When neither works, the Download buttons hide and Copy remains.
 */
interface DownloadsNs { save(r: { filename: string; data: string }): Promise<{ status: string }> }
interface ClaudeHost { use(name: string): Promise<unknown> }

const host = (globalThis as unknown as { claude?: ClaudeHost }).claude;
let ns: DownloadsNs | null = null;

/** null while unknown, then whether a Download button can work in this view. */
export const canDownload = signal<boolean | null>(host ? null : true);

if (host) {
  host.use('downloads').then(
    (d) => { ns = (d as DownloadsNs | null) ?? null; canDownload.value = ns !== null; },
    () => { canDownload.value = false; },
  );
}

/** Save a text file; resolves to a short status message for the UI (or null when nothing needs saying). */
export async function saveText(filename: string, text: string, type: string): Promise<string | null> {
  if (ns) {
    try {
      await ns.save({ filename, data: text });
      return null;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'declined') return null;
      if (code === 'rate_limited') return 'A save is already waiting for your answer.';
      canDownload.value = false;
      return 'Saving files isn’t available here. Use Copy instead.';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return null;
}
