export type DifficultyLevel = 'Principiante' | 'Intermedio' | 'Avanzato' | 'Personalizzato';

export interface DictationItem {
  id: string;
  title: string;
  difficulty: DifficultyLevel;
  audioSrc: string; // Percorso del file (es. /audio/lesson1.mp3) o blob locale
  englishText: string; // Testo in inglese da trascrivere
  phonetics?: string;
  translation?: string;
  isCustom?: boolean;
  createdAt?: string;
}

export interface DictationAttempt {
  dictationId: string;
  date: string;
  userText: string;
  score: number; // 0-100
  accuracyWords: number;
  totalWords: number;
  completed: boolean;
}

export interface AudioSettings {
  playbackRate: number; // 0.7, 0.85, 1.0, 1.15
  autoPauseDuration: number; // 0, 3, 5, 8
  soundFxEnabled: boolean;
  tapeEq: 'NORMAL' | 'CrO2' | 'METAL';
  volume: number;
}
