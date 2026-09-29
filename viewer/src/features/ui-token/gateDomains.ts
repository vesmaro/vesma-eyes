import type { TranslationKey } from "@/i18n";

/**
 * The v6 public-surface table (union И1, 07k §2.1 + owner adдендум
 * 2026-09-29): which Shell domains sit behind the owner sign-in and which
 * stay public. Pure data + pure matching, consumed by the Shell content
 * gate (GatedOutlet) and the sidebar locks — one source, no drift.
 *
 * The CLIENT gate is a VIEW over the owner's ratified public-surface model;
 * the RIGHTS stay server-side (dressing map §1.1.6 "честность границ").
 * Server-side verification status at И1 (auditors, see the ME-043 report):
 * Kora reads 401 anonymous (verified live), Память/Задачи/Агенты/Система
 * reads are currently OPEN on the wire ("the cluster ingress is the auth
 * boundary") — the client gate implements the product model, the read-wall
 * gap is a server-side finding, not something the UI may silently unlock
 * around.
 *
 * Обзор (/) and Документы (/docs) are public by the owner's verdict
 * (07k §10-аддендум) — no locks, no gate screens. /pair and /auth are
 * public entry surfaces outside the Shell entirely.
 */
export interface GateDomain {
  /** The domain's route prefix (its canonical root path). */
  prefix: string;
  /** The domain's display-name key (the H1 template interpolates it). */
  nameKey: TranslationKey;
  /** The «что внутри» line (07k §3 table). */
  insideKey: TranslationKey;
  /** The disclosure lines «Что я увижу после входа» (07k §3) — honest,
   * one per real page of the domain, no promises of what is not there. */
  seeMoreKeys: readonly [TranslationKey, TranslationKey, TranslationKey];
}

export const GATED_DOMAINS: readonly GateDomain[] = [
  {
    prefix: "/memory",
    nameKey: "nav.memory",
    insideKey: "auth.gate.inside.memory",
    seeMoreKeys: [
      "auth.gate.seeMore.memoryRecords",
      "auth.gate.seeMore.memorySearch",
      "auth.gate.seeMore.memoryPulse",
    ],
  },
  {
    prefix: "/tasks",
    nameKey: "nav.tasks",
    insideKey: "auth.gate.inside.tasks",
    seeMoreKeys: [
      "auth.gate.seeMore.tasksBoard",
      "auth.gate.seeMore.tasksInbox",
      "auth.gate.seeMore.tasksArchive",
    ],
  },
  {
    prefix: "/agents",
    nameKey: "nav.agents",
    insideKey: "auth.gate.inside.agents",
    seeMoreKeys: [
      "auth.gate.seeMore.agentsHosts",
      "auth.gate.seeMore.agentsExecution",
      "auth.gate.seeMore.agentsConnect",
    ],
  },
  {
    prefix: "/kora",
    nameKey: "nav.kora",
    insideKey: "auth.gate.inside.kora",
    seeMoreKeys: [
      "auth.gate.seeMore.koraJournal",
      "auth.gate.seeMore.koraTranscripts",
      "auth.gate.seeMore.koraCoverage",
    ],
  },
  {
    prefix: "/system",
    nameKey: "nav.system",
    insideKey: "auth.gate.inside.system",
    seeMoreKeys: [
      "auth.gate.seeMore.systemStatus",
      "auth.gate.seeMore.systemSettings",
      "auth.gate.seeMore.systemDevices",
    ],
  },
];

/**
 * The gated domain a pathname sits in, or null for public paths. Prefix
 * matching on the domain root segment — `/memory/anything`, `/kora/:id`
 * and `/system/...` all resolve to their domain; `/`, `/docs/*`, `/pair`,
 * `/auth` and unknown paths answer null (public or outside the Shell).
 */
export function gatedDomainFor(pathname: string): GateDomain | null {
  for (const domain of GATED_DOMAINS) {
    if (pathname === domain.prefix || pathname.startsWith(`${domain.prefix}/`)) {
      return domain;
    }
  }
  return null;
}
