// Leaderboard submission panel on the results screen (08-spec-game: "Leaderboard
// submission"). The Turnstile script loads only when the player presses Submit.

import {
  ensureSubmitterToken,
  NAME_KEY,
  NAME_PATTERN,
  rememberEntry,
} from '../lib/game/leaderboard/client';
import type { Combo } from '../lib/game/leaderboard/types';
import type { RunClaim } from '../lib/game/leaderboard/verify';
import { turnstileWidget, type Widget } from '../lib/turnstile-client';

export type PanelState = 'hidden' | 'offer' | 'done' | 'declined' | 'reduced' | 'offline';

export interface SubmitContext {
  /** null when the run cannot be offered (quit). */
  state: Exclude<PanelState, 'done' | 'declined'>;
  claim: Omit<RunClaim, 'runId'> | null;
  /** Resolves to the server run ID, or null when /api/game/runs failed. */
  runId: Promise<string | null>;
  /** "Hiragana · Normal · Challenge". */
  comboLabel: string;
  /** Called with the rank once the run is on the board (for the share card chip). */
  onRanked: (rank: number | null, name: string) => void;
}

/** Waits up to `ms` for the widget's token (the managed widget solves itself). */
async function tokenFrom(widget: Widget, ms = 10_000): Promise<string> {
  const start = Date.now();
  while (!widget.token() && Date.now() - start < ms) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return widget.token();
}

function readName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Blocked storage: the name is simply not remembered.
  }
}

function need<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

export class SubmitPanel {
  private readonly labels: Record<string, string>;
  private readonly form: HTMLFormElement;
  private readonly name: HTMLInputElement;
  private readonly error: HTMLElement;
  private readonly send: HTMLButtonElement;
  private readonly sendLabel: HTMLElement;
  private readonly rank: HTMLElement;
  private readonly box: HTMLElement;
  private widget: Widget | null | undefined;
  private context: SubmitContext | null = null;
  /** Bumped per run, so late answers for an old run are ignored. */
  private generation = 0;

  constructor(private readonly root: HTMLElement) {
    this.labels = JSON.parse(root.dataset.labels ?? '{}') as Record<string, string>;
    this.form = need(root, '[data-submit-form]');
    this.name = need(root, '[data-submit-name]');
    this.error = need(root, '[data-submit-error]');
    this.send = need(root, '[data-submit-send]');
    this.sendLabel = need(root, '[data-submit-send-label]');
    this.rank = need(root, '[data-submit-rank]');
    this.box = need(root, '[data-turnstile]');

    this.name.addEventListener('input', () => this.validate(false));
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.submit();
    });
    need(root, '[data-submit-decline]').addEventListener('click', () => {
      this.setState('declined');
      need<HTMLElement>(root, '[data-submit-reopen]').focus();
    });
    need(root, '[data-submit-reopen]').addEventListener('click', () => {
      this.setState('offer');
      this.name.focus();
    });
  }

  private label(key: string, params: Record<string, string | number> = {}): string {
    return (this.labels[key] ?? key).replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    );
  }

  private setState(state: PanelState): void {
    this.root.dataset.state = state;
    this.root.hidden = state === 'hidden';
  }

  show(context: SubmitContext): void {
    this.context = context;
    const generation = ++this.generation;
    this.error.textContent = '';
    this.name.removeAttribute('aria-invalid');
    this.name.value = this.name.value || readName();
    this.send.disabled = false;
    this.sendLabel.textContent = this.label('send');
    this.rank.replaceChildren();
    this.validate(true);
    this.setState(context.state);
    if (context.state !== 'offer' || !context.claim) return;
    // A run without a server run cannot be submitted: say so once that is known.
    void context.runId.then((runId) => {
      if (generation !== this.generation) return;
      if (runId === null) this.setState('offline');
      else void this.fillRank(context.claim as Omit<RunClaim, 'runId'>, generation);
    });
  }

  /** "It would currently rank #4 in Hiragana · Normal · Challenge." */
  private async fillRank(claim: Omit<RunClaim, 'runId'>, generation: number): Promise<void> {
    const query = new URLSearchParams({
      script: claim.script,
      difficulty: claim.difficulty,
      mode: claim.mode,
      cleared: String(claim.status === 'cleared'),
      wpm: String(claim.wpm),
      accuracy: String(claim.accuracy),
      duration: String(Math.round(claim.duration)),
    });
    try {
      const response = await fetch(`/api/game/leaderboard/rank?${query.toString()}`);
      if (!response.ok || generation !== this.generation) return;
      const { rank } = (await response.json()) as { rank: number };
      const [before, after] = this.label('rank', {
        combo: this.context?.comboLabel ?? '',
      }).split('{rank}');
      const strong = document.createElement('strong');
      strong.textContent = `#${rank}`;
      this.rank.replaceChildren(before ?? '', strong, `${after ?? ''} `);
    } catch {
      // The sentence is optional; the panel works without it.
    }
  }

  private validate(quiet: boolean): boolean {
    const valid = NAME_PATTERN.test(this.name.value.trim());
    this.send.disabled = !valid;
    if (valid) {
      this.name.removeAttribute('aria-invalid');
      this.error.textContent = '';
    } else if (!quiet && this.name.value.length > 0) {
      this.name.setAttribute('aria-invalid', 'true');
      this.error.textContent = this.label('invalid');
    }
    return valid;
  }

  private fail(message: string, field = false): void {
    this.error.textContent = message;
    if (field) {
      this.name.setAttribute('aria-invalid', 'true');
      this.name.focus();
    }
    this.send.disabled = false;
    this.sendLabel.textContent = this.label('send');
    this.widget?.reset();
  }

  private async submit(): Promise<void> {
    const context = this.context;
    if (!context?.claim || !this.validate(false)) return;
    const generation = this.generation;
    const name = this.name.value.trim();
    this.send.disabled = true;
    this.sendLabel.textContent = this.label('sending');
    this.error.textContent = '';

    const runId = await context.runId;
    if (!runId) {
      this.setState('offline');
      return;
    }
    this.widget ??= await turnstileWidget(this.box, this.root.dataset.sitekey ?? '');
    const turnstile = this.widget ? await tokenFrom(this.widget) : '';
    if (!turnstile) {
      this.fail(this.label('verify'));
      return;
    }

    let response: Response;
    try {
      response = await fetch('/api/game/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...context.claim,
          runId,
          name,
          submitter: ensureSubmitterToken(),
          turnstile,
        }),
      });
    } catch {
      this.fail(this.label('error'));
      return;
    }
    if (generation !== this.generation) return;
    const body = (await response.json().catch(() => ({}))) as {
      id?: string;
      rank?: number | null;
      error?: string;
    };

    if (response.status === 201 && body.id) {
      saveName(name);
      rememberEntry(body.id);
      this.showDone(name, body.rank ?? null, context);
      return;
    }
    if (body.error === 'name-taken') return this.fail(this.label('taken'), true);
    if (body.error === 'name-invalid') return this.fail(this.label('nameRejected'), true);
    if (body.error === 'not-better') {
      return this.fail(
        typeof body.rank === 'number'
          ? this.label('notBetter', { rank: body.rank })
          : this.label('notBetterHidden'),
      );
    }
    if (body.error === 'invalid-run') {
      this.fail(this.label('invalidRun'));
      this.send.disabled = true;
      return;
    }
    this.fail(this.label(response.status === 429 ? 'limit' : 'error'));
  }

  private showDone(name: string, rank: number | null, context: SubmitContext): void {
    const claim = context.claim as Combo;
    const text =
      rank === null
        ? this.label('done.hidden', { name })
        : this.label('done.text', { name, rank, combo: context.comboLabel });
    need(this.root, '[data-submit-done-text]').textContent = text;
    // Button renders a plain <a> for links (no extra attributes), so find it by its box.
    const view = need<HTMLAnchorElement>(this.root, '[data-submit-done] a');
    const query = new URLSearchParams({
      script: claim.script,
      difficulty: claim.difficulty,
      mode: claim.mode,
    });
    view.href = `${this.root.dataset.board ?? '/game/leaderboard'}?${query.toString()}`;
    this.setState('done');
    context.onRanked(rank, name);
  }
}
