# Cognition MeetingOS: Project Context

_Last updated: 2026-09-30. Describes the code as it is on `main` (after the security and agent-pipeline overhaul)._

## 1. What this is

An agentic AI app that turns a meeting transcript into accountable work. **CrewAI** agents (7, in two crews) extract tasks, decisions and risks (each backed by a verbatim transcript quote), assign owners from the company roster, verify the result and plan follow-ups. Python then resolves dates and owners and scores confidence. A second crew explains each score, audits the final result and writes Minutes of Meeting (MoM). Everything is saved to Firestore. Humans (PMs) review flagged items on role-based dashboards.

Pitch line: _"We built an AI system that turns meetings into accountable execution, automatically."_

Goal right now: a strong portfolio/showcase project on GitHub, with the intent to grow into a real product later.

## 2. Architecture

```
Google Meet ─► Chrome extension ─┐
                                 ├─► FastAPI backend ─► Crew 1 (4 agents) ─► Python assembly ─► Crew 2 (3 agents) ─► Firestore
Paste transcript (PM dashboard) ─┘        │                                                                      ▲
                                          └── verifies Firebase ID token + role on every request                 │
React frontend (Vite) ── Firebase Auth (login) ── reads/writes Firestore directly for profiles + team chat ──────┘
                      └─ calls the FastAPI backend (axios) for everything else
```

One shared Firebase project is used by the frontend and the backend: **`cognition-meetingos-37be5`** (Spark/free plan, owned by the user's Google account).

| Layer | Tech | Where it runs |
|---|---|---|
| Frontend | React 19, Vite 8, Tailwind 4, react-router 7, axios, firebase JS SDK | Local `:5174`; Vercel later (`frontend/vercel.json`) |
| Backend | Python 3.12 target (3.11 in the local venv), FastAPI, firebase-admin, slowapi, dateparser | Local `:8010` (not 8000–8004, which other local projects use); Render later (`render.yaml`, `Procfile`) |
| AI | CrewAI 1.12.2 → Gemini SDK (via LiteLLM model ids). Default `gemini/gemini-3.6-flash`, override with `LLM_MODEL` | Google Gemini API |
| Data + auth | Cloud Firestore + Firebase Authentication (email/password + Google) | Google cloud |
| Capture | Chrome extension (Manifest V3) scraping Google Meet captions | User's Chrome |

## 3. Repository map

```
backend/
  main.py                 FastAPI app, CORS (ALLOWED_ORIGINS + chrome-extension://), rate limiter, routers
  analytics.py            Team performance stats and early-warning alerts (pure functions)
  access.py               Who can see/manage what: pure rule functions (meeting_view, can_manage_task, ...)
  auth_middleware.py      Token verification, cached user profile, require_role() dependency factory
  firebase_config.py      Admin SDK init: FIREBASE_SERVICE_ACCOUNT_KEY env var, else backend/firebase-service-account.json
  routes/                 (also extension.py: the extension's revocable token + upload)
    companies.py          register/join, role-aware invites, team, role + team changes, remove member
    meetings.py           upload transcript, run crew (background), list/get meeting, regenerate MoM, chat
    tasks.py              list tasks, /mine, validate (PM), status update, overdue check
  crew/
    agents.py             7 agent factories + get_llm() (retries on 429/5xx for Gemini)
    tasks.py              CrewAI tasks for both crews, guardrails, MoM task builder
    schemas.py            Pydantic outputs exchanged between agents
    pipeline.py           Deterministic logic: quote grounding, deadlines, owner match, confidence, assemble()
    crew.py               run_meeting_crew(): Crew 1 → assemble → Crew 2, per-step audit callback, graceful degradation
  tests/                  76 pytest tests (no Firebase or LLM needed)
frontend/src/
  App.jsx                 Routes; ProtectedRoute(allow=[roles]) wraps pages in AppShell; ErrorBoundary; 404
  api.js                  axios client; attaches Firebase ID token; all endpoint wrappers
  contexts/               AuthContext (profile, refreshProfile, token→localStorage), ToastContext
  pages/                  LandingPage, Login, PMDashboard (Meetings), ManagerDashboard (Team), EmployeeDashboard (My work, all roles),
                          MeetingDetail, ConnectExtension, NotFound
  lib/                    format.js (labels, dates, status maps), pageMeta.js (breadcrumb + tab title)
  dev/mock.js             DEV-only preview mode with sample data
  components/             AppShell, ui (design primitives), TaskCard, TeamPanel, CompanyChat, OnboardingChecklist, ...
extension/                captions.js (pure caption logic + node tests), content.js (Meet automation + on-page pill),
                          background.js (uploads, badge, notifications), bridge.js (web app → extension handshake), popup
firestore.rules           Security rules (LIVE on the Firebase project since 2026-09-30)
docs/                     Web app design brief
```

## 4. The AI pipeline (backend/crew)

**7 agents in two crews, with a Python step between them.** Every agent uses `output_pydantic` (schemas in `crew/schemas.py`). Agents refer to items by **index** instead of re-emitting lists, so fields can't be silently dropped. Rule of thumb: agents do what needs judgement, Python does what has one right answer.

**Crew 1: understand the meeting** (`get_crew_tasks`)
1. **Extraction agent** → `ExtractionResult`: items of type `task | decision | risk`, each with title, description, `owner_name`, `deadline_text`, `evidence_quote`, `speaker`.
   - A **guardrail** (`grounding_guardrail`) parses the raw output and rejects it (agent retries, max 2) if more than 30% of items have an evidence quote not found in the transcript.
2. **Assignment agent** → owner per task, chosen from company roster + meeting participants.
3. **Validation agent** → per item: `grounded`, `needs_review`, `review_reason`, plus a `validation_summary`.
4. **Follow-up agent** → `followup_days` and `escalate_to` per task.

**Python assembly** (`crew/pipeline.py::assemble()`, unit-tested)
- Deadlines: `resolve_deadline()` uses `dateparser` relative to the **meeting date** ("by Friday" → ISO date; also EOD, end of week/month). Unparseable → `null`.
- Owners: `resolve_owner()` matches to a real company member (exact name, else unique first name) → `owner_uid`. Unresolved → flagged.
- Confidence: `confidence_breakdown()` is a 4×25 rubric (clarity, owner, deadline, evidence); the score is its sum and the breakdown is stored on the task. `needs_review` if flagged or confidence < 50.
- An item is **dropped only if both** the validation agent and the deterministic quote check say it's unsupported.
- Decisions and risks go to the meeting doc, not the tasks collection.

**Crew 2: explain, audit, summarize** (`get_review_tasks`, runs on the *assembled* result)
5. **Confidence agent** → `ConfidenceNotes`: per task, one sentence on why it scored what it did and a `next_step`. It never sets or changes the number (the score comes from code).
6. **Audit agent** → `AuditReport`: findings (`severity` info/warning/critical, `category` conflict/duplicate/missing_follow_up/deadline/ownership/unsupported/other, `task_index`, message) plus a one-sentence verdict. `automated_audit_checks()` (past deadlines, duplicate titles via difflib ≥ 0.85, owner with more than 5 tasks) runs first and is passed in so the agent doesn't repeat it. `apply_audit()` flags warning/critical tasks `needs_review` and appends the reason. Findings carry `task_title` because the UI's task order differs from the audit's numbering. Saved on the meeting as `audit {summary, findings[], passed, completed}`.
7. **Summary agent** → MoM markdown with exactly 5 sections, written from the final data (real owners, ISO dates).
- Guardrails on the confidence and audit tasks (`indexed_guardrail`) reject references to task numbers that don't exist.

**Failure behaviour:** if Crew 1 fails, the meeting is `failed`. If Crew 2 fails part-way (e.g. API quota), everything it finished is kept, the tasks are still saved, and a warning goes to the audit log (the UI then offers "Generate Minutes" to retry the MoM).

Persistence (`routes/meetings.py::process_with_crew`): batch-writes tasks with stable IDs `sha1(meeting_id:title)[:12]` (re-runs don't duplicate), writes MoM/decisions/risks/audit to the meeting, logs each agent step and each audit warning to `meetings/{id}/logs`. **Any exception in Crew 1 or persistence sets `status: failed`** with the reason in the logs (never a silent "completed").

Cost note: a meeting now needs at least 7 LLM calls (more with guardrail retries), which matters on free-tier API quotas.

Chat (`POST /meetings/{id}/chat`): single-turn Q&A over the transcript using the same LLM (no history, transcript treated as data).

## 5. Data model (Firestore)

```
users/{uid}         name, email, createdAt · role, companyId, managerId (employees), updatedAt (role/companyId/managerId set ONLY by backend)
companies/{id}      name, createdBy, createdAt (legacy docs may still hold inviteCode/expiresAt)
invites/{code}      companyId, role (manager|employee), managerId, createdBy, createdAt, expiresAt, uses, maxUses (backend-only)
  messages/{id}     text, senderId, senderName, senderRole, createdAt   (team chat; client reads/writes directly)
meetings/{id}       title, department, transcript, mom, status (processing|completed|failed), date, companyId,
                    uploadedBy, teamManagerId, participantUids[], memberUids[], participantNames[], durationMinutes,
                    durationEstimated, decisions[], risks[{…, severity high|medium|low, mitigation}], validation_summary,
                    flagged_count, audit{summary,findings[],passed,completed}
  participants/{id} name, role, department
  logs/{id}         agent, action, timestamp   (audit trail)
tasks/{id}          meeting_id, companyId, title, description, assigned_to (lowercase name), owner_uid,
                    deadline (ISO date or raw text), deadline_text, deadline_date, status, confidence, validated
                    (pending|approved|rejected), needs_review, review_reason, followup_days, escalate_to,
                    escalated_to, evidence_quote, speaker, teamManagerId, confidence_breakdown{clarity,owner,deadline,evidence},
                    confidence_note, confidence_next_step, createdAt, source (ai|manual), createdBy,
                    acceptance (pending|accepted|declined), acceptedAt, declineReason, progress (0-100),
                    updates[{progress,note,by,at}] (last 20), validatedBy, validatedAt, statusUpdatedAt, completedAt
```

Meetings/tasks are backend-only (rules deny all client access). Tasks created before the overhaul lack `owner_uid`, `evidence_quote` etc.; the code falls back to name matching for those.

## 6. Roles, hierarchy and security

**Hierarchy:** Owner → Managers → their team. The stored role values are `pm` (shown as **Owner**), `manager` and `employee`. A team is simply "employees whose `managerId` is that manager" (no separate collection).

- **Roles are never self-assigned.** Registering a company (`POST /companies`) makes the caller the Owner. Everyone else joins with an **invite code** (`invites/{code}`) that fixes their role: an owner's *manager invite*, or an *employee invite* bound to a manager's team (created by that manager, or by the owner for a chosen team). Codes expire after 7 days and have a use limit. A legacy company-wide code (`companies.inviteCode`) still joins as an unassigned employee.
- **Owners** manage roles, move employees between teams (`PATCH /companies/team/{uid}/manager`) and see/approve everything. Owners can never be removed or demoted by anyone, so a company always has an owner; an owner can promote another owner.
- Removing or demoting a manager releases their team (employees lose `managerId`). Removed users keep their Firebase account and can join another company.
- `access.py` holds the access rules as pure functions (`meeting_view`, `can_manage_task`, `can_view_task`); `auth_middleware.py` has `get_current_user`, `require_role(*roles)` and the 5-minute profile cache (`invalidate_user(uid)` after changing a user).
- **Meetings** carry `teamManagerId` (the team they belong to, or `null` = company-wide) and `memberUids` (participants matched to real members at upload, plus everyone later given a task). **Tasks** carry `teamManagerId` copied from the meeting. A manager's uploads always belong to their own team; an owner picks the team.
- **Visibility:** *full* view = owner, the team's manager, or the uploader (and pre-teams meetings stay full for managers). *member* view = anyone in `memberUids`: they get the minutes, decisions, risks and their own tasks, but never the transcript, audit trail, validation summary, logs or chat. Everyone else gets 403.
- Firestore rules: clients can create only a bare profile (`name, email, createdAt` with server timestamp), update only `name`/`updatedAt`, never write `role`/`companyId`/`managerId`, and never create companies. Company chat is readable/writable only by members. Meetings, tasks and invites are backend-only. Client writes must use `serverTimestamp()`.
- CORS restricted to `ALLOWED_ORIGINS`, credentials off (bearer tokens). Register/join/invite creation are rate-limited.

| Endpoint | Who |
|---|---|
| `POST /companies` (register), `POST /companies/join` | any signed-in user without a company (409 otherwise) |
| `POST/GET/DELETE /companies/invites` | owner (any role, optional team); manager (own team invites only) |
| `GET /companies/team`, `GET /companies/info` | owner: everyone; manager: self + own team |
| `PATCH /companies/team/{uid}/role`, `PATCH /companies/team/{uid}/manager` | owner |
| `DELETE /companies/team/{uid}` | owner (not owners); manager (own team's employees only) |
| `POST /meetings/upload-transcript` | owner, manager |
| `GET /meetings/` | scoped list (owner: all; manager: team + legacy + attended; employee: attended) |
| `GET /meetings/{id}` | full or member view as above |
| `GET /meetings/{id}/logs`, `POST /{id}/chat`, `POST /{id}/regenerate-summary` | full view only (owner / team manager) |
| `GET /tasks/` | owner: all; manager: team's (+ own, + pre-teams); employee: own |
| `GET /tasks/mine`, `POST /tasks/check-overdue` | any member |
| `POST /tasks/{id}/validate` | owner; manager for own team's tasks |
| `PATCH /tasks/{id}/status`, `PATCH /tasks/{id}/progress` | assignee, or owner / the team's manager |
| `PATCH /tasks/{id}/acceptance` | the assignee only (decline needs a reason) |
| `PATCH /tasks/{id}/assign` | owner; manager for own team's tasks |
| `POST /meetings/{id}/tasks` (add a task by hand) | full view (owner / team manager / uploader) |
| `GET /notifications` | any member (built from their own tasks and meetings) |
| `GET /analytics/team`, `GET /analytics/export` (CSV audit log) | owner, manager (own team) |

Frontend: managers and owners share the Meetings dashboard (`/pm`, scoped by the backend) and the Team performance page (`/manager`); employees have `/employee`. Route guards are UX only; the backend enforces everything. An onboarding checklist guides owners (register → invite managers → managers invite teams → first meeting) and managers (invite team → first meeting); employees get a dismissible welcome card and a list of meetings they were part of.

**Task lifecycle:** the AI proposes a task → a manager approves, edits, reassigns or rejects it (`validatedBy`) → the **assignee accepts or declines** it (declining needs a reason, which flags the task back to the manager as "Declined by X: …") → the assignee reports progress (0–100% with a note; >0 moves it to in progress, 100 marks it done) → done stamps `completedAt`. Reassigning or changing the assignee resets acceptance to pending. Managers can also add tasks by hand on a processed meeting (`source: manual`, approved straight away, still needs the assignee's acceptance; no AI confidence score).

**Sign-in vs sign-up:** Firebase's Google sign-in always creates an account if none exists, so the frontend enforces the difference: on the *Sign in* tab, if `getAdditionalUserInfo(cred).isNewUser` is true the new account is deleted immediately and the user is pointed to *Sign up*; on *Sign up*, an existing account is simply signed in with a notice. (A server-side alternative is Identity Platform blocking functions, which needs the Blaze plan.)

**Onboarding:** owners register the company (owner name, job title, phone; company name, industry, size, country, website). Managers and employees join with an invite code (previewed first: company, role, team), plus name, job title, phone and a department picked from a list (`DEPARTMENTS` in `lib/format.js`) or typed in.

**Data created before this change:** meetings/tasks without `teamManagerId` are treated as pre-teams (visible to managers), and old meetings have no `memberUids`, so existing employees won't see them until backfilled.

## 6b. Team performance dashboard

`GET /analytics/team?window=N` (owner, manager; N = 3–50, default 10) powers the **Team** page (`/manager`). Logic lives in `backend/analytics.py` as pure functions; thresholds are constants at the top of that file.

- The **window** is the latest N *completed* meetings the caller can see; the N before them are used to spot a decline.
- Per person: tasks assigned/done/open/overdue/escalated in the window and all time, completion rate, on-time rate (done on or before the deadline, using `completedAt`), trend vs the previous window, one coloured square per task (done/open/overdue), and up to 6 open tasks.
- **Alerts** (severity critical/warning/info): *behind* (completion < 70% with at least 3 tasks; < 50% is critical, e.g. "completed 6 of 10 tasks from the last 10 meetings (60%): 4 not done"), *overdue* (2+; 4+ critical), *declining* (20+ points down vs the previous window), *stale* (2+ open tasks untouched for 14 days), *overloaded* (8+ open), *escalated*. People are sorted at risk → needs attention → on track.
- Team-wide: completion, overdue, on-time, people at risk, AI tasks awaiting approval, deadlines in the next 7 days, risks raised, recent meetings with done/flagged/audit counts.
- Scope follows `access.py`: managers see their own team only, owners see every employee and manager.
- `PATCH /tasks/{id}/status` now stamps `statusUpdatedAt`, and `completedAt` when a task is marked done (older tasks lack these, so their on-time rate is unknown).
- **Weekly velocity** (`weekly_series`): tasks created vs completed per week for the last 6 weeks, shown as a bar chart. **Oldest overdue** per person (`oldest_overdue`): the task that has been overdue longest, shown on each member card.
- **Export audit log:** `GET /analytics/export` returns a CSV of every task the caller can see (meeting, task, assignee, deadline, status, progress, approval and who approved, acceptance, confidence, source, created/completed, evidence quote).
- **Notifications bell** (top bar, polls every 60 s): tasks waiting for your acceptance, overdue or due soon, declined tasks and tasks waiting for approval (managers), newly processed or failed meetings. Read state is per browser (localStorage).
- **My Work** (employees): tasks sorted by urgency (awaiting acceptance → overdue → soonest deadline), Accept/Decline banner, due countdown with a "time used" bar, progress slider with a note, and "done this week vs last week".

## 6d. Web app design system ("Warm Bento")

The UI follows the Google Stitch designs in `stitch_web_app_ui_design/` (Warm Bento variant: Meetings dashboard, Meeting detail v2, Team performance v2, My work). Other screens (landing, login, members, extension, 404) were designed to match.

- **Tokens** live in `frontend/src/index.css` as a Tailwind v4 `@theme` (canvas `#F4F3EE`, white bento cards with 28px radius, coral `#FF5722` accent, forest green for success, dark `#30312E` sidebar, Plus Jakarta Sans, Material Symbols icons). Component classes: `.bento`, `.tile`, `.btn-*`, `.field`, `.segmented`, `.eyebrow`.
- **Primitives** in `components/ui.jsx` (Icon, Logo, Avatar/AvatarStack, Chip, StatCard, Segmented, ProgressBar, EvidenceQuote, EmptyState, Loading, SectionHeader); helpers and status/role maps in `lib/format.js`.
- **Shell** (`components/AppShell.jsx`): fixed dark sidebar (role-based nav, extension status, account), sticky top bar with clickable breadcrumbs (a meeting shows its title), upload button and account menu, mobile drawer, skip-to-content link. Pages set the browser tab title via `lib/pageMeta.js`.
- **Navigation polish:** back buttons return to the previous in-app page (or the role's dashboard on a direct visit), scroll-to-top on page change, a 404 page, an error boundary with Reload/Go home, Esc closes menus and drawers, visible keyboard focus, a warning before discarding a half-written upload.
- **No fake data in the real app:** design elements without backing data were replaced with real ones (e.g. "Neural pipeline 99.8%" → actual agent steps from the audit trail and real counts; avatars → initials).
- Icons are a ligature font: they stay invisible (as 1em boxes) until the font has loaded, so text like "arrow_forward" never flashes.
- **Dev preview mode** (`src/dev/mock.js`, dev server only, excluded from production builds): in the browser console run `localStorage.setItem('meetingos_mock', 'pm')` (or `'manager'` / `'employee'`) and reload to see every screen with sample data and no backend or Firebase; `localStorage.removeItem('meetingos_mock')` to exit.

## 7. Running it locally

Backend (from `backend/`):
```bash
python3 -m venv venv && source venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env            # GEMINI_API_KEY, LLM_MODEL, ALLOWED_ORIGINS, ...
# put the Firebase Admin key at backend/firebase-service-account.json (gitignored)
python -m uvicorn main:app --reload --port 8010
python -m pytest -q             # 104 tests, no credentials needed
cd ../extension && node --test   # caption + audio merge logic, script loading (25 tests)
```
Frontend (from `frontend/`): `cp .env.example .env` (Firebase web config + `VITE_API_URL=http://localhost:8010`), then `npm install && npm run dev` → http://localhost:5174 (pinned in `vite.config.js` so it doesn't clash with other Vite apps on 5173).

Env vars: backend `GEMINI_API_KEY`, `LLM_MODEL`, `GROQ_API_KEY` (Whisper for call audio; optional), `TRANSCRIBE_MODEL` (default `whisper-large-v3-turbo`), `FIREBASE_SERVICE_ACCOUNT_KEY` (JSON on one line, alternative to the key file), `ALLOWED_ORIGINS`, `APP_NAME`. Frontend `VITE_API_URL`, `VITE_FIREBASE_*`, optional `VITE_EXTENSION_ZIP_URL`.

**Never commit:** `backend/.env`, `frontend/.env`, `backend/firebase-service-account.json` (all gitignored; verified untracked).

Chrome extension: `chrome://extensions` → Developer mode → Load unpacked → `extension/` (or the zip served by the web app at `/meetingos-extension.zip`, rebuilt with `npm run zip:extension`). Chrome/Chromium only. See section 6c for how it works.

## 6c. Chrome extension

**Connecting (one time):** the popup's *Connect account* opens the web app's `/connect-extension` page (owners and managers). It calls `POST /extension/token`, which creates a long-lived token `mos_ext_…` (stored only as a SHA-256 hash in `extensionTokens/{hash}`, one per user; reconnecting replaces it) and hands it to the extension via `window.postMessage` → `bridge.js`. `bridge.js` runs only on the web-app origins listed in `manifest.json` (currently `http://localhost:5174`, plus 5173 for older setups; **add the production domain there**). The token can only identify its user (`GET /extension/me`), upload a meeting (`POST /extension/meetings`, same code path as uploads via `start_meeting`) and revoke itself (`DELETE /extension/me`). Every call re-checks the user's current role and company; losing upload rights deletes the token. The web app can check (`GET /extension/status`) and revoke (`DELETE /extension/token`).

**In a call (`content.js`):** detects the call by the Leave button (found by its `call_end` icon, so it works in any UI language), starts recording automatically, turns on Meet captions (button found by its `closed_caption_off` icon), and watches the caption region. Capture is **block-based**, the approach used by the open-source [TranscripTonic](https://github.com/vivek-nexus/transcriptonic) (MIT): Meet shows each speaker turn as a block with the name element right before the text, and keeps rewriting that block's text as recognition improves. We watch the live block, keep only its *latest* text, and commit a line when a new block starts (or Meet resets a long block). That replaces the earlier snapshot-diffing, which produced duplicated and half-finished lines. `createBlockBuffer()` in `captions.js` holds this logic; if Meet's structure changes and no block is found for 15 s, it falls back to the old snapshot merge. "You" becomes the connected user's name. Upload sends the real call length (`duration_minutes`), and the backend estimates it from word count otherwise.

**Call audio for accuracy (optional, free):** Meet's captions are Google's live speech recognition, tuned for speed, so names, jargon and accents come out wrong however carefully we read them. The popup's *Use call audio for accuracy* button records the Meet tab's audio (Chrome only allows this after a click on the extension, so once per meeting; Chrome shows a sharing icon on the tab). It runs in a hidden extension page (`offscreen.js`) that plays the audio back so you still hear the call, cuts it into 30–90 s chunks at a pause, skips chunks with no speech, and posts each one to `POST /extension/transcribe`. The backend (`transcription.py`) sends it to **Whisper on Groq's free tier** with the company name, meeting title and team names as spelling hints, drops Whisper's silence hallucinations, and snaps near-miss names to the roster ("Aneika" → "Anika"). The audio is never stored. The recorder then keeps only segments that overlap moments where it actually heard sound (Whisper can confidently invent text over silence, often echoing the hint names). At upload, `mergeAudioWithCaptions` uses Whisper's words for everyone else and the captions only for *who* spoke when (matched by time); your own lines still come from captions, because tab audio doesn't include your microphone. Any chunk that failed (no key, quota, network) falls back to the caption lines for that stretch. Without `GROQ_API_KEY` the button reports that audio isn't set up and captions are used. Verified with real Whisper on a generated meeting in headless Chrome (clean output, last sentence included, silence filtered) and by loading the extension in Chrome; not yet on a live Meet call.

Captures are saved to `chrome.storage.local` continuously, so a closed or crashed tab loses nothing. A small status pill in the call shows Recording / Captions off / Sending / Sent with buttons. When the call ends, it auto-sends (if at least 3 lines) through `background.js`, which shows a notification that opens the meeting, keeps a `REC` badge on the toolbar icon, and asks to reconnect on 401.

**Popup:** connection, live status for the current Meet tab, editable title, speakers and preview, Start/Stop/Send/Open, recent captures (send ones that didn't go out), settings (auto-record, auto-captions, auto-send), paste-a-transcript fallback.

**Limits:** depends on Meet's captions and its page structure (all selectors in `MEET` in `captions.js`, so a breakage is a one-line fix); best with Meet in English (button labels); captions are visible to everyone in the call. Never tested on a live Meet call from the dev environment: the caption logic has unit tests and Chrome validates the manifest, but the DOM selectors need a real call to confirm.

## 8. Gotchas learned the hard way

- **Gemini free tier is tiny.** `gemini-3.6-flash` allowed ~20 requests/day on the free tier, and one meeting uses ~6–10. For demos use `LLM_MODEL=gemini/gemini-3.1-flash-lite` (tested end to end) or enable billing. The LLM client already retries 429/5xx with backoff.
- **Groq is not usable as-is.** `llama-3.3-70b-versatile` no longer exists on this key, and `openai/gpt-oss-120b` hits an 8k tokens/minute limit and fails structured-output parsing. (The old chat endpoint was calling the dead model.)
- **CrewAI guardrails run before pydantic conversion**, so a guardrail must parse `output.raw` itself and return JSON text on success (see `grounding_guardrail`; covered by a test).
- **The venv's launcher scripts are broken** (venv was moved from `~/Desktop`). Use `venv/bin/python -m pip` / `-m uvicorn` / `-m pytest`, never `venv/bin/pip`.
- **System Python `urllib` fails SSL verification** on this Mac; use `httpx`/`requests` for ad-hoc HTTPS scripts.
- **Firestore rules were deployed via the Firebase Rules REST API** with the service-account key (the Firebase CLI's pre-check is denied for that key). The previously live rules were a "relaxed" variant from a deleted `deploy_rules.py`. The `firebase` CLI is not installed; `.firebaserc` now points to `cognition-meetingos-37be5` so `npx firebase-tools login && npx firebase-tools deploy --only firestore:rules` also works. The Firebase console (Firestore → Rules → Publish) is the no-terminal alternative.
- Signing up before the new rules were live fails (old rules required `role`); now fixed since the rules are deployed.

## 9. Testing status

- **Call-audio transcription:** 8 backend tests (`tests/test_transcription.py`: silence filtering, hints, name correction, endpoint auth and fallback), 7 extension tests (audio/caption merge, voiced-only filter), a real Whisper run on generated speech, and an end-to-end recorder run in headless Chrome against real Whisper.
- **Latest batch (task acceptance, progress/reassign, add task, notifications, export, velocity, risk severity, durations, block capture):** 96 backend tests (incl. `tests/test_task_workflow.py`), 18 extension tests, and a headless-Chrome run of the extension against a fake Meet page (clean lines, revised text kept, "You" renamed, auto-upload on leave). Screens checked in dev preview mode. Not yet verified: a live Meet call and real Google sign-in against Firebase.

- **Automated (76 backend + 8 extension tests, all passing):** extension token connect/use/revoke/expiry-on-role-loss; caption merging and speaker splitting (node); team performance stats and alerts (incl. the 6-of-10 case) and the `/analytics/team` endpoint; the owner → manager → team model end to end against an in-memory Firestore fake (`tests/fake_firestore.py`: registration, role-aware invites, joining, team management, meeting/task scoping, employee redaction, uploads), role enforcement on every privileged endpoint, quote grounding + guardrail, deadline resolution, owner matching, confidence rubric and breakdown, result assembly, automated audit checks, index guardrail, and the two-crew flow with stubbed LLM crews (including Crew 2 failing mid-run).
- **Verified manually:** full 7-agent runs on a transcript with planted problems (`gemini-3.1-flash-lite`): tasks, owners and ISO deadlines correct; a vague task flagged and scored 55; a task contradicting a "hold" decision and a task given to someone who said they'd be out were both flagged (by the audit and validation agents; the audit agent's findings vary run to run); confidence notes agree with the score breakdown; decisions/risks separated; MoM generated. Frontend builds; backend serves `/health`, rejects unauthenticated calls (401), accepts CORS from the local web app.
- **Not yet verified in a browser:** the new sign-up → create company → join with invite flow, PM role changes, the extension on a live Meet call, and the new UI (evidence quotes, decisions/risks panel).

## 10. Known gaps and tech debt

- **Extension depends on Meet's page:** speaker names and caption reading rely on Meet's current markup and English labels; selectors are centralised in `extension/captions.js` but need checking whenever Meet changes. Not yet tried on a live call.
- **Follow-ups are planned but not executed:** `followup_days` and `escalate_to` are stored; nothing schedules or sends nudges yet.
- **Processing runs in FastAPI `BackgroundTasks`** (same process). On Render's free tier the server sleeps when idle, and a job interrupted mid-run leaves a meeting stuck in `processing` (no sweeper yet).
- `assigned_to` is still a lowercase name string next to `owner_uid`; dashboards group by name.
- 3 remaining ESLint errors are advisories in older code (CompanyChat unread counter, hook exports from the two context files), not bugs; the build passes.
- Transcript is truncated at 100k characters for the LLM; chat sends the whole transcript every time.

## 11. Roadmap

**Agentic pipeline v2:** move to a CrewAI **Flow** with persisted state and live per-step progress; route confident tasks to auto-approve and the rest to PM review; give the assignment agent tools over the team directory and open tasks (cross-meeting memory, dedupe/updates); scheduled follow-up agent that nudges owners in company chat and escalates; multi-turn "ask your meetings" agent across all meetings; an eval suite (precision/recall on hand-labelled transcripts).

**Future capture options (researched, deliberately not built yet):**
- *Meeting bot.* No install for users; a bot joins the call. Google has no API for this, so every bot is an automated browser. Options: **Vexa** (Apache-2.0) self-hosted with Docker for free, using **Groq Whisper's free tier** for speech-to-text (`TRANSCRIPTION_SERVICE_URL=https://api.groq.com/openai/v1`, `TRANSCRIPTION_MODEL=whisper-large-v3-turbo`; the user's Groq key already has this model; free tier ≈ 2,000 requests and 8 audio-hours/day), API `POST /bots`, transcript `GET /transcripts/google_meet/{code}`, HMAC-signed webhooks. Vexa's hosted service is ~$0.30/h + $0.20/h transcription; Recall.ai ~$0.50–0.65/h. Or a home-grown Playwright caption bot (free, but fragile and needs a dedicated Google account). Either needs an always-on machine (not Render's free tier); the user's dev Mac is an 8 GB M1, which can run one bot for testing.
- *Google Meet REST API.* Official transcripts with speaker attribution after the meeting (`conferenceRecords/*/transcripts/*/entries`). Requires the host's Google Workspace plan to include transcripts (Business Standard and up), transcription switched on in the meeting, Google OAuth with Meet scopes (Google verification needed beyond 100 test users), and only works for meetings the connected user organised. Good as an "Import from Google Meet" option for Workspace customers.

**Production:** a real job queue (arq/Celery/Cloud Tasks) with idempotent retries and a stuck-job sweeper; Firebase custom claims for roles; Slack/Linear/Jira sync; tracing and cost tracking; CI running tests + evals. Deployment options discussed: Vercel + Render + Firebase (free, but the backend sleeps) or Firebase Hosting + Cloud Run (one vendor, needs the Blaze plan).

## 12. Git and history

- Branch `main`, hosted at https://github.com/shreytiwari09/Cognition-Meeting-OS.
