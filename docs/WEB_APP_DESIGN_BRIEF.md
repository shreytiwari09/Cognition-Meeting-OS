# Cognition MeetingOS: Web App Design Brief

A complete description of the web app's interface, written to generate new designs (for example with Google Stitch) that can be implemented without changing the backend. Every screen below exists today. Field names match the real data. Items marked **(new, optional)** are suggestions that don't exist yet.

---

## 1. The product in one paragraph

MeetingOS turns meetings into accountable work. A Chrome extension captures a Google Meet's captions (with speaker names), or someone pastes a transcript. A team of 7 AI agents then extracts **tasks** (with an owner, a deadline and the exact quote they came from), **decisions** and **risks**, writes the **Minutes of Meeting**, scores each task's confidence and audits the result for contradictions. Managers approve the AI's tasks, employees do them, and a team dashboard shows who is delivering and who is falling behind.

**Tone:** a focused, trustworthy work tool, closer to Linear or Notion than to a consumer app. Calm, dense with information but never cluttered. The AI is shown as transparent: every claim links back to evidence.

## 2. Users and roles

| Role (label in UI) | Stored as | Who they are | Main screens |
|---|---|---|---|
| **Owner** | `pm` | Registered the company. Sees and approves everything. | Meetings, Team, Meeting detail, Extension |
| **Manager** | `manager` | Leads a team. Sees and approves only their team's work. | Same as Owner, scoped to their team |
| **Employee** | `employee` | Member of a manager's team. | My work, Meeting detail (limited view) |

Hierarchy: **Company → Managers → their team.** People join only with an invite code; the code decides their role and team.

## 3. Current visual style (keep, refine or replace)

- **Theme:** dark only. Page background `#07070f`, cards `rgba(255,255,255,0.025)` with 1px borders `rgba(255,255,255,0.07)`, radius 12–16px.
- **Brand:** purple gradient `#7c3aed → #a78bfa / #c084fc`. Logo is a white lightning bolt in a purple rounded square, with the wordmark "Cognition" (bold) and "MeetingOS" (light, purple).
- **Text:** primary `#e5e7eb`, secondary `#9ca3af`, muted `#6b7280`, faint `#374151`. Font: system UI / Inter.
- **Status colours** (used everywhere, keep consistent):
  - Done / on track / completed: green `#22c55e` / `#34d399`
  - Pending / needs attention / processing: amber `#fbbf24`
  - Overdue / at risk / failed / critical: red `#ef4444` / `#f87171`
  - Escalated: orange `#fb923c`
  - Info / neutral: grey `#9ca3af`
- **Role colours:** Owner purple `#c084fc`, Manager green `#34d399`, Employee blue `#60a5fa`.
- **Agent colours** in the audit trail: Extraction `#a78bfa`, Assignment `#60a5fa`, Validation `#fbbf24`, Follow-up `#f97316`, Confidence `#34d399`, Audit `#f43f5e`, Summary `#c084fc`, Humans `#22c55e`, System `#6b7280`.
- **Motion:** subtle fade-up on cards, pulsing dot for "recording/processing", spinners for loading.
- Desktop-first (1100–1240px content width). There's no mobile layout today; a responsive design is welcome.

## 4. Global elements

**Top navigation bar** (sticky, 56px, translucent dark with blur):
- Left: logo + "Cognition MeetingOS", a "/" breadcrumb with the page name, then nav links.
  - Owner/Manager links: **Meetings**, **Team**, **Extension**.
  - Employee link: **My work**.
- Right: role badge (Owner / Manager / Employee, role-coloured pill), avatar with initials, name, **Sign out**.

**Team chat widget** (floating button, bottom-right, on every signed-in page): opens a "Team Chat" panel with company-wide messages (sender name, role, time) and a "Type a message..." input.

**Toasts:** small notifications (success, error, info, warning) for actions like "Task approved" or "Invite revoked".

---

## 5. Screens

### 5.1 Landing / setup guide (`/`)
Currently a 2-step guide, not a marketing page.
- **Step indicator** at top: 1 "Extension Setup" → 2 "User Guide".
- **Step 1, "Install the Chrome Extension":**
  - A Download button (zip).
  - A numbered list of 6 steps: download, unzip, open `chrome://extensions` (a click-to-copy chip, since browsers can't link there), Developer mode, Load unpacked, pin and connect.
  - A "Using the extension during a meeting" box with 4 short points.
  - A "Next: User Guide" button.
- **Step 2, "How to Use MeetingOS":**
  - An end-to-end flow.
  - Role cards for Owner, Employee and Manager, each with 4 steps.
  - Back and "Get started / Sign in" buttons.
- **(new, optional)** A real marketing landing page: hero ("Turn meetings into accountable execution"), how-it-works in 3 steps (capture → 7 AI agents → team dashboard), feature highlights (evidence quotes, audit agent, team performance alerts), screenshots, and a CTA to register a company. The install guide could move to `/setup`.

### 5.2 Sign in / Sign up (`/login`)
- Centered card titled "Cognition: MeetingOS — AI Execution Platform".
- Sign In / Sign Up tabs.
- **Sign up fields:** Full name, Email, Password, Confirm password (live match indicator).
- **Sign in fields:** Email, Password.
- "Continue with Google" button, plus an inline error box.
- **Sub-screens:**
  - **Verify your email:** icon, "We sent a verification link to {email}", "Back to Sign In". Also shows a "Resend verification email" link when sign-in fails because the email isn't verified.
  - **Company setup** (after first sign-in, if the user has no company). Two tabs:
    - **Join with invite code:** one code input (8 characters, monospace, uppercase) and a "Join Company" button. Errors: invalid code, expired, used up, too many attempts.
    - **Register a company:** a Company name input and a "Register Company" button. Copy: "You'll be the Owner. Then invite your managers, and they invite their teams."
  - **Success screen:**
    - Owner: "Your company is registered. Next, invite your managers from the Team tab."
    - Manager: "You joined as a manager. Invite your own team…"
    - Employee: "Your tasks will show up on your dashboard."
    - Then it auto-redirects.

### 5.3 Meetings dashboard (`/pm`, Owner and Manager)
The home screen for Owners and Managers. Page tabs: **Meetings** | **Team** (the Team tab is the members & invites panel, 5.6).
- **Header:** title + subtitle, "↻ Refresh", and a primary "+ Upload Transcript" button.
- **Getting-started checklist** (dismissible, shows "x of y done"):
  - Owner steps: Register company ✓ → Invite your managers → Managers invite their teams → Upload your first meeting.
  - Manager steps: Invite your team → Upload your first meeting.
  - Each open step has a hint and an action button.
- **4 stat cards:** Total Meetings (all time), Processing (running now, amber), Completed (fully analyzed, green), Tasks Extracted (across all meetings, purple).
- **Upload panel** (expands below the header):
  - Fields: Meeting title, Department, **Team** (Owner only: "Company-wide" or "Team of {manager}"), Participants (comma-separated full names), Transcript (large textarea).
  - Submit, with a loading state.
- **Meeting list:**
  - A search box ("Search by title or department…") and status filter pills: All (n), processing, completed, failed.
  - **Meeting card:** title, department chip, date, status pill (processing pulses amber, completed green, failed red), task count. The whole card is clickable.
- **States:**
  - Loading.
  - Empty ("No meetings yet", plus a prompt to upload or use the extension).
  - No search results ("No meetings match your search", Clear).
  - Error banner.
  - Auto-refresh every 5s while something is processing.

### 5.4 Meeting detail (`/meeting/:id`)
The richest screen. Two views:
- **Full view:** Owner, or the team's Manager.
- **Participant view:** an employee who attended. They get the minutes and their own tasks only.

**Header:**
- "← Back".
- **Ask Your Meeting** button (full view only; opens the chat sidebar) and **Refresh**.
- Meeting title, department chip, status pill, participants, date.

**Meeting Efficiency Score card:** a single score derived from the tasks (completion and confidence), with a short label.

**Banner:** "AI Minutes of Meeting generated → View Summary" (when minutes exist).

**Tabs:** **Tasks** | **Summary** | **Transcript** | **Logs (n)**. The participant view has only Tasks and Summary.

**Tasks tab:**
- **Stat bar:** Total, Pending, Done, Flagged.
- **Task cards** (grid). See 6.1 for the full anatomy.
- **Validation Agent note:** a yellow callout with a 2–3 sentence summary.
- **Decisions and Risks:** two columns. Each item has a title, description, quote and speaker.
- **Audit & Compliance Reviewer panel:**
  - A ✓ or ⚠ verdict sentence.
  - A list of findings, each with a severity pill (CRITICAL / WARNING / INFO), the affected task title, a message, and an "automated check" tag where applicable.
- **Processing state:** "AI agents are processing this meeting…".
- **Failed state:** "Processing failed. See the Logs tab for the reason."

**Summary tab (Minutes of Meeting):**
- **Content:** rendered in 5 sections (Executive Summary, Key Decisions, Action Items, Risks & Concerns, Next Steps), with a Copy button.
- **Empty or legacy state:** "No summary available" with a "✨ Generate Minutes of Meeting" button and a spinner while the Summary Agent works ("This may take 15–30 seconds").

**Transcript tab:** the raw "Speaker: text" transcript.

**Logs tab: "Agent Audit Trail".** A vertical timeline. Each event has an agent-coloured dot, the agent name, the time, and a sentence such as "Extracted 4 tasks, 2 decisions and 1 risk, each with a transcript quote" or "[critical] (task #1) Rahul said he is out Friday…". Human actions appear as "{Name} (Human): Task 'X' approved".

**Ask Your Meeting sidebar** (right drawer): a chat with the AI that answers only from the transcript. Greeting "Hi! Ask me anything about this meeting.", placeholder "Ask about decisions, tasks...", and message bubbles (user: purple gradient, right; AI: grey, left).

### 5.5 Team performance (`/manager`, Owner and Manager)
Page tabs: **Performance** | **Members & invites**. Managers see their team; Owners see everyone (all employees and managers).

- **Header:** "How much of the work from your team's meetings is actually getting done", with a **window selector**: "Look at the last [5] [10] [20] meetings".
- **5 summary stats:** Completion % ("x of y tasks done", colour by %), Overdue ("n escalated"), On time %, People at risk ("n more need attention"), Awaiting approval ("AI tasks flagged for review").
- **"Needs your attention" alert box** (red-tinted). Each alert has a severity pill and a plain sentence, and clicking it scrolls to that person. Examples:
  - "Anika completed 6 of 10 tasks from the last 10 meetings (60%): 4 not done."
  - "Rahul has 3 overdue tasks (oldest was due Sep 20)."
  - "Dev's completion dropped from 80% to 55% compared with the previous 10 meetings."
  - "Sam has 2 open tasks with no update in 14+ days."
  - When nobody is behind, it shows green: "✓ Nobody is falling behind right now."
- **People grid.** Filter pills: Everyone, Flagged, On track, No tasks. Legend: ■ done ■ open ■ overdue.
  - **Person card:**
    - Name and team ("Team of Alan" / "Manager"), with a status pill: At risk (red), Needs attention (amber), On track (green), No tasks yet (grey).
    - A big **"6/10" done** figure, coloured by rate, with "done · last 10 meetings" and a trend "▲/▼ n pts".
    - A progress bar.
    - **A row of small squares, one per task** (green done, grey open, red overdue).
    - Stats line: overdue, open, on-time %, all-time done/assigned.
    - "Details ▼" expands to the person's alerts and up to 6 open tasks (title, deadline or "overdue"), each linking to its meeting.
- **Right column lists:**
  - Awaiting your approval (task, owner).
  - Due in the next 7 days (task · owner, date).
  - Risks raised (risk, meeting).
  - Recent meetings (title, "⚠ n" audit findings, "x/y done · n flagged").
- **States:** loading; empty team ("Invite people from the Members & invites tab"); and "Only n completed meetings so far" when there's less history than the window.

### 5.6 Members & invites panel (tab on Meetings and Team pages; Owner and Manager)
- **Stats:** Company (Owner) / Your team (Manager) name, Members, Managers, Employees.
- **Invite panel:**
  - **Owner:**
    - A role toggle: "A manager" / "An employee".
    - For employees, a team picker: "No team yet" or "Team of {manager}".
    - A "+ Create invite code" button.
  - **Manager:** "+ Create team invite code" (always for their own team).
  - **Active invite rows:**
    - The **code** (large, monospace, purple), a role pill, and the target team.
    - "n used · expires Oct 9".
    - **Copy** and **Revoke** buttons.
  - Newly created invites are highlighted.
- **Members table:**
  - Columns: Name (avatar initial), Email, Role, **Team** (Owner only), Joined, remove (✕).
  - Owners get a role dropdown (Manager / Employee) and a team dropdown for employees. Owners themselves are locked.
  - Managers see only themselves and their team, and can remove their own team members.

### 5.7 My work (`/employee`, Employee)
- **Welcome card** (dismissible, first visit): explains that tasks come from meetings with the exact words that led to them, and to mark done or escalate.
- **Header card:**
  - "Good morning, {name}" and "Your Task Board".
  - Stat pills: Pending, Completed, Overdue.
  - A **progress ring** (% complete).
- **Filter tabs:** All (n), Pending (n), Done (n), Overdue (n).
- **Task grid:** task cards with status actions (mark done, escalate, back to pending). No approve or edit.
- **"Meetings you were part of":** a list of title, date and "n of your tasks". Each opens the participant view of the meeting.
- **Empty state:** "No tasks assigned yet. Tasks appear here once a meeting you were part of has been processed."

### 5.8 Connect extension (`/connect-extension`, Owner and Manager)
- **Title:** "Capture Google Meet automatically", with an explainer paragraph.
- **States, shown one at a time:**
  1. "Looking for the extension…".
  2. **Not installed:** a numbered install guide (with the `chrome://extensions` copy chip), plus "Download extension" and "I installed it, reload" buttons, and a note that it's Chrome only.
  3. **Installed, not connected:** "Connect it to your account", an explanation that it gets its own key that can only upload meetings, and a "Connect extension" button with an error line.
  4. **Connected:** "✓ Connected as {name}", "Join any Google Meet to try it…", last used time, "Go to meetings" and "Disconnect".
  5. **Employees:** "Only owners and managers send meetings…".
- **"Good to know" box:** captions must be allowed; tell participants; English works best; the popup has settings and recent captures.

---

## 6. Shared components

### 6.1 Task card (most important component)
- Left border coloured by approval state: green approved, red rejected, otherwise the status colour.
- **Top:** title, and a status pill (Pending / Done / Overdue / Escalated).
- **Description** (truncated to about 100 characters).
- **Evidence quote:** italic, with a purple left rule: “I'll have it live by Friday.” — Anika Rao.
- **Flag reason** (amber box, only while flagged and unapproved), e.g. "⚠ Contradicts the decision to hold the launch until legal approval."
- **Meta grid:** Assigned to (name), Deadline (date; amber when due soon).
- **AI Confidence:** "%" with a thin bar (green ≥70, amber ≥40, red below). Under it, the Confidence Analyst's one-line explanation and a purple "→ next step", e.g. "No deadline was given, so it lost 25 points → Ask Rahul for a deadline".
- **Approval footer** (Owner/Manager, full view):
  - Pending: **✓ Approve**, **Edit**, **Reject**.
  - Approved: ✓ Approved badge with Edit.
  - Rejected: ✕ Rejected with Approve.
- **Edit mode:**
  - Fields: Title, Assigned to (dropdown of team members), Deadline.
  - Buttons: **Save & Approve** and **Cancel**.
- **Employee footer:** status actions only (Mark done, Escalate).

### 6.2 Other components
- **Stat card:** label, big number, sub-label.
- **Status pill:** with an optional pulsing dot.
- **Role badge.**
- **Severity pill.**
- **Empty state:** icon, message and action.
- **Skeleton loaders.**
- **Confirm dialog** (remove member, disconnect).
- **Search input.**
- **Filter pills.**
- **Toggle group.**

---

## 7. Chrome extension surfaces (optional to redesign)
- **Popup (340px wide):**
  - Header: logo, name · company, Disconnect.
  - **Not connected:** an explainer and a "Connect account" button.
  - **Connected:**
    - A live status card with a coloured dot and status: "Recording · 42 lines" / "In a call, not recording" / "Captured 42 lines" / "Sent: agents are processing it" / "Reload this Meet tab".
    - A captions-off warning.
    - An editable meeting title, speaker chips, and a preview of the last 3 lines.
    - Buttons: Start / Stop / Send / Open.
    - **Recent captures** list (title · lines, with Send/Open).
    - **Settings toggles:** start recording when I join, turn on captions automatically, send automatically when the call ends.
    - A collapsible "Paste a transcript instead".
- **In-meeting pill** (bottom-left of the Google Meet page): a dark rounded pill with a dot and text, plus one action:
  - "Recording · 12 lines [Stop]"
  - "Turn on captions (CC) so MeetingOS can listen"
  - "Sending to MeetingOS…"
  - "Sent · agents are processing [Open]"
  - "Captured 40 lines [Send]"

---

## 8. Design guidance for the redesign
1. **Make evidence the hero.** The quote on each task and the audit findings are what make this AI trustworthy. Give them clear, consistent styling.
2. **The Team page is the "wow" screen.** It should be scannable in 5 seconds: who needs attention, why, and what to do next.
3. **Keep the status colour system identical across screens** (task status, person status, meeting status, severity).
4. **Show agent work as a pipeline:** 7 named agents in two crews (Extract → Assign → Validate → Follow-up, then Confidence → Audit → Summary). A visual pipeline on the meeting page while processing is a strong idea **(new, optional)**.
5. **Respect the two meeting views:** the participant view must not show the transcript, logs, audit panel, chat or approval buttons.
6. **Design every state:** loading, empty, error, processing, failed.
7. **Light mode is optional**; dark is the current identity.
8. **(new, optional)** A notifications bell for flagged tasks awaiting approval and new alerts.

---

## 9. Ready-to-paste Stitch prompts

Use one prompt per screen, and paste section 3 (visual style) first as the shared style.

1. **Meetings dashboard:** "Dark, purple-accented B2B web app dashboard for 'Cognition MeetingOS'. Sticky top nav with logo, links Meetings / Team / Extension, role badge 'Owner', avatar and Sign out. Page tabs Meetings | Team. A dismissible 'Getting started' checklist with 4 steps and action buttons. Four stat cards: Total Meetings, Processing (amber), Completed (green), Tasks Extracted (purple). A search bar and status filter pills (All, Processing, Completed, Failed). A list of meeting cards with title, department chip, date, status pill with pulsing dot, and task count. Primary button '+ Upload Transcript'."
2. **Meeting detail:** "Meeting detail page for an AI meeting assistant. Header with title, status pill, participants, date, buttons 'Ask Your Meeting' and 'Refresh'. A 'Meeting Efficiency Score' card. Tabs Tasks | Summary | Transcript | Logs. A grid of task cards: title, status pill, description, italic evidence quote with speaker, amber flag reason, assignee and deadline, AI confidence bar with a one-line explanation and a 'next step', and Approve / Edit / Reject buttons. Below: two columns 'Decisions' and 'Risks' with quotes, and an 'Audit & Compliance Reviewer' panel listing findings with CRITICAL / WARNING / INFO severity pills."
3. **Team performance:** "Team performance dashboard for managers. Segmented control 'Look at the last 5 / 10 / 20 meetings'. Five KPI cards: Completion %, Overdue, On time %, People at risk, Awaiting approval. A red-tinted 'Needs your attention' box with alerts like 'Anika completed 6 of 10 tasks from the last 10 meetings (60%): 4 not done.' A grid of person cards: name, team, status pill (At risk / Needs attention / On track), a big '6/10 done' figure with trend arrow, progress bar, a row of small green/grey/red squares (one per task), and stats for overdue, open and on-time. A right sidebar with lists: Awaiting your approval, Due in the next 7 days, Risks raised, Recent meetings."
4. **Members & invites:** "Team management panel. Stat cards for company, members, managers, employees. An invite card with a toggle 'A manager / An employee', a team dropdown, and a 'Create invite code' button. A list of active invite codes in large monospace purple text with role pill, target team, 'n used · expires', and Copy / Revoke buttons. A members table with name and avatar, email, role dropdown, team dropdown, joined date, and a remove icon."
5. **Employee 'My work':** "Personal task board for an employee. Greeting header 'Good morning, Anika' with stat pills (Pending, Completed, Overdue) and a circular progress ring. Filter tabs All / Pending / Done / Overdue. A grid of task cards with evidence quote, deadline and buttons 'Mark done' and 'Escalate'. A list 'Meetings you were part of'. A dismissible welcome card at the top."
6. **Sign in and company setup:** "Centered auth card with tabs Sign In / Sign Up, email and password fields, and 'Continue with Google'. A second screen 'Join your company' with tabs 'Join with invite code' (8-character monospace code input) and 'Register a company' (company name input)."
7. **Connect extension:** "Setup page 'Capture Google Meet automatically' with a 3-step state flow: install (download button and numbered steps), connect (one 'Connect extension' button), connected (green check 'Connected as Priya', 'Go to meetings', 'Disconnect'). A 'Good to know' info box."
8. **Marketing landing (new):** "Landing page for 'Cognition MeetingOS: turn meetings into accountable execution'. Hero with CTA 'Register your company', a 3-step how-it-works (Capture → 7 AI agents → Team dashboard), feature cards (evidence-backed tasks, AI audit for contradictions, team performance alerts, Chrome extension), and a product screenshot area."

**When you have designs:** export them (or share screenshots and the generated HTML/CSS), and I'll implement them on the existing React + Tailwind code, keeping all data, roles and states above.
