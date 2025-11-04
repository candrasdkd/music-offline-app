import type { Category, Track } from './types';

const DB_NAME = 'musicpwa';
const DB_VER = 1;

type BlobRow = { id: string; blob: Blob };

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('tracks')) {
        const store = db.createObjectStore('tracks', { keyPath: 'id' });
        store.createIndex('byName', 'name', { unique: false });
      }
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs', { keyPath: 'id' });
      }
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

async function tx(storeNames: string[], mode: IDBTransactionMode = 'readonly') {
  const db = await openDB();
  return db.transaction(storeNames, mode);
}

export async function putTrack(track: Track): Promise<void> {
  const t = await tx(['tracks'], 'readwrite');
  await new Promise<void>((res, rej) => {
    const r = t.objectStore('tracks').put(track);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

export async function getAllTracks(): Promise<Track[]> {
  const t = await tx(['tracks']);
  return new Promise<Track[]>((res, rej) => {
    const r = t.objectStore('tracks').getAll();
    r.onsuccess = () => res((r.result as Track[]) || []);
    r.onerror = () => rej(r.error);
  });
}

export async function deleteTracks(ids: string[] = []): Promise<void> {
  const t = await tx(['tracks'], 'readwrite');
  await Promise.all(
    ids.map(
      (id) =>
        new Promise<void>((res, rej) => {
          const r = t.objectStore('tracks').delete(id);
          r.onsuccess = () => res();
          r.onerror = () => rej(r.error);
        })
    )
  );
}

export async function putBlob(id: string, blob: Blob): Promise<void> {
  const t = await tx(['blobs'], 'readwrite');
  await new Promise<void>((res, rej) => {
    const r = t.objectStore('blobs').put({ id, blob } as BlobRow);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

export async function getBlob(id: string): Promise<Blob | null> {
  const t = await tx(['blobs']);
  return new Promise<Blob | null>((res, rej) => {
    const r = t.objectStore('blobs').get(id);
    r.onsuccess = () => res((r.result as BlobRow | undefined)?.blob || null);
    r.onerror = () => rej(r.error);
  });
}

export async function putCategory(cat: Category): Promise<void> {
  const t = await tx(['categories'], 'readwrite');
  await new Promise<void>((res, rej) => {
    const r = t.objectStore('categories').put(cat);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

export async function getAllCategories(): Promise<Category[]> {
  const t = await tx(['categories']);
  return new Promise<Category[]>((res, rej) => {
    const r = t.objectStore('categories').getAll();
    r.onsuccess = () => res((r.result as Category[]) || []);
    r.onerror = () => rej(r.error);
  });
}

export async function deleteCategory(id: string): Promise<void> {
  const t = await tx(['categories'], 'readwrite');
  await new Promise<void>((res, rej) => {
    const r = t.objectStore('categories').delete(id);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}
