// Browser client for the JLPT run API (src/pages/api/jlpt/runs).

import type { PublicRunState } from './run';
import type { JlptLevel } from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    ...(init?.body ? { headers: { 'Content-Type': 'application/json' } } : {}),
    cache: 'no-store',
  });
  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code =
      typeof body === 'object' && body !== null && 'error' in body ? String(body.error) : 'error';
    throw new ApiError(response.status, code);
  }
  return body as T;
}

const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) });

export const createRun = (level: JlptLevel, isPublic: boolean) =>
  post<PublicRunState>('/api/jlpt/runs', { level, public: isPublic });

export const getRun = (id: string) => request<PublicRunState>(`/api/jlpt/runs/${id}`);

export interface PaperQuestion {
  id: string;
  passage: string | null;
  stem: string;
  choices: string[];
  audio: string | null;
  tts: { script: string; voices: string[] } | null;
}

export interface PaperMondai {
  number: number;
  type: string;
  spokenChoices: boolean;
  instruction: { en: string; ja: string; es?: string } | null;
  passages: { id: string; text: string }[];
  questions: PaperQuestion[];
}

export interface Paper {
  section: number;
  id: string;
  replays: number;
  mondai: PaperMondai[];
}

export const getPaper = (id: string) => request<Paper>(`/api/jlpt/runs/${id}/paper`);

export const submitSection = (
  id: string,
  section: number,
  answers: { id: string; choice: number | null; at: number }[],
) => post<PublicRunState>(`/api/jlpt/runs/${id}/submit`, { section, answers });

export const continueRun = (id: string, section: number) =>
  post<PublicRunState>(`/api/jlpt/runs/${id}/continue`, { section });

export const saveName = (id: string, name: string) =>
  post<undefined>(`/api/jlpt/runs/${id}/name`, { name });

export const sendFeedback = (id: string, section: number, rating: 'easy' | 'right' | 'hard') =>
  post<undefined>(`/api/jlpt/runs/${id}/feedback`, { section, rating });
