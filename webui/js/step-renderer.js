/**
 * step-renderer.js  —  Agent Zero XC
 * Rich, per-tool-type card UI for every agentic step.
 *
 * Covers all step types:
 *   GEN  → shimmer + thinking-dots while streaming, thought-bubble on expand
 *   END  → completion summary card
 *   USE/MCP → structured tool-call card with icon, KV grid, status chip
 *   EXE  → macOS-style terminal card (dots, path, cmd, exit, copy, line count)
 *   SKL  → skill-load card with icon, name, target badge, pulse glow
 *   WWW/WEB → web card with icon, URL, HTTP status chip
 *   SUB/RES → sub-agent delegation card
 *   WRN  → amber callout (always visible)
 *   ERR  → red callout with collapsible stack trace
 *   INF/HDL → subtle info card
 *
 * Special USE subtypes (detected from tool_name / title text):
 *   todo_manager    → checklist with progress bar
 *   text_editor read  → file breadcrumb + language badge + preview
 *   text_editor write → diff-style card
 *   search_engine   → query card
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function countLines(text) {
  if (!text) return 0;
  return (String(text).match(/\n/g) || []).length + 1;
}

function domainFrom(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return String(url).slice(0, 40); }
}

function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  }).catch(() => {});
}

/** Collect KV pairs from a step element → { key: value, … } */
function collectKvps(step) {
  const map = {};
  step.querySelectorAll('.step-kvp').forEach(kvp => {
    const k = kvp.querySelector('.step-kvp-key')?.textContent?.trim()?.toLowerCase();
    const v = kvp.querySelector('.step-kvp-value')?.textContent?.trim();
    if (k && v !== undefined) map[k] = v;
  });
  return map;
}

/** Get badge type string (GEN, EXE, …) from a step element */
function badgeType(step) {
  const badge = step.querySelector('.step-badge');
  if (!badge) return '';
  const m = badge.className.match(/\b(GEN|END|USE|MCP|SUB|RES|EXE|WWW|WEB|HDL|INF|HNT|SKL|WRN|ERR|UTL)\b/);
  return m ? m[1] : '';
}

/** Return the detail scroll container, creating it if absent */
function getScroll(step) {
  const detail = step.querySelector('.process-step-detail');
  if (!detail) return null;
  return detail.querySelector('.process-step-detail-scroll') || detail;
}

// ---------------------------------------------------------------------------
// Tool icon map
// ---------------------------------------------------------------------------

const TOOL_ICONS = {
  todo_manager:    '📋',
  text_editor:     '📝',
  search_engine:   '🔍',
  code_execution:  '⚡',
  browser:         '🌐',
  response:        '💬',
  planner:         '🗂️',
  memory:          '🧠',
  knowledge:       '📚',
  file:            '📄',
  http:            '🌐',
  default:         '🔧',
};

function toolIcon(name) {
  const lower = (name || '').toLowerCase();
  for (const [k, v] of Object.entries(TOOL_ICONS)) {
    if (lower.includes(k)) return v;
  }
  return TOOL_ICONS.default;
}

// Language badge from file extension
const EXT_LANG = {
  py: 'Python', js: 'JS', ts: 'TS', html: 'HTML', css: 'CSS',
  json: 'JSON', md: 'Markdown', sh: 'Shell', bash: 'Shell',
  txt: 'Text', yaml: 'YAML', yml: 'YAML', toml: 'TOML', xml: 'XML',
  rs: 'Rust', go: 'Go', rb: 'Ruby', php: 'PHP', java: 'Java', cpp: 'C++', c: 'C',
};
function langFromPath(p) {
  const ext = (p || '').split('.').pop().toLowerCase();
  return EXT_LANG[ext] || '';
}

// ---------------------------------------------------------------------------
// GEN — AI Thinking
// ---------------------------------------------------------------------------

function upgradeGenStep(step) {
  if (step.dataset.genUpgraded) return;
  step.dataset.genUpgraded = '1';

  const titleEl = step.querySelector('.step-title');
  if (!titleEl) return;

  function attachDots() {
    if (step.dataset.dotAttached) return;
    if (!titleEl.classList.contains('shiny-text')) return;
    step.dataset.dotAttached = '1';

    const dots = document.createElement('span');
    dots.className = 'step-thinking-dots';
    dots.innerHTML = '<span></span><span></span><span></span>';
    titleEl.after(dots);

    const obs = new MutationObserver(() => {
      if (!titleEl.classList.contains('shiny-text')) {
        dots.remove();
        delete step.dataset.dotAttached;
        obs.disconnect();

        // Build thought card on completion if there's detail text
        const scroll = getScroll(step);
        if (scroll && !scroll.querySelector('.step-thought-card')) {
          const raw = scroll.textContent.trim();
          if (raw.length > 4) {
            const card = document.createElement('div');
            card.className = 'step-thought-card';
            card.textContent = raw.length > 300 ? raw.slice(0, 300) + '…' : raw;
            scroll.insertBefore(card, scroll.firstChild);
          }
        }
      }
    });
    obs.observe(titleEl, { attributes: true, attributeFilter: ['class'] });
  }

  attachDots();

  // Also watch in case shiny-text is added later
  const titleObs = new MutationObserver(attachDots);
  titleObs.observe(titleEl, { attributes: true, attributeFilter: ['class'] });
}

// ---------------------------------------------------------------------------
// END — Completion card
// ---------------------------------------------------------------------------

function upgradeEndStep(step) {
  if (step.dataset.endUpgraded) return;
  step.dataset.endUpgraded = '1';

  step.classList.add('step-type-end');

  const scroll = getScroll(step);
  if (!scroll) return;

  const kvps = collectKvps(step);
  const durationEl = step.querySelector('.step-timing');
  const duration = durationEl?.textContent?.trim() || kvps['duration'] || '';
  const tokens   = kvps['tokens'] || kvps['token'] || '';
  const status   = kvps['status'] || 'Completed';

  if (!scroll.querySelector('.step-end-card')) {
    const card = document.createElement('div');
    card.className = 'step-end-card';
    card.innerHTML = `
      <span class="step-end-icon" aria-hidden="true">✅</span>
      <span class="step-end-status">${escHtml(status)}</span>
      ${duration ? `<span class="step-end-chip"><span class="material-symbols-outlined">timer</span>${escHtml(duration)}</span>` : ''}
      ${tokens   ? `<span class="step-end-chip"><span class="material-symbols-outlined">token</span>${escHtml(tokens)}</span>` : ''}
    `;
    scroll.insertBefore(card, scroll.firstChild);
  }
}

// ---------------------------------------------------------------------------
// USE / MCP — Generic tool call card
// ---------------------------------------------------------------------------

function upgradeUseStep(step) {
  if (step.dataset.useUpgraded) return;
  step.dataset.useUpgraded = '1';

  // Detect the actual tool from title or kvp
  const titleEl   = step.querySelector('.step-title');
  const titleText = titleEl?.textContent?.trim() || '';
  const kvps      = collectKvps(step);

  // Tool name: look for "Using tool 'xxx'" or kvp
  const toolMatch = titleText.match(/[Uu]sing tool '([^']+)'/) ||
                    titleText.match(/[Uu]sing tool "([^"]+)"/); 
  const toolName  = toolMatch ? toolMatch[1] : (kvps['tool'] || kvps['name'] || '');
  const action    = kvps['action'] || '';

  // Route to a specialised renderer
  const lower = toolName.toLowerCase();
  if (lower.includes('todo'))        return upgradeTodoStep(step, toolName, action, kvps);
  if (lower.includes('text_editor') || lower.includes('editor')) 
                                     return upgradeEditorStep(step, toolName, action, kvps);
  if (lower.includes('search'))      return upgradeSearchStep(step, toolName, kvps);

  // Generic tool call card
  const scroll = getScroll(step);
  if (!scroll || scroll.querySelector('.step-tool-card')) return;

  const icon     = toolIcon(toolName);
  const isRunning = titleEl?.classList.contains('shiny-text');
  const statusCls = isRunning ? 'tool-status-running' : 'tool-status-done';
  const statusTxt = isRunning ? '▶ Running' : '✓ Done';

  const card = document.createElement('div');
  card.className = 'step-tool-card';
  card.innerHTML = `
    <div class="step-tool-header">
      <span class="step-tool-icon" aria-hidden="true">${icon}</span>
      <span class="step-tool-name">${escHtml(toolName || 'tool')}</span>
      ${action ? `<span class="step-tool-action">${escHtml(action)}</span>` : ''}
      <span class="step-tool-status ${statusCls}">${statusTxt}</span>
    </div>
  `;

  // Build argument rows from existing KV pairs (reuse DOM, don't duplicate)
  const kvpRows = step.querySelectorAll('.step-kvp');
  if (kvpRows.length) {
    const grid = document.createElement('div');
    grid.className = 'step-tool-kvgrid';
    kvpRows.forEach(kvp => {
      const k = kvp.querySelector('.step-kvp-key')?.textContent?.trim() || '';
      const v = kvp.querySelector('.step-kvp-value')?.textContent?.trim() || '';
      if (!k) return;
      const row = document.createElement('div');
      row.className = 'step-tool-kvrow';
      row.innerHTML = `<span class="step-tool-kvkey">${escHtml(k)}</span><span class="step-tool-kvval">${escHtml(v.length > 200 ? v.slice(0, 200) + '…' : v)}</span>`;
      grid.appendChild(row);
    });
    card.appendChild(grid);
  }

  scroll.insertBefore(card, scroll.firstChild);

  // Update status chip when streaming ends
  if (isRunning && titleEl) {
    const obs = new MutationObserver(() => {
      if (!titleEl.classList.contains('shiny-text')) {
        const chip = card.querySelector('.step-tool-status');
        if (chip) { chip.className = 'step-tool-status tool-status-done'; chip.textContent = '✓ Done'; }
        obs.disconnect();
      }
    });
    obs.observe(titleEl, { attributes: true, attributeFilter: ['class'] });
  }
}

// ---------------------------------------------------------------------------
// TODO manager
// ---------------------------------------------------------------------------

function upgradeTodoStep(step, toolName, action, kvps) {
  const scroll = getScroll(step);
  if (!scroll || scroll.querySelector('.step-todo-card')) return;

  const actionUpper = (action || kvps['action'] || '').toUpperCase();
  const taskId      = kvps['task id'] || kvps['task_id'] || kvps['id'] || '';

  const actionBadgeMap = {
    COMPLETE:  { cls: 'todo-complete', label: '✓ Complete' },
    ADD:       { cls: 'todo-add',      label: '+ Add'      },
    REMOVE:    { cls: 'todo-remove',   label: '✗ Remove'   },
    UPDATE:    { cls: 'todo-update',   label: '↻ Update'   },
  };
  const ab = actionBadgeMap[actionUpper] || { cls: 'todo-default', label: actionUpper || 'Action' };

  // Grab upcoming tasks from the raw text
  const rawText = scroll.textContent;
  const upcomingMatch = rawText.match(/upcoming:\s*(.+)$/m);
  const completedMatch = rawText.match(/(\d+)\s+remaining/);
  const remaining = completedMatch ? parseInt(completedMatch[1], 10) : null;

  // Parse upcoming tasks: "[3] desc | [4] desc | …"
  let tasksHtml = '';
  if (upcomingMatch) {
    const tasks = upcomingMatch[1].split('|').map(t => t.trim()).filter(Boolean);
    tasksHtml = tasks.slice(0, 5).map(t => {
      const tm = t.match(/\[(\d+)\]\s*(.*)/);
      const id  = tm ? tm[1] : '';
      const txt = tm ? tm[2].trim() : t;
      return `<div class="todo-task-row"><span class="todo-task-id">#${escHtml(id)}</span><span class="todo-task-text">${escHtml(txt.length > 80 ? txt.slice(0,80)+'…' : txt)}</span></div>`;
    }).join('');
  }

  const card = document.createElement('div');
  card.className = 'step-todo-card';
  card.innerHTML = `
    <div class="step-todo-header">
      <span class="step-todo-icon" aria-hidden="true">📋</span>
      <span class="step-todo-tool">todo_manager</span>
      <span class="step-todo-action ${ab.cls}">${ab.label}</span>
      ${taskId ? `<span class="step-todo-taskid">Task #${escHtml(taskId)}</span>` : ''}
      ${remaining !== null ? `<span class="step-todo-remaining">${remaining} remaining</span>` : ''}
    </div>
    ${remaining !== null ? `
    <div class="step-todo-progress">
      <div class="step-todo-progress-bar" style="width: ${Math.max(5, 100 - remaining * 10)}%"></div>
    </div>` : ''}
    ${tasksHtml ? `<div class="step-todo-tasks">${tasksHtml}</div>` : ''}
  `;

  scroll.insertBefore(card, scroll.firstChild);
}

// ---------------------------------------------------------------------------
// Text editor
// ---------------------------------------------------------------------------

function upgradeEditorStep(step, toolName, action, kvps) {
  const scroll = getScroll(step);
  if (!scroll || scroll.querySelector('.step-editor-card')) return;

  const op       = (action || kvps['action'] || kvps['command'] || 'read').toLowerCase();
  const filePath = kvps['path'] || kvps['file'] || kvps['filename'] || '';
  const lang     = langFromPath(filePath);
  const isWrite  = /write|save|create|update|replace/.test(op);
  const isRead   = /read|view|open|get/.test(op);

  // Build breadcrumb segments
  const parts = filePath.split('/').filter(Boolean);
  const breadcrumb = parts.map((p, i) =>
    i === parts.length - 1
      ? `<span class="editor-crumb editor-crumb-file">${escHtml(p)}</span>`
      : `<span class="editor-crumb">${escHtml(p)}</span><span class="editor-crumb-sep">/</span>`
  ).join('');

  // Extract content for preview
  const rawText  = scroll.textContent;
  let previewHtml = '';
  if (isWrite) {
    // Show diff-style if we can find +/- lines
    const lines = rawText.split('\n').slice(0, 10);
    const diffLines = lines.map(l => {
      if (l.startsWith('+')) return `<div class="diff-line diff-add">${escHtml(l)}</div>`;
      if (l.startsWith('-')) return `<div class="diff-line diff-del">${escHtml(l)}</div>`;
      return `<div class="diff-line diff-ctx">${escHtml(l)}</div>`;
    }).join('');
    previewHtml = `<div class="step-editor-diff">${diffLines}</div>`;
  } else if (isRead && rawText.length > 10) {
    const preview = rawText.trim().split('\n').slice(0, 5).join('\n');
    previewHtml = `<pre class="step-editor-preview">${escHtml(preview.length > 200 ? preview.slice(0,200)+'…' : preview)}</pre>`;
  }

  const opIcon = isWrite ? '✏️' : '📖';
  const opLabel = isWrite ? 'WRITE' : isRead ? 'READ' : op.toUpperCase();
  const opCls   = isWrite ? 'editor-op-write' : 'editor-op-read';

  const card = document.createElement('div');
  card.className = 'step-editor-card';
  card.innerHTML = `
    <div class="step-editor-header">
      <span class="step-editor-icon" aria-hidden="true">${opIcon}</span>
      <span class="step-editor-op ${opCls}">${opLabel}</span>
      <span class="step-editor-breadcrumb">${breadcrumb || escHtml(filePath || 'file')}</span>
      ${lang ? `<span class="step-editor-lang">${escHtml(lang)}</span>` : ''}
    </div>
    ${previewHtml}
  `;

  scroll.insertBefore(card, scroll.firstChild);
}

// ---------------------------------------------------------------------------
// Search engine
// ---------------------------------------------------------------------------

function upgradeSearchStep(step, toolName, kvps) {
  const scroll = getScroll(step);
  if (!scroll || scroll.querySelector('.step-search-card')) return;

  const query = kvps['query'] || kvps['q'] || kvps['search'] || '';
  const engine = kvps['engine'] || kvps['source'] || 'web';

  const card = document.createElement('div');
  card.className = 'step-search-card';
  card.innerHTML = `
    <div class="step-search-header">
      <span class="step-search-icon" aria-hidden="true">🔍</span>
      <span class="step-search-label">search_engine</span>
      ${engine ? `<span class="step-search-engine">${escHtml(engine)}</span>` : ''}
    </div>
    ${query ? `<div class="step-search-query">&ldquo;${escHtml(query)}&rdquo;</div>` : ''}
  `;

  scroll.insertBefore(card, scroll.firstChild);
}

// ---------------------------------------------------------------------------
// EXE — Terminal card
// ---------------------------------------------------------------------------

function upgradeTerminalStep(step) {
  if (step.dataset.terminalUpgraded) return;
  step.dataset.terminalUpgraded = '1';

  const detail = step.querySelector('.process-step-detail');
  if (!detail) return;

  const legacyOutput = detail.querySelector('.terminal-output');
  const rawPre       = !legacyOutput && detail.querySelector('pre');
  const outputEl     = legacyOutput || rawPre;
  const outputText   = outputEl ? outputEl.textContent : '';

  const titleEl  = step.querySelector('.step-title');
  const titleTxt = titleEl ? titleEl.textContent.trim() : '';

  let cwd = '';
  step.querySelectorAll('.step-kvp').forEach(kvp => {
    const k = kvp.querySelector('.step-kvp-key')?.textContent || '';
    const v = kvp.querySelector('.step-kvp-value')?.textContent || '';
    if (/path|cwd|dir/i.test(k)) cwd = v.trim();
  });

  const lines      = countLines(outputText);
  const exitMatch  = outputText.match(/exit(?:\s+code)?[:\s]+?(\d+)/i);
  const exitCode   = exitMatch ? parseInt(exitMatch[1], 10) : null;
  const exitOk     = exitCode === null || exitCode === 0;

  const card = document.createElement('div');
  card.className = 'terminal-card';
  card.innerHTML = `
    <div class="terminal-titlebar">
      <div class="terminal-dots">
        <span class="dot-red"></span>
        <span class="dot-yellow"></span>
        <span class="dot-green"></span>
      </div>
      <span class="terminal-path">${escHtml(cwd || 'terminal')}</span>
      ${exitCode !== null
        ? `<span class="terminal-exit ${exitOk ? 'exit-ok' : 'exit-err'}">${exitOk ? '✓' : '✗'} ${exitCode}</span>`
        : '<span class="terminal-exit exit-ok">✓ 0</span>'}
      <button class="terminal-copy-btn" type="button">Copy</button>
    </div>
    ${titleTxt ? `<div class="terminal-cmd">${escHtml(titleTxt)}</div>` : ''}
    <div class="terminal-output-body">${escHtml(outputText || '(no output)')}</div>
    <div class="terminal-line-count">${lines.toLocaleString()} line${lines !== 1 ? 's' : ''}</div>
  `;

  card.querySelector('.terminal-copy-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    copyToClipboard(outputText, e.currentTarget);
  });

  const scroll = detail.querySelector('.process-step-detail-scroll') || detail;
  if (outputEl) outputEl.replaceWith(card);
  else scroll.appendChild(card);
}

// ---------------------------------------------------------------------------
// SKL — Skill load card
// ---------------------------------------------------------------------------

function upgradeSkillStep(step) {
  if (step.dataset.skillUpgraded) return;
  step.dataset.skillUpgraded = '1';

  const detail = step.querySelector('.process-step-detail');
  if (!detail) return;

  const scroll = detail.querySelector('.process-step-detail-scroll') || detail;
  if (scroll.querySelector('.step-skill-card')) return;

  const text = scroll.textContent.trim();
  const m    = text.match(/[Ll]oaded skill ['"\`]?([\w\-\.]+)['"\`]?(?:\s+into\s+([\w]+))?/);
  const skillName = m ? m[1] : text.slice(0, 50);
  const target    = (m && m[2]) ? m[2] : 'EXTRAS';

  // Derive emoji from skill name
  const lower = skillName.toLowerCase();
  const icon  = lower.includes('fuzz') ? '🎯'
    : lower.includes('recon')          ? '🔭'
    : lower.includes('scan')           ? '📡'
    : lower.includes('web')            ? '🌐'
    : lower.includes('code')           ? '💻'
    : lower.includes('math')           ? '🔢'
    : lower.includes('plan')           ? '🗂️'
    : '🧩';

  const card = document.createElement('div');
  card.className = 'step-skill-card';
  card.innerHTML = `
    <span class="step-skill-icon" aria-hidden="true">${icon}</span>
    <div class="step-skill-info">
      <span class="step-skill-name">${escHtml(skillName)}</span>
      <span class="step-skill-loaded">Loaded into</span>
      <span class="step-skill-target">${escHtml(target)}</span>
    </div>
  `;

  scroll.insertBefore(card, scroll.firstChild);
}

// ---------------------------------------------------------------------------
// WWW / WEB — Web card
// ---------------------------------------------------------------------------

function upgradeWebStep(step) {
  if (step.dataset.webUpgraded) return;
  step.dataset.webUpgraded = '1';

  const detail = step.querySelector('.process-step-detail');
  if (!detail) return;

  const scroll = detail.querySelector('.process-step-detail-scroll') || detail;
  if (scroll.querySelector('.step-web-card')) return;

  let url = '';
  let statusCode = null;

  step.querySelectorAll('.step-kvp').forEach(kvp => {
    const k = kvp.querySelector('.step-kvp-key')?.textContent || '';
    const v = kvp.querySelector('.step-kvp-value')?.textContent?.trim() || '';
    if (/url|link|href|uri/i.test(k)) url = v;
    if (/status|code/i.test(k))       statusCode = parseInt(v, 10) || null;
  });

  if (!url) {
    const m = scroll.textContent.match(/https?:\/\/[^\s"'>]+/);
    if (m) url = m[0];
  }
  if (!url) return;

  let statusClass = ''; let statusLabel = '';
  if (statusCode) {
    if (statusCode < 300)      { statusClass = 'status-ok';    statusLabel = statusCode + ' OK'; }
    else if (statusCode < 400) { statusClass = 'status-redir'; statusLabel = statusCode + ' Redirect'; }
    else                       { statusClass = 'status-err';   statusLabel = statusCode + ' Error'; }
  }

  const domain = domainFrom(url);
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=16`;

  const card = document.createElement('div');
  card.className = 'step-web-card';
  card.innerHTML = `
    <div class="step-web-header">
      <img class="step-web-favicon" src="${escHtml(faviconUrl)}" alt="" width="14" height="14" onerror="this.style.display='none'">
      <span class="step-web-domain">${escHtml(domain)}</span>
      ${statusLabel ? `<span class="step-web-status ${statusClass}">${escHtml(statusLabel)}</span>` : ''}
    </div>
    <a class="step-web-url" href="${escHtml(url)}" target="_blank" rel="noopener noreferrer">${escHtml(url.length > 90 ? url.slice(0,90)+'…' : url)}</a>
  `;

  scroll.insertBefore(card, scroll.firstChild);
}

// ---------------------------------------------------------------------------
// SUB / RES — Sub-agent delegation
// ---------------------------------------------------------------------------

function upgradeSubStep(step) {
  if (step.dataset.subUpgraded) return;
  step.dataset.subUpgraded = '1';

  const scroll = getScroll(step);
  if (!scroll || scroll.querySelector('.step-sub-card')) return;

  const kvps      = collectKvps(step);
  const agentName = kvps['agent'] || kvps['name'] || kvps['context'] || 'Sub-agent';
  const task      = kvps['task'] || kvps['instruction'] || kvps['message'] || '';
  const type      = badgeType(step);
  const isReturn  = type === 'RES';

  const card = document.createElement('div');
  card.className = 'step-sub-card';
  card.innerHTML = `
    <div class="step-sub-header">
      <span class="step-sub-icon" aria-hidden="true">${isReturn ? '↩️' : '🤖'}</span>
      <span class="step-sub-label">${isReturn ? 'Response from' : 'Delegating to'}</span>
      <span class="step-sub-name">${escHtml(agentName)}</span>
    </div>
    ${task ? `<div class="step-sub-task">${escHtml(task.length > 120 ? task.slice(0,120)+'…' : task)}</div>` : ''}
  `;

  scroll.insertBefore(card, scroll.firstChild);
}

// ---------------------------------------------------------------------------
// WRN / ERR — Callout cards
// ---------------------------------------------------------------------------

function upgradeWarnErrStep(step, type) {
  if (step.dataset.warnUpgraded) return;
  step.dataset.warnUpgraded = '1';

  const detail = step.querySelector('.process-step-detail');
  if (!detail) return;

  const scroll = detail.querySelector('.process-step-detail-scroll') || detail;
  const text   = scroll.textContent.trim();
  if (!text) return;

  const isErr = type === 'error';
  const cls   = isErr ? 'step-error-callout' : 'step-warning-callout';
  const icon  = isErr ? '✕' : '⚠';

  // Check for stack trace
  const lines = text.split('\n');
  const hasStack = lines.some(l => /^\s+at\s/.test(l) || /Traceback|File "/.test(l));
  const mainText = hasStack ? lines[0] : text;
  const stackText = hasStack ? lines.slice(1).join('\n') : '';

  const callout = document.createElement('div');
  callout.className = cls;
  callout.innerHTML = `
    <span class="callout-icon" aria-hidden="true">${icon}</span>
    <div class="callout-body">
      <span class="callout-text"></span>
      ${hasStack ? `<details class="callout-stack"><summary>Stack trace</summary><pre class="callout-stack-pre"></pre></details>` : ''}
    </div>
  `;
  callout.querySelector('.callout-text').textContent = mainText;
  if (hasStack) callout.querySelector('.callout-stack-pre').textContent = stackText;

  const existing = Array.from(scroll.childNodes);
  existing.forEach(n => n.remove());
  scroll.appendChild(callout);

  // Errors are always expanded
  if (isErr) step.classList.add('expanded');
}

// ---------------------------------------------------------------------------
// INF / HDL — Info card
// ---------------------------------------------------------------------------

function upgradeInfoStep(step) {
  if (step.dataset.infoUpgraded) return;
  step.dataset.infoUpgraded = '1';

  const scroll = getScroll(step);
  if (!scroll || scroll.querySelector('.step-info-card')) return;

  const text = scroll.textContent.trim();
  if (!text) return;

  const card = document.createElement('div');
  card.className = 'step-info-card';
  card.innerHTML = `<span class="step-info-icon" aria-hidden="true">ℹ️</span><span class="step-info-text"></span>`;
  card.querySelector('.step-info-text').textContent = text.length > 200 ? text.slice(0,200)+'…' : text;

  scroll.insertBefore(card, scroll.firstChild);
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function upgradeStep(step) {
  // Attach data-type attribute for CSS accent rails
  const type = badgeType(step);
  if (type && !step.dataset.type) {
    const typeMap = {
      GEN: 'agent', END: 'response', USE: 'tool', MCP: 'mcp',
      EXE: 'code_exe', WWW: 'browser', WEB: 'browser',
      SUB: 'subagent', RES: 'delegation',
      SKL: 'skill', HNT: 'skill', UTL: 'util',
      INF: 'info', HDL: 'info',
      WRN: 'warning', ERR: 'error',
    };
    step.dataset.type = typeMap[type] || 'info';
  }

  switch (type) {
    case 'GEN':                     upgradeGenStep(step);                  break;
    case 'END':                     upgradeEndStep(step);                  break;
    case 'USE': case 'MCP':         upgradeUseStep(step);                  break;
    case 'EXE':                     upgradeTerminalStep(step);             break;
    case 'SKL': case 'HNT':         upgradeSkillStep(step);                break;
    case 'WWW': case 'WEB':         upgradeWebStep(step);                  break;
    case 'SUB': case 'RES':         upgradeSubStep(step);                  break;
    case 'WRN':                     upgradeWarnErrStep(step, 'warning');   break;
    case 'ERR':                     upgradeWarnErrStep(step, 'error');     break;
    case 'INF': case 'HDL':         upgradeInfoStep(step);                 break;
    default: break;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function upgradeAllSteps() {
  document.querySelectorAll('.process-step').forEach(upgradeStep);
}

const _observer = new MutationObserver((mutations) => {
  for (const mut of mutations) {
    for (const node of mut.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.classList.contains('process-step')) upgradeStep(node);
      else node.querySelectorAll?.('.process-step').forEach(upgradeStep);
    }
  }
});

export function startStepObserver() {
  const el = document.getElementById('chat-history');
  if (el) _observer.observe(el, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { upgradeAllSteps(); startStepObserver(); });
} else {
  upgradeAllSteps();
  startStepObserver();
}
