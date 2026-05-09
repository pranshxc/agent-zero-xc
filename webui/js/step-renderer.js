/**
 * step-renderer.js  —  Agent Zero XC
 * Monochrome, Claude-style step card upgrades.
 * No emoji, no color. Structure only.
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

function collectKvps(step) {
  const map = {};
  step.querySelectorAll('.step-kvp').forEach(kvp => {
    const k = kvp.querySelector('.step-kvp-key')?.textContent?.trim()?.toLowerCase();
    const v = kvp.querySelector('.step-kvp-value')?.textContent?.trim();
    if (k !== undefined && v !== undefined) map[k] = v;
  });
  return map;
}

function badgeType(step) {
  const badge = step.querySelector('.step-badge');
  if (!badge) return '';
  const m = badge.className.match(/\b(GEN|END|USE|MCP|SUB|RES|EXE|WWW|WEB|HDL|INF|HNT|SKL|WRN|ERR|UTL)\b/);
  return m ? m[1] : '';
}

function getScroll(step) {
  const detail = step.querySelector('.process-step-detail');
  if (!detail) return null;
  return detail.querySelector('.process-step-detail-scroll') || detail;
}

const EXT_LANG = {
  py:'Python',js:'JS',ts:'TS',tsx:'TSX',jsx:'JSX',
  html:'HTML',css:'CSS',json:'JSON',md:'MD',
  sh:'Shell',bash:'Shell',txt:'Text',
  yaml:'YAML',yml:'YAML',toml:'TOML',xml:'XML',
  rs:'Rust',go:'Go',rb:'Ruby',php:'PHP',
  java:'Java',cpp:'C++',c:'C',
};
function langFromPath(p) {
  return EXT_LANG[(p || '').split('.').pop().toLowerCase()] || '';
}

// ---------------------------------------------------------------------------
// GEN  —  shimmer + thinking dots
// ---------------------------------------------------------------------------

function upgradeGenStep(step) {
  if (step.dataset.genUpgraded) return;
  step.dataset.genUpgraded = '1';

  const titleEl = step.querySelector('.step-title');
  if (!titleEl) return;

  function maybeAttachDots() {
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
      }
    });
    obs.observe(titleEl, { attributes: true, attributeFilter: ['class'] });
  }

  maybeAttachDots();
  const watch = new MutationObserver(maybeAttachDots);
  watch.observe(titleEl, { attributes: true, attributeFilter: ['class'] });
}

// ---------------------------------------------------------------------------
// END
// ---------------------------------------------------------------------------

function upgradeEndStep(step) {
  if (step.dataset.endUpgraded) return;
  step.dataset.endUpgraded = '1';

  const scroll = getScroll(step);
  if (!scroll || scroll.querySelector('.step-end-card')) return;

  const kvps     = collectKvps(step);
  const duration = step.querySelector('.step-timing')?.textContent?.trim() || kvps['duration'] || '';
  const tokens   = kvps['tokens'] || kvps['token'] || '';

  const card = document.createElement('div');
  card.className = 'step-end-card';
  card.innerHTML = `
    <span class="step-end-status">Done</span>
    ${duration ? `<span class="step-end-chip">${escHtml(duration)}</span>` : ''}
    ${tokens   ? `<span class="step-end-chip">${escHtml(tokens)} tok</span>` : ''}
  `;
  scroll.insertBefore(card, scroll.firstChild);
}

// ---------------------------------------------------------------------------
// USE / MCP  —  tool call card
// ---------------------------------------------------------------------------

function upgradeUseStep(step) {
  if (step.dataset.useUpgraded) return;
  step.dataset.useUpgraded = '1';

  const titleEl   = step.querySelector('.step-title');
  const titleText = titleEl?.textContent?.trim() || '';
  const kvps      = collectKvps(step);

  const toolMatch = titleText.match(/[Uu]sing tool ['"](.*?)['"]/) ||
                    titleText.match(/[Tt]ool[:\s]+([\w_\-\.]+)/);
  const toolName  = toolMatch ? toolMatch[1] : (kvps['tool'] || kvps['name'] || '');
  const action    = kvps['action'] || kvps['command'] || '';

  const lower = toolName.toLowerCase();
  if (lower.includes('todo'))          return upgradeTodoStep(step, toolName, action, kvps);
  if (lower.includes('text_editor') || lower.includes('editor'))
                                       return upgradeEditorStep(step, toolName, action, kvps);
  if (lower.includes('search'))        return upgradeSearchStep(step, toolName, kvps);

  const scroll = getScroll(step);
  if (!scroll || scroll.querySelector('.step-tool-card')) return;

  const isRunning = titleEl?.classList.contains('shiny-text');

  const card = document.createElement('div');
  card.className = 'step-tool-card';

  let headerHtml = `
    <div class="step-tool-header">
      <span class="step-tool-name">${escHtml(toolName || 'tool')}</span>
      ${action ? `<span class="step-tool-action">${escHtml(action)}</span>` : ''}
      <span class="step-tool-status${isRunning ? ' tool-status-running' : ''}">${isRunning ? '...' : 'done'}</span>
    </div>`;

  card.innerHTML = headerHtml;

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
      row.innerHTML = `<span class="step-tool-kvkey">${escHtml(k)}</span><span class="step-tool-kvval">${escHtml(v.length > 250 ? v.slice(0,250)+'…' : v)}</span>`;
      grid.appendChild(row);
    });
    card.appendChild(grid);
  }

  scroll.insertBefore(card, scroll.firstChild);

  if (isRunning && titleEl) {
    const obs = new MutationObserver(() => {
      if (!titleEl.classList.contains('shiny-text')) {
        const chip = card.querySelector('.step-tool-status');
        if (chip) { chip.className = 'step-tool-status'; chip.textContent = 'done'; }
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
  const rawText     = scroll.textContent;
  const remaining   = (rawText.match(/(\d+)\s+remaining/) || [])[1];

  const actionLabels = { COMPLETE:'complete', ADD:'add', REMOVE:'remove', UPDATE:'update' };
  const actionLabel  = actionLabels[actionUpper] || (actionUpper.toLowerCase() || 'action');

  let tasksHtml = '';
  const upcomingMatch = rawText.match(/upcoming:\s*(.+)$/m);
  if (upcomingMatch) {
    const tasks = upcomingMatch[1].split('|').map(t => t.trim()).filter(Boolean).slice(0,5);
    tasksHtml = tasks.map(t => {
      const tm = t.match(/\[(\d+)\]\s*(.*)/);
      const id  = tm ? '#' + tm[1] : '';
      const txt = tm ? tm[2].trim() : t;
      return `<div class="todo-task-row"><span class="todo-task-id">${escHtml(id)}</span><span class="todo-task-text">${escHtml(txt.length > 80 ? txt.slice(0,80)+'…' : txt)}</span></div>`;
    }).join('');
  }

  const pct = remaining ? Math.max(5, Math.min(95, 100 - parseInt(remaining,10)*10)) : 50;

  const card = document.createElement('div');
  card.className = 'step-todo-card';
  card.innerHTML = `
    <div class="step-todo-header">
      <span class="step-todo-tool">todo_manager</span>
      <span class="step-todo-action todo-${actionLabel}">${actionLabel}</span>
      ${taskId   ? `<span class="step-todo-taskid">#${escHtml(taskId)}</span>` : ''}
      ${remaining ? `<span class="step-todo-remaining">${remaining} left</span>` : ''}
    </div>
    ${remaining ? `<div class="step-todo-progress"><div class="step-todo-progress-bar" style="width:${pct}%"></div></div>` : ''}
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
  const opLabel  = isWrite ? 'write' : isRead ? 'read' : op;

  const parts     = filePath.split('/').filter(Boolean);
  const breadcrumb = parts.map((p, i) =>
    i === parts.length - 1
      ? `<span class="editor-crumb editor-crumb-file">${escHtml(p)}</span>`
      : `<span class="editor-crumb">${escHtml(p)}</span><span class="editor-crumb-sep">/</span>`
  ).join('');

  const rawText = scroll.textContent;
  let previewHtml = '';
  if (isWrite) {
    const lines = rawText.split('\n').slice(0,10).map(l => {
      if (l.startsWith('+')) return `<div class="diff-line diff-add">${escHtml(l)}</div>`;
      if (l.startsWith('-')) return `<div class="diff-line diff-del">${escHtml(l)}</div>`;
      return `<div class="diff-line diff-ctx">${escHtml(l)}</div>`;
    }).join('');
    previewHtml = `<div class="step-editor-diff">${lines}</div>`;
  } else if (isRead && rawText.trim().length > 6) {
    const preview = rawText.trim().split('\n').slice(0,5).join('\n');
    previewHtml = `<pre class="step-editor-preview">${escHtml(preview.slice(0,200))}</pre>`;
  }

  const card = document.createElement('div');
  card.className = 'step-editor-card';
  card.innerHTML = `
    <div class="step-editor-header">
      <span class="step-editor-op editor-op-${isWrite?'write':'read'}">${opLabel}</span>
      <span class="step-editor-breadcrumb">${breadcrumb || escHtml(filePath || 'file')}</span>
      ${lang ? `<span class="step-editor-lang">${escHtml(lang)}</span>` : ''}
    </div>
    ${previewHtml}
  `;
  scroll.insertBefore(card, scroll.firstChild);
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function upgradeSearchStep(step, toolName, kvps) {
  const scroll = getScroll(step);
  if (!scroll || scroll.querySelector('.step-search-card')) return;

  const query  = kvps['query'] || kvps['q'] || kvps['search'] || '';
  const engine = kvps['engine'] || kvps['source'] || '';

  const card = document.createElement('div');
  card.className = 'step-search-card';
  card.innerHTML = `
    <div class="step-search-header">
      <span class="step-search-label">search</span>
      ${engine ? `<span class="step-search-engine">${escHtml(engine)}</span>` : ''}
    </div>
    ${query ? `<div class="step-search-query">${escHtml(query)}</div>` : ''}
  `;
  scroll.insertBefore(card, scroll.firstChild);
}

// ---------------------------------------------------------------------------
// EXE  —  terminal card
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
  const titleTxt = titleEl?.textContent?.trim() || '';

  let cwd = '';
  step.querySelectorAll('.step-kvp').forEach(kvp => {
    const k = kvp.querySelector('.step-kvp-key')?.textContent || '';
    const v = kvp.querySelector('.step-kvp-value')?.textContent || '';
    if (/path|cwd|dir/i.test(k)) cwd = v.trim();
  });

  const lines     = countLines(outputText);
  const exitMatch = outputText.match(/exit(?:\s+code)?[:\s]+(\d+)/i);
  const exitCode  = exitMatch ? parseInt(exitMatch[1],10) : null;
  const exitOk    = exitCode === null || exitCode === 0;

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
      <span class="terminal-exit ${exitOk?'exit-ok':'exit-err'}">${exitOk?'ok':'err'}${exitCode!==null?' '+exitCode:''}</span>
      <button class="terminal-copy-btn" type="button">copy</button>
    </div>
    ${titleTxt ? `<div class="terminal-cmd">${escHtml(titleTxt)}</div>` : ''}
    <div class="terminal-output-body">${escHtml(outputText || '')}</div>
    <div class="terminal-line-count">${lines} line${lines!==1?'s':''}</div>
  `;

  card.querySelector('.terminal-copy-btn').addEventListener('click', e => {
    e.stopPropagation();
    navigator.clipboard.writeText(outputText).then(() => {
      const btn = e.currentTarget;
      const orig = btn.textContent;
      btn.textContent = 'copied';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    }).catch(() => {});
  });

  const scroll = detail.querySelector('.process-step-detail-scroll') || detail;
  if (outputEl) outputEl.replaceWith(card);
  else scroll.appendChild(card);
}

// ---------------------------------------------------------------------------
// SKL  —  skill card
// ---------------------------------------------------------------------------

function upgradeSkillStep(step) {
  if (step.dataset.skillUpgraded) return;
  step.dataset.skillUpgraded = '1';

  const detail = step.querySelector('.process-step-detail');
  if (!detail) return;

  const scroll = detail.querySelector('.process-step-detail-scroll') || detail;
  if (scroll.querySelector('.step-skill-card')) return;

  const text  = scroll.textContent.trim();
  const m     = text.match(/[Ll]oaded skill ['"\`]?([\w\-\.]+)['"\`]?(?:\s+into\s+([\w]+))?/);
  const name  = m ? m[1] : text.slice(0,50);
  const target = (m && m[2]) ? m[2] : 'EXTRAS';

  const card = document.createElement('div');
  card.className = 'step-skill-card';
  card.innerHTML = `
    <div class="step-skill-info">
      <span class="step-skill-name">${escHtml(name)}</span>
      <span class="step-skill-loaded">loaded into</span>
      <span class="step-skill-target">${escHtml(target)}</span>
    </div>
  `;
  scroll.insertBefore(card, scroll.firstChild);
}

// ---------------------------------------------------------------------------
// WWW / WEB
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
    if (/status|code/i.test(k)) statusCode = parseInt(v,10) || null;
  });
  if (!url) {
    const m = scroll.textContent.match(/https?:\/\/[^\s"'>]+/);
    if (m) url = m[0];
  }
  if (!url) return;

  let domain = '';
  try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch { domain = ''; }

  let statusLabel = '';
  if (statusCode) statusLabel = String(statusCode);

  const card = document.createElement('div');
  card.className = 'step-web-card';
  card.innerHTML = `
    <div class="step-web-header">
      ${domain ? `<span class="step-web-domain">${escHtml(domain)}</span>` : ''}
      ${statusLabel ? `<span class="step-web-status">${escHtml(statusLabel)}</span>` : ''}
    </div>
    <a class="step-web-url" href="${escHtml(url)}" target="_blank" rel="noopener noreferrer">${escHtml(url.length>90?url.slice(0,90)+'…':url)}</a>
  `;
  scroll.insertBefore(card, scroll.firstChild);
}

// ---------------------------------------------------------------------------
// SUB / RES
// ---------------------------------------------------------------------------

function upgradeSubStep(step) {
  if (step.dataset.subUpgraded) return;
  step.dataset.subUpgraded = '1';

  const scroll = getScroll(step);
  if (!scroll || scroll.querySelector('.step-sub-card')) return;

  const kvps      = collectKvps(step);
  const agentName = kvps['agent'] || kvps['name'] || kvps['context'] || 'sub-agent';
  const task      = kvps['task'] || kvps['instruction'] || kvps['message'] || '';
  const isReturn  = badgeType(step) === 'RES';

  const card = document.createElement('div');
  card.className = 'step-sub-card';
  card.innerHTML = `
    <div class="step-sub-header">
      <span class="step-sub-label">${isReturn ? 'response from' : 'delegating to'}</span>
      <span class="step-sub-name">${escHtml(agentName)}</span>
    </div>
    ${task ? `<div class="step-sub-task">${escHtml(task.length>120?task.slice(0,120)+'…':task)}</div>` : ''}
  `;
  scroll.insertBefore(card, scroll.firstChild);
}

// ---------------------------------------------------------------------------
// WRN / ERR
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
  const lines = text.split('\n');
  const hasStack = lines.some(l => /^\s+at\s/.test(l) || /Traceback/.test(l));
  const mainText  = hasStack ? lines[0] : text;
  const stackText = hasStack ? lines.slice(1).join('\n') : '';

  const callout = document.createElement('div');
  callout.className = isErr ? 'step-error-callout' : 'step-warning-callout';
  callout.innerHTML = `
    <span class="callout-icon">${isErr ? '!' : '!'}</span>
    <div class="callout-body">
      <span class="callout-text"></span>
      ${hasStack ? `<details class="callout-stack"><summary>stack trace</summary><pre class="callout-stack-pre"></pre></details>` : ''}
    </div>
  `;
  callout.querySelector('.callout-text').textContent = mainText;
  if (hasStack) callout.querySelector('.callout-stack-pre').textContent = stackText;

  Array.from(scroll.childNodes).forEach(n => n.remove());
  scroll.appendChild(callout);
}

// ---------------------------------------------------------------------------
// INF / HDL
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
  const span = document.createElement('span');
  span.className = 'step-info-text';
  span.textContent = text.length > 200 ? text.slice(0,200)+'…' : text;
  card.appendChild(span);
  scroll.insertBefore(card, scroll.firstChild);
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function upgradeStep(step) {
  const type = badgeType(step);
  switch (type) {
    case 'GEN':                      upgradeGenStep(step);                break;
    case 'END':                      upgradeEndStep(step);                break;
    case 'USE': case 'MCP':          upgradeUseStep(step);                break;
    case 'EXE':                      upgradeTerminalStep(step);           break;
    case 'SKL': case 'HNT':          upgradeSkillStep(step);              break;
    case 'WWW': case 'WEB':          upgradeWebStep(step);                break;
    case 'SUB': case 'RES':          upgradeSubStep(step);                break;
    case 'WRN':                      upgradeWarnErrStep(step,'warning');  break;
    case 'ERR':                      upgradeWarnErrStep(step,'error');    break;
    case 'INF': case 'HDL':          upgradeInfoStep(step);               break;
    default: break;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function upgradeAllSteps() {
  document.querySelectorAll('.process-step').forEach(upgradeStep);
}

const _observer = new MutationObserver(mutations => {
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
