/**
 * Client-side native English speech synthesis utility.
 * Sequential chunk playback engine with asynchronous voice discovery,
 * GC protection, error recovery watchdogs, and pause/resume/chunk navigation.
 */

let activeUtterance: SpeechSynthesisUtterance | null = null;
let isSpeaking = false;
let isPaused = false;
let watchdogTimer: number | null = null;
let currentOnEndCallback: (() => void) | null = null;
let cachedVoices: SpeechSynthesisVoice[] = [];
let pendingChunks: string[] = [];
let currentChunkIndex = 0;
let currentRate = 1.0;
let currentVolume = 1.0;
let currentOnChunkChangeCallback: ((chunkIndex: number, totalChunks: number) => void) | null = null;

function updateCachedVoices() {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      cachedVoices = window.speechSynthesis.getVoices() || [];
    } catch {
      cachedVoices = [];
    }
  }
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  updateCachedVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = () => {
      updateCachedVoices();
    };
  }
}

export function isSpeechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  );
}

export function getEnglishVoice(preferredAccent: 'en-US' | 'en-GB' = 'en-US'): SpeechSynthesisVoice | null {
  if (cachedVoices.length === 0) {
    updateCachedVoices();
  }
  if (cachedVoices.length === 0) return null;

  const targetPrefix = preferredAccent.toLowerCase();

  // 1. Exact preferred English accent (en-US or en-GB)
  const exactVoice = cachedVoices.find((v) => {
    const lang = (v.lang || '').toLowerCase().replace('_', '-');
    return lang === targetPrefix;
  });
  if (exactVoice) return exactVoice;

  // 2. Natural / high-quality English voice
  const preferredNamedVoice = cachedVoices.find((v) => {
    const lang = (v.lang || '').toLowerCase();
    const name = (v.name || '').toLowerCase();
    return (
      lang.startsWith('en') &&
      (name.includes('natural') ||
        name.includes('google') ||
        name.includes('samantha') ||
        name.includes('daniel') ||
        name.includes('aria') ||
        name.includes('jenny'))
    );
  });
  if (preferredNamedVoice) return preferredNamedVoice;

  // 3. Any English voice (en-US, en-GB, en-AU, etc.)
  const anyEN = cachedVoices.find((v) => {
    const lang = (v.lang || '').toLowerCase();
    const name = (v.name || '').toLowerCase();
    return lang.startsWith('en') || name.includes('english');
  });
  return anyEN || null;
}

/**
 * Splits English text into natural sentence chunks by punctuation (. ! ? ; \n).
 * Also splits overly long clauses (> 130 chars) at commas to avoid browser TTS timeouts.
 */
export function splitEnglishIntoChunks(text: string): string[] {
  if (!text) return [];
  const clean = text.trim();
  if (!clean) return [];

  const rawSegments = clean.split(/([.!?;:\n]+)/g);
  const segments: string[] = [];

  for (let i = 0; i < rawSegments.length; i += 2) {
    const part = rawSegments[i]?.trim() || '';
    const punctuation = rawSegments[i + 1] || '';
    const full = (part + punctuation).trim();
    if (full) segments.push(full);
  }

  const finalChunks: string[] = [];
  for (const seg of segments) {
    if (seg.length > 130) {
      const subParts = seg.split(/(,+)/g);
      for (let j = 0; j < subParts.length; j += 2) {
        const sub = (subParts[j]?.trim() || '') + (subParts[j + 1] || '');
        if (sub.trim()) finalChunks.push(sub.trim());
      }
    } else {
      finalChunks.push(seg);
    }
  }

  return finalChunks.length > 0 ? finalChunks : [clean];
}

/**
 * Estimates reading duration in seconds for English text based on playback rate.
 */
export function estimateEnglishReadingDuration(text: string, rate: number = 1.0): number {
  if (!text) return 3;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const effectiveRate = Math.max(0.5, Math.min(1.5, rate));
  // Average clear English dictation reading speed: ~2.3 words per second at 1.0x
  const estSeconds = words / 2.3 / effectiveRate + 0.8;
  return Math.max(2, Math.round(estSeconds * 10) / 10);
}

function clearWatchdog() {
  if (watchdogTimer !== null) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
}

function playNextChunk() {
  if (!isSpeaking) return;

  if (currentChunkIndex >= pendingChunks.length) {
    isSpeaking = false;
    isPaused = false;
    activeUtterance = null;
    clearWatchdog();
    if (currentOnEndCallback) {
      const cb = currentOnEndCallback;
      currentOnEndCallback = null;
      cb();
    }
    return;
  }

  const chunk = pendingChunks[currentChunkIndex];
  if (!chunk || !chunk.trim()) {
    currentChunkIndex++;
    playNextChunk();
    return;
  }

  if (currentOnChunkChangeCallback) {
    currentOnChunkChangeCallback(currentChunkIndex, pendingChunks.length);
  }

  try {
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.lang = 'en-US';
    utterance.rate = Math.max(0.6, Math.min(1.3, currentRate));
    utterance.pitch = 1.0;
    utterance.volume = Math.max(0, Math.min(1, currentVolume));

    const voice = getEnglishVoice('en-US');
    if (voice) {
      utterance.voice = voice;
    }

    let chunkHandled = false;
    const proceedToNext = () => {
      if (chunkHandled) return;
      chunkHandled = true;
      clearWatchdog();
      currentChunkIndex++;
      setTimeout(() => {
        playNextChunk();
      }, 60);
    };

    utterance.onend = () => {
      proceedToNext();
    };

    utterance.onerror = (e) => {
      console.warn('TTS chunk playback notice:', e);
      proceedToNext();
    };

    activeUtterance = utterance;

    // Safety watchdog: ensure a stuck utterance never hangs indefinitely
    const words = chunk.split(/\s+/).length;
    const maxWaitMs = Math.max(5000, ((words / 1.5) / currentRate) * 1000 + 5000);
    watchdogTimer = window.setTimeout(() => {
      if (isSpeaking && !isPaused && !chunkHandled) {
        console.warn('TTS watchdog triggered chunk transition');
        proceedToNext();
      }
    }, maxWaitMs);

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('SpeechSynthesis error during chunk speak:', err);
    currentChunkIndex++;
    playNextChunk();
  }
}

export function speakEnglishText(
  text: string,
  rate: number = 1.0,
  onEnd?: () => void,
  options?: {
    volume?: number;
    startChunkIndex?: number;
    onChunkChange?: (chunkIndex: number, totalChunks: number) => void;
  }
): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    if (onEnd) onEnd();
    return;
  }

  stopEnglishSpeech();

  const chunks = splitEnglishIntoChunks(text);
  if (chunks.length === 0) {
    if (onEnd) onEnd();
    return;
  }

  const startIdx = Math.max(0, Math.min(chunks.length - 1, options?.startChunkIndex ?? 0));

  pendingChunks = chunks;
  currentChunkIndex = startIdx;
  currentRate = rate;
  currentVolume = options?.volume ?? 1.0;
  isSpeaking = true;
  isPaused = false;
  currentOnEndCallback = onEnd || null;
  currentOnChunkChangeCallback = options?.onChunkChange || null;

  setTimeout(() => {
    if (isSpeaking) {
      playNextChunk();
    }
  }, 40);
}

export function stopEnglishSpeech(): void {
  isSpeaking = false;
  isPaused = false;
  pendingChunks = [];
  currentChunkIndex = 0;
  activeUtterance = null;
  currentOnEndCallback = null;
  currentOnChunkChangeCallback = null;
  clearWatchdog();

  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore cancel errors
    }
  }
}

export function pauseEnglishSpeech(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis && isSpeaking && !isPaused) {
    try {
      isPaused = true;
      window.speechSynthesis.pause();
    } catch (err) {
      console.warn('Error pausing speech:', err);
    }
  }
}

export function resumeEnglishSpeech(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis && isSpeaking && isPaused) {
    try {
      isPaused = false;
      window.speechSynthesis.resume();
    } catch (err) {
      console.warn('Error resuming speech:', err);
    }
  }
}
