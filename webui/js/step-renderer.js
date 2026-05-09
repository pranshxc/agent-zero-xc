/**
 * step-renderer.js — Agent Zero XC
 * VSCode Copilot-style agent step renderer.
 * – Icon + title + colored status pill per step
 * – Auto-expand while running, auto-collapse on done
 * – Per-tool custom card body in expanded panel
 * – Accent color per tool type
 */

/* -----------------------------------------------------------------------
   Tool type config: [icon_name, accent_css_var, display_label, icon_bg_opacity]
----------------------------------------------------------------------- */
const TOOL_CONFIG = {
  GEN:  { icon: 'psychology',       accent: '--ac-think',  label: 'Thinking',     bg: 0.08 },
  END:  { icon: 'check_circle',     accent: '--ac-done',   label: 'Done',         bg: 0.08 },
  USE:  { icon: 'build',            accent: '--ac-tool',   label: 'Tool',         bg: 0.07 },
  MCP:  { icon: 'extension',        accent: '--ac-tool',   label: 'MCP Tool',     bg: 0.07 },
  EXE:  { icon: 'terminal',         accent: '--ac-code',   label: 'Run Code',     bg: 0.08 },
  WWW:  { icon: 'language',         accent: '--ac-search', label: 'Web',          bg: 0.07 },
  WEB:  { icon: 'language',         accent: '--ac-search', label: 'Web',          bg: 0.07 },
  SKL:  { icon: 'auto_awesome',     accent: '--ac-skill',  label: 'Skill',        bg: 0.08 },
  HNT:  { icon: 'lightbulb',        accent: '--ac-skill',  label: 'Hint',         bg: 0.07 },
  SUB:  { icon: 'account_tree',     accent: '--ac-agent',  label: 'Sub-Agent',    bg: 0.08 },
  RES:  { icon: 'reply',            accent: '--ac-agent',  label: 'Response',     bg: 0.08 },
  WRN:  { icon: 'warning',          accent: '--ac-warn',   label: 'Warning',      bg: 0.07 },
  ERR:  { icon: 'error',            accent: '--ac-err',    label: 'Error',        bg: 0.07 },
  INF:  { icon: 'info',             accent: '--ac-info',   label: 'Info',         bg: 0.05 },
  HDL:  { icon: 'info',             accent: '--ac-info',   label: 'Info',         bg: 0.05 },
  UTL:  { icon: 'settings',         accent: '--ac-info',   label: 'Util',         bg: 0.05 },
};

const TOOL_NAMES = {
  todo_manager: { label: 'Task Manager', icon: 'checklist', accent: '--ac-done',   type: 'todo'   },
  text_editor:  { label: 'Code Editor',  icon: 'edit',      accent: '--ac-file',   type: 'editor' },
  code_exec:    { label: 'Run Code',     icon: 'terminal',  accent: '--ac-code',   type: 'exe'    },
  search_engine:{ label: 'Web Search',   icon: 'search',    accent: '--ac-search', type: 'search' },
  web_search:   { label: 'Web Search',   icon: 'search',    accent: '--ac-search', type: 'search' },
  browser:      { label: 'Browser',      icon: 'open_in_browser', accent: '--ac-search', type: 'web' },
  memory_tool:  { label: 'Memory',       icon: 'memory',    accent: '--ac-skill',  type: 'generic'},
  memory_load:  { label: 'Load Memory',  icon: 'memory',    accent: '--ac-skill',  type: 'generic'},
  memory_save:  { label: 'Save Memory',  icon: 'memory',    accent: '--ac-skill',  type: 'generic'},
  http_request: { label: 'HTTP Request', icon: 'http',      accent: '--ac-search', type: 'web'    },
};

const EXT_LANG = {
  py:'Python',js:'JS',ts:'TypeScript',tsx:'TSX',jsx:'JSX',
  html:'HTML',css:'CSS',json:'JSON',md:'Markdown',
  sh:'Shell',bash:'Shell',yml:'YAML',yaml:'YAML',
  toml:'TOML',rs:'Rust',go:'Go',rb:'Ruby',
  php:'PHP',java:'Java',cpp:'C++',c:'C',sql:'SQL',
};
function langFromPath(p) {
  return EXT_LANG[(p||'').split('.').pop().toLowerCase()] || '';
}

/* ----------------------------------------------------------------------- */

function esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function collectKvps(step) {
  const m = {};
  step.querySelectorAll('.step-kvp').forEach(kvp => {
    const k = kvp.querySelector('.step-kvp-key')?.textContent?.trim()?.toLowerCase();
    const v = kvp.querySelector('.step-kvp-value')?.textContent?.trim();
    if (k != null && v != null) m[k] = v;
  });
  return m;
}
function badgeType(step) {
  const b = step.querySelector('.step-badge');
  if (!b) return '';
  const m = b.className.match(/\b(GEN|END|USE|MCP|SUB|RES|EXE|WWW|WEB|HDL|INF|HNT|SKL|WRN|ERR|UTL)\b/);
  return m ? m[1] : '';
}
function getDetail(step) { return step.querySelector('.process-step-detail'); }
function getScroll(step) {
  const d = getDetail(step);
  return d ? (d.querySelector('.process-step-detail-scroll') || d) : null;
}
function getHeader(step) { return step.querySelector('.process-step-header'); }

/* -----------------------------------------------------------------------
   BUILD STEP HEADER
   Replaces the boring step-header content with:
   [accent-bar] [icon] [title] [status-pill] [timing] [chevron]
----------------------------------------------------------------------- */
function buildStepHeader(step, type, titleOverride, subtitle) {
  if (step.dataset.headerBuilt) return;
  step.dataset.headerBuilt = '1';

  const cfg    = TOOL_CONFIG[type] || TOOL_CONFIG.INF;
  const header = getHeader(step);
  if (!header) return;

  // Set CSS accent variable on the step
  const accentVal = getComputedStyle(document.documentElement).getPropertyValue(cfg.accent) ||
                    getComputedStyle(step).getPropertyValue(cfg.accent);
  step.style.setProperty('--step-type-accent', `var(${cfg.accent})`);

  // Get or create icon wrap
  let iconWrap = header.querySelector('.step-icon-wrap');
  if (!iconWrap) {
    iconWrap = document.createElement('span');
    iconWrap.className = 'step-icon-wrap';
    // insert after expand-icon
    const expIcon = header.querySelector('.step-expand-icon');
    if (expIcon) expIcon.after(iconWrap);
    else header.prepend(iconWrap);
  }
  iconWrap.innerHTML = `<span class="material-symbols-outlined">${cfg.icon}</span>`;
  iconWrap.style.color = `var(${cfg.accent})`;

  // Update title
  const titleEl = header.querySelector('.step-title');
  if (titleEl && titleOverride) {
    const wasShiny = titleEl.classList.contains('shiny-text');
    titleEl.textContent = titleOverride;
    if (wasShiny) titleEl.classList.add('shiny-text');
  }

  // Add subtitle pill if provided
  if (subtitle) {
    const existing = header.querySelector('.step-subtitle-pill');
    if (!existing) {
      const sp = document.createElement('span');
      sp.className = 'step-subtitle-pill';
      sp.style.cssText = `font-size:10.5px;color:var(${cfg.accent});opacity:0.65;font-family:var(--az-mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;flex-shrink:1;`;
      sp.textContent = subtitle.length > 40 ? subtitle.slice(0,40)+'…' : subtitle;
      if (titleEl) titleEl.after(sp);
    }
  }

  // Inject status pill
  buildStatusPill(step, header);
}

function buildStatusPill(step, header) {
  if (header.querySelector('.step-status-pill')) return;
  const titleEl = header.querySelector('.step-title');
  const isRunning = titleEl?.classList.contains('shiny-text');
  const pill = document.createElement('span');
  pill.className = `step-status-pill ${isRunning ? 'status-running' : 'status-done'}`;
  pill.textContent = isRunning ? 'running' : 'done';
  header.appendChild(pill);

  if (isRunning && titleEl) {
    const obs = new MutationObserver(() => {
      if (!titleEl.classList.contains('shiny-text')) {
        pill.className = 'step-status-pill status-done';
        pill.textContent = 'done';
        // Auto-collapse when done (like VSCode Copilot)
        if (step.classList.contains('expanded')) {
          setTimeout(() => {
            if (step.classList.contains('expanded')) {
              step.classList.remove('expanded');
            }
          }, 1200);
        }
        obs.disconnect();
      }
    });
    obs.observe(titleEl, { attributes: true, attributeFilter: ['class'] });

    // Auto-expand while running
    if (!step.classList.contains('expanded')) {
      step.classList.add('expanded');
    }
  }
}

/* -----------------------------------------------------------------------
   GEN — Thinking
----------------------------------------------------------------------- */
function upgradeGenStep(step) {
  if (step.dataset.done) return;
  step.dataset.done = '1';
  buildStepHeader(step, 'GEN', null, null);

  const header = getHeader(step);
  const titleEl = header?.querySelector('.step-title');
  if (!titleEl) return;

  function attachDots() {
    if (step.dataset.dots || !titleEl.classList.contains('shiny-text')) return;
    step.dataset.dots = '1';
    const dots = document.createElement('span');
    dots.className = 'step-thinking-dots';
    dots.innerHTML = '<span></span><span></span><span></span>';
    // insert after title
    const pill = header.querySelector('.step-status-pill');
    if (pill) pill.before(dots); else titleEl.after(dots);
    const obs = new MutationObserver(() => {
      if (!titleEl.classList.contains('shiny-text')) {
        dots.remove(); delete step.dataset.dots; obs.disconnect();
      }
    });
    obs.observe(titleEl, { attributes: true, attributeFilter: ['class'] });
  }
  attachDots();
  const w = new MutationObserver(attachDots);
  w.observe(titleEl, { attributes: true, attributeFilter: ['class'] });
}

/* -----------------------------------------------------------------------
   END
----------------------------------------------------------------------- */
function upgradeEndStep(step) {
  if (step.dataset.done) return;
  step.dataset.done = '1';

  const kvps = collectKvps(step);
  const dur  = step.querySelector('.step-timing')?.textContent?.trim() || kvps['duration'] || '';
  const tok  = kvps['tokens'] || '';

  buildStepHeader(step, 'END', 'Task Complete', '');

  // Override pill to done
  const pill = getHeader(step)?.querySelector('.step-status-pill');
  if (pill) { pill.className = 'step-status-pill status-done'; pill.textContent = 'done'; }

  const scroll = getScroll(step);
  if (!scroll) return;
  const card = document.createElement('div');
  card.className = 'az-card-done';
  card.innerHTML = `
    <div class="az-done-icon">✓</div>
    <div class="az-done-chips">
      ${dur ? `<span class="az-done-chip">${esc(dur)}</span>` : ''}
      ${tok ? `<span class="az-done-chip">${esc(tok)} tokens</span>` : ''}
      <span class="az-done-chip">completed</span>
    </div>`;
  scroll.insertBefore(card, scroll.firstChild);
}

/* -----------------------------------------------------------------------
   USE / MCP — tool calls (dispatch to sub-renderers)
----------------------------------------------------------------------- */
function upgradeUseStep(step) {
  if (step.dataset.done) return;
  step.dataset.done = '1';

  const titleEl   = step.querySelector('.step-title');
  const titleTxt  = titleEl?.textContent?.trim() || '';
  const kvps      = collectKvps(step);
  const toolMatch = titleTxt.match(/[Uu]sing tool ['"](.*?)['"]/) ||
                    titleTxt.match(/[Tt]ool[:\s]+([\w_\-\.]+)/);
  const rawTool   = (toolMatch ? toolMatch[1] : (kvps['tool'] || kvps['name'] || '')).toLowerCase();
  const action    = kvps['action'] || kvps['command'] || '';

  if (rawTool.includes('todo'))          return upgradeTodoStep(step, rawTool, action, kvps);
  if (rawTool.includes('text_editor') || rawTool.includes('editor'))
                                         return upgradeEditorStep(step, rawTool, action, kvps);
  if (rawTool.includes('search') || rawTool.includes('web_search'))
                                         return upgradeSearchStep(step, rawTool, kvps);

  // Generic tool
  const cfg = TOOL_NAMES[rawTool] || { label: rawTool || 'Tool', icon: 'build', accent: '--ac-tool', type: 'generic' };
  buildStepHeader(step, 'USE', cfg.label, action || rawTool);
  step.style.setProperty('--step-type-accent', `var(${cfg.accent})`);

  const iconWrap = getHeader(step)?.querySelector('.step-icon-wrap');
  if (iconWrap) iconWrap.innerHTML = `<span class="material-symbols-outlined">${cfg.icon}</span>`;

  const scroll = getScroll(step);
  if (!scroll) return;

  const kvpRows = step.querySelectorAll('.step-kvp');
  if (!kvpRows.length) return;

  const card = document.createElement('div');
  card.className = 'az-card-tool';
  let rowsHtml = '';
  kvpRows.forEach(kvp => {
    const k = kvp.querySelector('.step-kvp-key')?.textContent?.trim() || '';
    const v = (kvp.querySelector('.step-kvp-value')?.textContent?.trim() || '').slice(0, 300);
    if (!k) return;
    rowsHtml += `<div style="display:contents"><span class="step-kvp-key">${esc(k)}</span><span class="step-kvp-value">${esc(v)}</span></div>`;
  });
  card.innerHTML = `
    <div class="az-tool-name-row">
      <span class="az-tool-raw-name">${esc(rawTool || 'tool')}</span>
      ${action ? `<span class="az-tool-action">${esc(action)}</span>` : ''}
    </div>
    <div class="step-kvps">${rowsHtml}</div>`;
  scroll.insertBefore(card, scroll.firstChild);
}

/* -----------------------------------------------------------------------
   TODO / TASK MANAGER
----------------------------------------------------------------------- */
function upgradeTodoStep(step, rawTool, action, kvps) {
  const taskId    = kvps['task id'] || kvps['task_id'] || kvps['id'] || '';
  const scroll    = getScroll(step);
  const rawText   = scroll?.textContent || '';
  const actionVerb = (action || kvps['action'] || 'update').toLowerCase();
  const remaining  = (rawText.match(/(\d+)\s+remaining/) || [])[1];

  buildStepHeader(step, 'END', 'Task Manager',
    `${actionVerb}${taskId ? ' #' + taskId : ''}`);
  step.style.setProperty('--step-type-accent', 'var(--ac-done)');
  const iconWrap = getHeader(step)?.querySelector('.step-icon-wrap');
  if (iconWrap) iconWrap.innerHTML = '<span class="material-symbols-outlined">checklist</span>';

  if (!scroll) return;

  const upcomingMatch = rawText.match(/upcoming:\s*(.+)$/m);
  let tasksHtml = '';
  if (upcomingMatch) {
    const tasks = upcomingMatch[1].split('|').map(t => t.trim()).filter(Boolean).slice(0,5);
    tasksHtml = tasks.map(t => {
      const tm = t.match(/\[(\d+)\]\s*(.*)/);
      const id  = tm ? '#' + tm[1] : '';
      const txt = tm ? tm[2].trim() : t;
      return `<li class="az-task-row"><span class="az-task-id">${esc(id)}</span><span class="az-task-text">${esc(txt.slice(0,80))}</span></li>`;
    }).join('');
  }

  const actMap = { complete:'act-complete', add:'act-add', remove:'act-remove', update:'act-update' };
  const actCls = actMap[actionVerb] || 'act-default';
  const pct    = remaining ? Math.max(5, Math.min(95, 100 - parseInt(remaining)*12)) : 50;

  const card = document.createElement('div');
  card.className = 'az-card-todo';
  card.innerHTML = `
    <div class="az-todo-header">
      <span class="az-todo-action ${actCls}">${actionVerb}</span>
      ${taskId ? `<span class="az-todo-taskid">#${esc(taskId)}</span>` : ''}
      ${remaining ? `<span class="az-todo-remaining">${remaining} left</span>` : ''}
    </div>
    ${remaining ? `<div class="az-progress"><div class="az-progress-fill" style="width:${pct}%"></div></div>` : ''}
    ${tasksHtml ? `<ul class="az-task-list">${tasksHtml}</ul>` : ''}`;
  scroll.insertBefore(card, scroll.firstChild);
}

/* -----------------------------------------------------------------------
   TEXT EDITOR
----------------------------------------------------------------------- */
function upgradeEditorStep(step, rawTool, action, kvps) {
  const op       = (action || kvps['action'] || kvps['command'] || 'read').toLowerCase();
  const filePath = kvps['path'] || kvps['file'] || kvps['filename'] || '';
  const lang     = langFromPath(filePath);
  const filename = filePath.split('/').pop() || filePath || 'file';
  const isWrite  = /write|save|create|update|replace/.test(op);
  const opLabel  = isWrite ? 'write' : 'read';

  buildStepHeader(step, 'USE', 'Code Editor', `${opLabel} ${filename}`);
  step.style.setProperty('--step-type-accent', 'var(--ac-file)');
  const iconWrap = getHeader(step)?.querySelector('.step-icon-wrap');
  if (iconWrap) iconWrap.innerHTML = '<span class="material-symbols-outlined">edit_document</span>';

  const scroll = getScroll(step);
  if (!scroll) return;

  const rawText = scroll.textContent;
  let diffHtml = '';
  if (isWrite && rawText.trim()) {
    const lines = rawText.trim().split('\n').slice(0, 12);
    diffHtml = lines.map(l =>
      l.startsWith('+') ? `<span class="az-diff-line az-diff-add">${esc(l)}</span>`
    : l.startsWith('-') ? `<span class="az-diff-line az-diff-del">${esc(l)}</span>`
    : `<span class="az-diff-line az-diff-ctx">${esc(l)}</span>`
    ).join('');
  }

  const card = document.createElement('div');
  card.className = 'az-card-editor';
  card.innerHTML = `
    <div class="az-file-row">
      <span class="az-file-icon"><span class="material-symbols-outlined">description</span></span>
      <span class="az-file-path">${esc(filePath || filename)}</span>
      <span class="az-op-badge op-${opLabel}">${opLabel}</span>
      ${lang ? `<span class="az-lang-badge">${esc(lang)}</span>` : ''}
    </div>
    ${diffHtml ? `<div class="az-diff-block">${diffHtml}</div>` : ''}`;
  scroll.insertBefore(card, scroll.firstChild);
}

/* -----------------------------------------------------------------------
   SEARCH
----------------------------------------------------------------------- */
function upgradeSearchStep(step, rawTool, kvps) {
  const query  = kvps['query'] || kvps['q'] || kvps['search'] || '';
  const engine = kvps['engine'] || kvps['source'] || 'web';

  buildStepHeader(step, 'USE', 'Web Search', query.slice(0, 45) || 'searching…');
  step.style.setProperty('--step-type-accent', 'var(--ac-search)');
  const iconWrap = getHeader(step)?.querySelector('.step-icon-wrap');
  if (iconWrap) iconWrap.innerHTML = '<span class="material-symbols-outlined">search</span>';

  const scroll = getScroll(step);
  if (!scroll) return;
  const card = document.createElement('div');
  card.className = 'az-card-search';
  card.innerHTML = `
    <div class="az-search-row">
      <span class="az-search-engine">${esc(engine)}</span>
    </div>
    ${query ? `<code class="az-search-query">${esc(query)}</code>` : ''}`;
  scroll.insertBefore(card, scroll.firstChild);
}

/* -----------------------------------------------------------------------
   EXE — Run Code
----------------------------------------------------------------------- */
function upgradeExeStep(step) {
  if (step.dataset.done) return;
  step.dataset.done = '1';

  const titleTxt = step.querySelector('.step-title')?.textContent?.trim() || '';
  let cwd = '';
  step.querySelectorAll('.step-kvp').forEach(kvp => {
    if (/path|cwd|dir/i.test(kvp.querySelector('.step-kvp-key')?.textContent || ''))
      cwd = kvp.querySelector('.step-kvp-value')?.textContent?.trim() || '';
  });

  buildStepHeader(step, 'EXE', 'Run Code', titleTxt.slice(0, 45) || cwd);

  const detail = getDetail(step);
  if (!detail) return;
  const outputEl  = detail.querySelector('.terminal-output') || detail.querySelector('pre');
  const outputTxt = outputEl ? outputEl.textContent : '';
  const lines     = (outputTxt.match(/\n/g) || []).length + 1;
  const exitMatch = outputTxt.match(/exit(?:\s+code)?[:\s]+(\d+)/i);
  const exitCode  = exitMatch ? parseInt(exitMatch[1]) : null;
  const exitOk    = exitCode === null || exitCode === 0;

  const card = document.createElement('div');
  card.className = 'terminal-card';
  card.innerHTML = `
    <div class="terminal-titlebar">
      <div class="terminal-dots"><span class="dot-red"></span><span class="dot-yellow"></span><span class="dot-green"></span></div>
      <span class="terminal-path">${esc(cwd || '~')}</span>
      <span class="terminal-exit ${exitOk ? 'exit-ok' : 'exit-err'}">${exitOk ? 'exit 0' : 'exit ' + exitCode}</span>
      <button class="terminal-copy-btn" type="button">copy</button>
    </div>
    ${titleTxt ? `<div class="terminal-cmd">${esc(titleTxt)}</div>` : ''}
    <div class="terminal-output-body">${esc(outputTxt)}</div>
    <div class="terminal-line-count">${lines} line${lines !== 1 ? 's' : ''}</div>`;

  card.querySelector('.terminal-copy-btn').addEventListener('click', e => {
    e.stopPropagation();
    navigator.clipboard.writeText(outputTxt).then(() => {
      const btn = e.currentTarget;
      btn.textContent = 'copied';
      setTimeout(() => (btn.textContent = 'copy'), 1400);
    }).catch(() => {});
  });

  const scroll = detail.querySelector('.process-step-detail-scroll') || detail;
  if (outputEl) outputEl.replaceWith(card);
  else scroll.appendChild(card);
}

/* -----------------------------------------------------------------------
   SKL — Skill Load
----------------------------------------------------------------------- */
function upgradeSkillStep(step) {
  if (step.dataset.done) return;
  step.dataset.done = '1';
  const scroll = getScroll(step);
  const text   = scroll?.textContent?.trim() || '';
  const m      = text.match(/[Ll]oaded skill ['"\`]?([\w\-\.]+)/);
  const name   = m ? m[1] : text.slice(0, 40);

  buildStepHeader(step, 'SKL', 'Load Skill', name);

  if (!scroll) return;
  const card = document.createElement('div');
  card.className = 'az-card-skill';
  card.innerHTML = `
    <div class="az-skill-icon"><span class="material-symbols-outlined">auto_awesome</span></div>
    <div class="az-skill-info">
      <div class="az-skill-name">${esc(name)}</div>
      <div class="az-skill-target">loaded into EXTRAS</div>
    </div>`;
  scroll.insertBefore(card, scroll.firstChild);
}

/* -----------------------------------------------------------------------
   WWW / WEB — Browser
----------------------------------------------------------------------- */
function upgradeWebStep(step) {
  if (step.dataset.done) return;
  step.dataset.done = '1';

  const scroll = getScroll(step);
  let url = '', statusCode = null;
  step.querySelectorAll('.step-kvp').forEach(kvp => {
    const k = kvp.querySelector('.step-kvp-key')?.textContent || '';
    const v = kvp.querySelector('.step-kvp-value')?.textContent?.trim() || '';
    if (/url|link|href|uri/i.test(k)) url = v;
    if (/status|code/i.test(k)) statusCode = parseInt(v) || null;
  });
  if (!url && scroll) {
    const m = scroll.textContent.match(/https?:\/\/[^\s"'>]+/);
    if (m) url = m[0];
  }
  let domain = '';
  try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch {}

  buildStepHeader(step, 'WWW', 'Browse Web', domain || url.slice(0, 45));

  if (!scroll || !url) return;
  const statusCls = !statusCode ? '' : statusCode < 300 ? 's-ok' : statusCode < 400 ? 's-redir' : 's-err';
  const card = document.createElement('div');
  card.className = 'az-card-web';
  card.innerHTML = `
    <div class="az-web-row">
      ${domain ? `<span class="az-web-domain">${esc(domain)}</span>` : ''}
      ${statusCode ? `<span class="az-web-status ${statusCls}">${statusCode}</span>` : ''}
    </div>
    <a class="az-web-url" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url.length>90?url.slice(0,90)+'…':url)}</a>`;
  scroll.insertBefore(card, scroll.firstChild);
}

/* -----------------------------------------------------------------------
   SUB / RES
----------------------------------------------------------------------- */
function upgradeSubStep(step) {
  if (step.dataset.done) return;
  step.dataset.done = '1';
  const kvps  = collectKvps(step);
  const agent = kvps['agent'] || kvps['name'] || kvps['context'] || 'sub-agent';
  const task  = kvps['task'] || kvps['instruction'] || kvps['message'] || '';
  const isRet = badgeType(step) === 'RES';

  buildStepHeader(step, isRet ? 'RES' : 'SUB',
    isRet ? 'Agent Response' : 'Delegate Agent', agent);

  const scroll = getScroll(step);
  if (!scroll) return;
  const card = document.createElement('div');
  card.className = 'az-card-agent';
  card.innerHTML = `
    <div class="az-agent-row">
      <span class="az-agent-direction">${isRet ? 'response from' : 'delegating to'}</span>
      <span class="az-agent-name">${esc(agent)}</span>
    </div>
    ${task ? `<div class="az-agent-task">${esc(task.slice(0,140))}${task.length>140?'…':''}</div>` : ''}`;
  scroll.insertBefore(card, scroll.firstChild);
}

/* -----------------------------------------------------------------------
   WRN / ERR
----------------------------------------------------------------------- */
function upgradeWarnErrStep(step, isErr) {
  if (step.dataset.done) return;
  step.dataset.done = '1';

  const type   = isErr ? 'ERR' : 'WRN';
  const scroll = getScroll(step);
  const text   = scroll?.textContent?.trim() || '';
  if (!text) return;

  const lines    = text.split('\n');
  const hasStack = lines.some(l => /^\s+at\s/.test(l) || /Traceback/.test(l));
  const mainText = hasStack ? lines[0] : text;
  const stackTxt = hasStack ? lines.slice(1).join('\n') : '';

  buildStepHeader(step, type, isErr ? 'Error' : 'Warning',
    mainText.length > 55 ? mainText.slice(0,55)+'…' : mainText);

  if (!scroll) return;
  const icon = isErr ? 'error' : 'warning';
  const callout = document.createElement('div');
  callout.className = `az-callout az-callout-${isErr ? 'err' : 'warn'}`;
  callout.innerHTML = `
    <span class="az-callout-icon"><span class="material-symbols-outlined">${icon}</span></span>
    <div class="az-callout-body">
      <span class="az-callout-text"></span>
      ${hasStack ? `<details class="az-stack-detail"><summary>stack trace</summary><pre class="az-stack-pre"></pre></details>` : ''}
    </div>`;
  callout.querySelector('.az-callout-text').textContent = mainText;
  if (hasStack) callout.querySelector('.az-stack-pre').textContent = stackTxt;
  while (scroll.firstChild) scroll.removeChild(scroll.firstChild);
  scroll.appendChild(callout);
}

/* -----------------------------------------------------------------------
   INF / HDL
----------------------------------------------------------------------- */
function upgradeInfoStep(step) {
  if (step.dataset.done) return;
  step.dataset.done = '1';
  const scroll = getScroll(step);
  const text   = scroll?.textContent?.trim() || '';
  buildStepHeader(step, 'INF', 'Info', text.slice(0, 55));
  if (!scroll || !text) return;
  const card = document.createElement('div');
  card.className = 'az-card-info';
  card.textContent = text.length > 300 ? text.slice(0,300)+'…' : text;
  scroll.insertBefore(card, scroll.firstChild);
}

/* -----------------------------------------------------------------------
   Dispatch
----------------------------------------------------------------------- */
function upgradeStep(step) {
  const type = badgeType(step);
  switch (type) {
    case 'GEN':              upgradeGenStep(step);              break;
    case 'END':              upgradeEndStep(step);              break;
    case 'USE': case 'MCP': upgradeUseStep(step);              break;
    case 'EXE':              upgradeExeStep(step);              break;
    case 'SKL': case 'HNT': upgradeSkillStep(step);            break;
    case 'WWW': case 'WEB': upgradeWebStep(step);              break;
    case 'SUB': case 'RES': upgradeSubStep(step);              break;
    case 'WRN':              upgradeWarnErrStep(step, false);   break;
    case 'ERR':              upgradeWarnErrStep(step, true);    break;
    case 'INF': case 'HDL': upgradeInfoStep(step);             break;
    default: break;
  }
}

export function upgradeAllSteps() {
  document.querySelectorAll('.process-step').forEach(upgradeStep);
}

const _obs = new MutationObserver(mutations => {
  for (const mut of mutations)
    for (const node of mut.addedNodes)
      if (node instanceof HTMLElement) {
        if (node.classList.contains('process-step')) upgradeStep(node);
        else node.querySelectorAll?.('.process-step').forEach(upgradeStep);
      }
});

export function startStepObserver() {
  const el = document.getElementById('chat-history');
  if (el) _obs.observe(el, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { upgradeAllSteps(); startStepObserver(); });
} else {
  upgradeAllSteps();
  startStepObserver();
}
