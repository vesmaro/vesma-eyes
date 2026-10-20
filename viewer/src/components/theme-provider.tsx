import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { TranslationKey } from "@/i18n";

export type Theme = "dark" | "light";
/**
 * Appearance presets (themes-presets-wave1, design brief §1): a preset is a
 * COMPLETE «surfaces + warmth + text» kit — one click, no sliders. The canon
 * points keep their lore names: Колодец = `well` (the dark :root column,
 * stored historically as "dark"), Береста = `light` (stored "light" — the
 * id doubles as the legacy storage value so existing users never move).
 * Storage compat (brief §1): no attribute = Колодец, "light" = Береста.
 */
export type PresetId = "well" | "zhila" | "sozvezdia" | "light" | "prosvet";
/** The hub choice: a preset, or «Системная» as a MODE on top (follows OS). */
export type PresetChoice = PresetId | "system";
export type ThemeFamily = Theme;

export const DARK_PRESETS = ["well", "zhila", "sozvezdia"] as const;
export const LIGHT_PRESETS = ["light", "prosvet"] as const;
export type DarkPresetId = (typeof DARK_PRESETS)[number];
export type LightPresetId = (typeof LIGHT_PRESETS)[number];

/** Family of every preset (the top-bar toggle switches FAMILIES). */
export const PRESET_FAMILY = {
  well: "dark",
  zhila: "dark",
  sozvezdia: "dark",
  light: "light",
  prosvet: "light",
} as const satisfies Record<PresetId, ThemeFamily>;

/**
 * [data-theme] attribute per preset; `null` = attribute REMOVED (the dark
 * tokens live on :root — Колодец). This is the storage-compat contract:
 * pre-wave records "dark"/"light" resolve to well/light and render exactly
 * as before the registry existed.
 */
export const PRESET_ATTR = {
  well: null,
  zhila: "zhila",
  sozvezdia: "sozvezdia",
  light: "light",
  prosvet: "prosvet",
} as const satisfies Record<PresetId, string | null>;

/** Hub segment «Оформление» — display order per the brief (§1). */
export interface PresetDef {
  id: PresetChoice;
  /** `null` for «Системная» — a mode, not a look. */
  family: ThemeFamily | null;
  labelKey: TranslationKey;
}

export const THEME_PRESETS: readonly PresetDef[] = [
  { id: "system", family: null, labelKey: "settings.hub.themeSystem" },
  { id: "well", family: "dark", labelKey: "settings.hub.presetWell" },
  { id: "zhila", family: "dark", labelKey: "settings.hub.presetZhila" },
  { id: "sozvezdia", family: "dark", labelKey: "settings.hub.presetSozvezdia" },
  { id: "light", family: "light", labelKey: "settings.hub.presetLight" },
  { id: "prosvet", family: "light", labelKey: "settings.hub.presetProsvet" },
];

/** i18n key of a hub choice's label (hub segment + SettingsMirror legend). */
export function presetLabelKey(choice: PresetChoice): TranslationKey {
  return (
    THEME_PRESETS.find((preset) => preset.id === choice)?.labelKey ??
    "settings.hub.themeSystem"
  );
}

/**
 * Family check for the RAW [data-theme] attribute — the single authority
 * for code that reads the attribute off <html> (Mermaid re-theming,
 * non-token libs) instead of consuming tokens. Light family = Береста
 * ("light") or Просвет ("prosvet"); dark family = Колодец (absence) or
 * "zhila"/"sozvezdia".
 */
export function attrIsLightFamily(attr: string | null): boolean {
  return attr === "light" || attr === "prosvet";
}

/**
 * STORAGE MODEL (documented per the wave contract — preset vs family):
 *
 * - `vesmaro.theme` (registry key, UI-23): "dark" | "light" = the EXPLICIT
 *   family lock; absent = «Системная» (follow the OS). Semantics unchanged —
 *   an older build's tab reading only this key keeps dark/light. The legacy
 *   `vesma-eyes:theme` stays a read-only fallback, never written.
 * - `vesmaro.appearance` (NEW this wave): JSON
 *   `{"lastDark":"well","lastLight":"light"}` — the LAST CHOSEN PRESET PER
 *   FAMILY. Written on every preset change INCLUDING in «Системная» mode, so
 *   the top-bar family toggle can flip dark↔light WITHOUT resetting the
 *   chosen preset to the family default: toggling away from «Жила» and back
 *   returns to «Жила», not Колодец.
 *
 * Resolution: family = explicit ?? OS; preset = slots[family]. The applied
 * attribute is PRESET_ATTR[preset] — null removes [data-theme] (Колодец).
 */
export const APPEARANCE_STORAGE_KEY = "vesmaro.appearance";
export const THEME_STORAGE_KEY = "vesmaro.theme";
export const LEGACY_THEME_STORAGE_KEY = "vesma-eyes:theme";

export interface PresetSlots {
  lastDark: DarkPresetId;
  lastLight: LightPresetId;
}

const DEFAULT_SLOTS: PresetSlots = { lastDark: "well", lastLight: "light" };

function isDarkPreset(value: unknown): value is DarkPresetId {
  return (DARK_PRESETS as readonly string[]).includes(value as string);
}

function isLightPreset(value: unknown): value is LightPresetId {
  return (LIGHT_PRESETS as readonly string[]).includes(value as string);
}

function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/**
 * Read the persisted explicit family: new key → legacy key → null
 * (= «Системная»). Guarded try/catch — private mode falls back to the
 * system default silently (spec §4.1 storage conventions).
 */
export function readStoredExplicitFamily(): Theme | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    return null; // storage unavailable — system default
  }
  try {
    const legacy = window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    return legacy === "light" || legacy === "dark" ? legacy : null;
  } catch {
    return null;
  }
}

/**
 * Read the per-family preset slots; unknown/corrupt records fall back to
 * the canonical defaults slot-by-slot (a hand-edited or partially written
 * record must never yield an invalid preset id).
 */
export function readStoredPresetSlots(): PresetSlots {
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SLOTS };
    const parsed: unknown = JSON.parse(raw);
    const record = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
    return {
      lastDark: isDarkPreset(record.lastDark) ? record.lastDark : DEFAULT_SLOTS.lastDark,
      lastLight: isLightPreset(record.lastLight) ? record.lastLight : DEFAULT_SLOTS.lastLight,
    };
  } catch {
    return { ...DEFAULT_SLOTS };
  }
}

function applyPreset(preset: PresetId): void {
  // design-system.md §9 + brief §1: dark presets carry the :root column
  // (well = attribute REMOVED), every other preset sets its [data-theme]
  // scope. «Системная» resolves to a preset first — the attribute always
  // mirrors the RESOLVED look, never the mode.
  const attr = PRESET_ATTR[preset];
  if (attr === null) {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = attr;
  }
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Theming per design-system.md §9 + the presets brief §1: default = system
 * preference (followed LIVE while no explicit choice exists), explicit
 * family persisted under `vesmaro.theme`, per-family preset slots under
 * `vesmaro.appearance`, applied via `data-theme` on <html>. «Системная»
 * removes BOTH theme records (otherwise the legacy fallback would
 * resurrect the pre-migration choice — spec acceptance §8.2) while the
 * slot record survives so the toggle always lands on the last preset.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [explicitFamily, setExplicitFamily] = useState<Theme | null>(
    () => readStoredExplicitFamily(),
  );
  const [slots, setSlots] = useState<PresetSlots>(() => readStoredPresetSlots());
  const [systemTheme, setSystemTheme] = useState<Theme>(getSystemTheme);

  // The resolved family + preset the rest of the app consumes.
  const theme: Theme = explicitFamily ?? systemTheme;
  const resolvedPreset: PresetId = theme === "dark" ? slots.lastDark : slots.lastLight;
  /** The hub control's value: the chosen preset, or «Системная». */
  const presetChoice: PresetChoice = explicitFamily === null ? "system" : resolvedPreset;

  useEffect(() => {
    applyPreset(resolvedPreset);
  }, [resolvedPreset]);

  // Blueprint §12.7: the theme-color meta follows the RESOLVED look. The
  // value is READ from the live token (zero duplicated hexes here); the
  // pre-paint bootstrap in index.html carries the first-paint values, and
  // tokens.test.ts pins its hexes against tokens.css.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-bg-base")
      .trim();
    if (value) meta.setAttribute("content", value);
  }, [resolvedPreset]);

  // Follow the OS while the user has not made an explicit choice — the
  // state above is the single authority (no storage re-reads here).
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? "light" : "dark");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  /** Persist an explicit family (slots unchanged) — top-bar toggle path. */
  const persistExplicit = useCallback((family: Theme, nextSlots: PresetSlots) => {
    try {
      // Writes go ONLY to the new registry keys (spec §4.2).
      window.localStorage.setItem(THEME_STORAGE_KEY, family);
      window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(nextSlots));
    } catch {
      // Non-fatal: the look still applies for this session.
    }
  }, []);

  const setPreset = useCallback(
    (choice: PresetChoice) => {
      if (choice === "system") {
        try {
          window.localStorage.removeItem(THEME_STORAGE_KEY);
          window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
        } catch {
          // Non-fatal: the mode still applies for this session.
        }
        // Slots survive: re-entering a family must land on the last preset.
        setExplicitFamily(null);
        return;
      }
      const family = PRESET_FAMILY[choice];
      const nextSlots: PresetSlots =
        family === "dark"
          ? { ...slots, lastDark: choice as DarkPresetId }
          : { ...slots, lastLight: choice as LightPresetId };
      persistExplicit(family, nextSlots);
      setSlots(nextSlots);
      setExplicitFamily(family);
    },
    [persistExplicit, slots],
  );

  // Top-bar toggle = a fast FAMILY flip (brief §1): it writes the explicit
  // opposite of the resolved family and lands on THAT family's last preset
  // — never on a forced default (toggling away from «Жила» and back
  // returns to «Жила»).
  const toggleTheme = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    persistExplicit(next, slots);
    setExplicitFamily(next);
  }, [persistExplicit, slots, theme]);

  const value = useMemo(
    () => ({ theme, presetChoice, resolvedPreset, setPreset, toggleTheme }),
    [theme, presetChoice, resolvedPreset, setPreset, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

interface ThemeContextValue {
  /** RESOLVED family (what the top-bar icon shows) — dark even under system. */
  theme: Theme;
  /** The hub control's value: the chosen preset, or «Системная». */
  presetChoice: PresetChoice;
  /** The RESOLVED preset id (what is applied to <html>). */
  resolvedPreset: PresetId;
  setPreset: (choice: PresetChoice) => void;
  /** Top-bar toggle: flip the dark↔light family, keep the preset slots. */
  toggleTheme: () => void;
}

/** Access the current theme. Throws outside <ThemeProvider>. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme: missing <ThemeProvider> in the component tree.");
  }
  return ctx;
}
