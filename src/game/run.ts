import {
  crossTime,
  DANGER_FROM,
  DIFFICULTIES,
  type Difficulty,
  endlessLevel,
  endlessPool,
  endlessTuning,
  LANES,
  MAX_STEP,
} from './config';
import { matchRomaji, typingForm } from './romaji';
import { pickItem, pickLane, pickSide, type Side } from './spawner';
import { pickTarget } from './targeting';
import type {
  Bubble,
  GameItem,
  KanaTime,
  LogEntry,
  RunEvent,
  RunOptions,
  RunStats,
  RunStatus,
  Sample,
} from './types';

export type {
  Bubble,
  GameItem,
  KanaTime,
  LogEntry,
  RunEvent,
  RunOptions,
  RunStats,
  RunStatus,
  Sample,
} from './types';

const TYPED_KEY = /^[a-z'-]$/;
/** A trailing sample shorter than this is rounding noise, not a second of play. */
const MIN_SAMPLE = 0.05;

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
    kana: 0,
    combo: 0,
    maxCombo: 0,
  };
  status: RunStatus = 'playing';
  elapsed = 0;
  lives: number;
  target: Bubble | null = null;
  /** Endless level (always 1 in challenge mode). */
  level = 1;
  /** Keys per second of play, for the results chart and consistency. */
  readonly samples: Sample[] = [];
  /** Every bubble that left the field, in order. */
  readonly log: LogEntry[] = [];
  /** Time per typed kana unit, for "slowest kana". */
  readonly kanaTimes: KanaTime[] = [];

  private second = { correct: 0, wrong: 0 };
  /** Run time since the player last had no target. */
  private freeSince = 0;
  private events: RunEvent[] = [];
  private nextId = 1;
  private spawnIn = 0;
  private recent: number[] = [];
  private items: readonly GameItem[];
  private readonly sides: Record<Side, number> = { left: 0, right: 0 };
  private readonly options: Required<RunOptions>;

  constructor(options: RunOptions) {
    if (options.items.length === 0) throw new Error('A run needs at least one item');
    this.options = { speed: 1, difficulty: 'normal', pools: {}, ...options };
    this.lives = options.config.lives;
    this.items = options.items;
  }

  get endless(): boolean {
    return this.options.mode === 'endless';
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
    while (this.samples.length + 1 <= this.elapsed) this.closeSample(1);

    for (const bubble of [...this.bubbles]) {
      bubble.progress = Math.min(1, bubble.progress + dt / bubble.duration);
      if (bubble.progress >= 1) this.miss(bubble);
    }
    if (this.status !== 'playing') return;

    if (this.endless) this.levelUp();
    this.spawnIn -= dt;
    if (this.spawnIn <= 0 && this.bubbles.length < this.options.config.maxBubbles) {
      if (this.spawn()) this.spawnIn = this.tuning().spawnEvery;
    }

    if (!this.endless && this.elapsed >= this.options.config.challengeTime) {
      this.end('cleared');
    }
  }

  /** Spawn interval and speed for the current level. */
  private tuning(): { crossTimeScale: number; spawnEvery: number } {
    const { config } = this.options;
    if (!this.endless) return { crossTimeScale: 1, spawnEvery: config.spawnEvery };
    return endlessTuning(config, this.level);
  }

  /** Endless: a level every 2:00; every 2 levels the pool moves to longer items. */
  private levelUp(): void {
    const level = endlessLevel(this.elapsed);
    if (level === this.level) return;
    this.level = level;
    const items = this.poolAt(level);
    if (items !== this.items) {
      this.items = items;
      this.recent = [];
    }
    this.events.push({ type: 'level', level });
  }

  /** The pool for a level, or the longest available pool below it. */
  private poolAt(level: number): readonly GameItem[] {
    const { difficulty, pools, items } = this.options;
    const target = DIFFICULTIES.indexOf(endlessPool(difficulty, level));
    for (let index = target; index > DIFFICULTIES.indexOf(difficulty); index--) {
      const pool = pools[DIFFICULTIES[index] as Difficulty];
      if (pool && pool.length > 0) return pool;
    }
    return items;
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
    bubble.unitFrom = Math.max(bubble.spawnedAt, this.freeSince);
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
    const { config, random, speed } = this.options;
    const items = this.items;
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
      duration:
        (crossTime(config, typingForm(item.reading).length) * this.tuning().crossTimeScale) / speed,
      typed: '',
      kana: 0,
      pending: '',
      misses: 0,
      spawnedAt: this.elapsed,
      unitFrom: this.elapsed,
    };
    this.bubbles.push(bubble);
    this.events.push({ type: 'spawn', bubble });
    return true;
  }

  private correct(key: string, bubble: Bubble, match: ReturnType<typeof matchRomaji>): void {
    this.stats.correctKeys += 1;
    this.second.correct += 1;
    this.stats.combo += 1;
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.stats.combo);
    bubble.typed += key;
    const kana =
      match.status === 'done'
        ? typingForm(bubble.item.reading).length
        : match.status === 'partial'
          ? match.kana
          : bubble.kana;
    if (kana > bubble.kana) this.timeKana(bubble, bubble.kana, kana);
    if (match.status === 'partial') {
      bubble.kana = match.kana;
      bubble.pending = match.pending;
    }
    this.events.push({ type: 'key', key, correct: true, bubble });
    if (match.status === 'done') this.pop(bubble);
  }

  private wrong(key: string): void {
    this.stats.wrongKeys += 1;
    this.second.wrong += 1;
    this.stats.combo = 0;
    if (this.target) this.target.misses += 1;
    this.events.push({ type: 'key', key, correct: false, bubble: this.target });
    const perLife = this.options.config.wrongKeysPerLife;
    if (perLife !== null && this.stats.wrongKeys % perLife === 0) this.loseLife();
  }

  private pop(bubble: Bubble): void {
    this.stats.popped += 1;
    this.log.push({ item: bubble.item, popped: true });
    bubble.kana = typingForm(bubble.item.reading).length;
    bubble.pending = '';
    this.remove(bubble);
    this.events.push({ type: 'pop', bubble });
  }

  private miss(bubble: Bubble): void {
    this.stats.missed += 1;
    this.log.push({ item: bubble.item, popped: false });
    this.remove(bubble);
    this.events.push({ type: 'miss', bubble });
    this.loseLife();
  }

  private release(bubble: Bubble): void {
    bubble.typed = '';
    bubble.kana = 0;
    bubble.pending = '';
    this.target = null;
    this.freeSince = this.elapsed;
    this.events.push({ type: 'release', bubble });
  }

  private remove(bubble: Bubble): void {
    const index = this.bubbles.indexOf(bubble);
    if (index !== -1) this.bubbles.splice(index, 1);
    if (this.target === bubble) {
      this.target = null;
      this.freeSince = this.elapsed;
    }
  }

  /** Records the kana units from `from` to `to` (one unit per key that completes them). */
  private timeKana(bubble: Bubble, from: number, to: number): void {
    const kana = [...bubble.item.reading].slice(from, to).join('');
    this.stats.kana += to - from;
    this.kanaTimes.push({ kana, seconds: this.elapsed - bubble.unitFrom });
    bubble.unitFrom = this.elapsed;
  }

  private closeSample(seconds: number): void {
    this.samples.push({ ...this.second, seconds });
    this.second = { correct: 0, wrong: 0 };
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
    const rest = this.elapsed - this.samples.length;
    if (rest >= MIN_SAMPLE) this.closeSample(rest);
    this.events.push({ type: 'end', status });
  }
}
