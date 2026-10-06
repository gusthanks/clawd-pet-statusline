#!/usr/bin/env node
// Two-line truecolor RGB status line: names on top, usage below.
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ESC = '\x1b';
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const rgb = (r, g, b) => `${ESC}[38;2;${r};${g};${b}m`;

const YELLOW = rgb(235, 200, 0);
const CYAN = rgb(0, 220, 220);
const MAGENTA = rgb(210, 90, 220);
const GRAY_DIM = rgb(110, 110, 110);
const DARK_GRAY = rgb(60, 60, 60);
const GREEN = rgb(0, 200, 80);
const RED = rgb(220, 40, 20);
const ORANGE = rgb(255, 140, 0);

// Terminal width detection.
// Claude Code does NOT pass terminal columns in the statusLine JSON, and this
// script runs as a child process with no console attached, so both COLUMNS and
// [Console]::WindowWidth / process.stdout.columns come up empty here (verified
// on this machine: COLUMNS unset, WindowWidth throws IOException). So there is
// no automatic detection to rely on -- the width has to be declared.
//
// Two ways to declare it, checked in this order:
//
//   1. FLAG FILE (preferred -- takes effect on the very next render, no restart):
//        ~/.claude/statusline-narrow   exists  -> narrow layout
//        delete it                             -> back to wide
//      This is the one that works while Claude Code is already running, e.g.
//      when mirroring the desktop terminal onto the Orca iOS app mid-session.
//
//   2. ENV VAR (only applies to a Claude Code process started afterwards,
//      since a running process keeps the environment it was launched with):
//        $env:CLAUDE_STATUSLINE_COLS = 45    (current PowerShell session)
//        setx CLAUDE_STATUSLINE_COLS 45      (persists for new sessions)
const NARROW_FLAG = path.join(os.homedir(), '.claude', 'statusline-narrow');

function detectWidth() {
    try {
        if (fs.existsSync(NARROW_FLAG)) return 45;
    } catch {}
    const forced = parseInt(process.env.CLAUDE_STATUSLINE_COLS || '', 10);
    if (Number.isFinite(forced) && forced > 0) return forced;
    const envCols = parseInt(process.env.COLUMNS || '', 10);
    if (Number.isFinite(envCols) && envCols > 0) return envCols;
    try {
        if (process.stdout && process.stdout.columns) return process.stdout.columns;
    } catch {}
    // safe default: assume a normal desktop pane when nothing tells us otherwise
    return 100;
}

const COLS = detectWidth();
const NARROW = COLS < 60;

// width (in blocks) of every progress bar — single knob for all three.
// In narrow mode the 5h and 7d bars share one line, so the bar shrinks to keep
// that line under ~45 columns even in the worst case (100% + a 6-char reset
// countdown like "13d23h"): 2*(2+1+4+1+4+1+8) + 1 = 41.
const BAR_W = NARROW ? 4 : 10;

// gradient stop: green(0,200,80) -> yellow(220,200,0) -> red(220,40,20)
function gradient(t) {
    let r, g, b;
    if (t <= 0.5) {
        const u = t / 0.5;
        r = Math.round(0 + u * (220 - 0));
        g = Math.round(200 + u * (200 - 200));
        b = Math.round(80 + u * (0 - 80));
    } else {
        const u = (t - 0.5) / 0.5;
        r = Math.round(220 + u * (220 - 220));
        g = Math.round(200 + u * (40 - 200));
        b = Math.round(0 + u * (20 - 0));
    }
    return rgb(r, g, b);
}

function bar(pct, width = 10) {
    const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
    let bar = '';
    for (let i = 0; i < width; i++) {
        if (i < filled) {
            const t = width > 1 ? i / (width - 1) : 0;
            bar += `${gradient(t)}█`;
        } else {
            bar += `${DARK_GRAY}█`;
        }
    }
    return `${bar}${RESET}`;
}

function usageLevel(pct) {
    if (pct < 20) return { emoji: '🟢', color: GREEN };
    if (pct < 70) return { emoji: '⚡', color: rgb(220, 200, 0) };
    if (pct < 90) return { emoji: '🔥', color: ORANGE };
    return { emoji: '🚨', color: RED };
}

// "resets_at" is a unix timestamp in seconds -> compact countdown (2d4h, 3h12m, 45m)
function resetIn(ts) {
    if (typeof ts !== 'number' || !Number.isFinite(ts)) return '';
    let secs = Math.round(ts - Date.now() / 1000);
    if (secs <= 0) return 'now';
    const d = Math.floor(secs / 86400);
    const h = Math.floor((secs % 86400) / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (d) return `${d}d${h}h`;
    if (h) return `${h}h${m}m`;
    return `${m}m`;
}

let input = '';
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
    let data;
    try {
        data = JSON.parse(input);
    } catch {
        process.stdout.write('');
        return;
    }

    const dir = data.workspace?.current_dir || data.cwd || process.cwd();
    const projectDir = data.workspace?.project_dir || dir;
    const model = data.model?.display_name || 'unknown';
    const effort = data.effort?.level;
    const pct = Math.round(data.context_window?.used_percentage ?? 0);
    const fiveHourPct = data.rate_limits?.five_hour?.used_percentage;
    const fiveHourReset = resetIn(data.rate_limits?.five_hour?.resets_at);
    const weekPct = data.rate_limits?.seven_day?.used_percentage;
    const weekReset = resetIn(data.rate_limits?.seven_day?.resets_at);
    const added = data.cost?.total_lines_added || 0;
    const removed = data.cost?.total_lines_removed || 0;

    // repo name
    const repoName = data.workspace?.repo?.name || path.basename(projectDir || dir);

    // git branch (skip optional locks, quiet failure)
    let branch = '';
    try {
        branch = execSync('git --no-optional-locks rev-parse --abbrev-ref HEAD', {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd: dir,
        }).trim();
        if (branch === 'HEAD') branch = '';
    } catch {}

    // ---- segments ----
    const repoSeg = `📂 ${BOLD}${YELLOW}${repoName}${RESET}`;

    // parentheses are dropped in narrow mode to save 2 columns; the branch name
    // itself is never shortened/truncated.
    const branchSeg = branch
        ? `${BOLD}${CYAN}🌿 ${NARROW ? branch : `(${branch})`}${RESET}`
        : '';

    const diffSeg =
        added || removed ? `${GREEN}+${added}${RESET} ${RED}-${removed}${RESET}` : '';

    let modelSeg = `${MAGENTA}🌀 ${model}${RESET}`;
    if (effort) {
        modelSeg += ` ${GRAY_DIM}${effort.toUpperCase()}${RESET}`;
    }

    const ctxSeg = `🧠 ${usageLevel(pct).color}${pct}%${RESET}`;

    let fiveSeg = '';
    if (typeof fiveHourPct === 'number' && !Number.isNaN(fiveHourPct)) {
        const h = Math.round(fiveHourPct);
        const r = fiveHourReset ? ` ${GRAY_DIM}(${fiveHourReset})${RESET}` : '';
        fiveSeg = `⏳ ${bar(h, BAR_W)} ${usageLevel(h).color}${h}%${RESET}${r}`;
    }

    let weekSeg = '';
    if (typeof weekPct === 'number' && !Number.isNaN(weekPct)) {
        const w = Math.round(weekPct);
        const r = weekReset ? ` ${GRAY_DIM}(${weekReset})${RESET}` : '';
        weekSeg = `📅 ${bar(w, BAR_W)} ${usageLevel(w).color}${w}%${RESET}${r}`;
    }

    // drops empty segments so a missing branch / clean tree leaves no stray gap
    const row = (...segs) => segs.filter(Boolean).join(' ');

    if (NARROW) {
        // Four short rows instead of one wide one. Grouping is by kind: where
        // you are, which branch, what is running, how much is left. Nothing is
        // ever ellipsized — a row that would not fit becomes its own line
        // rather than getting cut.
        const rows = [
            row(repoSeg, diffSeg),
            branchSeg,
            row(modelSeg, ctxSeg),
            row(fiveSeg, weekSeg),
        ].filter(Boolean);
        process.stdout.write(rows.join('\n'));
    } else {
        // wide desktop layout: two compact rows, blank line between them
        // (terminals have no line-height control)
        process.stdout.write(
            `${row(repoSeg, branchSeg, diffSeg)}\n\n${row(modelSeg, ctxSeg, fiveSeg, weekSeg)}`
        );
    }
});
