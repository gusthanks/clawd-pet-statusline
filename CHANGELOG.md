# Changelog

All notable changes to this project are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions
follow [Semantic Versioning](https://semver.org/).

## 0.3.0 - 2026-10-09

### Added

- **Costumes in the bay.** Each mini-Clawd dresses for the task of the subagent it stands for: racer with a checkered flag (verify, review, test), pirate with a sword (refute, skeptic, critique), detective with a magnifier (research, map; `Explore` agents), astronaut (plan, spec; `Plan` agents), engineer with a wrench (implement, fix), painter with a roller (design, visual), chef with a frying pan (write, docs) and judge with a gavel (judge, decide). The costume comes from the task's name (the verb before the ":" first, Portuguese or English words), then the agent type and, with no clue at all, the first tool it uses; once chosen, it never changes. Six of the same vary the hat's shade. In the rain the hat gives way to the umbrella and the prop stays in the claw. When a helper finishes fine, its mini raises a claw, goes "^ ^", its hat flies off and it leaves the bay (~2 s); after an error it leaves without a party. The "+N" now always sits above the costumes. On the author's real tasks, 85% get a costume from the name alone. Inside: `fantasias.ts` (the drawings and who wears what) and `equipe.ts` (the bay); the label comes from `agent.spawn`, which only observes; the bay's state (new atoms `team` and `crew`, replacing `helpers`) is written only on the 1 s tick and only when it changes. The sheet gains the `team` scene.
- **Progress bar.** A text bar in the status line column, fed by the engine's own events, so no one has to report progress:
  - workflows (🧩): the phases come from `meta.phases` in the script; each agent's phase from its label prefix (fallback: the agent's `meta.json`); the end from the run's final JSON, with `classic.Stop` and a 30-minute cutoff as fallbacks. Each phase fills on its own and never goes back, so overlapping (pipelined) phases are not shown full while they still run;
  - the task list (📋: `TaskCreate`, `TaskUpdate`, `TodoWrite`) when no workflow runs;
  - a batch of Agent helpers (🤖) when neither of the above is active.

  It never changes the band's height or the lane's width: on the wide status line it takes the empty first row; otherwise it becomes a segment at the end of an existing row, shrinking through four formats (and hiding below 6 free columns). When a workflow finishes, the bar fills up with ✅ for 5 s and Clawd raises a claw; if it fails or is stopped, ❌ freezes the bar for 8 s and Clawd gets startled. State lives in new atoms (`progress`, `runs`), written only on the tick and only when it changes. It only reads files Claude Code itself writes on your machine.
- On Windows the weather place now follows you: it comes from the Windows location service (read locally through `powershell.exe`; nothing leaves the machine), and the IP lookup (get.geojs.io, then ipwho.is) is only the backup, for when location is denied or off, PowerShell fails, or the system is not Windows. `CLAWD_LOCATION` still wins over everything, and `CLAWD_WEATHER=off` turns this lookup off too. The stored place now records its source (`windows`, `ip` or `env`); a place from the IP (or from an older version, with no source) is corrected on Windows at the first chance, without waiting for the hour, and if the source changes or the position moves more than 1 km the weather is fetched again right away. If Windows fails, the mod only tries again the next hour.

### Fixed

- The ultracode aura stayed on in a regular turn when the previous ultracode turn had ended with no helper running.
- A teammate with a role (not a subagent) showed up in the bay as a mini-Clawd.

## 0.2.0 - 2026-10-06

### Added

- A calmer umbrella: drizzle (codes 51–57) only counts as rain with 0.5 mm or more of precipitation, and a trace of precipitation with no rain code opens nothing. The place still comes from the IP (usually the city center); for your exact address, use `CLAWD_LOCATION`.
- In the rain, each mini-Clawd (one per subagent) gets a small umbrella in the same style as the big one: stuck on its head, covering it and its little laptop. The "+N" moves above the umbrella's tip. The sheet's `rain-work` scene now shows the big Clawd working in the rain with two mini-Clawds under umbrellas.
- Small hours with a crescent moon and twinkling stars on the lane (the stars go away when it rains).
- Date hats: a Christmas hat on Dec 24 and 25, and a party hat on Dec 31, Jan 1 and your birthday, set with `CLAWD_BIRTHDAY="DD-MM"`.
- Reaction to test commands (main agent): passed, he raises a claw with a "✓" for 3 seconds; failed, he gets startled.
- The code was split into smaller modules (`art.ts`, `lane.ts`, `scenes.ts`, `tap.tsx` and others).
- Clawd calls you when Claude stops waiting for your "yes" on a permission: he puts the laptop away, turns to the front, waves and shows a "?" bubble until the permission is settled (the next tool finishes, you send another request, or the turn ends) or until 10 minutes pass. Main agent only; a tap shows the usual reaction and he goes back to calling. Known limit: the app does not say when you answer, so after the "yes" he keeps calling until the approved tool finishes. It uses `classic.PermissionRequest` (with `classic.Notification` `permission_prompt` as a backup) and only observes: it never changes the decision.
- `CLAWD_WEATHER=off` and `CLAWD_LIMITS=off` (also `0` and `false`): each turns off the internet calls for the weather (IP and Open-Meteo) and for the limits (api.anthropic.com). With `off`, no request goes out.
- `CLAWD_NODE`: path of the Node that runs the statusline. The lookup is now `CLAWD_NODE`, `node` on the PATH, `where node` (Windows only, once) and the Mac/Linux paths; the author's machine path left the code.
- `CLAWD_DEBUG`: when set, the click log is written to the store (otherwise it stays in memory). The band size log (`renderLog`) was removed.
- The local time and date (small hours, morning coffee, hats, birthday) use the system time zone when Open-Meteo does not answer or `CLAWD_WEATHER=off` (before, they were fixed at UTC-3).
- Automatic cleanup of the mod's memory: the effort and line counts of conversations not seen for more than 7 days (and orphans from older versions) are deleted when a conversation starts.

## 0.1.0

First public version.

### Added

- Clawd, animated in the band above the message box of the Claude Code desktop app, next to
  a statusline.
- Reactions to what Claude is doing: laptop when a message arrives, glasses when reading files,
  magnifier on web searches, little hammer when editing, mini-Clawds for subagents, purple aura
  in ultracode, a press while the context is compacted, and fireworks after `git commit` or
  `git push`.
- Warnings from the statusline: sweat when the context goes above 80%, worry when the 5-hour
  limit goes above 90%, and the "pausa?" (break?) sign after an hour of non-stop work.
- Time and weather: morning coffee, sleepy small hours, an umbrella (on his head, and a big one
  over the laptop) when it rains where you are.
- Play: a tap with a click, and a dizzy Clawd after four taps in 3 seconds.
- The statusline with folder, lines changed, weather, model, effort, context and the 5-hour and
  7-day usage limits, updated every 20 seconds and the moment something changes.
- Installer `install.mjs` (installs, updates and turns off with `--uninstall`).
- Optional tweaks through the `env` of settings.json: `CLAWD_LOCATION` and `CLAWD_STATUSLINE`.
- The sheet with every animation in `docs/sheet/`, generated by `tools/make-sheet.py`.
- README in English and Portuguese, with the privacy table.
