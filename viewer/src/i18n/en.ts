import type { TranslationKey } from "./ru";

/**
 * English dictionary. The Record<TranslationKey, string> typing makes the
 * compiler reject a missing or extra key against ru.ts (the key source of
 * truth) — dictionary parity is a build-time guarantee, not a test.
 */
export const en: Record<TranslationKey, string> = {
  // --- navigation / layout ---------------------------------------------------
  // Domain sidebar (redesign concept §2.1 — Overview + 5 domains).
  "nav.overview": "Overview",
  "nav.memory": "Memory",
  "nav.records": "Records",
  "nav.record": "Record",
  "nav.pulse": "Pulse",
  "nav.tasks": "Tasks",
  "nav.agents": "Agents",
  "nav.kora": "Kora",
  "nav.stores": "Stores",
  "nav.system": "System",
  "nav.soon": "soon",
  // ME-072 A: honest badge for a blocked-but-EXISTING section (its route
  // answers) — «later», not «soon».
  "nav.later": "later",
  "nav.soonAgents": "the Agents domain arrives in Phase 4",
  "nav.soonStores": "the Stores domain arrives in Phase 4",
  // UX-overhaul §6/§8 (Ф1): Sessions/Traces leave the nav as disabled slots.
  "nav.soonSessions": "Sessions coming later",
  "nav.soonTraces": "Traces coming later",
  // Section labels (level 2 pages).
  "nav.search": "Search",
  "nav.memories": "Records",
  "nav.tags": "Tags",
  // Task-domain sections (Ф2).
  "nav.task": "Task",
  "nav.taskList": "List",
  "nav.taskBoard": "Kanban",
  "nav.taskInbox": "Inbox",
  "nav.taskArchive": "Archive",
  "nav.status": "Status",
  "nav.sessions": "Sessions",
  "nav.traces": "Traces",
  "nav.primary": "Primary",
  "nav.session": "Session",
  "nav.collapse": "Collapse sidebar",
  "nav.expand": "Expand sidebar",
  // Session-aware mode line (fix/login-feedback) — see ru.ts.
  "nav.modeReadOnly": "read-only",
  "nav.modeActive": "session active",
  // UI-22: paired device without an owner session — see ru.ts.
  "nav.modeDevice": "device connected",
  "nav.modeDeviceControl": "device connected · full access",
  // Sidebar version label (owner feedback) — see ru.ts.
  "nav.versionAria": "App version {{version}}",
  // UI-30: the domain-row aggregate badge («Задачи») — see ru.ts.
  "nav.newCount": "new: {{count}}",
  "nav.sections": "Sections",
  "nav.palette": "Palette",
  "nav.cheatsheet": "Cheatsheet",
  "shell.skipToContent": "Skip to content",
  "shell.viewFell": "This view fell into the well",
  // Update banner (stale-tab self-healing) — see ru.ts.
  "shell.updateAvailable": "A new version is available",
  "shell.updateReload": "Reload",
  "shell.tryAgain": "Try again",

  // --- breadcrumbs (concept §2.2) ----------------------------------------------
  "breadcrumbs.label": "Breadcrumb",
  // Back control of the sticky crumb row (UI-18 spec §3.4): see ru.ts.
  "nav.backTo": "Back: {{place}}",
  "nav.backFallback": "Back",

  // --- top bar ----------------------------------------------------------------
  "topbar.themeToLight": "Switch to light theme",
  "topbar.themeToDark": "Switch to dark theme",
  "topbar.themeLight": "Light theme",
  "topbar.themeDark": "Dark theme",
  // В1 live-layer indicator (blueprint §6.6, canon v11 §4).
  "topbar.liveLayerAria": "Living layer: {{state}}. Click to change.",
  "topbar.liveLayerTitle": "Living layer: live → paused → off",
  "topbar.liveLive": "live",
  "topbar.liveCalm": "paused",
  "topbar.liveOff": "off",
  "topbar.langLabel": "Interface language",
  "topbar.searchPlaceholder": "Search memory and tasks…",
  "topbar.searchLabel": "Global search across memory and tasks",
  "topbar.openSidebar": "Open sections",
  "topbar.densityToCompact": "Switch density to compact",
  "topbar.densityToComfortable": "Switch density to comfortable",
  "topbar.densityCompact": "Compact density",
  "topbar.densityComfortable": "Comfortable density",
  // ME-071 W3 slice 2: the status-zone pill (no tier codes in UI copy).
  "topbar.b1.title": "Living layer: {{state}}",
  "topbar.b1.stateOk": "nominal",
  "topbar.b1.stateWarn": "with caveats",
  "topbar.b1.stateError": "problem",
  "topbar.b1.stateNone": "no data yet",
  "topbar.b1.done": "resolutions this session: {{count}}",

  // --- hotkeys (Ф1 `/`+`?`; Ф2 adds the palette's ⌘K/Ctrl+K) ---------------------
  "hotkeys.title": "Keyboard shortcuts",
  "hotkeys.subtitle":
    "The shell hotkey layer. ⌘K works inside form fields too — the rest stay quiet there.",
  "hotkeys.openPalette": "Open the palette",
  "hotkeys.openPaletteAnywhere":
    "The palette — from anywhere, even inside a form field",
  "hotkeys.focusSearch": "Focus the global search",
  "hotkeys.toggleSidebar": "Collapse or expand the sidebar",
  "hotkeys.cheatsheet": "This cheatsheet",
  "hotkeys.closeDialog": "Close the dialog",
  "hotkeys.escKey": "Esc",
  "hotkeys.openAria": "Keyboard shortcuts cheatsheet",

  // --- command palette (UX-overhaul §7.3, Ф2) ------------------------------------
  "cmdk.title": "Search",
  "cmdk.placeholder": "Memory, tasks, agents, navigation — start typing",
  "cmdk.openAria": "Open search",
  "cmdk.groupMemory": "Memory",
  "cmdk.groupTasks": "Tasks",
  "cmdk.groupAgents": "Agents",
  "cmdk.groupNav": "Go to",
  "cmdk.resultsLabel": "Results",
  "cmdk.noResults": "Nothing found for “{{query}}”.",
  "cmdk.searching": "Searching…",
  "cmdk.searchFailed": "Memory search is unavailable",
  "cmdk.extendedSearch": "Advanced search",
  "cmdk.hintNavigate": "↑↓ — navigate",
  "cmdk.hintOpen": "Enter — open",
  "cmdk.hintClose": "Esc — close",

  // --- overview cockpit (UX-overhaul §3, Ф2 — live blocks) ------------------------
  "cockpit.busyTitle": "Who is busy",
  "cockpit.busyAll": "All agents",
  "cockpit.busyOnline": "executors connected: {{online}} of {{total}}",
  "cockpit.busyWorking": "tasks in progress: {{count}}",
  "cockpit.busyQueued": "queued: {{count}}",
  "cockpit.agentsNone": "No agents yet — connect the first one",
  "cockpit.agentsNoneAction": "Connect an agent",
  "cockpit.busyError": "Could not load who is busy",
  "cockpit.waitingTitle": "Waiting for you",
  // ME-072 C: the chip renders the number and this LABEL side by side —
  // the count lives only in the numeral (no «3 … waiting for you: 3» double).
  "cockpit.waitingSummaryLabel": "Waiting for the owner",
  "cockpit.waitingSummaryTitle": "Open the most urgent",
  "cockpit.waitingInbox": "Inbox: {{count}}",
  "cockpit.waitingReview": "In review: {{count}}",
  "cockpit.waitingQueued": "Queued: {{count}}",
  "cockpit.waitingError": "Could not count what is waiting",
  "cockpit.memoryTitle": "In memory",
  "cockpit.retry": "Retry",

  // --- overview (concept §2.4 — honest Ф1 cut) -----------------------------------
  "overview.title": "Overview",
  "overview.tagline": "a gaze into oneself",
  "overview.searchHint": "Press / or ⌘K to search",
  // Well hero (blueprint §12.3): display headline + counters + HUD.
  "overview.heroTitle": "The memory is alive",
  "overview.heroSubtitle": "Your AI helpers’ memory",
  "overview.heroMemories": "{{count}} records",
  // Fix round W1b: the honesty counter replaces the records/tags pair — it
  // describes exactly what is drawn (the shown sample) from answered wires.
  "overview.heroShownOf": "showing {{shown}} most recent of {{total}}",
  "overview.heroShown": "showing {{shown}}",
  // The tone legend (fix round W1b): surface strip + the full dictionary.
  "overview.legendAbout": "About the colors",
  "overview.legendProblem": "problem",
  "overview.legendAttention": "attention",
  "overview.legendUpdate": "update",
  "overview.legendToneRecall": "at rest · memory read",
  "overview.legendToneWrite": "writing · awaiting confirmation",
  "overview.legendToneSuccess": "connected",
  "overview.legendToneWarning": "attention (up to a minute)",
  "overview.legendToneError": "problem (while it lives)",
  "overview.legendToneUpdate": "update (until accepted or dismissed)",
  "overview.legendNote":
    "The well shows {{shown}} most recent records and their links. Links appear only between displayed records.",
  "overview.heroTags": "tags — {{count}}",
  "overview.waitingChip": "Waiting in total: {{count}}",
  // U2 «Overview well» (2026-10-08): HUD + the bus ticker. One parent
  // action «Share»; the vital cluster renders only from answered wires;
  // the ticker is ONE line of real /api/events frames (meaning-mapped —
  // no raw kind codes in lines). A silent bus = an empty line (honest).
  "overview.share": "Share",
  "overview.shareDone": "Link copied",
  "overview.shareManual": "Copy the address: {{url}}",
  "overview.heroAgents": "agents — {{count}}",
  "overview.tickerLabel": "Bus event ticker",
  "overview.eventTaskCreated": "New task: {{ref}}",
  "overview.eventTaskUpdated": "Task updated: {{ref}}",
  "overview.eventTaskMoved": "Task moved: {{ref}}",
  "overview.eventTaskDeleted": "Task deleted: {{ref}}",
  "overview.eventTaskArchived": "Task archived: {{ref}}",
  "overview.eventTaskUnarchived": "Task restored: {{ref}}",
  "overview.eventReport": "Report for task: {{ref}}",
  "overview.eventAssignmentCreated": "Assignment created: {{ref}}",
  "overview.eventAssignmentClaimed": "Task claimed: {{ref}}",
  "overview.eventAssignmentStarted": "In progress: {{ref}}",
  "overview.eventAssignmentDone": "Done: {{ref}}",
  "overview.eventAssignmentFailed": "Failed: {{ref}}",
  "overview.eventAssignmentCancelled": "Assignment cancelled: {{ref}}",
  "overview.eventAssignmentExpired": "Assignment expired: {{ref}}",
  "overview.eventExecutorOnline": "Agent is online: {{ref}}",
  "overview.eventExecutorOffline": "Agent went offline: {{ref}}",
  "overview.eventExecutorRegistered": "New agent: {{ref}}",
  "overview.eventExecutorUpdated": "Agent updated: {{ref}}",
  "overview.eventExecutorDeleted": "Agent deleted: {{ref}}",
  "overview.eventServerChanged": "A memory store changed",
  "overview.eventNotification": "Notification: {{ref}}",
  "overview.eventEnrollmentCreated": "Enrollment token minted",
  "overview.eventEnrollmentUsed": "Enrollment token used: {{ref}}",
  "overview.eventEnrollmentRevoked": "Enrollment token revoked",
  "overview.eventEnrollmentExpired": "Enrollment token expired",
  "overview.eventHarnessAdded": "New harness: {{ref}}",
  "overview.eventHarnessRemoved": "Harness removed: {{ref}}",
  "overview.eventProvisionCreated": "Connection started: {{ref}}",
  "overview.eventProvisionProgress": "Connection in progress: {{ref}}",
  "overview.eventProvisionOk": "Connected: {{ref}}",
  "overview.eventProvisionFailed": "Connection failed: {{ref}}",
  "overview.eventProvisionRepinned": "Host re-pinned: {{ref}}",
  "overview.eventPairingRequested": "Pairing requested: {{ref}}",
  "overview.eventPairingConfirmed": "Device confirmed: {{ref}}",
  "overview.eventPairingRevoked": "Pairing revoked",
  "overview.eventPairingExpired": "Pairing expired",
  "overview.eventRuleCreated": "Automation rule created",
  "overview.eventRuleUpdated": "Automation rule updated",
  "overview.eventRuleToggled": "Automation rule toggled",
  "overview.eventRuleDeleted": "Automation rule deleted",
  "overview.eventOther": "Bus event",
  "overview.wellEmpty": "The well awaits its first record — agents write them.",
  "overview.wellError": "The well is unreachable — the bus did not answer",
  // UX-overhaul §3/§8 (Ф1): the overview leads into the working domains and
  // states what is not live yet in one honest line.
  // Review P3-4: Sessions/Traces left the nav in Ф1 — the line tells the
  // owner where they live (they are reachable, just later).
  "overview.honestyLater":
    "Stores and metrics are in the works; sessions and traces are coming later",
  "overview.storesLoading": "Loading store health",
  "overview.storesError": "Store health unavailable: {{message}}",
  "overview.storeOk": "healthy",
  "overview.storeFail": "unreachable",
  "overview.storeDisabled": "disabled",
  "overview.storeDisabledNote": "This store is disabled and skipped by the merge.",
  "overview.storeMemories": "memories — {{count}}",
  "overview.storeLatency": "{{ms}} ms probe",
  "overview.pulseTitle": "Fresh pulse",
  "overview.pulseAll": "full pulse",
  "overview.pulseError": "Pulse unavailable: {{message}}",
  // SCHED-1-UI: the auto-launch counter lives INSIDE the busy block now.
  "overview.autoLaunchesToday": "auto-launches today: {{count}}",

  // --- memory pulse (Ф1) ---------------------------------------------------------
  "pulse.title": "Memory pulse",
  "pulse.loading": "Loading the pulse",
  "pulse.loadFailed": "Failed to load the pulse",
  "pulse.emptyTitle": "Quiet so far",
  "pulse.emptyMessage": "No recent memories in the selected stores.",
  "pulse.scopeLabel": "Pulse scope",
  "pulse.scopeAll": "all stores",
  "pulse.feedLabel": "Pulse memory feed",
  "pulse.untitled": "untitled",
  "pulse.degradedStores": "Some stores did not answer: {{servers}}",
  "pulse.unavailableTitle": "Pulse is unavailable in vesma mode",
  "pulse.unavailableMessage":
    "The pulse collects entries from every connected board. The app is currently talking to vesma directly, so the feed has nowhere to come from yet — connect a board and the entries will appear.",

  // --- auth / connection --------------------------------------------------------
  "auth.localMock": "local (mock)",
  "auth.connected": "connected to {{backend}}: {{endpoint}}",
  "auth.degraded": "{{backend}} degraded",
  "auth.offline": "offline",
  "auth.connecting": "connecting…",
  "auth.signIn": "Sign in",
  "auth.signOut": "Sign out",
  "auth.signOutAria": "Sign out of vesma",
  "auth.title": "Sign in to vesma",
  "auth.title2fa": "Two-factor verification",
  "auth.description":
    "Paste your mnk_ access token. It stays in this browser and is sent only to your vesma instance.",
  "auth.description2fa": "Enter the 6-digit code from your authenticator app.",
  "auth.sessionExpired": "Your session expired — sign in again to continue.",
  "auth.tokenLabel": "Access token",
  "auth.codeLabel": "One-time code",
  "auth.show": "Show",
  "auth.hide": "Hide",
  "auth.continueReadOnly": "Continue in read-only mode",
  "auth.signingIn": "Signing in…",
  "auth.verify": "Verify",

  // --- auth session + gates v6 (union И1, 07k §1–§4; копии — карта И1 §1.3) ----
  "auth.status.anonymous": "anonymous",
  "auth.status.signedIn": "you: owner",
  "auth.lock.why": "opens after you sign in",
  "auth.gate.heading": "The “{{domain}}” section opens after you sign in",
  "auth.gate.inside.memory":
    "Records, search by meaning, pulse and tags — the contents of memory",
  "auth.gate.inside.tasks":
    "Kanban, list, inbox and archive — your work and assignments",
  "auth.gate.inside.agents": "Execution, hosts and connecting new machines",
  "auth.gate.inside.kora":
    "A journal of sessions from every host: what the agent did and said",
  "auth.gate.inside.system": "Status, devices and traces — the service area",
  "auth.gate.elsewhere":
    "The statistics are open to everyone — they live on the Overview.",
  "auth.gate.goOverview": "Open the Overview",
  "auth.gate.signUp": "Create an account",
  "auth.gate.seeMore": "What will I see after signing in",
  "auth.gate.seeMore.memoryRecords": "Memory records: the list, filters, tags",
  "auth.gate.seeMore.memorySearch": "Search by meaning across every record",
  "auth.gate.seeMore.memoryPulse": "Memory pulse: what was added and when",
  "auth.gate.seeMore.tasksBoard": "Kanban and the list of your tasks",
  "auth.gate.seeMore.tasksInbox": "Inbox: what awaits your decision",
  "auth.gate.seeMore.tasksArchive": "Archive and change history",
  "auth.gate.seeMore.agentsHosts": "Hosts: which machines are online and busy",
  "auth.gate.seeMore.agentsExecution": "Execution: who is running what",
  "auth.gate.seeMore.agentsConnect": "Connecting a new machine to the board",
  "auth.gate.seeMore.koraJournal": "Every host's sessions in one journal",
  "auth.gate.seeMore.koraTranscripts": "Transcripts: what the agent did and said",
  "auth.gate.seeMore.koraCoverage": "Coverage: what is visible from your machines",
  "auth.gate.seeMore.systemStatus": "Board status and memory stores",
  "auth.gate.seeMore.systemSettings": "Settings and automation",
  "auth.gate.seeMore.systemDevices": "Connected devices",
  // U1: the gate mini-preview caption — the sketch is honest about being a sketch.
  "auth.gate.previewCaption":
    "A sketch of the section — its contents open after you sign in",
  "auth.gate.checkingSession": "Checking your session…",
  "auth.route.back": "← Back to the board",
  // U1 (07h §12): the noticeable return button by the central card on /auth
  // and /pair — icon arrow + clean label (the «←» glyph above stays put).
  "auth.route.backLabel": "Back to the board",
  "auth.route.backAria": "Back to the board — return to the Overview",
  "auth.route.alreadySignedIn": "You are already signed in",

  // --- ME-080: /auth route, the «Sign in | Register» pair (07k §4.1–§4.4;
  // ME-078 copy standard: zero jargon, human outcomes) -------------------------
  "auth.route.registerTitle": "Create an account",
  "auth.route.passwordDescription": "Sign in with a username and password.",
  "auth.route.tokenDescription":
    "Token sign-in — for machines and service deployments. People sign in with a username and password.",
  "auth.route.registerDescription":
    "Create an account — it becomes your way onto the board right away.",
  "auth.route.tabsLabel": "Sign in or create an account",
  "auth.route.tabSignIn": "Sign in",
  "auth.route.tabRegister": "Register",
  "auth.route.registerSubmit": "Create an account",
  "auth.route.signingIn": "Signing in…",
  "auth.route.creating": "Creating…",
  "auth.route.registerNote":
    "The first account created becomes the owner of the board.",
  "auth.route.usernameLabel": "Username",
  "auth.route.passwordLabel": "Password",
  "auth.route.confirmLabel": "Repeat the password",
  "auth.route.showPassword": "Show the password",
  "auth.route.hidePassword": "Hide the password",
  "auth.route.usernameHint":
    "The name: lowercase latin letters, 3 to 32 characters; digits, hyphens and underscores allowed.",
  "auth.route.passwordHint": "The password: at least 8 characters.",
  "auth.route.errRequiredUsername": "Enter the name.",
  "auth.route.errRequiredPassword": "Enter the password.",
  "auth.route.errRequiredConfirm": "Repeat the password.",
  "auth.route.errUsername":
    "The name does not fit: lowercase latin letters, 3 to 32 characters; digits, hyphens and underscores allowed inside.",
  "auth.route.errPassword": "The password is too short — at least 8 characters.",
  "auth.route.errConfirm": "The passwords do not match — check the second field.",
  "auth.route.verdictPrefix": "Error:",
  "auth.route.loginFailed": "Wrong name or password.",
  "auth.route.loginFailedHelp":
    "What to check: the RU/EN layout, letter case, Caps Lock.",
  "auth.route.tooManyAttempts": "Too many attempts — wait a minute and try again.",
  "auth.route.nameTaken": "That name is taken. Pick another one.",
  // fix/kora-auth-honesty (owner complaint, prod 1.63.0): the verdict names
  // the cause AND the way out — who opens registration, with which flag.
  "auth.route.registrationClosed":
    "Registration is closed — the board already has its owner. The owner opens access for new members in the server settings (the VESMARO_ALLOW_REGISTRATION flag).",
  "auth.route.techDetail": "Server technical details",
  "auth.route.registerFailed": "The account could not be created.",
  "auth.route.networkFailed":
    "The server did not answer — check the connection and try again.",
  "auth.route.signedInToast": "You are signed in: {{username}}",
  "auth.route.accountCreatedToast":
    "The account is created. You are signed in: {{username}}",
  "auth.route.alreadySignedInNamed": "You are already signed in: {{username}}",
  "auth.route.tokenModeLink": "Token sign-in (admin)",
  "auth.route.backToPassword": "← Back to the username and password sign-in",
  "auth.route.roleOwner": "owner",
  "auth.route.roleMember": "member",

  // --- fix/recovery-ux: the /auth password-recovery track (the owner's
  // complaint, prod 1.64.0: «how do I reset the password if I don't remember
  // the old one?»). Two steps on page state, no new route: sign in with the
  // token, then set a new password — the current one is never asked for.
  "auth.route.recoveryLink": "Forgot your password?",
  "auth.route.recoveryTitle": "Password recovery",
  "auth.route.recoveryTokenLead":
    "Sign in with the token — we will set a new password right away. The current one is not needed.",
  "auth.route.recoverySetLead":
    "The token is accepted. Set a new password for the account — the current one is not needed.",
  "auth.route.recoveryFormTitle": "Set a new password",
  "auth.route.recoveryUsernameLabel": "Account name",
  "auth.route.recoveryUsernamePlaceholder": "for example, abyss",
  "auth.route.recoverySubmit": "Set the password",
  "auth.route.recoverySaving": "Setting…",
  "auth.route.recoveryDoneToast": "The password is set — now sign in",
  "auth.route.recoveryBack": "← Back to sign-in",
  "auth.route.recoveryForbidden":
    "Not allowed — password recovery is available to the board's owner.",
  "auth.route.recoveryTooManyAttempts":
    "Too many attempts — wait {{n}} s and try again.",
  "auth.route.recoveryFailed": "Could not set the password.",

  // --- search -------------------------------------------------------------------
  "search.title": "Search",
  "search.tagline": "a gaze into oneself",
  "search.placeholder": "Search the well…",
  "search.formLabel": "Search memories",
  "search.inputLabel": "Search memory",
  "search.submit": "Search",
  "search.submitting": "Searching",
  "search.typeLegend": "Search type",
  "search.typeAuto": "Auto",
  "search.typeFts": "FTS",
  "search.typeSemantic": "Semantic",
  "search.typeAutoTitle": "Server-decided ranking per hit",
  "search.typeFtsTitle": "Show full-text hits only (client-side filter)",
  "search.typeSemanticTitle": "Show semantic hits only (client-side filter)",
  "search.resultsLabel": "Search results",
  "search.failed": "Could not run the search. Check the connection and try again.",
  "search.nothing": "Nothing surfaced",
  "search.noMatches": "No memories matched “{{query}}”.",
  "search.noTypedMatches":
    "No {{type}} hits for “{{query}}”. The pipeline may rank this query differently.",
  "search.noMatchesHint":
    "Try fewer or different words — the well is deep but literal.",
  "search.hitsCount": "{{count}} found for “{{query}}”",
  "search.hitsTypedSuffix": " (client-side filter of server-ranked hits)",
  "search.relevanceTitle": "relevance {{value}}",

  // --- memories ---------------------------------------------------------------
  "memories.title": "Records",
  "memories.filterLabel": "Filter memories",
  "memories.statusLabel": "Status",
  "memories.projectLabel": "Project",
  "memories.limitLabel": "Per page",
  "memories.allStatuses": "All statuses",
  "memories.allProjects": "All projects",
  "memories.loading": "Loading memories",
  "memories.loadFailed": "Could not load memories",
  "memories.noMatch": "No memories match these filters",
  "memories.noMatchHint":
    "Loosen the status or project filter to surface more of the well.",
  "memories.clearFilters": "Clear filters",
  "memories.wellEmpty": "Your memory records will live here",
  "memories.wellEmptyHint":
    "Agents write the memory — records appear once they start working.",
  "memories.prev": "Prev",
  "memories.next": "Next",
  "memories.showing": "Showing {{from}}–{{to}}",
  "memories.pagesAria": "Memory list pages",
  "memories.all": "All memories",
  "memories.noId": "No memory id in route",
  "memories.loadingOne": "Loading memory",
  "memories.notFoundTitle": "No such scroll",
  "memories.notFoundMessage": "vesma holds no memory with id “{{id}}”.",
  "memories.loadOneFailed": "Could not load the memory",

  // --- memory card / scroll ------------------------------------------------------
  "memory.agentUnknown": "unknown agent",
  "memory.agentUnknownShort": "unknown",
  "memory.agentLabel": "agent:",
  "memory.projectLabel": "project:",
  "memory.createdLabel": "created:",
  "memory.confidenceTitle": "confidence {{value}}",
  "memory.showingRaw": "Showing raw content",
  "memory.showingEffective": "Showing effective content",
  "memory.rawSwitch": "switch",
  "memory.related": "Related memories",
  "memory.idLabel": "id:",
  "memory.updatedLabel": "updated:",
  "memory.sourceLabel": "source:",
  "memstatus.raw": "raw",
  "memstatus.processing": "processing",
  "memstatus.processed": "processed",
  // ME-072 C: the pulse badge carries this human explanation in
  // title/aria-label — a legend block was deliberately NOT added.
  "memstatus.processedHint": "record parsed, waiting to be published",
  "memstatus.published": "published",
  "memstatus.publishedHint": "record published — visible in the well and in search",
  "memstatus.archived": "archived",

  // --- tags -------------------------------------------------------------------
  "tags.title": "Tags",
  "tags.familyRowLabel": "Tags in this family",
  "tags.filterLabel": "Filter tags",
  "tags.filterPlaceholder": "by name substring…",
  "tags.loading": "Loading tags",
  "tags.loadFailed": "Could not load tags",
  "tags.noMatch": "No tags match",
  "tags.noTags": "Tags appear once memories carry topics",
  "tags.noMatchMessage": "Nothing matches “{{filter}}”.",
  "tags.noTagsMessage": "Open the memory — the agents will tag it.",
  "tags.noneInWell": "No tags in the well yet.",
  "tags.memoriesCount": "memories: {{count}}",
  "tags.all": "All tags",
  "tags.drilldownTitle": "Memories tagged",
  "tags.drilldownNote": "Filtered client-side — vesma has no by-tag list filter.",
  "tags.nothingCarries": "Nothing carries this tag",
  "tags.nothingCarriesMessage": "No memory is tagged {{tag}} right now.",
  // --- tags cloud (UI-17, spec 2026-09-21 §9; owner-approved copy) -----------
  "tags.statsLine": "{{count}} tags · as of {{time}}",
  "tags.partialData": "Data from {{answered}} of {{total}} stores",
  "tags.partialStores": "Stores unreachable: {{servers}}",
  "tags.family.all": "All families",
  "tags.family.bare": "no prefix",
  "tags.family.tags": "{{count}} tags",
  "tags.band.core": "Core · 1000+",
  "tags.band.frequent": "Frequent · 100–999",
  "tags.band.middle": "Middle · 10–99",
  "tags.band.rare": "Rare · 1–9",
  "tags.band.showAll": "Show all {{count}}",
  "tags.band.showMore": "Show {{count}} more",
  "tags.band.collapse": "Collapse",
  "tags.searchMatches": "{{count}} matches",
  "tags.searchCapped": "Showing the first {{count}} — refine the query",
  "tags.group.heading": "Group {{group}}",
  "tags.group.open": "Open group {{group}}",
  "tags.drill.siblings": "Nearby in {{family}}",
  "tags.drill.tasks": "Tasks carrying this tag",
  "tags.drill.tasksEmpty": "No tasks carry this tag",
  "tags.drill.memories": "Memories",
  "tags.drill.storeErrors": "Stores unreachable: {{servers}}",
  "tags.drill.openInMemories": "Open in Memories",

  // --- status -----------------------------------------------------------------
  "status.title": "Status",
  "status.loading": "Loading status",
  "status.unreachable": "vesma is unreachable",
  "status.metricsBroken": "Health is fine, metrics are not",
  "status.retryMetrics": "Retry metrics",
  "status.refreshHealth": "Refresh health",
  "status.apiStatus": "API status",
  "status.memoriesStat": "Memories",
  "status.publishedDetail": "{{count}} published",
  "status.avgLatency": "Avg search latency",
  "status.avgLatencyNotReported": "vesma /metrics carries no latency",
  "status.dlq": "DLQ depth",
  "status.dlqNotReported": "no dlq key in /metrics",
  "status.tagsStat": "Tags",
  "status.sessionsStat": "A2A sessions",
  "status.tracesStat": "Pipeline traces",
  "status.avgQuality": "Avg quality score",
  "status.generated": "Metrics generated",
  "status.notReported": "not reported",
  // UX-overhaul §6/§8 (Ф1): health always renders; metrics degrade to one
  // honest HonestLine instead of a fullscreen empty state.
  "status.metricsLater": "Metrics will come later — service status is available",
  "status.unreachableMessage":
    "Could not load the service status — the application server is not responding.",
  "status.healthOk": "ok",
  "status.healthDegraded": "degraded",
  "status.healthError": "error",
  "status.healthUnknown": "unknown",
  "status.srBackendStatus": "status: ",

  // --- sessions -----------------------------------------------------------------
  "sessions.title": "A2A sessions",
  "sessions.loading": "Loading sessions",
  "sessions.loadFailed": "Could not load sessions",
  "sessions.unavailableMnemos": "Session list is unavailable in vesma 4.1",
  "sessions.unavailableMnemosMessage":
    "vesma exposes no session-list endpoint — only POST /v1/sessions (create) and GET /v1/sessions/{id}. Open a session by id once you know it.",
  "sessions.empty": "No A2A sessions yet",
  "sessions.emptyMessage": "Sessions appear once agents talk through vesma.",
  "sessions.noId": "No session id in route",
  "sessions.loadingOne": "Loading session",
  "sessions.notFound": "No such session",
  "sessions.notFoundMessage": "vesma holds no session with id “{{id}}”.",
  "sessions.loadOneFailed": "Could not load the session",
  "sessions.created": "created",
  "sessions.updated": "updated",
  "sessions.turns": "turns: {{count}}",
  "sessions.ttlUntil": "ttl until {{time}}",
  "sessions.persistent": "persistent",
  "sessions.metadata": "Metadata",
  "sessions.transcriptsHidden": "Turn transcripts are not exposed",
  "sessions.transcriptsHiddenMessage":
    "vesma 4.1 returns session counters and metadata only — individual turns and linked memories have no read endpoint. The turn count above is the honest total.",
  "sessions.all": "All sessions",

  // --- toasts (Ф3 mutation feedback) ---------------------------------------------
  "toasts.regionLabel": "Notifications",
  "toasts.dismissAria": "Dismiss notification",

  // --- ui-token login window (Ф3, class ui; fix/login-window; ADR 0014) ------------
  "login.title": "Sign in",
  "login.description":
    "Sign in with a ui token to edit tasks. The value is verified by the server; the session lives in a cookie of this browser — all tabs, one sign-in, 6 hours of idle time.",
  "login.continueQueued": "Sign in to continue — your action will run automatically",
  // Refusal AT THE DOOR (ADR 0014 Ф1): the verify call said no — nothing stored.
  "login.rejected":
    "The server did not accept the token — check the value and try again.",
  // Mid-flight refusal (ADR 0014 Ф2): a stored token rotted / the session
  // idled out — a distinct text so it never reads as "you mistyped it".
  "login.sessionExpired": "Your session expired — sign in again.",
  "login.fieldLabel": "Token",
  "login.showValue": "Reveal the token value",
  "login.hideValue": "Hide the token value",
  // ME-028: the guidance leads («ask the administrator»); the kubectl command
  // is a disclosure below — still available, no longer the first thing a
  // non-admin reads.
  "login.hint": "Where to get one: ask your cluster administrator.",
  "login.hintCommandSummary": "Command for the administrator (kubectl)",
  "login.hintCommand":
    "kubectl -n kube-agents get secret vesmaro-eyes-ui-token -o jsonpath='{.data.VESMARO_UI_TOKEN}' | base64 -d",
  "login.continueReadOnly": "Continue read-only",
  "login.submit": "Sign in",
  "login.verifying": "Verifying…",
  "login.signIn": "Sign in",
  "login.signOut": "Sign out",
  "login.signOutAria": "End the server session (all tabs of this browser)",
  // Login feedback toasts (fix/login-feedback) — see ru.ts.
  "login.toastSignedIn": "Signed in — control available",
  "login.toastLegacy":
    "Board token accepted: no dedicated ui token (vesmaro-eyes-ui-token) is configured — legacy mode is active.",
  "login.toastRejected": "Token rejected",
  "login.toastRejectedDetail":
    "The server answered 401 — the login window is open for a current value.",
  // UI-22 device beat — see ru.ts (scope v1: read-scope devices only).
  "login.deviceForbidden": "Actions from this device are closed",
  "login.deviceForbiddenDetail":
    "This device's scope is read-only: mutations run in an owner session.",
  "login.logoutFailed":
    "Could not end the server session — you are still signed in. Check the connection and try again.",

  // --- tasks (Ф2 — read-only domain, mutations are Ф3) ---------------------------
  "tasks.title": "Tasks",
  "tasks.loading": "Loading tasks",
  "tasks.loadFailed": "Could not load tasks",
  "tasks.unavailableTitle": "The Tasks domain is unavailable in vesma mode",
  "tasks.unavailableMessage":
    "Tasks live on the board, and the app is currently talking to vesma directly, so there are none here. Connect a board and the board with the list will appear.",
  "tasks.statsLabel": "Status counts across the whole board",
  "tasks.filterLabel": "Task filter",
  "tasks.searchLabel": "Search",
  "tasks.searchPlaceholder": "by title or id…",
  "tasks.statusLabel": "Status",
  "tasks.allStatuses": "All statuses",
  "tasks.priorityLabel": "Priority",
  "tasks.allPriorities": "All priorities",
  "tasks.projectLabel": "Project",
  "tasks.allProjects": "All projects",
  "tasks.agentLabel": "Agent",
  "tasks.allAgents": "All agents",
  "tasks.colLabel": "Column",
  "tasks.allColumns": "All columns",
  "tasks.limitLabel": "Per page",
  "tasks.noMatch": "Nothing matches these filters",
  "tasks.noMatchHint": "Relax the filters or clear the search to surface more tasks.",
  "tasks.boardEmpty": "The board is empty",
  "tasks.boardEmptyHint": "No tasks on the board yet — create one or check the inbox.",
  "tasks.clearFilters": "Clear filters",
  "tasks.tableCaption": "Task list grouped by project",
  "tasks.colPriority": "Priority",
  "tasks.colStatus": "Status",
  "tasks.colTitle": "Title",
  "tasks.colProject": "Project",
  "tasks.colAgent": "Agent",
  "tasks.colDate": "Updated",
  "tasks.colActions": "Actions",
  "tasks.noProject": "no project",
  "tasks.reportsCountTitle": "reports — {{count}}",
  "tasks.loadingOne": "Loading task",
  "tasks.loadOneFailed": "Could not load the task",
  "tasks.noId": "The route carries no task id",
  "tasks.notFoundTitle": "No such task",
  "tasks.notFoundMessage":
    "Task “{{id}}” is not on the board — it may be archived or the id is mistyped.",
  "tasks.goArchive": "Open the archive",
  "tasks.editLabel": "Edit",
  "tasks.createdLabel": "created",
  "tasks.updatedLabel": "updated",
  "tasks.agentChip": "agent: {{agent}}",
  "tasks.tabsLabel": "Task sections",
  "tasks.tabReports": "Reports",
  "tasks.tabHistory": "History",
  "tasks.tabMemory": "Memory",
  "tasks.tabDetails": "Details",
  "tasks.tabExecution": "Execution",

  // --- UI-31 task card: description, related links, «who worked» -------------
  "tasks.descriptionLabel": "Description",
  "tasks.descriptionEmpty": "No description yet.",
  "tasks.descriptionEmptyHint": "Add one via «Edit».",
  // ME-078: the «human view / raw source» toggle on the task card description.
  "tasks.sourceToggle.raw": "Raw source",
  "tasks.sourceToggle.human": "Human view",
  "tasks.sourceToggleAria.raw": "Raw source: show the spec as the agent sees it",
  "tasks.sourceToggleAria.human": "Human view: back to the normalized view",
  "tasks.relatedLabel": "Related",
  "tasks.relatedActivity": "Task activity",
  "tasks.relatedKora": "Work sessions (Kora)",
  "tasks.relatedMemory": "Task memory",
  "tasks.workersLabel": "Who worked on this",
  "tasks.workersLoading": "Loading the task audit log",
  "tasks.workersFailed": "Failed to load the task audit log",
  "tasks.workersUnavailableTitle": "Audit log unavailable in this mode",
  "tasks.workersUnavailableMessage":
    "This data source does not serve the activity log — there is no way to show who worked on this.",
  "tasks.workersPartial":
    "Showing the latest {{limit}} events — the list may be incomplete.",
  "tasks.workersEmptyTitle": "No known executor",
  "tasks.workersEmpty": "No audit events for this task — it never reached execution.",
  "tasks.workersNoAttribution":
    "No attribution: the audit log did not record who worked on tasks before version 1.35.",
  "tasks.workersEvents": "events: {{count}}",
  "tasks.workersLast": "last: {{time}}",
  "tasks.workersAgents": "Declared agents",
  "tasks.workersReportsLink": "Task reports: {{count}}",

  // --- ME-063 «Specialists and sessions» (agents-ui-spec §6.2) ---------------
  "tasks.sessionsLabel": "Specialists and sessions",
  "tasks.sessionsLoading": "Loading specialist sessions",
  "tasks.sessionsUnavailableTitle": "Sessions unavailable in this mode",
  "tasks.sessionsUnavailableMessage":
    "This data source does not serve specialist sessions — the block will show them once the board is connected.",
  "tasks.sessionsFailed": "Failed to load sessions",
  "tasks.sessionsFailedMessage":
    "The board did not answer the sessions request — please retry.",
  "tasks.sessionsEmptyTitle": "The agent has not reported any sessions yet",
  "tasks.sessionsEmptyMessage":
    "Specialist sessions are reported by the executor's agent. None so far — an honest absence, not a breakage: tasks run by the poller or an agent-less executor yield no sessions.",
  "tasks.sessionsLive": "running",
  "tasks.sessionsIdle": "finished",
  "tasks.sessionsToolCalls": "tool calls: {{count}}",
  "tasks.sessionsAge": "{{age}} ago",
  "tasks.sessionsExecutor": "reported by {{name}}",
  "tasks.sessionsOpenTranscript": "Open transcript",
  "tasks.sessionsReportedHint":
    "Facts are the agent's advisory mirror, never authority; the age counts from the session start.",

  // --- UI-28 «Activity» (spec 2026-09-27 §6 + row grammar §2) ----------------
  "nav.taskActivity": "Activity",
  "activity.title": "Activity",
  "activity.subtitle": "Task execution stream: who is doing what, and where",
  "activity.live": "Live",
  "activity.reconnecting": "Data as of {{time}} — reconnecting",
  "activity.loading": "Loading activity",
  "activity.loadFailed": "Failed to load activity",
  "activity.retry": "Retry",
  "activity.emptyTitle": "No activity yet",
  "activity.emptyMessage":
    "As soon as tasks and agents start moving, events will show up here.",
  "activity.emptyFiltered": "Nothing matches these filters.",
  "activity.clearFilters": "Clear filters",
  "activity.loadMore": "Load more",
  "activity.feedEnd": "You have reached the end of the journal",
  "activity.newBatch": "{{count}} new events — show",
  "activity.type.task": "Tasks",
  "activity.type.assignment": "Execution",
  "activity.type.report": "Reports",
  "activity.filter.agent": "Agent",
  "activity.filter.host": "Host",
  "activity.filter.task": "Task",
  "activity.filter.label": "Filters",
  "activity.filter.taskPlaceholder": "task id…",
  "activity.filter.clearTask": "Clear the task filter",
  "activity.chart.label": "Last 24 hours",
  "activity.chart.barAria":
    "{{range}} — {{total}} events: {{tasks}} task, {{assignments}} execution, {{reports}} report",
  "activity.chart.empty": "No events in the last 24 hours",
  "activity.chart.now": "now",

  "activity.feed.label": "Activity feed",
  "activity.actor.owner": "owner",
  "activity.actor.board": "board",
  "activity.actor.reaper": "background service (reaper)",
  "activity.actor.sweep": "validation sweep",
  "activity.kind.taskCreated": "created",
  "activity.kind.taskMoved": "moved",
  "activity.kind.taskUpdated": "details edited",
  "activity.kind.taskArchived": "archived",
  "activity.kind.taskUnarchived": "restored from archive",
  "activity.kind.assignmentCreated": "assigned",
  "activity.kind.assignmentClaimed": "claimed",
  "activity.kind.assignmentStarted": "execution started",
  "activity.kind.assignmentDone": "completed",
  "activity.kind.assignmentFailed": "failed",
  "activity.kind.assignmentCancelled": "cancelled",
  "activity.kind.assignmentExpired": "expired",
  "activity.kind.reportIntermediate": "report (intermediate)",
  "activity.kind.reportFinal": "final report",

  "tasks.resumeLabel": "Resume",
  "tasks.resumeTitle":
    "UI-8: status → in-progress, the column stays (live final report)",
  "tasks.reportsLoading": "Loading reports",
  "tasks.reportsFailed": "Could not load reports",
  "tasks.reportsEmpty": "No reports yet",
  "tasks.reportsEmptyHint": "Agents have not reported on this task so far.",
  "tasks.reportsLabel": "Task reports, chronological",
  "tasks.reportFinal": "final",
  "tasks.reportIntermediate": "intermediate",
  "tasks.reportSuperseded": "superseded",
  "tasks.reportNoAgent": "no agent",
  "tasks.historyLoading": "Loading history",
  "tasks.historyFailed": "Could not load history",
  "tasks.historyEmpty": "History is empty",
  "tasks.historyEmptyHint": "No events or linked memories for this task yet.",
  "tasks.historyLabel": "Task timeline",
  "tasks.historyMemory": "memory",
  "tasks.history.created": "task created",
  "tasks.history.updated": "task updated",
  "tasks.history.moved": "status changed",
  "tasks.history.deleted": "task deleted",
  "tasks.history.archived": "task archived",
  "tasks.history.unarchived": "task unarchived",
  "tasks.history.report": "agent report",
  "tasks.history.event": "event",
  "tasks.memoryLoading": "Loading linked memories",
  "tasks.memoryFailed": "Could not load linked memories",
  "tasks.memoryEmpty": "No linked memories",
  "tasks.memoryEmptyHint": "The task does not reference vesma records yet.",
  "tasks.memoryLabel": "Linked memories",
  "tasks.memorySource": "source: {{server}}",
  "tasks.memoryOpenPrompt": "Open the memory record",
  "tasks.memoryUnresolved": "Unresolved links (absent from active servers):",
  "tasks.detailsSummaryLabel": "Summary",
  "tasks.detailsMetaLabel": "Metadata",
  "tasks.detailsEnv": "Environment",
  "tasks.detailsProject": "Project",
  "tasks.detailsSpecialists": "Specialists",
  "tasks.detailsTags": "vesma tags",
  "tasks.detailsMemoryIds": "Linked memories (ids)",
  "tasks.inboxTitle": "Inbox",
  "tasks.inboxLoading": "Loading inbox",
  "tasks.inboxFailed": "Could not load the inbox",
  "tasks.inboxCount": "records — {{count}}",
  "tasks.inboxRefreshed": "scan: {{time}}",
  "tasks.inboxShowAdopted": "show adopted",
  "tasks.inboxEmpty": "Scan finished — no new tasks found",
  "tasks.inboxEmptyHint": "New tasks appear after a store scan (the “Scan” button).",
  "tasks.inboxLabel": "Inbox task list",
  "tasks.inboxStaleNote": "Disappeared from the source (cannot be adopted):",
  "tasks.inboxStaleLabel": "Disappeared records",
  "tasks.inboxSource": "server: {{server}}",
  "tasks.inboxAdoptedLink": "adopted → {{id}}",
  "tasks.inboxNoSpecialist": "no specialist",
  // UI-25: key:value chips + expand/edit
  "tasks.inboxProjectChip": "project: {{value}}",
  "tasks.inboxPriorityChip": "priority: {{value}}",
  "tasks.inboxEditedBadge": "edited",
  "tasks.inboxExpandLabel": "Record details",
  "tasks.inboxCollapseLabel": "Collapse",
  "tasks.inboxDetailsLabel": "Record details",
  "tasks.inboxDetailsSpecialist": "specialist: {{value}}",
  "tasks.inboxDetailsCreated": "created at source: {{value}}",
  "tasks.inboxDetailsMemoryId": "memory: {{value}}",
  "tasks.inboxFullTextLabel": "Record text from memory",
  "tasks.inboxFullTextFailed": "Could not load the record from memory",
  "tasks.inboxEditLabel": "Edit",
  "tasks.inboxEditTitle": "Edit the record before adopting it to the board",
  "tasks.inboxEditHint": "Edits ride into the task and sync to memory on adoption.",
  "tasks.inboxEdit.titleLabel": "Title",
  "tasks.inboxEdit.summaryLabel": "Summary (spec)",
  "tasks.inboxEdit.priorityLabel": "Priority",
  "tasks.inboxEdit.projectLabel": "Project",
  "tasks.inboxEdit.save": "Save edits",
  "tasks.inboxEdit.cancel": "Cancel",
  "tasks.scanLabel": "Scan stores",
  "tasks.scanBusy": "Scanning…",
  "tasks.adoptLabel": "Adopt to board",
  "tasks.adoptAllLabel": "Accept all",
  "tasks.adoptAllConfirm": "Accept all records to the board ({{count}})?",
  "tasks.adoptAllBusy": "Accepting…",
  "tasks.adoptAllNone": "No records to accept",
  "tasks.archiveTitle": "Archive",
  "tasks.archiveLoading": "Loading archive",
  "tasks.archiveFailed": "Could not load the archive",
  "tasks.archiveFilterLabel": "Archive filter",
  "tasks.archiveSearchLabel": "Search the archive",
  "tasks.archiveSearchPlaceholder": "by title or summary…",
  "tasks.archiveEmpty": "The archive is empty",
  "tasks.archiveEmptyHint": "No archived tasks match these filters — relax them.",
  "tasks.archiveLabel": "Archived tasks",
  "tasks.archiveFrom": "archived from “{{col}}”",
  "tasks.unarchiveLabel": "Restore to board",
  "tasks.archivePagesAria": "Archive pages",
  "tasks.archiveRange": "Showing {{from}}–{{to}} of {{total}}",
  "tasks.archivePageEmpty": "Nothing on this page — go back a page.",
  "tasks.status.open": "open",
  "tasks.status.in-progress": "in progress",
  "tasks.status.blocked": "blocked",
  "tasks.status.resolved": "resolved",
  "tasks.status.done": "done",
  "tasks.status.withdrawn": "withdrawn",
  "tasks.status.unknown": "unknown",

  // --- tasks: WF-1 kanban column titles (7 lanes; mirror server COLUMN_RU) ---------
  // ME-072 C: column labels lead with a capital (the board header + every
  // «column: …» / «… → …» embedding reads list-like after a colon).
  // ME-077: owner-facing renames (Open→Queued, Resolved→Awaiting review) —
  // the WIRE column ids never change.
  "tasks.column.backlog": "Backlog",
  "tasks.column.validating": "Validating",
  "tasks.column.open": "Queued",
  "tasks.column.in-progress": "In progress",
  "tasks.column.blocked": "Blocked",
  "tasks.column.resolved": "Awaiting review",
  "tasks.column.done": "Done",

  // --- ME-077: column hints (whose action moves the card onward) -------------------
  "tasks.columnHint.backlog": "moves: owner — queue for work",
  "tasks.columnHint.validating": "moves: owner — accept or return",
  "tasks.columnHint.open": "moves: executor — take into work",
  "tasks.columnHint.in-progress": "moves: executor — finish or block",
  "tasks.columnHint.blocked": "moves: executor — lift the block",
  "tasks.columnHint.resolved": "moves: owner — accept or return to the executor",
  "tasks.columnHint.done": "auto-archives after 3 days · restore manually",

  // --- tasks: kanban board (Ф3, CV-4 — ARCHCOM-3 verdict §3) ------------------------
  "tasks.view.toggleLabel": "Task view",
  "tasks.view.kanban": "Kanban",
  "tasks.view.list": "List",
  "tasks.board.label": "Task kanban board",
  "tasks.board.columnLabel": "Column “{{col}}”",
  "tasks.board.emptyColumn": "Empty",
  "tasks.board.noMatchColumn": "Nothing matches the filters",
  "tasks.board.archcomBadge": "archcom",
  "tasks.board.archcomTitle": "owner decision required",
  "tasks.board.validatingFor": "validating {{hours}}h {{minutes}}m",
  "tasks.board.validatingOverdueTitle":
    "validating for over 24 hours — an owner decision is required",
  "tasks.board.dragDisabled": "sign in to manage",
  "tasks.board.styleLabel": "Board layout",
  "tasks.board.styleGroups": "Groups",
  "tasks.board.styleClassic": "Classic",
  // ME-077: column visibility (compact 5 / all 7), persisted board setting.
  "tasks.board.columnsLabel": "Columns",
  "tasks.board.columnsCompact": "5 columns",
  "tasks.board.columnsAll": "all 7",
  "tasks.board.hiddenColumns": "Hidden: {{cols}}",
  "tasks.board.expandColumn": "Expand the empty “{{col}}” column",
  "tasks.board.collapseColumn": "Collapse the empty “{{col}}” column",

  // ME-071 W3: the living console (15-WOW §3.4/§8.5) — the waiting facade,
  // the resolution tempo, the task.done flash, the blocked edge.
  "tasks.board.waitingChip": "Waiting for the owner: {{count}}",
  "tasks.board.waitingChipTitle":
    "Show tasks waiting for the owner's decision (on review)",
  "tasks.board.doneTempoUnit": "/h",
  "tasks.board.doneTempoAria": "resolutions in the last hour: {{count}}",
  "tasks.board.resolvedToast": "Task “{{title}}” resolved",
  "tasks.board.doneToast": "Task “{{title}}” done",
  "tasks.board.blockedReason": "the agent can't take the task",

  // U3: the blocked-reason dictionary (the blocked edge with a reason,
  // 15-WOW §3.4 item 4) — derived from the task's own data, never invented.
  "tasks.blocked.failed": "the execution attempt failed",
  "tasks.blocked.expired": "execution expired: the agent stopped responding",
  "tasks.blocked.unrouted": "no eligible executor",
  "tasks.blocked.unassigned": "no executor assigned",

  // --- ME-074: lifecycle time labels on cards ---------------------------------------
  "tasks.card.arrived": "arrived {{date}}",
  "tasks.card.hanging": "open for {{duration}}",
  "tasks.card.completed": "completed {{date}}",

  // --- ME-075: date filters (arrival / completion + presets) -------------------------
  "tasks.date.label": "Dates",
  "tasks.date.arrivalLabel": "Arrived",
  "tasks.date.completedLabel": "Completed",
  "tasks.date.from": "from",
  "tasks.date.to": "to",
  "tasks.date.presetToday": "Today",
  "tasks.date.presetWeek": "Week",
  "tasks.date.presetAll": "All",
  "tasks.date.clear": "Clear dates",
  "tasks.priority.critical": "critical",
  "tasks.priority.high": "high",
  "tasks.priority.normal": "normal",
  "tasks.priority.low": "low",

  // --- tasks: edit dialog (Ф3, BE-12 force path) -----------------------------------
  "tasks.edit.title": "Edit task",
  "tasks.edit.description":
    "Content fields of task {{id}}. Workflow status moves separately (row move, UI-8).",
  "tasks.edit.titleLabel": "Title",
  "tasks.edit.titleError":
    "Title is required (1–200 characters) — an empty task cannot be saved.",
  "tasks.edit.summaryLabel": "Summary",
  "tasks.edit.specLabel": "Specification",
  "tasks.edit.projectLabel": "Project",
  "tasks.edit.envLabel": "Environment",
  "tasks.edit.priorityLabel": "Priority",
  "tasks.edit.specialistsLabel": "Specialists (comma-separated)",
  "tasks.edit.tagsLabel": "vesma tags (comma-separated)",
  "tasks.edit.listPlaceholder": "value, value…",
  "tasks.edit.cancel": "Cancel",
  "tasks.edit.submit": "Save",
  "tasks.edit.lockedTitle": "Task is older than 24 hours — edit locked (423)",
  "tasks.edit.lockedDetail":
    "The server locks content edits on tasks older than 24 hours (BE-12). You can force the edit — it will be audited with force=true.",
  "tasks.edit.forceLabel": "Edit anyway (force)",
  "tasks.edit.forceConfirm":
    "The task is older than 24 hours. Edit anyway (force=true)? The edit will be audited as forced.",

  // --- tasks: create dialog (Ф3 — direct POST /api/tasks) ---------------------------
  "tasks.create.label": "Task",
  "tasks.create.title": "New task",
  "tasks.create.description":
    "The first line becomes the title, the rest the summary. The task is created on the board in the “open” column right away.",
  "tasks.create.textLabel": "Raw text",
  "tasks.create.textPlaceholder":
    "Task title on the first line…\nThen the summary and context.",
  "tasks.create.textHint": "first line → title (1–200), the rest → summary",
  "tasks.create.textError":
    "The first line is required and must stay under 200 characters — it becomes the title.",
  "tasks.create.projectLabel": "Project",
  "tasks.create.tagsLabel": "vesma tags (comma-separated)",
  "tasks.create.submit": "Create task",
  // --- U8: the task-formation conveyor (the v12 wizard «What → Whom →
  // Review»); a step IS a real operation, «Whom» rides the assignment engine.
  "tasks.create.stepWhat": "What",
  "tasks.create.stepWhom": "Whom",
  "tasks.create.stepReview": "Review",
  "tasks.create.conveyorLabel": "Task steps",
  "tasks.create.next": "Next",
  "tasks.create.whatTitle": "What to do",
  "tasks.create.whomTitle": "Whom to assign",
  "tasks.create.whomSub":
    "Every card promises an honest start moment — when the task actually begins.",
  "tasks.create.queueChoice": "Queue without an executor",
  "tasks.create.queueNote":
    "The task waits on the board — assign someone later. An equal path, not a fallback.",
  "tasks.create.startLive": "Connected: the task starts after the agent's next report",
  "tasks.create.startOffline":
    "Away: the task queues up — the agent picks it up on return",
  "tasks.create.assignHint":
    "A direct hand-off to {{name}} goes through the assignment engine: it needs a specialist and a harness.",
  "tasks.create.specialistError": "the assignment engine needs a specialist (1–120 chars)",
  "tasks.create.sumWhat": "What",
  "tasks.create.sumTags": "Tags",
  "tasks.create.whomQueue": "Queue — no executor yet",
  "tasks.create.whomExecutor": "{{name}} · specialist {{specialist}} · harness {{harness}}",
  "tasks.create.give": "Give the task",
  "tasks.create.assignmentFailed":
    "Task {{id}} was created, but the hand-off did not land — the reason is in the toast. You can assign the task from its card.",

  // --- tasks: row action menu (Ф3) ---------------------------------------------------
  "tasks.menu.triggerAria": "Actions for task {{id}}",
  "tasks.menu.label": "Task {{id}} menu",
  "tasks.menu.edit": "Edit",
  "tasks.menu.move": "Move to…",
  "tasks.menu.archive": "Archive",
  "tasks.menu.archiveConfirm":
    "Archive {{id}}? It can be restored from the archive later.",
  "tasks.menu.back": "Back",

  // --- tasks: mutation toasts (Ф3) ---------------------------------------------------
  "tasks.mutation.editFailed": "Could not save the task",
  "tasks.mutation.saved": "{{id}}: saved",
  "tasks.mutation.savedDetail": "task content updated",
  "tasks.mutation.savedForced": "edited with force=true",
  "tasks.mutation.resumeFailed": "Could not resume the task",
  "tasks.mutation.resumed": "{{id}}: resumed",
  "tasks.mutation.resumedDetail": "status in-progress · column unchanged",
  "tasks.mutation.moveFailed": "Could not move the task",
  "tasks.mutation.moveInvalidTitle": "invalid transition: move to in-progress first",
  "tasks.mutation.moveRevertedDetail": "the card is back where it was",
  "tasks.mutation.moved": "{{id}}: moved",
  "tasks.mutation.movedDetail": "column: {{col}}",
  "tasks.mutation.archiveFailed": "Could not archive the task",
  "tasks.mutation.archived": "{{id}}: archived",
  "tasks.mutation.unarchiveFailed": "Could not restore the task",
  "tasks.mutation.unarchived": "{{id}}: back on the board",
  "tasks.mutation.createFailed": "Could not create the task",
  "tasks.mutation.created": "Task {{id}} created",
  "tasks.mutation.openTask": "Open task",
  "tasks.mutation.adoptFailed": "Could not adopt the record",
  "tasks.mutation.adoptConflictTitle": "Record already adopted",
  "tasks.mutation.adoptConflictDetail": "task {{id}} already exists",
  "tasks.mutation.adopted": "Adopted to board: {{id}}",
  "tasks.mutation.adoptBatchDone": "Records accepted",
  "tasks.mutation.adoptBatchDetailAll": "records accepted: {{count}}",
  "tasks.mutation.adoptBatchDetailPartial":
    "accepted: {{adopted}} · failed: {{failed}} — details in the server report",
  "tasks.mutation.adoptBatchFailed": "Could not accept the records",
  "tasks.mutation.inboxEditFailed": "Could not save the record edits",
  "tasks.mutation.inboxEditSaved": "Edits saved — adoption will use this version",
  "tasks.mutation.scanFailed": "Could not scan the stores",
  "tasks.mutation.scanDone": "Scan complete",
  "tasks.mutation.scanDetail": "records seen: {{found}}, new: {{new}}",

  // --- traces -----------------------------------------------------------------
  "traces.title": "Traces",
  "traces.filterLabel": "Filter by task label",
  "traces.filterPlaceholder": "by id or name substring…",
  "traces.loading": "Loading traces",
  "traces.loadFailed": "Could not load traces",
  "traces.empty": "No traces found",
  "traces.emptyFiltered": "No pipeline traces carry the label “{{label}}”.",
  // ME-072 C: the filtered-empty state carries the one-click way out.
  "traces.clearFilter": "Reset filter",
  "traces.emptyPlain": "The pipeline has not recorded any traces yet.",
  "traces.caption": "Pipeline traces, newest first",
  "traces.colTrace": "Trace",
  "traces.colTaskLabel": "Task label",
  "traces.colStatus": "Status",
  "traces.colStarted": "Started",
  "traces.colDuration": "Duration",
  "traces.colDetails": "Details",
  "traces.rawJson": "Raw JSON",
  "traces.unknownStatus": "unknown",

  // --- agents domain (AGW-2: assignment trigger + execution tab) -------------------
  "agents.list.label": "Task assignments",
  "agents.list.loading": "Loading assignments",
  "agents.list.failed": "Failed to load assignments",
  "agents.empty.title": "No assignments yet",
  "agents.empty.message":
    "Take the task into work — the assignment will queue for an executor.",
  "agents.state.queued": "queued",
  "agents.state.claimed": "claimed",
  "agents.state.running": "running",
  "agents.state.done": "done",
  "agents.state.failed": "failed",
  "agents.state.cancelled": "cancelled",
  "agents.state.expired": "expired",
  "agents.age.queued": "queued {{age}}",
  "agents.age.claimed": "taken {{age}} ago",
  "agents.age.running": "pulse {{age}} ago",
  "agents.age.terminal": "finished {{age}} ago",
  "agents.age.unitMinutes": "min",
  "agents.age.unitHours": "h",
  "agents.age.unitDays": "d",
  "agents.identity.reportedBy": "reported by {{who}} · unverified",
  "agents.identity.tooltip":
    "Identity declared by the executor, never verified by the server",
  "agents.routing.resolvedRow": "route: {{name}} · {{reason}}",
  "agents.routing.unmatchedRow": "waiting for an executor",
  "agents.routing.waitsOffline": "waiting for an executor (offline {{age}})",
  "agents.routing.previewLabel": "Route preview",
  "agents.routing.previewResolved": "{{name}} · {{reason}}",
  "agents.routing.previewUnmatched":
    "No executor available — the assignment will wait in the queue",
  "agents.routing.previewWaits":
    "the executor is offline right now — the assignment will wait for them",
  "agents.routing.previewNote":
    "a preview by the current routing rules; who actually claims it is a fact, shown on the row",
  "agents.routing.reason.explicit": "targeted executor",
  "agents.routing.reason.specialist": "by specialist",
  "agents.routing.reason.taskSpecialists": "by task specialists",
  "agents.routing.reason.projectDefault": "project default",
  "agents.routing.reason.globalDefault": "default executor",
  "agents.routing.reason.auto": "live free executor",
  "agents.routing.reason.unmatched": "no route",
  "agents.executor.noCapabilities": "none assigned yet",
  "agents.executor.noCapabilitiesHint":
    "Skills are what the host may run. Assign some — and tasks will be able to find it.",
  "agents.executor.neverSeen": "never seen",
  "agents.executor.lastSeen": "last seen",
  "agents.executor.pendingReason": "awaiting owner approval",
  "agents.executor.revokedReason": "access revoked",
  "agents.executor.disabledReason": "disabled by the owner",
  "agents.executor.offlineReason": "offline — last seen {{age}} ago",
  "agents.executor.staleReason":
    "pulse missed ({{age}} ago) — a default needs strictly online",
  "agents.executor.staleShort": "pulse missed — a default needs strictly online",
  "agents.sheet.title": "Take into work",
  "agents.sheet.subtitle": "{{id}}: the assignment will queue for an executor",
  "agents.sheet.specialistLabel": "Specialist",
  "agents.sheet.harnessLabel": "Harness",
  "agents.sheet.executorLabel": "Executor",
  "agents.sheet.defaultExecutor": "Default",
  "agents.sheet.defaultExecutorName": "setting: {{name}}",
  "agents.sheet.defaultExecutorNone": "no default set — route by the rules",
  "agents.sheet.cancel": "Cancel",
  "agents.sheet.submit": "Assign",
  "agents.sheet.submitting": "Assigning…",
  "agents.assign.open": "Take into work",
  "agents.assign.terminalTask":
    "The task is in a terminal column — assignment is closed",
  "agents.assign.createFailed": "Failed to assign",
  "agents.assign.created": "{{id}}: assigned",
  "agents.assign.createdDetail": "assignment queued, waiting for the poller",
  "agents.cancel.label": "Cancel",
  "agents.cancel.confirm":
    "A stop signal will be sent to the executor. Cancel the assignment?",
  "agents.cancel.reason": "cancelled by the owner",
  "agents.cancel.sent": "{{id}}: cancellation sent",
  "agents.cancel.sentDetail": "the executor will receive the stop signal",
  "agents.cancel.failed": "Failed to cancel the assignment",
  "agents.retry.label": "Restart",
  "agents.badge.title": "Execution: {{state}}",

  // --- agents domain: execution section (AGW-3) -----------------------------------
  "nav.agentsExecution": "Execution",
  "nav.systemSettings": "Settings",
  // ME-014: the host roster («Хосты») — the section's default landing.
  // ME-072 C: agents.roster.title retired — the visible h1 reads the nav key.
  // agents-redesign A1: the card-grid keys retired with the grid; the frame
  // speaks agents.hosts.* (below) + the survivors here.
  "nav.agentsHosts": "Hosts",
  "nav.agentsHost": "Host",
  "agents.roster.failed": "Failed to load the roster",
  "agents.roster.emptyTitle": "No agents yet",
  "agents.roster.emptyMessage":
    "The roster comes alive once the first executor connects.",
  "agents.roster.hostUnknown": "No host",
  // agents-redesign A1 (blueprint 2026-10-09): the hosts FRAME — the roster
  // panel (compact host rows + filter chips + the connect action) and the
  // selected-host scaffold in the field.
  "agents.hosts.loading": "Loading the host roster",
  "agents.hosts.summary.machines": "machines: {{n}}",
  "agents.hosts.summary.online": "connected: {{n}}",
  "agents.hosts.summary.attention": "need attention: {{n}}",
  "agents.hosts.filter.groupLabel": "Host roster filter",
  "agents.hosts.filter.all": "All",
  "agents.hosts.filter.attention": "Need attention",
  "agents.hosts.filter.decision": "Awaiting decision",
  "agents.hosts.filterEmpty": "No hosts match the filter.",
  "agents.hosts.onlineCounter": "{{online}}/{{total}} harnesses online",
  "agents.hosts.connectAction": "Connect a host",
  "agents.hosts.pendingPill": "awaits decision",
  "agents.hosts.fieldPlaceholder":
    "The host work field arrives in the next update.",
  "agents.hosts.notFound": "Host not found",
  "agents.hosts.notFoundMessage":
    "No host «{{host}}» in the roster — its record may have been deleted.",
  "agents.hosts.backToRoster": "Back to the host roster",
  "agents.hosts.rosterRegion": "Host roster",
  "agents.hosts.rosterTrigger": "Roster · {{n}}",
  "agents.hosts.ribbonLabel": "Host ribbon",
  "agents.hosts.sheetHint": "Pick a host — its card opens in the main field.",
  "agents.hosts.taskCount": "active tasks: {{n}}",
  "agents.hosts.actionGiveTask": "Give a task",
  "agents.hosts.actionKora": "Sessions in Kora",
  "agents.hosts.actionLinkCheck": "Check the link",
  "agents.hosts.nowTitle": "Now",
  "agents.hosts.nowIdle": "Idle — no active tasks, no live sessions.",
  "agents.hosts.nowAssignments": "Active tasks",
  "agents.hosts.nowSessions": "Live sessions",
  "agents.hosts.nowNoSessions": "No live sessions — they appear when a harness starts working.",
  "agents.hosts.sessionsFailed": "Sessions unavailable.",
  "agents.hosts.recentTitle": "Recent",
  "agents.hosts.recentEmpty": "Quiet. The first events arrive after the first report.",
  "agents.hosts.recentFailed": "Failed to load the feed.",
  "agents.hosts.reconnectAction": "Reconnect",
  "agents.hosts.resize.label": "Hosts panel width",
  "agents.hosts.resize.tooltip":
    "Drag to resize. Double-click to restore",
  "agents.execution.title": "Execution",
  "agents.execution.emptyTitle": "No assignments",
  "agents.execution.emptyMessage":
    "No execution attempts right now — take a task into work from its page.",
  "agents.unavailableTitle": "Section unavailable in vesma mode",
  "agents.unavailableMessage":
    "Execution is a board-native domain; switch to board or mock mode.",
  "agents.strip.label": "Executors",
  "agents.strip.empty": "No executors connected",
  "agents.strip.emptyHint": "Executors appear when an agent connects",
  "agents.strip.emptyAction": "Connect an agent",
  "agents.strip.transportLocal": "local",
  "agents.strip.transportMesh": "via mesh",
  "agents.strip.lastSeen": "last seen",
  "agents.strip.error": "Failed to load the executor registry",
  "agents.presence.online": "online",
  "agents.presence.stale": "pulse missed",
  "agents.presence.offline": "offline",
  "agents.presence.unknown": "presence unknown",
  "agents.group.active": "active",
  "agents.group.queued": "queue",
  "agents.group.terminal": "terminal today",
  "agents.filters.specialist": "specialist",
  "agents.filters.search": "search: task, executor…",
  "agents.row.menuAria": "Actions for assignment {{id}}",
  "agents.row.menuLabel": "Assignment {{id}} menu",
  "agents.row.openTask": "Open task",
  "agents.row.copyId": "Copy id ({{id}})",
  "agents.timing.expiresIn": "expires in ~{{minutes}} min",
  "agents.timing.noClaimStamp": "no claim stamp",
  "agents.timing.queuedNotifyHint":
    "~{{minutes}} min without an executor — the poller is not taking it (notification)",
  "agents.timing.reapOverdue": "expired — awaiting the reaper",
  "agents.timeline.created": "created",
  "agents.timeline.claimed": "claimed",
  "agents.timeline.started": "started",
  "agents.timeline.heartbeat": "pulse",
  "agents.timeline.finished": "finished",
  "agents.drawer.openTask": "task {{id}} →",
  "agents.drawer.timelineLabel": "Phase timeline",
  "agents.drawer.identityLabel": "Identity",
  "agents.drawer.identityNone": "no executor claimed",
  "agents.drawer.envelopeLabel": "Dispatch envelope (reconstructed from API fields)",
  "agents.drawer.reportLabel": "Final report",
  "agents.drawer.reportLoading": "loading task reports…",
  "agents.drawer.reportNone": "no final report yet",
  "agents.feed.label": "Execution feed",
  "agents.feed.listLabel": "Execution events, newest first",
  "agents.feed.hint": "assignments and reports interleaved",
  "agents.feed.empty": "No execution events yet — take a task into work",
  "agents.feed.actor": "actor: {{who}}",
  "agents.feed.created": "assignment created",
  "agents.feed.claimed": "claimed",
  "agents.feed.started": "execution started",
  "agents.feed.done": "done",
  "agents.feed.failed": "failed",
  "agents.feed.cancelled": "cancelled",
  "agents.feed.expired": "expired",
  "agents.feed.report": "report",
  "agents.stream.stale": "data as of {{time}}",
  "agents.settings.title": "Settings",
  "agents.settings.executionTitle": "Execution",
  "agents.settings.executionHint":
    "The default route and the fallback executor (global; project overrides reserved)",
  "agents.settings.defaultLabel": "Default executor",
  "agents.settings.fallbackLabel": "Fallback executor",
  "agents.settings.none": "— none —",
  "agents.settings.save": "Save",
  "agents.settings.saving": "Saving…",
  "agents.settings.saved": "Execution settings saved",
  "agents.settings.savedDetail": "routing of new assignments updated",
  "agents.settings.saveFailed": "Failed to save execution settings",
  "agents.settings.meshIneligible": "mesh transport — routing unavailable until R4",

  // --- agents domain: registry page /agents/harnesses (AGW-4) ----------------------
  "nav.agentsHarnesses": "Connect a machine",
  "agents.registry.title": "Agent connections",
  "agents.registry.loading": "Loading the executor registry",
  "agents.registry.failed": "Failed to load the executor registry",
  "agents.registry.band.pending": "Awaiting approval",
  "agents.registry.band.active": "Connected",
  "agents.registry.band.revoked": "Revoked",
  "agents.registry.approve": "Approve",
  "agents.registry.approveHint":
    "after approving, enable the executor — routing picks only enabled ones",
  "agents.registry.enable": "Enable",
  "agents.registry.disable": "Disable",
  "agents.registry.revoke": "Revoke",
  "agents.registry.remove": "Delete",
  "agents.registry.capabilitiesLabel": "Skills",
  "agents.registry.capabilitiesHint":
    "Skills are what the host may run. Assign some — and tasks will be able to find it.",
  "agents.registry.hostLabel": "host",
  "agents.registry.revokedHint": "trust is not restorable — re-register the executor",

  // UXE-2: the connection lifecycle pills (07a dictionary §4) — the state
  // LIST is server-owned (meta.lifecycle.states), the human wording lives
  // here. Every pill = state + age + the next step, never a lone chip.
  "agents.lifecycle.state.provisioning": "installing…",
  "agents.lifecycle.state.awaiting-approval": "awaiting approval",
  "agents.lifecycle.state.awaiting-first-report": "awaiting first report",
  "agents.lifecycle.state.online": "online",
  "agents.lifecycle.state.silent": "quiet",
  "agents.lifecycle.state.offline": "offline",
  "agents.lifecycle.state.disabled": "disabled by the owner",
  "agents.lifecycle.state.revoked": "revoked",
  "agents.lifecycle.next.provisioning":
    "Installing the agent on the machine — usually a couple of minutes.",
  "agents.lifecycle.next.awaiting-approval":
    "The host has registered. Review the details and approve.",
  "agents.lifecycle.next.awaiting-first-report":
    "The agent is installed; it usually reports within {{silentMax}} — check the link.",
  "agents.lifecycle.next.online": "Last report {{age}} ago.",
  "agents.lifecycle.next.silent": "No reports for {{age}} — check the link.",
  "agents.lifecycle.next.offline": "Last link {{age}} ago — check the link.",
  "agents.lifecycle.next.disabled": "Receives no new tasks; reports continue.",
  "agents.lifecycle.next.revoked": "Access revoked. The secret no longer works.",
  "agents.lifecycle.reportAgo": "{{age}} ago",
  "agents.lifecycle.reportNever": "no reports yet",
  "agents.lifecycle.checkLink": "Check the link",

  "agents.connect.label": "How to connect an external agent",
  "agents.connect.step1":
    "Press «Add executor», fill in the name and the harness — you can add your own harness right in the list.",
  "agents.connect.step2": "Create a token and copy the ONE command from the screen.",
  "agents.connect.step3":
    "Run it on the external machine (VPS) — it installs the dependencies, the agent and the service on its own.",
  "agents.connect.step4":
    "The agent appears here in «Awaiting approval» — approve and enable it.",
  "agents.connect.step5":
    "Give the task with the button on the task card — execution happens on the external machine.",
  "agents.connect.note":
    "The command downloads the installer from the board (the installer text is public); everything after rides a secured channel with certificate verification. The token is one-time and lives for 15 minutes.",
  "agents.connect.manual":
    "The manual path — deploy/poller/REMOTE-EXECUTOR.md («Путь 2 — руками», for diagnostics and isolated networks).",
  "agents.executors.actionFailed": "Failed to update the executor",
  "agents.executors.approved": "{{name}}: approved",
  "agents.executors.approvedDetail":
    "enable the executor — routing picks only enabled ones",
  "agents.executors.enabled": "{{name}}: enabled",
  "agents.executors.disabled": "{{name}}: disabled",
  "agents.executors.revokeConfirm":
    "Revoke {{name}}'s access? Trust is not restorable: the state is terminal and the executor must re-register (a new record and a new secret).",
  "agents.executors.revoked": "{{name}}: revoked",
  "agents.executors.revokedDetail": "terminal state — re-registration only",
  "agents.executors.deleteConfirm":
    "Remove {{name}} from the registry? The removal is hard: the executor's secret dies with the record and the name is freed for re-registration; active assignments keep their executor references.",
  "agents.executors.deleted": "{{name}}: deleted",

  // --- agents domain: execution polish (AGW-4) -------------------------------------
  "agents.execution.openTasks": "Open tasks",
  "agents.group.terminalIdle": "Last completed — {{date}}",
  "agents.onboarding.label": "How this works",
  "agents.onboarding.body":
    "Take a task in the Tasks section and press «Take into work» on its page — the poller picks the assignment up in ~10 seconds and you watch it here; the feed below fills in live.",

  // --- agents domain: enrollment + context menus (AGW-5 phase 2) -------------------
  "agents.menu.triggerAria": "Actions for executor {{name}}",
  "agents.menu.label": "Executor menu {{name}}",
  "agents.menu.copyId": "Copy id ({{id}})",
  "agents.menu.openRegistry": "Open registry",
  // AGW-6 A: link check (outbound-only honesty)
  // UX-overhaul §4.4/§8 (Ф1): «link» promised a ping that never happens —
  // «pulse» promises exactly what the button does; the hint names the effect.
  "agents.linkcheck.trigger": "Refresh pulse",
  "agents.linkcheck.triggerHint": "Check when the agent last reported in",
  "agents.linkcheck.checkForReal": "Check for real",
  "agents.linkcheck.verdict.never": "has never answered a poll",
  "agents.linkcheck.verdict.online": "online — answered a poll {{age}} ago",
  "agents.linkcheck.verdict.stale": "answered a while ago — {{age}} ago",
  "agents.linkcheck.verdict.offline": "not responding — last answered {{age}} ago",
  "agents.linkcheck.verdict.revoked": "revoked — presence is gone",
  "agents.linkcheck.verdict.unknown": "presence thresholds are not loaded yet",
  "agents.linkcheck.disclaimer":
    "The board never pings agents (outbound-only): this is the age of the poller's last answer, not machine availability.",
  "agents.linkcheck.unitSeconds": "s",
  "agents.linktest.title": "Check for real — {{name}}",
  "agents.linktest.subtitle":
    "Pick a task — its «Take into work» sheet opens with {{name}} pinned.",
  "agents.linktest.allowlistNote":
    "An allowlist miss is a valid test too: the refusal-report proves the link just as well as a launch.",
  "agents.linktest.loading": "Loading board tasks",
  "agents.linktest.empty":
    "No tasks accept assignments right now. Create a test task on the board and come back.",
  "agents.linktest.listLabel": "Tasks for the test assignment",
  "agents.linktest.rowAria": "Open «Take into work» with {{name}} pinned",
  "agents.sheet.pinnedHint":
    "Executor pinned: the assignment waits for them to come back online — submit stays active.",
  "agents.sheet.pinnedInvalidHint":
    "The pinned executor cannot take tasks right now — pick «Default» or another executor.",
  // AGW-6 B: executor settings card (drawer)
  "agents.card.title": "Executor card",
  "agents.card.description":
    "Executor settings: identity, link, access, declared capabilities",
  "agents.card.menuOpen": "Settings card",
  "agents.card.sectionIdentity": "Identity",
  "agents.card.sectionLink": "Link",
  "agents.card.sectionAccess": "Access",
  "agents.card.sectionCaps": "Capabilities (declared)",
  "agents.card.sectionDanger": "Danger zone",
  // UX-overhaul §4.3/§8 (Ф1): work first — what the executor is doing NOW.
  "agents.card.nowWorking": "Working on now",
  "agents.card.nowIdle": "Idle — nothing in progress",
  "agents.card.allTasks": "All tasks",
  // Service facts collapse under a disclosure (persona-review feedback).
  "agents.card.techDetails": "Technical data",
  "agents.card.nameLabel": "Name",
  "agents.card.copyId": "Copy id ({{id}})",
  "agents.card.harnessLabel": "harness",
  "agents.card.transportLabel": "transport",
  "agents.card.versionLabel": "version",
  "agents.card.registeredVia": "origin",
  "agents.card.registeredAt": "registered",
  "agents.card.updatedAt": "updated",
  "agents.card.harnessNote":
    "The harness is not editable: it is the local allowlist matching axis on the machine — changing it would silently desync the board from poller.yaml. The honest path is «Revoke» + a fresh enrollment.",
  "agents.card.stateApproved": "approved",
  "agents.card.enabledLabel": "Enabled for dispatch",
  "agents.card.enabledNote": "dispatch = approved AND enabled",
  "agents.card.enabledPendingHint":
    "Approve first — the dispatch switch appears after approval.",
  "agents.card.capsPlaceholder": "a specialist role, e.g. researcher",
  // ME-064 «Detected on the host» (agents-ui-spec §3.1): inventory dropdowns.
  "agents.card.sectionInventory": "Detected on the host",
  "agents.card.inventoryNone": "No data",
  "agents.card.inventoryNoneNote":
    "Only the agent (Go) knows how to detect installations. A host connected via the poller will send the list after ME-056 — empty here is an honest answer, not a delay.",
  "agents.card.inventorySpecialists": "specialists",
  "agents.card.inventorySkills": "skills",
  "agents.card.inventoryPlugins": "plugins",
  "agents.card.inventoryInstructions": "instructions",
  "agents.card.inventoryNoNames": "no names — counter only",
  "agents.card.inventoryOverflow": "…and {{count}} more",
  "agents.card.inventoryGcwShare": "gcw-* among them: {{count}}",
  "agents.card.capsInputAria": "New capability",
  "agents.card.capsAdd": "Add",
  "agents.card.capsClear": "Clear",
  "agents.card.capsClearConfirm":
    "Send an empty capabilities list? The server will wipe every declared value ([] is a valid operation).",
  "agents.card.capsDup": "This capability is already declared.",
  "agents.card.capsMax": "Maximum 64 — the server rejects more.",
  "agents.card.capsRemoveAria": "Remove capability {{capability}}",
  "agents.card.capsNote":
    "Declarations for ROUTING only (owner-declared); they never gate launches — the real gate is the poller's local allowlist.",
  "agents.card.save": "Save",
  "agents.card.saved": "{{name}}: card saved",
  "agents.card.noChanges": "no changes",
  "agents.card.dangerNote":
    "«Revoke» is terminal — trust is not restorable; «Delete» removes the record — active assignments keep their pins.",
  "agents.card.revokedReadOnly":
    "This executor is revoked — the card is read-only except Delete.",
  "agents.card.secretHint":
    "The secret is never shown: it appears exactly once, at registration. Lost it — revoke the executor and register again.",
  "agents.registry.viaEnrollment": "origin: enrollment token",
  "agents.registry.viaMachine": "origin: machine token",
  "agents.enrollment.title": "Add executor",
  "agents.enrollment.description":
    "Minting a one-time connection token for a remote executor",
  "agents.enrollment.formHint":
    "Fill in the card — you get ONE command for the external machine. The agent installs itself and appears here for approval.",
  "agents.enrollment.label": "Label (for you)",
  "agents.enrollment.labelPlaceholder": "e.g. vps-1",
  "agents.enrollment.harness": "Harness (hint for the commands)",
  "agents.enrollment.nameHint": "Executor name (optional)",
  "agents.enrollment.create": "Create token",
  "agents.enrollment.creating": "Creating…",
  "agents.enrollment.createFailed": "Failed to create the token",
  "agents.enrollment.created": "Enrollment token created",
  "agents.enrollment.tokenLabel": "Enrollment token",
  "agents.enrollment.tokenOnce": "The token is shown ONCE — copy it now.",
  "agents.enrollment.copy": "Copy",
  "agents.enrollment.copied": "Copied",
  "agents.enrollment.copyFailedToken":
    "Copy failed — the token stays visible, select it manually.",
  "agents.enrollment.copyFailed":
    "Copy failed — the value is in the row, select it manually.",
  "agents.enrollment.copyAll": "Copy all",
  "agents.enrollment.copyStepAria": "Copy step {{step}}",
  "agents.enrollment.ttl": "expires in {{time}}",
  "agents.enrollment.state.created": "waiting for connection",
  "agents.enrollment.state.used": "used",
  "agents.enrollment.state.expired": "expired",
  "agents.enrollment.state.revoked": "revoked",
  "agents.enrollment.bootstrapTitle": "Run on the VPS",
  "agents.enrollment.afterRegister":
    "After the VPS registers, the executor appears above in «Awaiting approval» — verify the origin and IP, then Approve → Enable.",
  "agents.enrollment.usedBy": "used: {{name}}",
  "agents.enrollment.usedIp": "connection IP: {{ip}}",
  "agents.enrollment.done": "Done",
  "agents.harness.addOption": "Add harness…",
  "agents.harness.add": "Add",
  "agents.harness.adding": "Adding…",
  "agents.harness.addFailed": "Failed to add the harness",
  "agents.harness.invalid":
    "Lowercase latin/digits first, then dots, dashes, underscores (≤60 chars).",

  "agents.enrollment.oneLinerHint":
    "The outer -k is safe: the installer text is public and secret-free — everything inside rides the pinned CA. The --url must be the address THIS machine resolves (the VPN overlay address may differ from the LAN one).",
  "agents.enrollment.tokenInCopyNote": "Copying puts the FULL token on the clipboard.",
  "agents.enrollment.quotaCount": "Live tokens: {{count}} of 3",
  "agents.enrollment.quotaFull":
    "Live-token limit (3) reached — revoke one or wait out the TTL.",
  "agents.enrollment.manualToggle": "Manual path — diagnostics / air-gapped installs",

  // --- AGW-11: the connect card (SSH provisioner, wave 4) -------------------

  "agents.provision.title": "Connect over SSH",
  "agents.provision.subtitle":
    "the board logs into the machine itself, installs the agent and walks it to your approval",
  "agents.provision.host": "Machine address (IP or hostname)",
  "agents.provision.hostError":
    "lowercase letters/digits/hyphens and dots — an IP or FQDN, no slashes",
  "agents.provision.port": "SSH port",
  "agents.provision.portError": "port is a number from 1 to 65535",
  "agents.provision.name": "Executor name (optional)",
  "agents.provision.nameError":
    "starts with a letter/digit; letters, digits, dot, '_', '-' up to 120 chars",
  "agents.provision.authLegend": "How to log in",
  "agents.provision.authKey": "SSH key",
  "agents.provision.authAlias": "Alias from the board's ssh-config",
  "agents.provision.authPassword": "Password",
  // UX-overhaul §4.1 (Ф1): the connect card folds under a disclosure
  // (П2 — configuration after the working state); the title names the
  // outcome, not the technology.
  "agents.provision.enrollTitle": "Connect a new agent",
  "agents.provision.authPasswordNote":
    "Password sign-in is currently off on the server — use a key instead.",
  "agents.provision.authAliasNote":
    "The board connects via an alias from its own ssh-config: user, key and port come from the config. A separate username field is not accepted by the server yet — use an alias.",
  "agents.provision.keySecret": "Private key (paste in full)",
  "agents.provision.passwordSecret": "Password",
  "agents.provision.secretShow": "Show key",
  "agents.provision.secretHide": "Hide key",
  "agents.provision.secretNote":
    "The secret lives only in page memory until submit: never in the DB, logs or events. Masked against shoulder surfing.",
  "agents.provision.secretError": "This login method needs a secret.",
  "agents.provision.passphrase": "Key passphrase (if any)",
  "agents.provision.harness": "Harness (hint for commands)",
  "agents.provision.boardUrl": "Board address for the machine",
  "agents.provision.boardUrlNote":
    "https://host[:port] the TARGET machine resolves (the overlay address may differ from the browser one).",
  "agents.provision.boardUrlError":
    "strict https://host[:port] required — no path, no query",
  "agents.provision.submit": "Connect",
  "agents.provision.submitting": "Starting…",
  "agents.provision.submitFailed": "Failed to start the connection",
  "agents.provision.queued": "Connection to {{host}} started",
  "agents.provision.reuseNote":
    "The retry reuses the live enrollment token from the previous attempt",
  "agents.provision.feedTitle": "Connecting {{host}}",
  "agents.provision.close": "Hide",
  "agents.provision.closeAria": "Hide the connect card",
  "agents.provision.feedLoading": "Reading the job state…",
  "agents.provision.feedError": "Job unavailable: {{message}}",
  "agents.provision.feedLive": "The job is running — the feed updates itself",
  "agents.provision.funnelAria": "Install steps",
  "agents.provision.state.live": "running",
  "agents.provision.state.done": "agent registered",
  "agents.provision.state.failed": "failed",
  "agents.provision.stage.bootstrapStarted": "SSH connection to the machine",
  "agents.provision.stage.caPinned": "Machine trust anchor pinned",
  "agents.provision.stage.pollerInstalled": "Agent installed",
  "agents.provision.stage.firstHeartbeat": "First agent heartbeat",
  "agents.provision.stage.wgHandshake": "Mesh tunnel",
  "agents.provision.stage.reserved": "later",
  "agents.provision.connectivityTitle": "Connectivity transport",
  "agents.provision.connectivityManual": "interim: manual tunnel",
  "agents.provision.connectivityMesh": "mesh",
  "agents.provision.connectivityProfile": "Connectivity profile:",
  "agents.provision.connectivityLater": "later",
  "agents.provision.logTitle": "Step feed",
  "agents.provision.updatedAt": "updated {{time}}",
  "agents.provision.errorCode": "Code: {{code}}",
  "agents.provision.expectedFingerprint": "Expected machine key fingerprint:",
  "agents.provision.knownHostsHint":
    "The machine key does not match the pinned one. If the machine was REINSTALLED on purpose, the board has a separate re-pin action (POST /api/executors/provision/host/{host}/repin). Do not blindly retry: a mismatch may mean a MITM.",
  "agents.provision.retry": "Retry",
  "agents.provision.doneTitle": "Executor “{{name}}” awaits your approval",
  "agents.provision.doneLoadingRow": "Waiting for the registry row to appear…",
  "agents.provision.approvedAlready":
    "“{{name}}” is already approved — enable routing in the registry",
  "agents.provision.approveIntro": "Check the machine key and confirm the connection.",
  "agents.provision.pasteBackLabel":
    "Last 8 hex chars of the fingerprint FROM THE MACHINE",
  "agents.provision.pasteBackHint":
    "Run on the machine: awk '{print $2}' /etc/ssh/ssh_host_ed25519_key.pub | base64 -d | sha256sum — type the last 8 characters of its output. The button unlocks only on a match.",
  "agents.provision.pasteBackSkipped":
    "This machine's key was pinned and verified earlier — no re-verification needed.",
  "agents.provision.hint.sshUnreachable":
    "Machine unreachable: check the address, port and firewall.",
  "agents.provision.hint.sshAuthFailed": "The key or password did not fit.",
  "agents.provision.hint.sshSudoRequired":
    "Give the user passwordless sudo (NOPASSWD) or run the install as root.",
  "agents.provision.hint.caUnavailable":
    "The board did not serve its CA — a board-side problem, check its logs.",
  "agents.provision.hint.hostKeyMismatch":
    "The machine key did not match the expected one — the install stopped for safety.",
  "agents.provision.hint.wgKeyDelivery":
    "Tunnel key delivery failed (a future mesh transport leg — placeholder).",
  "agents.provision.hint.wgHandshake":
    "The tunnel did not come up in time (a future mesh transport leg — placeholder).",
  "agents.provision.hint.bootstrapTimeout":
    "The install ran long and was stopped by its timeout.",
  "agents.provision.hint.bootstrapExit":
    "The installer exited with an error — technical detail below.",
  "agents.provision.hint.registerTimeout":
    "The agent was installed but never registered in time — check its journal on the machine.",
  "agents.provision.hint.restarted":
    "The board restarted mid-install — job secrets live in memory only. Start the connection again.",
  "agents.provision.hint.pinInvalidated":
    "The machine's pinned key was changed (re-pin) — the job was stopped.",
  "agents.provision.hint.generic": "The install failed — technical detail below.",

  "agents.enrollment.listTitle": "Enrollment tokens",
  "agents.enrollment.listHint": "live + history",
  "agents.enrollment.listLoading": "Loading tokens",
  "agents.enrollment.listFailed": "Failed to load tokens",
  "agents.enrollment.empty": "No tokens yet",
  "agents.enrollment.loginHint":
    "Sign in with the owner token — minting and connection status require the ui token.",
  "agents.enrollment.revoke": "Revoke",
  "agents.enrollment.revokeConfirm":
    "Revoke the token {{label}}? It can no longer be used to connect.",
  "agents.enrollment.revoked": "Token revoked",
  "agents.enrollment.revokeFailed": "Failed to revoke the token",

  // --- automation section (SCHED-1-UI, ADR 0013 §8) ------------------------------
  "nav.systemAutomation": "Automation",
  "automation.title": "Automation",
  "automation.unavailableTitle": "Section unavailable in vesma mode",
  "automation.unavailableMessage":
    "Automation is the board's contract; switch to board or mock mode.",
  "automation.statusLoading": "Loading engine status",
  "automation.statusFailed": "Failed to load the status",
  "automation.tabSchedules": "Schedules",
  "automation.tabHooks": "Rules",
  "automation.tabJournal": "Journal",
  "automation.tabsLabel": "Automation sections",
  "automation.banner.engineOff": "Engine not enabled",
  "automation.banner.engineOffNote":
    "Manual runs only: schedules do not tick on their own — «run now» is the owner's hand.",
  "automation.banner.killSwitch": "global kill-switch",
  "automation.banner.cap": "daily cap",
  "automation.banner.usedToday": "auto-launches today",
  "automation.banner.rules": "rules",
  "automation.banner.rulesCount": "{{schedules}} schedules, {{hooks}} hook rules",
  "automation.banner.settingsLink": "change in Settings",
  // UI-21 settings hub: the kill-switch/cap form (server contract §2).
  "automation.settings.title": "Automation",
  "automation.settings.enabledLabel": "Automation enabled",
  "automation.settings.engineOffNote":
    "The engine is not running yet (S1): this preference is stored now and takes effect when the engine ships.",
  "automation.settings.capLabel": "Daily auto-launch cap",
  "automation.settings.capHint": "1–1000; {{used}} of {{cap}} used today.",
  "automation.settings.capError": "Enter a whole number from 1 to 1000.",
  "automation.settings.save": "Save",
  "automation.settings.saving": "Saving…",
  "automation.settings.saved": "Automation settings saved",
  "automation.settings.savedDetail": "kill-switch and daily cap updated",
  "automation.settings.saveFailed": "Failed to save automation settings",
  // UI-23 settings hub v2: sections, controls, hints and verdicts (spec §7).
  "settings.hub.navLabel": "Page sections",
  "settings.hub.appearanceTitle": "Appearance",
  "settings.hub.behaviorTitle": "Behavior",
  "settings.hub.boardTitle": "Board",
  "settings.hub.navigationTitle": "Navigation",
  "settings.hub.executionTitle": "Execution",
  "settings.hub.automationTitle": "Automation",
  "settings.hub.devicesTitle": "Devices",
  "settings.hub.devicesHint":
    "Revoke a compromised device or grant per-component access (tasks, reports, inbox, notifications) — managed per connected device.",
  "settings.hub.devicesCta": "Manage devices",
  // ME-080 follow-up: the «Безопасность» security section — the password form (POST /auth/password).
  "settings.hub.securityTitle": "Security",
  "settings.security.formTitle": "Password",
  "settings.security.usernameLabel": "Account name",
  "settings.security.currentLabel": "Current password",
  "settings.security.currentHint": "If you signed in with a password",
  "settings.security.newLabel": "New password",
  "settings.security.confirmLabel": "New password, again",
  "settings.security.save": "Save",
  "settings.security.saving": "Saving…",
  "settings.security.toastOk": "Password updated",
  "settings.security.wrongCurrent": "The current password does not match.",
  "settings.security.forbidden":
    "Not allowed: password recovery is available to the owner.",
  "settings.security.tooManyAttempts":
    "Too many attempts — wait {{n}} s and try again.",
  "settings.security.saveFailed": "Could not save the password.",
  "settings.security.honestySession":
    "You are signed in with a password: this changes your own account's password — the current password is required.",
  // fix/recovery-ux (the owner's complaint, prod 1.64.0): on the token leg
  // the «Current password» field is not rendered at all, and the leg line
  // says exactly that.
  "settings.security.honestyToken":
    "You are signed in with a token: set a new password — the current one is not needed.",
  "settings.security.unavailable":
    "The form is unavailable: no active sign-in. Sign in with a password or a token and come back.",
  "settings.security.recoveryLine":
    "If the password is lost — sign in with the token (the «Sign in» button above) and set a new one here: the current password is not needed.",
  "settings.hub.themeLabel": "Theme",
  "settings.hub.themeSystem": "System",
  "settings.hub.themeDark": "Dark",
  "settings.hub.themeLight": "Light",
  "settings.hub.themeHint": "“System” follows your OS preference.",
  "settings.hub.langLabel": "Interface language",
  "settings.hub.densityLabel": "Row density",
  "settings.hub.densityComfortable": "Comfortable",
  "settings.hub.densityCompact": "Compact",
  "settings.hub.densityHint":
    "Working lists — tasks, registries, results. Search and memory stay airy.",
  "settings.hub.appliesEverywhere": "Applies everywhere immediately.",
  // Settings «Mirror» (U6; SPEC-2026-10-07 «System»: the 380–480px live
  // preview — current-look DATA, no animation, zero living layer).
  "settings.mirror.title": "Mirror",
  "settings.mirror.hint":
    "A live preview of the current look: updates immediately — data, not animation.",
  "settings.mirror.sampleCaps": "Specimen",
  "settings.mirror.sampleTitle": "A card in the current theme",
  "settings.mirror.sampleSecondary": "Secondary text stays readable",
  "settings.mirror.sampleMuted": "Muted — service captions",
  "settings.mirror.sampleRow": "Row at the current density",
  "settings.mirror.themeCaption": "Theme",
  "settings.mirror.densityCaption": "Density",
  "settings.mirror.livingCaption": "Living layer",
  "settings.hub.boardStyleLabel": "Kanban board style",
  "settings.hub.boardStyleHint": "Takes effect on Tasks → Kanban.",
  "settings.hub.motionLabel": "Animations",
  "settings.hub.motionSystem": "System",
  "settings.hub.motionReduced": "Minimal",
  "settings.hub.motionHint":
    "“Minimal” disables motion and shimmer regardless of the OS setting.",
  "settings.hub.livingLabel": "Living layer",
  "settings.hub.livingFull": "Full",
  "settings.hub.livingCalm": "Calm",
  "settings.hub.livingOff": "Off",
  "settings.hub.livingHint":
    "The vein background breathes and tints from real data only. Full (default): breathing, tones, impulses, and Vesma's flights. Calm: breathing and tones, no impulses.",
  // Vesma, the nest keeper (ME-071 W2): her lines. No ids in phrases (ME-078).
  "living.vesma.intro": "I'm Vesma — I look after your memory.",
  "living.vesma.done": "“{{task}}” has a decision waiting for you.",
  "living.vesma.doneGeneric": "Work has finished — the result waits in Tasks.",
  "living.vesma.report": "A report came in for “{{task}}”.",
  "living.vesma.expired": "The assignment for “{{task}}” didn't finish — take a look.",
  "living.vesma.health": "Memory is responding worse than usual — check its health.",
  "living.vesma.healthOk": "The memory connection is restored.",
  "living.vesma.provision": "The device couldn't be connected — see Connections.",
  "living.vesma.dialog": "A dialog is open — errands on hold.",
  "living.vesma.gotIt": "Got it",
  "settings.hub.sidebarLabel": "Sidebar",
  "settings.hub.sidebarExpanded": "Expanded",
  "settings.hub.sidebarCollapsed": "Collapsed",
  "settings.hub.sidebarHint": "Also changes with the button on the sidebar itself.",
  "settings.hub.onboardingReplay": "Show the “How it works” hint again",
  "settings.hub.onboardingReplayed":
    "The hint will expand again on the Execution page.",
  "settings.hub.notCustomizable": "Not customizable",
  "settings.hub.verdict.fonts":
    "Typography is a single font pair and one scale: coherence beats choice.",
  "settings.hub.verdict.contemplative":
    "Search and memory stay airy regardless of density — by design.",
  "settings.hub.verdict.viewRoute":
    "Kanban and List are routes, not a preference: the page address is the choice.",
  "settings.hub.verdict.domains":
    "Sidebar sections and their order are fixed — the product map stays fully visible.",
  "settings.hub.verdict.groups":
    "Project-group collapse is remembered per project — workspace state, not a preference.",
  "settings.hub.verdict.dnd": "Card drag-and-drop is the board's primary control.",
  "settings.hub.verdict.filters":
    "Filters and search are part of the page address (?project=&q=) — bookmarkable.",
  "settings.hub.verdict.panels":
    "Terminal and feed panels collapse in place on the Execution page — state is remembered.",
  "settings.hub.verdict.confirms":
    "Confirmations for destructive actions are always on — they protect your data.",
  "settings.hub.verdict.scrolls":
    "Whole-page scrolling with position restore on Back is fixed.",
  "settings.hub.verdict.updateBanner":
    "The page never reloads on its own — a calm banner announces a new version.",
  "settings.hub.verdict.hotkeys":
    "Hotkeys are fixed: “/” focuses search, “?” opens the cheatsheet.",
  "settings.hub.verdict.search":
    "Global search is the single entrance to memory: its behavior is part of the structure, not a preference.",
  "settings.hub.verdict.crumbs":
    "Breadcrumbs carry the navigation context of the route; removing them breaks orientation.",
  "automation.listLoading": "Loading",
  "automation.listFailed": "Failed to load the list",
  "automation.schedule.create": "New schedule",
  "automation.schedule.title": "New schedule",
  "automation.schedule.subtitle":
    "Created disabled — enablement is a separate step; ticks only start with the engine (S2)",
  "automation.schedule.empty": "No schedules",
  "automation.schedule.emptyHint":
    "Create a schedule — manual runs work right away, automatic ones await the engine (S2).",
  "automation.hook.create": "New rule",
  "automation.hook.title": "New hook rule",
  "automation.hook.subtitle": "Event (on) + conditions + action; created disabled",
  "automation.hook.empty": "No rules",
  "automation.hook.emptyHint":
    "Create a rule on a board event — the action fires once enabled.",
  "automation.hook.noCondition": "no conditions",
  "automation.rule.enabled": "enabled",
  "automation.rule.disabled": "disabled",
  "automation.rule.enable": "Enable",
  "automation.rule.disable": "Disable",
  "automation.rule.delete": "Delete",
  "automation.rule.runNow": "Run now",
  "automation.rule.runNowTitle":
    "Manual run: the assignment is created immediately, bypassing the engine and budgets",
  "automation.rule.dailyAt": "daily at {{at}}",
  "automation.rule.everyInterval": "every {{interval}}",
  "automation.form.nameLabel": "Name",
  "automation.form.taskLabel": "Task",
  "automation.form.specialistLabel": "Specialist",
  "automation.form.harnessLabel": "Harness",
  "automation.form.triggerKindLabel": "Trigger",
  "automation.form.triggerDaily": "daily",
  "automation.form.triggerInterval": "interval",
  "automation.form.triggerAtLabel": "time (HH:MM)",
  "automation.form.triggerEveryLabel": "interval",
  "automation.form.scheduleTriggerNote":
    "A schedule's condition is its trigger: a time or an interval; there is no cron syntax.",
  "automation.form.conditionLabel": "Conditions",
  "automation.form.conditionNote":
    "Conditions come from the server dictionary — fields, operators and values arrive from the board.",
  "automation.form.clausesLabel": "Rule conditions",
  "automation.form.fieldLabel": "Field",
  "automation.form.opLabel": "Operator",
  "automation.form.valueLabel": "Value",
  "automation.form.addClause": "Add",
  "automation.form.addClauseTitle": "Add a condition from the dictionary",
  "automation.form.removeClause": "Remove condition {{clause}}",
  "automation.form.noValueEnum":
    "This field has no closed value set — the condition is unavailable in v1.",
  "automation.form.onLabel": "Event (on)",
  "automation.form.actionLabel": "Action",
  "automation.form.create": "Create",
  "automation.field.taskCol": "task column",
  "automation.field.taskPriority": "task priority",
  "automation.field.taskProject": "task project",
  "automation.field.taskStatus": "task status",
  "automation.field.raw": "condition field",
  "automation.journal.empty": "No launches",
  "automation.journal.emptyHint": "The journal is empty — run a rule by hand.",
  "automation.journal.launched": "launched",
  "automation.journal.skipped": "skipped",
  "automation.journal.missed": "missed (window)",
  "automation.journal.assignment": "assignment #{{id}} →",
  "automation.journal.more": "More",
  "automation.journal.moreFailed": "Failed to load more of the journal",
  "automation.mutation.disabledNote":
    "Mutations are unavailable without a ui token — the section is read-only.",
  "automation.mutation.createFailed": "Failed to create the rule",
  "automation.mutation.patchFailed": "Failed to update the rule",
  "automation.mutation.deleteFailed": "Failed to delete the rule",
  "automation.mutation.deleteConfirm":
    "Delete rule «{{name}}»? The name stays taken (soft delete with retention) — a rule with the same name cannot be created.",
  "automation.mutation.deleted": "«{{name}}» deleted",
  "automation.mutation.retainedNote": "soft delete: the row is retained disabled",
  "automation.mutation.created": "«{{name}}» created (disabled)",
  "automation.mutation.runFailed": "Failed to run",
  "automation.mutation.launched": "«{{name}}»: launched",
  "automation.mutation.launchedDetail":
    "assignment queued for task {{id}} — see «Execution»",
  "automation.mutation.skipped": "«{{name}}»: skipped",
  "automation.mutation.skippedDetail": "the run was refused — reason in the journal",

  // --- docs section (ADR 0015/0016, contract 2026-09-23 §§4–6) ---------------------
  "nav.docs": "Documentation",
  "docs.cat.product": "About the product",
  "docs.catDesc.product": "What vesma and vesma-eyes are: concepts and glossary.",
  "docs.cat.gettingStarted": "Getting started",
  "docs.catDesc.gettingStarted":
    "Deploy the board and sign in — from zero to a workspace.",
  "docs.cat.board": "Board & groups",
  "docs.catDesc.board":
    "Project groups and the kanban board: structure and everyday work with tasks.",
  "docs.cat.agents": "Agents & assignments",
  "docs.catDesc.agents": "Assignments, executors and completion reports.",
  "docs.cat.automation": "Automation",
  "docs.catDesc.automation": "Rules and schedules — no cron syntax.",
  "docs.cat.devices": "Devices & pairing",
  "docs.catDesc.devices": "Pair a device with the board via a QR code.",
  "docs.cat.security": "Security & tokens",
  "docs.catDesc.security": "Access tokens: issuing and rotation.",
  "docs.cat.maintenance": "Maintenance",
  "docs.catDesc.maintenance":
    "Backup, upgrade and troubleshooting — what to do when something breaks.",
  "docs.cat.faq": "FAQ",
  "docs.catDesc.faq": "Short answers to frequent questions.",
  // Imported hubs (contract §4 — mirroring the hub design spec §2).
  "docs.cat.mnemosUser": "For users",
  "docs.catDesc.mnemosUser":
    "Install, first run, sync and references — everyday work with the memory server.",
  "docs.cat.mnemosAdmin": "For administrators",
  "docs.catDesc.mnemosAdmin":
    "Security, federation and operational runbooks for the vesma administrator.",
  "docs.cat.mnemosArchitecture": "Architecture",
  "docs.catDesc.mnemosArchitecture":
    "How vesma is built: hybrid memory and its control surfaces.",
  "docs.cat.meshUser": "For users",
  "docs.catDesc.meshUser": "Run a vesma-mesh node and configure the federation.",
  "docs.cat.meshAdmin": "For administrators",
  "docs.catDesc.meshAdmin": "Day-2 operations and security for a vesma-mesh node.",
  "docs.cat.apiOverview": "Hub overview",
  "docs.catDesc.apiOverview":
    "What lives here, the project API map, and the freshness rule.",
  "docs.cat.apiBoard": "Board API",
  "docs.catDesc.apiBoard":
    "The vesma-eyes HTTP API reference, generated from the OpenAPI snapshot.",
  "docs.cat.apiMnemos": "vesma HTTP API",
  "docs.catDesc.apiMnemos":
    "A map over the memory server surfaces and the A2A sessions contract.",
  "docs.cat.apiAgent": "vesmaro-agent protocol",
  "docs.catDesc.apiAgent": "The agent wire protocol and the service charter v2 digest.",
  "docs.cat.apiMesh": "vesma-mesh",
  "docs.catDesc.apiMesh":
    "No public HTTP API — the internal protocol and the operator surface.",
  "docs.search.placeholder": "Search the docs",
  "docs.search.ariaLabel": "Search the docs",
  "docs.search.resultsLabel": "Search results",
  "docs.search.indexing": "Indexing…",
  "docs.search.noResults": "Nothing found for “{{query}}”",
  "docs.search.noResultsHint": "Try a single word: “token” instead of “token rotation”",
  "docs.search.localeHint":
    "Some pages are available in one language only — switch the interface language (RU|EN in the header).",
  "docs.toc.title": "On this page",
  "docs.prev": "Previous",
  "docs.next": "Next",
  "docs.prevNextNav": "Page navigation",
  "docs.badge.verified": "current as of v{{version}}",
  "docs.localeOriginal": "In the original language ({{lang}})",
  "docs.lang.ru": "Russian",
  "docs.lang.en": "English",
  "docs.provenance.badge": "from {{repo}}@{{sha}} · synced {{date}}",
  "docs.provenance.full":
    "Imported from the {{repo}} repository, commit {{sha}}, synced {{date}}",
  "docs.provenance.multiSource": "{{count}} sources · latest {{date}}",
  "docs.provenance.multiSourceFull":
    "Hub pages are synced from {{count}} repositories by pins; the latest sync is {{date}} — every page carries its own pin on its badge",
  "docs.hub.start": "Start here",
  "docs.hub.categories": "Categories",
  // U6: hub cards with statistics (the v12 canon — counters are DATA, zero
  // living layer). The strip lives on the section-root hub only.
  "docs.hub.cardsLabel": "Hubs",
  "docs.hub.cardUpdated": "updated {{stamp}}",
  "docs.hub.cardHere": "You are here — the current hub",
  "docs.hub.cardOpen": "Open the hub",
  "docs.hub.cardMultiSource": "{{count}} sources",
  // U6: the honest manifest error (honest-map rows 20–21) — an explicit
  // slot with Retry instead of an eternal skeleton.
  "docs.error.manifestTitle": "The docs catalog failed to build",
  "docs.error.manifestMessage":
    "The documentation index could not be loaded, so no pages can be shown. Check the connection and retry; if that does not help, reload the page (after a server update a stale cache may point at outdated files).",
  "docs.hub.vesmaroEyes.lede":
    "The board reference: from the first launch to upgrades — panels, agents, tokens and maintenance.",
  "docs.hub.mnemos.lede":
    "A memory server for AI agents: a well of entries, semantic search and storage governed by the tag contract. This hub carries the user and administrator guides plus the architecture overview.",
  "docs.hub.mnemosMesh.lede":
    "Federated storage: bring up a vesma-mesh node, configure the channel and run two-instance operations.",
  "docs.hub.api.lede":
    "The ecosystem's APIs in one place: the board reference from the OpenAPI snapshot, the vesma HTTP surface, the vesmaro-agent protocol, and an honest note on mesh. Every page is synced from its source — pin and date on the badge.",
  "docs.hub.coverage.both": "Available in Russian and English",
  "docs.hub.coverage.ru": "Available in Russian only",
  "docs.hub.coverage.en": "Available in English only",
  "docs.hub.coverage.mixed": "Partially translated (ru+en)",
  "docs.copy.code": "Copy code",
  "docs.copy.done": "Code copied",
  "docs.mermaid.renderFailed":
    "The diagram could not be rendered — its source is shown instead.",
  "docs.notFound.title": "No such page",
  "docs.notFound.message": "Check the address or go back to the category list.",
  "docs.notFound.cta": "Open the docs",
  "docs.error.title": "The page could not be shown",
  "docs.loading": "Loading…",
  // U6: the RUS/ORIG bilingual switch on a document page (the v12
  // presentation over the main engine): visible only when both a
  // translation and a distinct original exist.
  "docs.bilingual.group": "Article language: translation or original",
  "docs.bilingual.rus": "Russian translation",
  "docs.bilingual.orig": "The original language",
  "docs.pages.one": "{{count}} page",
  "docs.pages.few": "{{count}} pages",
  "docs.pages.many": "{{count}} pages",

  // --- shared empty/error ----------------------------------------------------------
  "common.retry": "Retry",
  // UX-overhaul §7.2 (Ф1): raw error text lives only under a disclosure.
  "common.techDetails": "Technical details",

  // --- UI-27: TextEngine (author text — markdown engine) ----------------------------
  "text.showFull": "Show full text",
  "empty.offlineNote":
    "If you are running against a live vesma, check that the API is up and that the dev proxy (/api → vesma) is reachable. Browser requests stay CORS-gated during development.",
  "app.loadingView": "Loading view",
  // ME-072 A: the ONE 404 pattern (the tasks 404 is the reference: explain
  // + an action).
  "app.notFoundTitle": "Page not found",
  "app.notFoundMessage":
    "This path does not exist in the well — the address is stale or mistyped.",
  "app.notFoundAction": "Back to overview",

  // --- CV-7: QR pairing + devices (ADR 0012) ---------------------------------------
  "nav.devices": "Devices",

  // The «Подключить устройство» dialog (owner side, §2.1–§2.4).
  "pairing.title": "Connect a device",
  "pairing.description":
    "The QR pairing dialog: create a code, scan it with the device, then confirm the request after matching the four digits.",
  "pairing.creating": "Creating a pairing…",
  "pairing.createFailed": "Could not create the pairing",
  "pairing.confirmFailed": "Could not confirm the pairing",
  "pairing.denyFailed": "Could not deny the pairing",
  "pairing.cancelFailed": "Could not cancel the pairing",
  "pairing.qrTitle": "Scan the QR with the device",
  "pairing.qr.hint": "No camera? Type the code below manually on the device.",
  "pairing.qr.loading": "Loading the QR…",
  "pairing.codeLabel": "Pairing code",
  "pairing.codeHint": "Manual path: open /pair on the device and enter this code.",
  "pairing.copy": "Copy",
  "pairing.copied": "Copied",
  "pairing.copyFailed":
    "Copy failed — the code stays in the field, select it manually.",
  "pairing.waitingScan": "Waiting for the scan…",
  "pairing.ttl": "expires in {{time}}",
  "pairing.expiredShort": "expired — start over",
  "pairing.cancel": "Cancel",
  "pairing.requestTitle": "Connection request",
  "pairing.requestHint":
    "A device scanned the code. Match the four digits against its screen and confirm.",
  "pairing.unverified": "unverified",
  "pairing.sourceIp": "Device IP",
  "pairing.noDeviceName": "no name",
  "pairing.verifyLabel": "Verification code",
  "pairing.verifyHint":
    "Four digits are a screen match, not a password: they must be identical on both devices.",
  "pairing.approve": "Confirm",
  "pairing.deny": "Deny",
  "pairing.confirmedTitle": "Device confirmed",
  "pairing.confirmedMessage":
    "The token will be issued at the device's next exchange — the entry appears in the device list.",
  "pairing.deniedTitle": "Request denied",
  "pairing.deniedMessage": "The device gets no token; the code is spent.",
  "pairing.cancelledTitle": "Pairing cancelled",
  "pairing.expiredTitle": "Pairing expired — start over",
  "pairing.expiredMessage": "A code lives for 3 minutes. Create a new pairing.",
  "pairing.revokedTitle": "Pairing revoked",
  "pairing.failedTitle": "Pairing not created",
  "pairing.restart": "Start over",
  "pairing.done": "Done",

  // The «Устройства» page (/system/devices, §10.2).
  "pairing.devices.title": "Devices",
  "pairing.devices.listLabel": "Paired devices",
  "pairing.devices.loading": "Loading devices…",
  "pairing.devices.failed": "Could not load the devices",
  "pairing.devices.loginHint":
    "The device list requires the owner session — sign in to see the connected devices.",
  "pairing.devices.empty": "No paired devices yet",
  "pairing.devices.emptyHint":
    "Connect a phone or tablet: «Connect a device» → QR → confirmation.",
  "pairing.devices.state.active": "active",
  "pairing.devices.state.expired": "expired",
  "pairing.devices.state.revoked": "revoked",
  "pairing.devices.created": "connected",
  "pairing.devices.lastIp": "last IP",
  "pairing.devices.expires": "sliding TTL until",
  "pairing.devices.hardExpires": "hard until",
  "pairing.devices.revoke": "Revoke",
  "pairing.devices.revokeConfirm":
    "Revoke «{{name}}»? Revocation is irreversible — the device will need a fresh pairing.",
  "pairing.devices.revoked": "Device revoked",
  "pairing.devices.revokeFailed": "Could not revoke the device",
  // Per-device granules (Amendment §A.7 — «давать и забирать доступы»;
  // global reads are always open and have no switch).
  "pairing.devices.grantsExpand": "Show component grants",
  "pairing.devices.grantsCollapse": "Hide component grants",
  "pairing.devices.grantsTitle": "Component grants",
  "pairing.devices.grantsHint":
    "Reads are always open; a switch grants or revokes the component's mutations — effective immediately, no re-pairing.",
  "pairing.devices.granule.tasks": "Tasks",
  "pairing.devices.granule.reports": "Reports",
  "pairing.devices.granule.inbox": "Inbox",
  "pairing.devices.granule.notifications": "Notifications",
  "pairing.devices.grantOn": "granted",
  "pairing.devices.grantOff": "closed",
  "pairing.devices.grantsSaved": "Grants updated",
  "pairing.devices.grantsFailed": "Could not update the grants",
  "pairing.unsupportedTitle": "Pairing is unavailable in this mode",
  "pairing.unsupportedMessage":
    "The devices domain speaks the board merge-API; the direct-mnemos mode has no such page.",

  // The device page (/pair, §2.3 — no authentication).
  "pair.title": "Connect this device",
  "pair.intro": "Enter the pairing code from the owner's screen and a device name.",
  "pair.codeLabel": "Pairing code",
  "pair.codeInvalid": "The code cannot be empty",
  "pair.nameLabel": "Device name",
  "pair.defaultName": "Browser on {{platform}}",
  "pair.platformUnknown": "unknown platform",
  "pair.connect": "Connect",
  "pair.connecting": "Connecting…",
  "pair.verifyingTitle": "Code accepted — confirm on the trusted side",
  "pair.verifyHint":
    "Show the owner these four digits and wait for the confirmation on their screen.",
  "pair.waitHint":
    "We will re-check automatically in a minute; the button works manually too.",
  "pair.checkNow": "Check now",
  "pair.checking": "Checking…",
  "pair.linkedTitle": "Device connected — bound to this browser",
  "pair.boundNote":
    "The token is stored on this device — nothing to copy by hand. The button below is only for moving it into another app.",
  "pair.tokenLabel": "Device token",
  "pair.copyToken": "Copy token",
  "pair.copyFallback": "Copied via the browser's fallback path.",
  "pair.copyManual":
    "Copy failed — the token is selected in the row, copy it manually.",
  "pair.startWork": "Start working",
  "pair.deviceId": "Device id",
  "pair.scope": "scope",
  "pair.expires": "expires",
  "pair.enterAnother": "Enter another code",
  "pair.err403": "The code is bound to another address",
  "pair.err404": "Unknown code",
  "pair.err410": "The code expired or was already used",
  "pair.err429": "Too many attempts",
  "pair.err503": "Pairing is disabled on the server",
  "pair.errGeneric": "Could not connect",

  // --- Kora (ADR 0019 rev.2; union И1 — the 07j/07l workspace) -------------------
  "kora.workspace.title": "Kora · host sessions",
  "kora.workspace.hint":
    "Kora — the journal of every host's sessions: what the agent did and said. Read-only records",
  "kora.summary.hosts": "hosts: {{n}}",
  "kora.summary.running": "running sessions: {{n}}",
  "kora.summary.day": "in 24h: {{n}}",
  "kora.filter.label": "Filter by host",
  "kora.filter.all": "All hosts",
  "kora.side.region": "Hosts and sessions",
  "kora.tree.title": "Hosts and agents",
  "kora.tree.explain":
    "Agents are the programs work runs through on a machine: for example, zcode",
  "kora.tree.noAgents": "no agents yet",
  "kora.tree.emptyNoExecutors": "No hosts yet",
  "kora.tree.expand": "expand",
  "kora.tree.collapse": "collapse",
  "kora.block2.section": "Sessions",
  "kora.block2.titleAll": "Sessions · all hosts",
  "kora.block2.titleHost": "Sessions · {{host}}",
  "kora.block2.titleAgent": "Sessions · {{harness}} on {{host}}",
  "kora.block2.titleExecutor": "Sessions · {{name}}",
  "kora.block2.qfRunning": "running",
  "kora.block2.qfDay": "in 24h",
  "kora.block2.emptyContext": "No sessions here",
  "kora.block2.emptyFiltered": "No sessions match this filter",
  "kora.about.title": "About the session",
  "kora.about.started": "Started",
  "kora.about.lastActivity": "Last activity",
  "kora.about.coverage": "This session's coverage",
  "kora.about.harness": "Source",
  "kora.about.copyLink": "Copy session link",
  "kora.about.copied": "Link copied",
  "kora.about.copyFailed": "Couldn't copy — copy it from the address bar",
  "kora.sessionCov.full": "full run",
  "kora.sessionCov.partial": "beginning only",
  "kora.sessionCov.metadata-only": "metadata only",
  "kora.sessionCov.absent": "not scanned",
  "kora.sessionCov.unknown": "coverage not named yet",
  "kora.pill.liveAge": "running · {{age}}",
  "kora.age.min": "{{n}} min",
  "kora.age.hour": "{{n}} h",
  "kora.age.day": "{{n}} d",
  "kora.coverage.support.full": "full",
  "kora.coverage.support.lists-only": "lists only",
  "kora.coverage.support.metadata-only": "metadata only",
  "kora.coverage.support.absent": "not scanned",
  "kora.coverage.gaps": "Known gaps",
  "kora.legend.title": "What we see from your machines",
  "kora.legend.growNote":
    "Coverage grows as scanners become ready — we'll update this list",
  "kora.list.loading": "Loading sessions",
  "kora.list.loadMore": "Load more",
  "kora.list.loadFailed": "Failed to load the session list",
  "kora.list.inactiveTitle": "Kora is waiting for you to sign in to the board",
  "kora.list.inactiveHint": "Sign in — host sessions will appear here",
  // UX-overhaul §5/§9.3 (Ф1): honest empty, branched by the executor count.
  // ME-072 №7: the connect CTA lives ONCE per screen — in the center; the
  // panel lines state the fact, action-free.
  "kora.list.emptyNoExecutors": "Sessions will appear once you connect an agent",
  "kora.list.emptyNoSessions": "Sessions will appear once the host scanner starts",
  "kora.list.emptyAction": "Connect an agent",
  "kora.list.emptyStatusLink": "Open system status",
  "kora.session.steerable": "steerable",
  "kora.session.origin.relay": "relay",
  "kora.session.origin.local": "local",
  "kora.session.state.live": "live",
  "kora.session.state.idle": "idle",
  "kora.session.state.dead": "process dead",
  "kora.session.notFound": "Session not found",
  "kora.session.notFoundMessage": "Session '{{id}}' is not in the Kora registry.",
  // ME-063: the coverage reason on the 404 plate — a return from the task
  // card with an explanation, never an empty screen (agents-ui-spec §5).
  "kora.session.notFoundCoverage":
    "The host is not available for viewing: the board reads transcripts only from hosts with a scanner. Head back to the session list or the task card — the link will work once the host becomes readable.",
  "kora.session.backToList": "Back to the session list",
  "kora.session.inactiveTitle": "Kora is waiting for you to sign in to the board",
  "kora.transcript.region": "Session run",
  "kora.transcript.loading": "Loading the transcript",
  "kora.transcript.loadFailed": "Failed to load the transcript",
  "kora.transcript.inactiveHint":
    "Sign in — the transcript of this session will appear here",
  "kora.transcript.emptyMessage":
    "The session is in the registry but the store has no entries — or the reader has not reached it yet.",
  "kora.transcript.redacted": "redacted",
  "kora.transcript.redactedNote":
    "Part of the line was masked by the single redaction module on serving",
  // UX-overhaul П4 (Ф1): timestamp-less transcript lines get a neutral
  // label; the seq cursor is an internal metric — it lives in the tooltip.
  "kora.transcript.line": "transcript line",
  "kora.workzone.invite": "Pick a session — its run opens here",
  "kora.workzone.openedAnnounce": "Opened session: {{name}}",
  "kora.workzone.followTail": "Follow the tail",
  "kora.workzone.searchLabel": "Find in this session",
  "kora.workzone.searchPlaceholder": "Find in this session…",
  "kora.workzone.matches": "matches: {{n}}",
  "kora.pult.title": "Console",
  "kora.pult.explain": "The console — the session digest and the Ether",
  "kora.pult.digest": "Digest",
  "kora.pult.ether": "Ether",
  "kora.pult.hint": "Pick a session — its digest will appear here",
  "kora.pult.digestEmpty":
    "The session digest is built automatically — it will arrive later",
  "kora.pult.readTranscript": "Read the transcript",
  "kora.pult.waiting": "awaiting owner: {{n}}",
  "kora.pult.waitingHint": "Tasks waiting for your decision",
  "kora.pult.expand": "Expand",
  "kora.pult.collapse": "Collapse",
  // Resize seams (U5, 07l §3 — the finale blocker): surface names, tooltips
  // and honest separator aria values.
  "kora.resize.side.label": "Hosts and sessions panel width",
  "kora.resize.side.tooltip": "Drag to resize. Double-click to restore",
  "kora.resize.pult.label": "Console height",
  "kora.resize.pult.tooltip": "Drag to resize the height. Double-click to restore",
  "kora.resize.ether.label": "Ether width",
  "kora.resize.ether.tooltip": "Drag to resize. Double-click to restore",
  "kora.resize.valueCollapsed": "collapsed, {{n}} px",
  "kora.resize.valueAuto": "auto",
  "kora.resize.valueAutoPx": "auto, {{n}} px",
  // The Ether (U5, 15-WOW §3.2): a live feed from REAL bus events only;
  // a silent bus = the honest empty and zero movement.
  "kora.ether.caps": "Ether — everything happening in the sessions right now",
  "kora.ether.title": "Ether feed",
  "kora.ether.empty":
    "No events yet — the feed collects what happens in the sessions while you are here",
  "kora.ether.emptyFiltered": "No events for host {{host}} yet",
  "kora.ether.online": "{{name}} on {{host}} — online",
  "kora.ether.onlineNoHost": "{{name}} — online",
  "kora.ether.offline": "{{name}} on {{host}} — offline",
  "kora.ether.offlineNoHost": "{{name}} — offline",
  "kora.ether.registered": "New agent: {{name}} on {{host}}",
  "kora.ether.registeredNoHost": "New agent: {{name}}",
  "kora.ether.report": "Report on task {{task}}",
  "kora.ether.reportBy": "{{actor}}: report on task {{task}}",
  "kora.composer.label": "Write to the agent in this session",
  "kora.composer.placeholder": "Write to the agent…",
  "kora.composer.send": "Send",
  "kora.composer.sendLaterChip": "Sending will arrive later",
  "kora.composer.sendLaterNote":
    "Sending messages to the agent will arrive later — for now Kora shows how sessions run. The draft is kept on this machine and survives a page reload.",
  // Draft persistence (U5, the vesmaro.koraDraft:{sessionId} key): honest
  // indication — «saved» only after a real write, a failure is named.
  "kora.composer.draftSaved": "Draft saved",
  "kora.composer.draftFailed":
    "The draft was not saved — it lives while the page is open",
  "kora.composer.finishedNote":
    "The session is finished — there is no one to write to; start a new one on the host",
  "kora.composer.interruptedNote":
    "The session was interrupted — the agent is no longer listening here",

  // --- base kit state matrices (spec 05 §2.2/§2.5, wave U0) ------------------
  "field.errorPrefix": "Error:",
  "tag.filterUnavailable": "Filtering is unavailable here",

  // --- conveyor (U8 v12-UX-flows): shared step-kit vocabulary -----------------
  // Step state for screen readers: the number/✓ glyphs are visual only
  // (aria-hidden), the state is named in words (WCAG 4.1.2).
  "flows.rail.stateDone": "Step completed",
  "flows.rail.stateCurrent": "Current step",
  "flows.rail.stateUpcoming": "Upcoming step",
  "flows.rail.backTitle": "Back to the “{{step}}” step",
  // Draft resume (koraFrameStorage precedent): a restore is named and
  // dated — the form does not pretend it was never closed.
  "flows.draft.restored": "Draft restored after reload (saved at {{time}})",
  "flows.draft.keepNote": "The draft is stored locally and survives a reload",
  "flows.draft.startOver": "Start over",

  // --- agent enrollment conveyor (U8): the «Details → Token → First
  // connect» steps. Progress = real operation states, never a timer.
  "agents.enrollment.railLabel": "Agent connection steps",
  "agents.enrollment.stepForm": "Details",
  "agents.enrollment.stepToken": "Token & command",
  "agents.enrollment.stepConnect": "First connect",
  "agents.enrollment.stepTokenTitle": "Token minted — it works exactly once",
  "agents.enrollment.watch": "Watch for the connect",
  "agents.enrollment.backToToken": "Back to the install command",
  "agents.enrollment.stepConnectTitle": "Waiting for the first connect: {{label}}",
  "agents.enrollment.watchWaiting":
    "The token is live — run the command from the «Token & command» step on the machine. As soon as the agent reports in, this step closes by itself.",
  "agents.enrollment.watchPollNote":
    "The status refreshes on its own; you may close this dialog — the token keeps being watched in the list below the registry.",
  "agents.enrollment.watchConnected":
    "The agent connected — “{{name}}” registered and awaiting approval",
  "agents.enrollment.watchApproveNote":
    "One step left: approve the new executor in the registry (fingerprint verify).",
  "agents.enrollment.watchOpenRegistry": "Open the registry to approve",
  "agents.enrollment.watchApproved": "“{{name}}” is connected and approved — all set",
  "agents.enrollment.watchUsedNoRow":
    "The token was used, but the executor card has not reached the registry yet — refresh or check the registry.",
  "agents.enrollment.watchExpired": "The token has expired — no connect happened",
  "agents.enrollment.watchExpiredHint":
    "Nothing broke: the machine simply did not report in time. Start over — a fresh token, the same fields.",
  "agents.enrollment.watchRestart": "Restart the connection",
  "agents.enrollment.watchRevoked":
    "The token was revoked — connecting with it is impossible. Start over with a fresh token.",
  "agents.enrollment.watchListError": "Failed to refresh the token status: {{message}}",
  "agents.enrollment.cancelNote":
    "You may close this dialog at any step — the token does not die and stays in the list below the registry (expires {{time}}).",

  // --- host-add conveyor (U8): «Machine → Install → Verify». A step IS a
  // real provision-job state; there is no timer-driven progress.
  "agents.provision.conveyorLabel": "Machine connection steps",
  "agents.provision.stepMachine": "Machine",
  "agents.provision.stepInstall": "Install",
  "agents.provision.stepVerify": "Verify",
  "agents.provision.detachNote":
    "You may close this card — the install does NOT cancel: it keeps running on the server, and the card re-attaches to the job when you return.",
};
