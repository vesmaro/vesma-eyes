import { useT } from "@/i18n";
import { useTheme } from "@/components/theme-provider";
import { useDensity } from "@/components/density-provider";
import { useLiveLayer, type LiveLayer } from "@/lib/liveLayerStore";
import { cn } from "@/lib/utils";

/**
 * «Зеркало» настроек (U6; SPEC-2026-10-07 «Система: из v12 — „Зеркало"
 * (живое превью 380–480px), „Живой слой" первой строкой»). ONE component,
 * TWO mounts (the KoraEther pattern): the sticky right rail at ≥1280 and
 * the inline slot in «Внешний вид» below it — 380–480px wide, the v12
 * canon measure.
 *
 * WHAT IT IS: a DATA preview of the current look — a specimen card, two
 * rows at the live `--row-h` density, and the legend of the three state
 * stores (theme / density / living layer). It re-renders the INSTANT a
 * control changes (the same providers the controls drive — «одно
 * состояние, два управления»), which is what «живое» means here.
 *
 * WHAT IT IS NOT: zero animation, zero timers, zero living layer. Система
 * carries NO living dose (the spec: «Доки/Система без живого слоя») — the
 * honesty gate pins /system/settings to pixel-identical frames on a silent
 * bus, forever. The one static glow (living = Полный legend dot) is DATA,
 * the same grammar as the agents' presence dot.
 *
 * A11y: the preview text is a real specimen (not aria-hidden — it carries
 * the contrast the owner will get); the legend is a description list.
 */
export function SettingsMirror({ className }: { className?: string }) {
  const t = useT();
  const { themePreference } = useTheme();
  const { density } = useDensity();
  const live = useLiveLayer();

  const themeLabel = t(
    themePreference === "dark"
      ? "settings.hub.themeDark"
      : themePreference === "light"
        ? "settings.hub.themeLight"
        : "settings.hub.themeSystem",
  );
  const densityLabel = t(
    density === "comfortable"
      ? "settings.hub.densityComfortable"
      : "settings.hub.densityCompact",
  );
  const livingLabel = t(
    live === "live"
      ? "settings.hub.livingFull"
      : live === "calm"
        ? "settings.hub.livingCalm"
        : "settings.hub.livingOff",
  );

  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-xs uppercase tracking-wide text-foreground-muted">
        {t("settings.mirror.title")}
      </p>
      <p className="mt-1 text-xs text-foreground-secondary">
        {t("settings.mirror.hint")}
      </p>

      {/* The specimen window: base stratum, a well card, two density rows.
       * Every surface/text rides the CURRENT theme's tokens — the preview
       * is the theme, not a picture of it. */}
      <div className="mt-3 overflow-hidden rounded-md border border-border-subtle shadow-well">
        <div className="bg-background p-3">
          <div className="rounded-md border border-border-subtle bg-well p-2.5 shadow-well">
            <p className="text-xs uppercase tracking-wide text-foreground-muted">
              {t("settings.mirror.sampleCaps")}
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {t("settings.mirror.sampleTitle")}
            </p>
            <p className="mt-0.5 text-xs text-foreground-secondary">
              {t("settings.mirror.sampleSecondary")}
            </p>
            <p className="mt-0.5 text-xs text-foreground-muted">
              {t("settings.mirror.sampleMuted")}
            </p>
          </div>
          <div className="mt-2 overflow-hidden rounded-md border border-border-subtle">
            <div
              className="flex items-center border-b border-border-subtle px-2.5 text-xs text-foreground-secondary"
              style={{ minHeight: "var(--row-h)" }}
            >
              {t("settings.mirror.sampleRow")} · 1
            </div>
            <div
              className="flex items-center px-2.5 text-xs text-foreground-secondary"
              style={{ minHeight: "var(--row-h)" }}
            >
              {t("settings.mirror.sampleRow")} · 2
            </div>
          </div>
        </div>
      </div>

      {/* The state legend — the mirror's data payload. */}
      <dl className="mt-3 space-y-1 text-xs">
        <div className="flex items-center gap-2">
          <dt className="text-foreground-muted">{t("settings.mirror.themeCaption")}</dt>
          <dd className="text-foreground-secondary">{themeLabel}</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="text-foreground-muted">{t("settings.mirror.densityCaption")}</dt>
          <dd className="text-foreground-secondary">{densityLabel}</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="text-foreground-muted">{t("settings.mirror.livingCaption")}</dt>
          <dd className="flex items-center gap-1.5 text-foreground-secondary">
            <span
              aria-hidden="true"
              className={
                "inline-block size-2 shrink-0 rounded-full " +
                (live === "live"
                  ? "bg-iris-bright"
                  : live === "calm"
                    ? "bg-iris-dim"
                    : "border border-border-subtle bg-transparent")
              }
              // Static glow ONLY while the layer is live — light as data
              // (the presence-dot grammar); zero animation anywhere.
              style={
                live === "live" ? { boxShadow: "var(--glow-iris)" } : undefined
              }
            />
            {livingLabel}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** The live-layer value type re-export keeps the hub's imports single-source. */
export type { LiveLayer };
