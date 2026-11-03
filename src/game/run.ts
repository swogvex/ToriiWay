import {
  crossTime,
  DANGER_FROM,
  type DifficultyConfig,
  LANES,
  MAX_STEP,
  type Mode,
} from './config';
import { matchRomaji, typingForm } from './romaji';
import { pickItem, pickLane, pickSide, type Random, type Side } from './spawner';
import { pickTarget } from './targeting';

/** One bubble's content. Single kana have no meaning to show on pop. */
export interface GameItem {
  text: string;
  reading: string;
  en?: string;
  es?: string;
}

export interface Bubble {
  id: number;
  item: GameItem;
  lane: number;
  side: Side;
  /** Share of the path travelled, 0–1. */
  progress: number;
  /** Seconds to cross the field. */
  duration: number;
  /** Romaji typed for this bubble while it is the target. */
  typed: string;
  /** Kana of the reading already produced. */
  kana: number;
  /** Romaji not yet converted. */
  pending: string;
  /** Wrong keys while this bubble was the target (the romaji hint shows after the first). */
  misses: number;
}

export type RunStatus = 'playing' | 'cleared' | 'failed' | 'quit';

export type RunEvent =
  | { type: 'spawn'; bubble: Bubble }
  | { type: 'key'; key: string; correct: boolean; bubble: Bubble | null }
  | { type: 'pop'; bubble: Bubble }
  | { type: 'miss'; bubble: Bubble }
  | { type: 'edit'; bubble: Bubble }
  | { type: 'release'; bubble: Bubble }
  | { type: 'life'; lives: number }
  | { type: 'end'; status: Exclude<RunStatus, 'playing'> };

export interface RunStats {
  correctKeys: number;
  wrongKeys: number;
  popped: number;
  missed: number;
  combo: number;
  maxCombo: number;
}

export interface RunOptions {
  config: DifficultyConfig;
  mode: Mode;
  items: readonly GameItem[];
  random: Random;
  /** Speed multiplier (reduced motion uses 0.7). */
  speed?: number;
}

const TYPED_KEY = /^[a-z'-]$/;

/**
 * One game run as a pure simulation: no DOM, no clock. The page calls `step`
 * every frame and `type` / `backspace` on input, then drains `events` to render.
 */
export class Run {
  readonly bubbles: Bubble[] = [];
  readonly stats: RunStats = {
    correctKeys: 0,
    wrongKeys: 0,
    popped: 0,
    missed: 0,
    combo: 0,
    maxCombo: 0,
  };
  status: RunStatus = 'playing';
  elapsed = 0;
  lives: number;
  target: Bubble | null = null;

  private events: RunEvent[] = [];
  private nextId = 1;
  private spawnIn = 0;
  private readonly recent: number[] = [];
  private readonly sides: Record<Side, number> = { left: 0, right: 0 };
  private readonly options: Required<RunOptions>;

  constructor(options: RunOptions) {
    if (options.items.length === 0) throw new Error('A run needs at least one item');
    this.options = { speed: 1, ...options };
    this.lives = options.config.lives;
  }

  /** Seconds left in challenge mode. */
  get remaining(): number {
    return Math.max(0, this.options.config.challengeTime - this.elapsed);
  }

  /** Events since the last call, oldest first. */
  drain(): RunEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  step(seconds: number): void {
    if (this.status !== 'playing') return;
    const dt = Math.min(Math.max(seconds, 0), MAX_STEP);
    this.elapsed += dt;

    for (const bubble of [...this.bubbles]) {
      bubble.progress = Math.min(1, bubble.progress + dt / bubble.duration);
      if (bubble.progress >= 1) this.miss(bubble);
    }
    if (this.status !== 'playing') return;

    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.bubbles.length < this.options.config.maxBubbles) {
      if (this.spawn()) this.spawnIn = this.options.config.spawnEvery;
    }

    if (this.options.mode === 'challenge' && this.elapsed >= this.options.config.challengeTime) {
      this.end('cleared');
    }
  }

  /**
   * One key from the player. Keys outside a–z, ' and - are ignored. The target
   * locks once it has a kana: until then ("k" pending), a key that fits another
   * bubble moves the target there ("k" + "i" → き… instead of a miss on く…).
   */
  type(input: string): void {
    const key = input.toLowerCase();
    if (this.status !== 'playing' || !TYPED_KEY.test(key)) return;

    const current = this.target;
    if (current) {
      const match = matchRomaji(current.item.reading, current.typed + key);
      if (match.status !== 'miss') {
        this.correct(key, current, match);
        return;
      }
      if (current.kana > 0 || !this.retarget(current.typed + key, current)) this.wrong(key);
      return;
    }
    if (!this.retarget(key, null)) this.wrong(key);
  }

  /** Targets the bubble that accepts `typed`, if any, and credits the last key. */
  private retarget(typed: string, previous: Bubble | null): boolean {
    const candidates = this.bubbles
      .filter((bubble) => bubble !== previous)
      .map(({ id, item, progress }) => ({ id, reading: item.reading, progress }));
    const picked = pickTarget(candidates, typed);
    const bubble = picked && this.bubbles.find((b) => b.id === picked.id);
    if (!picked || !bubble) return false;
    if (previous) this.release(previous);
    this.target = bubble;
    bubble.typed = typed.slice(0, -1);
    this.correct(typed.slice(-1), bubble, picked.match);
    return true;
  }

  /** Removes the last pending romaji; with none left, releases the target. */
  backspace(): void {
    const bubble = this.target;
    if (this.status !== 'playing' || !bubble) return;
    if (bubble.pending === '') {
      this.release(bubble);
      return;
    }
    bubble.typed = bubble.typed.slice(0, -1);
    const match = matchRomaji(bubble.item.reading, bubble.typed);
    if (match.status === 'partial') {
      bubble.kana = match.kana;
      bubble.pending = match.pending;
    }
    this.events.push({ type: 'edit', bubble });
  }

  quit(): void {
    if (this.status === 'playing') this.end('quit');
  }

  /** True once the bubble is in the last stretch of its path. */
  static inDanger(bubble: Bubble): boolean {
    return bubble.progress >= DANGER_FROM;
  }

  private spawn(): boolean {
    const lane = pickLane(LANES, new Set(this.bubbles.map((b) => b.lane)), this.options.random);
    if (lane === null) return false;
    const { items, config, random, speed } = this.options;
    const item = items[pickItem(items.length, this.recent, random)] ?? items[0];
    if (!item) return false;
    const side = pickSide(this.sides, random);
    this.sides[side] += 1;
    const bubble: Bubble = {
      id: this.nextId++,
      item,
      lane,
      side,
      progress: 0,
      duration: crossTime(config, typingForm(item.reading).length) / speed,
      typed: '',
      kana: 0,
      pending: '',
      misses: 0,
    };
    this.bubbles.push(bubble);
    this.events.push({ type: 'spawn', bubble });
    return true;
  }

  private correct(key: string, bubble: Bubble, match: ReturnType<typeof matchRomaji>): void {
    this.stats.correctKeys += 1;
    this.stats.combo += 1;
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.stats.combo);
    bubble.typed += key;
    if (match.status === 'partial') {
      bubble.kana = match.kana;
      bubble.pending = match.pending;
    }
    this.events.push({ type: 'key', key, correct: true, bubble });
    if (match.status === 'done') this.pop(bubble);
  }

  private wrong(key: string): void {
    this.stats.wrongKeys += 1;
    this.stats.combo = 0;
    if (this.target) this.target.misses += 1;
    this.events.push({ type: 'key', key, correct: false, bubble: this.target });
    const perLife = this.options.config.wrongKeysPerLife;
    if (perLife !== null && this.stats.wrongKeys % perLife === 0) this.loseLife();
  }

  private pop(bubble: Bubble): void {
    this.stats.popped += 1;
    bubble.kana = typingForm(bubble.item.reading).length;
    bubble.pending = '';
    this.remove(bubble);
    this.events.push({ type: 'pop', bubble });
  }

  private miss(bubble: Bubble): void {
    this.stats.missed += 1;
    this.remove(bubble);
    this.events.push({ type: 'miss', bubble });
    this.loseLife();
  }

  private release(bubble: Bubble): void {
    bubble.typed = '';
    bubble.kana = 0;
    bubble.pending = '';
    this.target = null;
    this.events.push({ type: 'release', bubble });
  }

  private remove(bubble: Bubble): void {
    const index = this.bubbles.indexOf(bubble);
    if (index !== -1) this.bubbles.splice(index, 1);
    if (this.target === bubble) this.target = null;
  }

  private loseLife(): void {
    if (this.status !== 'playing') return;
    this.lives = Math.max(0, this.lives - 1);
    this.events.push({ type: 'life', lives: this.lives });
    if (this.lives === 0) this.end('failed');
  }

  private end(status: Exclude<RunStatus, 'playing'>): void {
    this.status = status;
    this.target = null;
    this.events.push({ type: 'end', status });
  }
}
