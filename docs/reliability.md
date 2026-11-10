# Persistence, mentor context, and review workspaces

These changes ship in v0.3.2. They were developed on codex/reliability-fixes, based on 0a73b3b, and approved for merge by the learner on 2026-11-10. Future development and QA must use a separate worktree and profile; never point test FORGE_DATA at an active learner profile.

## Editor saves

web/src/draft.ts owns each editor's current files, revision, acknowledged revision, and pending save. Saves are serialized; edits arriving during a request trigger another save. Only acknowledgement of the current revision means saved. Failed requests keep the draft in memory and, when browser storage is available, in origin-local storage. Retry save and autosave retry the same draft.

SPA links and browser Back/Forward wait for registered editor flushes. A failure keeps the editor available. Closing or reloading sends a beacon with the same save payload and version as HTTP saves. server/save-order.ts rejects older revisions from the same editor, including a late request arriving after a newer beacon. This is ordering within one editor, not a collaborative editing protocol between multiple tabs.

Run, Submit, and Preview send persist:false and execute an immutable snapshot. Reset requests a starter file, then makes an ordinary editor edit. These operations cannot acknowledge a newer draft or write their older snapshot over it. Legacy callers that omit persist still keep the original save-and-run API behavior.

## Progress storage and recovery

server/progress-store.ts validates version 1 before accepting saved state. Missing optional v1 review state is initialized; existing learner code, course counters, workspace files and unknown additive fields remain in the document. A newer primary format is refused without falling back to an older backup.

A changed write preserves the previous primary in progress.json.backup-1 and rotates up to five backups. A temporary file is written, synced and renamed into place. Unchanged data does not rotate backups. Explicit editor save acknowledgements follow the flush to disk.

If startup encounters an unreadable primary, it uses the newest valid backup. A complete progress.json.tmp is a final recovery candidate for an interrupted first save. The original damaged bytes are copied to a uniquely named progress.json.corrupt-* file before replacement. Recovery is logged and displayed in the course UI. When no valid state exists, startup refuses to reset the profile or accept writes.

For manual recovery, stop that instance, preserve the entire data directory, inspect the primary and backups, and restore a valid version-1 file as progress.json. Do not delete damaged files to make startup appear successful. These local rolling backups are not a substitute for an independent backup of the data directory. Existing progress exports still exclude learner code.

## Review workspaces

/review/:module/:item uses the regular editor with /api/review/items/... endpoints. Only previously passed, due drills start new attempts. Draft files, hints, solution access and attempts live under progress.review.attempts; the original progress.items, lessons and workspaces are not changed. A review based on a cumulative project starts from that exercise's authored starting context, never by resetting the learner's project.

Opening, saving, running, and previewing do not award recall. The first graded submission records the review: an unassisted pass advances the interval; a failure or assisted pass schedules practice again in three days. Retries remain possible but do not repeatedly advance the interval. A new due date starts a fresh attempt. Each mutation carries its review cycle, so an old tab cannot overwrite the next review. The generic review-answer endpoint cannot award drill success.

## Mentor and authored content

Markdown defaults to ordinary Markdown and inert code fences. The authored opt-in is reserved for checked-in lesson bodies, task instructions and hints; mentor text, thinking summaries and voice snippets always use the default. Authored interactive diagrams, quizzes and GraphQL examples retain their current format.

A text thread keeps contextItem separately from lastItem (display activity). Saving voice turns does not claim that the text model received new task context. Older saved threads without contextItem refresh that context on their next typed turn. Voice navigation updates both delegation instructions and the existing backend conversation; notes wait behind an in-flight response. Stale tool requests are rejected; late tool results and edit glances from an older item are discarded. Asynchronous panel loads are checked against the currently visible thread before being displayed.

## Continuing the work

Run npm run typecheck, npm run build and npm run test:platform. The new regression files are draft-save, progress-recovery, markdown-trust, mentor-context and review-workbench under tests/. They cover delayed saves, failures and reload recovery, corrupted state and interrupted writes, renderer behavior, provider-event handoffs, and real TypeScript/Mongoose/React graders. Tests create temporary profiles or inject in-memory progress. Mentor tests use fake providers and no real keys.

Browser QA should use a temporary FORGE_DATA plus distinct FORGE_PORT, FORGE_REFERENCE_PORT and FORGE_LAUNCH_PORT. Check delayed autosave acknowledgements, navigation before the debounce, retry after a save outage, edits during Run/Submit, and review isolation. Check both original checkouts' progress hashes and Git status afterward.

Validation on 2026-11-10: typecheck, production build, and all 194 platform tests passed. Browser checks covered delayed and failed saves, navigation, edits during Run/Submit, review isolation, and review unload beacons. With the learner-authorized remembered connection, live text, delegation context changes, voice output transcripts and voice-to-text context were checked on a disposable profile. The first synthetic session expired before speech; a retry with an active silent audio stream remained connected and produced the correct new-step transcript without a provider error. Both calls were ended. Physical microphone capture and audible playback were not tested. The learner reviewed the fixes and authorized merging and publishing v0.3.2.
