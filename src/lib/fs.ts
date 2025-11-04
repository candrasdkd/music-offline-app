const AUDIO_ACCEPT = ['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.flac', '.opus'];
const AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/wav',
  'audio/ogg',
  'audio/flac',
  'audio/opus',
  'audio/x-m4a',
  'audio/x-wav'
];

export function hasFS(): boolean {
  return !!(window as any).showOpenFilePicker && !!(window as any).FileSystemHandle;
}

export async function pickFiles(): Promise<Array<{ file: File; handle?: any }> | null> {
  if (hasFS()) {
    try {
      const handles = await (window as any).showOpenFilePicker({
        multiple: true,
        types: [
          {
            description: 'Audio Files',
            accept: {
              'audio/*': AUDIO_ACCEPT
            }
          }
        ],
      });

      const results = await Promise.all(
        handles.map(async (h: any) => {
          const file = await h.getFile();
          return { file, handle: h };
        })
      );

      // Filter valid audio files
      return results.filter(({ file }) => isValidAudioFile(file));
    } catch (error) {
      console.warn('File System API failed, falling back to input:', error);
      return null;
    }
  }
  return null;
}

export async function pickFolder(): Promise<Array<{ file: File; handle?: any }> | null> {
  if (hasFS() && (window as any).showDirectoryPicker) {
    try {
      const dir = await (window as any).showDirectoryPicker({ mode: 'read' });
      const out: Array<{ file: File; handle?: any }> = [];

      await processDirectory(dir, out);
      return out;
    } catch (error) {
      console.warn('Directory Picker API failed:', error);
      return null;
    }
  }
  return null;
}

async function processDirectory(dir: any, out: Array<{ file: File; handle?: any }>, depth = 0) {
  // Safety limit untuk nested directories
  if (depth > 10) return;

  for await (const entry of dir.values()) {
    if (entry.kind === 'file') {
      if (isValidAudioFile(entry.name)) {
        try {
          const file: File = await entry.getFile();
          out.push({ file, handle: entry });
        } catch (error) {
          console.warn(`Failed to get file: ${entry.name}`, error);
        }
      }
    } else if (entry.kind === 'directory') {
      // Recursively process subdirectories
      await processDirectory(entry, out, depth + 1);
    }
  }
}

function isValidAudioFile(fileOrName: File | string): boolean {
  const name = typeof fileOrName === 'string' ? fileOrName : fileOrName.name;
  const lower = name.toLowerCase();

  // Check extension
  const hasValidExtension = AUDIO_ACCEPT.some(ext => lower.endsWith(ext));

  // For File objects, also check MIME type
  if (typeof fileOrName !== 'string') {
    const file = fileOrName as File;
    const hasValidMime = !file.type ||
      file.type.startsWith('audio/') ||
      AUDIO_MIME_TYPES.includes(file.type);
    return hasValidExtension && hasValidMime;
  }

  return hasValidExtension;
}

export function readFileAsBlob(file: File): Blob {
  return file;
}

// Utility function untuk estimate batch processing
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}