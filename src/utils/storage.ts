import { DictationItem, DictationAttempt, DifficultyLevel } from '../types/dictation';

const STORAGE_CUSTOM_KEY = 'engwalk_custom_dictations_v1';
const STORAGE_ATTEMPTS_KEY = 'engwalk_attempts_v1';

// Open IndexedDB for custom MP3 audio Blobs
const DB_NAME = 'EngWalkAudioDB';
const DB_VERSION = 1;
const AUDIO_STORE_NAME = 'audio_files';

function openAudioDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AUDIO_STORE_NAME)) {
        db.createObjectStore(AUDIO_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveAudioBlob(id: string, blob: Blob): Promise<void> {
  try {
    const db = await openAudioDB();
    const tx = db.transaction(AUDIO_STORE_NAME, 'readwrite');
    const store = tx.objectStore(AUDIO_STORE_NAME);
    store.put(blob, id);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed to save audio blob:', err);
  }
}

export async function getAudioBlob(id: string): Promise<Blob | null> {
  try {
    const db = await openAudioDB();
    const tx = db.transaction(AUDIO_STORE_NAME, 'readonly');
    const store = tx.objectStore(AUDIO_STORE_NAME);
    const req = store.get(id);
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Parses /audio/dettati.txt (1-line-per-dictation format: Difficoltà | File MP3 | Titolo | Frase in inglese)
 */
export async function fetchDefaultDictations(): Promise<DictationItem[]> {
  try {
    const txtRes = await fetch('/audio/dettati.txt');
    if (txtRes.ok) {
      const text = await txtRes.text();
      const lines = text.split('\n');
      const items: DictationItem[] = [];

      lines.forEach((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) return;

        const parts = line.split('|').map((p) => p.trim());
        if (parts.length >= 3) {
          let difficulty: DifficultyLevel = 'Principiante';
          const diffStr = parts[0].toLowerCase();
          if (diffStr.includes('intermedio') || diffStr.includes('medio')) difficulty = 'Intermedio';
          else if (diffStr.includes('avanzato') || diffStr.includes('difficile')) difficulty = 'Avanzato';

          let fileName = parts[1];
          if (fileName && !fileName.startsWith('/') && !fileName.startsWith('http')) {
            fileName = `/audio/${fileName}`;
          }

          let title = '';
          let english = '';

          if (parts.length === 3) {
            title = `Lezione ${idx + 1}`;
            english = parts[2];
          } else {
            title = parts[2];
            english = parts.slice(3).join(' | ');
          }

          items.push({
            id: `txt-${idx + 1}`,
            title,
            difficulty,
            audioSrc: fileName,
            englishText: english,
          });
        } else if (items.length > 0 && line) {
          const lastItem = items[items.length - 1];
          lastItem.englishText = lastItem.englishText ? `${lastItem.englishText} ${line}` : line;
        }
      });

      if (items.length > 0) {
        return items;
      }
    }

    return [];
  } catch (err) {
    console.warn('Error reading dictation files:', err);
    return [];
  }
}

export function getCustomDictations(): DictationItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOM_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomDictation(item: DictationItem): void {
  const existing = getCustomDictations();
  const index = existing.findIndex((d) => d.id === item.id);
  let updated: DictationItem[];
  if (index >= 0) {
    updated = [...existing];
    updated[index] = item;
  } else {
    updated = [item, ...existing];
  }
  localStorage.setItem(STORAGE_CUSTOM_KEY, JSON.stringify(updated));
}

export function deleteCustomDictation(id: string): void {
  const existing = getCustomDictations();
  const updated = existing.filter((d) => d.id !== id);
  localStorage.setItem(STORAGE_CUSTOM_KEY, JSON.stringify(updated));
}

export function getDictationAttempts(): Record<string, DictationAttempt> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_ATTEMPTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveDictationAttempt(attempt: DictationAttempt): void {
  const existing = getDictationAttempts();
  const prev = existing[attempt.dictationId];
  const bestScore = prev ? Math.max(prev.score, attempt.score) : attempt.score;

  existing[attempt.dictationId] = {
    ...attempt,
    score: bestScore,
    completed: attempt.completed || (prev ? prev.completed : false),
  };
  localStorage.setItem(STORAGE_ATTEMPTS_KEY, JSON.stringify(existing));
}

/**
 * Generate simple 1-line-per-exercise text format for copy/paste into dettati.txt
 */
export function generateDettatiTxtContent(items: DictationItem[]): string {
  let content = '# ELENCO DEI DETTATI INGLESI (1 RIGA PER ESERCIZIO)\n';
  content += '# Formato: Difficoltà | Nome file MP3 | Titolo | Frase in inglese\n\n';
  items.forEach((item) => {
    const mp3Name = item.audioSrc.replace('/audio/', '');
    const cleanEnglish = item.englishText.replace(/\r?\n/g, ' ').trim();
    content += `${item.difficulty} | ${mp3Name} | ${item.title} | ${cleanEnglish}\n`;
  });
  return content;
}
