/**
 * Tone engine of the living layer (ME-071 W1a) — lazy chunk `web-tones`.
 *
 * Semantics are the canon of docs/design/15-WOW-DIRECTION §14.6.1:
 * - BASE tone from real health: error > warn > update > neutral; the tone
 *   crossfades over `--duration-tone-fade` (1200ms), never switches
 *   instantly; `null` health (no data yet) is the honest neutral.
 * - TEMP tones from real bus events: classes 10s (background) / 12s
 *   (ordinary) / ≤60s (elevated, holds until the terminal event of its
 *   family); the last 20% of a window fades back to the base; ≤2 temp tones
 *   coexist — a new tone of the same key prolongs its window, a newcomer of
 *   lower priority than the sitting lowest is dropped (priority
 *   error > warn > confidence > success > write > recall).
 * - Error hold: the error base tone caps at `--duration-tone-hold` (≤60s)
 *   and releases early on a confirmed-ok health poll or a terminal ok event.
 * - Muted (anti-fake gate) → strictly neutral, events ignored.
 *
 * Pure logic + injected token reader — unit-tested with a fake clock.
 */

type ToneKey = "recall" | "write" | "success" | "conf" | "warn" | "error";

/** Deterministic 0..997 pick — shared by the engine (vein choice) and the
 * well organ (edge choice/direction): the same event kind always starts the
 * same way. Lives here so both web-tones consumers reuse one copy. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 997;
}

// --- the breath window (U2 honesty of light) ---------------------------------
//
// SPEC-2026-10-07, motion law 2–3: «первое дыхание из шины реальных событий;
// шина молчит — экран стоит». Ambient motion is no longer always-on: a REAL
// bus event opens ONE breath window (--duration-breath); the vein sheen and
// the well's drift/substrate breath animate only inside it. After the window
// the layer rests ≥ --duration-breath-rest (events keep TONING — state, not
// motion), so the duty stays ≤ 3500/(3500+10500) = 25%. Any user input
// freezes immediately (the ≤80ms law). Zero timers while resting: the next
// event re-checks the cooldown synchronously.

export interface Breath {
  /** A real bus event: open the window unless resting/reduced/muted. */
  event(): void;
  /** Any user input (or a regime flip): freeze motion NOW. */
  freeze(): void;
  /** True while ambient motion is allowed (a window is open). */
  readonly isOpen: boolean;
  /** Subscribe to open/close flips; fires the current state immediately. */
  subscribe(fn: (open: boolean) => void): () => void;
  /** Idempotent teardown (StrictMode). */
  destroy(): void;
}

/** Service frames are not events: `hello` must never open a window. */
export function isBusServiceKind(kind: string): boolean {
  return kind === "hello";
}

export function createBreath(
  read: (token: string, fallback: string) => string,
  allowed: () => boolean,
): Breath {
  // Reduced mirrors are 0ms — a zero window can never open (0 is a LEGAL
  // value here, unlike the engines' `parseFloat || fb` idiom). KEEP LEAN —
  // scripts/budget-check.mjs measures this chunk.
  const num = (name: string, fb: number): number => {
    const v = Number.parseFloat(read(name, String(fb)));
    return Number.isFinite(v) && v >= 0 ? v : fb;
  };
  const win = num("--duration-breath", 3500);
  const rest = num("--duration-breath-rest", 10500);
  let open = false; // the ANNOUNCED state — flips only via event()/close()
  let restUntil = 0;
  let timer: ReturnType<typeof setTimeout> | 0 = 0;
  let dead = false;
  const ls = new Set<(o: boolean) => void>();
  const fire = (o: boolean): void => {
    for (const fn of [...ls]) fn(o);
  };
  /** Close the window; only NATURAL expiry starts the quiet — an input
   * freeze leaves no cooldown (the next event may breathe immediately). */
  const close = (cool: boolean): void => {
    if (timer) {
      clearTimeout(timer);
      timer = 0;
    }
    if (!open) return;
    open = false;
    restUntil = cool ? performance.now() + rest : 0;
    fire(false);
  };

  return {
    event(): void {
      if (dead || open || !allowed() || win <= 0 || performance.now() < restUntil)
        return;
      open = true;
      fire(true);
      timer ||= setTimeout(() => {
        timer = 0;
        close(true);
      }, win);
    },
    freeze(): void {
      if (!dead) close(false);
    },
    get isOpen(): boolean {
      return !dead && open;
    },
    subscribe(fn: (o: boolean) => void): () => void {
      ls.add(fn);
      fn(open);
      return () => {
        ls.delete(fn);
      };
    },
    destroy(): void {
      dead = true;
      if (timer) clearTimeout(timer);
      timer = 0;
      const was = open;
      open = false;
      if (was) fire(false); // announce the close before detaching
      ls.clear();
    },
  };
}

/** True when animation must not run at all (canon: a STATIC drawing). */
export function isReducedMotion(): boolean {
  return (
    document.documentElement.dataset.motion === "reduced" ||
    (typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches)
  );
}

/** Kind → [tone key, window ms, hold?] — the real SSE dictionary mapped by
 * MEANING onto the §14.6.1 §2 classes (no colour without a source). Kinds
 * absent here carry no tone of their own; the base health tone speaks. */
const KIND_TONE: Record<string, [ToneKey, number, 1?]> = {
  // background · 10s — the tissue narrates, no consequences:
  "task.updated": ["recall", 10000],
  "task.moved": ["recall", 10000],
  notification: ["recall", 10000],
  "executor.updated": ["recall", 10000],
  "automation.rule.created": ["recall", 10000],
  "automation.rule.updated": ["recall", 10000],
  "automation.rule.toggled": ["recall", 10000],
  "automation.rule.deleted": ["recall", 10000],
  // ordinary · 12s — something was written / created / connected:
  "task.created": ["write", 12000],
  report: ["write", 12000],
  "assignment.started": ["write", 12000],
  "assignment.claimed": ["write", 12000],
  "assignment.done": ["write", 12000],
  "harness.added": ["write", 12000],
  "enrollment.used": ["write", 12000],
  "executor.online": ["success", 12000],
  "pairing.confirmed": ["success", 12000],
  "provisioning.ok": ["success", 12000],
  // elevated · ≤60s hold — until the terminal event of the family:
  "task.blocked": ["warn", 60000, 1],
  "assignment.failed": ["warn", 60000, 1],
  "assignment.expired": ["warn", 60000, 1],
  "pairing.requested": ["conf", 60000, 1],
  "enrollment.created": ["conf", 60000, 1],
  "provisioning.failed": ["error", 60000, 1],
};

/** Release rules: a terminal event drops the matching hold (§14.6.1 §2). */
const RELEASE: Record<string, ToneKey[]> = {
  "assignment.started": ["warn"],
  "assignment.done": ["warn"],
  "pairing.confirmed": ["conf"],
  "pairing.revoked": ["conf"],
  "pairing.expired": ["conf"],
  "enrollment.used": ["conf"],
  "enrollment.revoked": ["conf"],
  "enrollment.expired": ["conf"],
  "provisioning.ok": ["error"],
};

const PRIORITY: Record<ToneKey, number> = {
  error: 6,
  warn: 5,
  conf: 4,
  success: 3,
  write: 2,
  recall: 1,
};

interface TempTone {
  key: ToneKey;
  rgb: [number, number, number];
  t0: number;
  dur: number;
  hold: boolean;
}

export interface Tones {
  event(kind: string): void;
  health(states: readonly string[] | null): void;
  setUpdate(on: boolean): void;
  /** Current vein colour as `rgb(r,g,b)`; null = strictly neutral (muted). */
  frame(now: number, dt: number): string | null;
  /**
   * Step-mode read for lazy consumers (W1b well organ): the tone TARGET
   * right now — no crossfade state, the consumer's CSS owns the fade — plus
   * the base colour (the 80%-window return target), whether the colour
   * carries a REAL signal (a temp tone, or a base ≠ the resting recall
   * family), and the ms until the dominant temp tone's next state change
   * (0 = nothing pending → the consumer schedules NO timer). null = muted.
   */
  step(now: number): ToneStep | null;
}

export interface ToneStep {
  /** Tone target now (temp tone, else base) as `rgb(r,g,b)`. */
  readonly color: string;
  /** The base colour — what the tone returns to at the 80% window mark. */
  readonly base: string;
  /** True when the colour carries a real signal (§14.6.1: no idle tint). */
  readonly real: boolean;
  /** Ms until the next scheduled change of the dominant temp tone. */
  readonly nextIn: number;
}

export function createTones(
  read: (token: string, fallback: string) => string,
  isMuted: () => boolean,
): Tones {
  const num = (name: string, fb: number) => parseFloat(read(name, String(fb))) || fb;
  const FADE = num("--duration-tone-fade", 1200);
  const HOLD_CAP = num("--duration-tone-hold", 60000);

  const parseRgb = (v: string, fb: string): [number, number, number] => {
    const hex = /#([0-9a-f]{3,6})/i.exec(v);
    if (hex) {
      const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
      return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
      ];
    }
    const p = v.match(/\d+(\.\d+)?/g);
    return p && p.length >= 3
      ? [+p[0], +p[1], +p[2]]
      : (parseRgb(fb, "122,138,158") as [number, number, number]);
  };

  const color: Record<ToneKey, [number, number, number]> = {
    recall: parseRgb(read("--synapse-recall", "#4fc2ce"), "#4fc2ce"),
    write: parseRgb(read("--synapse-write", "#c9933a"), "#c9933a"),
    success: parseRgb(read("--color-success", "#3fbf7f"), "#3fbf7f"),
    conf: parseRgb(read("--color-confidence", "#c9933a"), "#c9933a"),
    warn: parseRgb(read("--color-warning", "#d9a03f"), "#d9a03f"),
    error: parseRgb(read("--synapse-error", "#e0655c"), "#e0655c"),
  };
  // The sixth semantic colour — lilac «пришло обновление» (§14.6.1 §4).
  const UPDATE_RGB = parseRgb(read("--web-tone-update", "#a88fc7"), "#a88fc7");
  // Neutral base = iris family tint over the myelin structure (§14.6.1 §1).
  const NEUTRAL = color.recall;

  let nowRef = 0;
  let healthWarn = false;
  let healthError = false;
  let errorUntil = 0; // error-event hold on the BASE tone (≤ --duration-tone-hold)
  let update = false;
  let base: [number, number, number] = NEUTRAL;
  let target = NEUTRAL;
  let fadeLeft = 0;
  const tones: TempTone[] = [];

  type BaseKey = ToneKey | "update";
  const baseKey = (): BaseKey =>
    nowRef < errorUntil || healthError
      ? "error"
      : healthWarn
        ? "warn"
        : update
          ? "update"
          : "recall";

  function rebase(): void {
    const k = baseKey();
    const want = k === "update" ? UPDATE_RGB : color[k];
    if (want.join() !== target.join()) {
      target = want;
      fadeLeft = FADE;
    }
  }

  const dropKey = (key: ToneKey): void => {
    for (let i = tones.length - 1; i >= 0; i--)
      if (tones[i].key === key) tones.splice(i, 1);
  };

  return {
    event(kind) {
      if (isMuted()) return;
      for (const key of RELEASE[kind] ?? []) dropKey(key);
      if (kind === "provisioning.ok") errorUntil = 0;
      const m = KIND_TONE[kind];
      if (!m) return;
      const [key, dur, hold] = m;
      const same = tones.find((t) => t.key === key);
      if (same) {
        same.t0 = nowRef; // same tone prolongs its window (§14.6.1 §2)
        same.dur = dur;
        return;
      }
      if (tones.length >= 2) {
        // Coalesce: the newcomer wins only over the sitting lowest priority.
        const lowest = tones.reduce((a, b) =>
          PRIORITY[a.key] <= PRIORITY[b.key] ? a : b,
        );
        if (PRIORITY[key] > PRIORITY[lowest.key]) {
          tones.splice(tones.indexOf(lowest), 1);
        } else return;
      }
      tones.push({ key, rgb: color[key], t0: nowRef, dur, hold: !!hold });
    },
    health(states) {
      if (isMuted() || !states) {
        healthWarn = healthError = false;
      } else {
        healthError = states.some((s) => /error/i.test(s));
        healthWarn = states.some((s) => /warn|degraded/i.test(s));
      }
      if (!healthError) errorUntil = 0; // confirmed ok releases the hold
      rebase();
    },
    setUpdate(on) {
      update = !!on && !isMuted();
      rebase();
    },
    frame(now, dt) {
      nowRef = now;
      if (isMuted()) {
        tones.length = 0;
        errorUntil = 0;
        update = false;
        healthWarn = healthError = false;
        target = NEUTRAL;
        base = NEUTRAL;
        fadeLeft = 0;
        return null; // strictly neutral — no colour at all
      }
      if (tones.some((t) => t.key === "error")) {
        errorUntil = now + HOLD_CAP; // hold ≤ --duration-tone-hold (§14.6.1)
      }
      rebase();
      if (fadeLeft > 0) {
        const k = Math.min(1, dt / Math.max(1, fadeLeft));
        fadeLeft = Math.max(0, fadeLeft - dt);
        base = base.map((c, i) => c + (target[i] - c) * k) as [number, number, number];
      } else {
        base = target;
      }
      for (let i = tones.length - 1; i >= 0; i--) {
        if (!tones[i].hold && now - tones[i].t0 >= tones[i].dur) tones.splice(i, 1);
      }
      if (!tones.length) {
        return `rgb(${base[0] | 0},${base[1] | 0},${base[2] | 0})`;
      }
      let best = tones[0];
      for (const t of tones) {
        if (PRIORITY[t.key] > PRIORITY[best.key]) best = t;
      }
      const col = best.rgb.slice() as [number, number, number];
      const k = (now - best.t0) / best.dur;
      if (!best.hold && k > 0.8) {
        const f = (k - 0.8) / 0.2;
        for (let i = 0; i < 3; i++) col[i] += (base[i] - col[i]) * f;
      }
      return `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`;
    },
    step(now) {
      nowRef = now;
      if (isMuted()) return null;
      if (tones.some((t) => t.key === "error")) {
        errorUntil = now + HOLD_CAP;
      }
      rebase();
      base = target; // step mode: the consumer's CSS owns the fade
      fadeLeft = 0;
      for (let i = tones.length - 1; i >= 0; i--) {
        if (!tones[i].hold && now - tones[i].t0 >= tones[i].dur) {
          tones.splice(i, 1);
        }
      }
      const baseCol = `rgb(${base[0] | 0},${base[1] | 0},${base[2] | 0})`;
      const baseReal = baseKey() !== "recall";
      let best: TempTone | null = null;
      for (const t of tones) {
        if (best === null || PRIORITY[t.key] > PRIORITY[best.key]) best = t;
      }
      if (best === null) {
        return { color: baseCol, base: baseCol, real: baseReal, nextIn: 0 };
      }
      if (best.hold) {
        // holds live until the terminal event of their family (§14.6.1 §2)
        return {
          color: `rgb(${best.rgb[0]},${best.rgb[1]},${best.rgb[2]})`,
          base: baseCol,
          real: true,
          nextIn: 0,
        };
      }
      const elapsed = now - best.t0;
      if (elapsed < best.dur * 0.8) {
        return {
          color: `rgb(${best.rgb[0]},${best.rgb[1]},${best.rgb[2]})`,
          base: baseCol,
          real: true,
          nextIn: best.dur * 0.8 - elapsed,
        };
      }
      // last 20% of the window: back to the base tone (organ returns to
      // «none» when the base itself is the resting recall family)
      return {
        color: baseCol,
        base: baseCol,
        real: baseReal,
        nextIn: Math.max(0, best.dur - elapsed),
      };
    },
  };
}
