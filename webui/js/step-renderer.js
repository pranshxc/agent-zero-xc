/**
 * step-renderer.js — Agent Zero XC
 * Flat headline-first design. No card boxes.
 * Each step = bold headline + dimmed subline.
 * Collapsed = one elegant summary line.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function getHeader(step) { return step.querySelector('.process-step-header'); }
function getScroll(step) {
  const d = step.querySelector('.process-step-detail');
  return d ? (d.querySelector('.process-step-detail-scroll') || d) : null;
}

const EXT_LANG = {
  py:'Python',js:'JS',ts:'TS',tsx:'TSX',jsx:'JSX',html:'HTML',
  css:'CSS',json:'JSON',md:'Markdown',sh:'Shell',bash:'Shell',
  txt:'Text',yaml:'YAML',yml:'YAML',toml:'TOML',xml:'XML',
  rs:'Rust',go:'Go',rb:'Ruby',php:'PHP',java:'Java',
  cpp:'C++',c:'C',sql:'SQL',
};
function langFromPath(p) {
  return EXT_LANG[(p || '').split('.').pop().toLowerCase()] || '';
}

const TOOL_NAMES = {
  todo_manager: 'Task Manager',
  text_editor: 'Code Editor',
  code_execution: 'Run Code',
  code_exe: 'Run Code',
  search_engine: 'Web Search',
  web_search: 'Web Search',
  browser: 'Browser',
  memory_load: 'Load Memory',
  memory_save: 'Save Memory',
  memory_tool: 'Memory',
  http_request: 'HTTP Request',
  call_agent: 'Agent Call',
};
function friendlyTool(raw) {
  return TOOL_NAMES[raw?.toLowerCase?.()] || (raw || 'Tool');
}

// ---------------------------------------------------------------------------
// Headline injection
// ---------------------------------------------------------------------------
// Replaces content of .step-title with a styled headline + injects
// a .step-summary-line just after .step-title in the header.

function injectHeadline(step, titleText, subText, pill) {
  const header = getHeader(step);
  if (!header || header.dataset.hlDone) return;
  header.dataset.hlDone = '1';

  const titleEl = header.querySelector('.step-title');
  if (!titleEl) return;

  // Overwrite title text styling
  if (titleText) {
    titleEl.innerHTML = `<span class="step-hl-title">${esc(titleText)}</span>`;
    // Preserve shiny-text class if present on parent step-title
  } else {
    titleEl.classList.add('step-hl-title-default');
  }

  // Build summary line (collapsed state)
  const existing = header.querySelector('.step-summary-line');
  if (!existing && subText) {
    const summary = document.createElement('span');
    summary.className = 'step-summary-line';
    summary.textContent = subText.length > 60 ? subText.slice(0, 60) + '…' : subText;
    titleEl.after(summary);
  }

  // Pill (language, engine, etc.)
  const existingPill = header.querySelector('.step-hl-pill');
  if (!existingPill && pill) {
    const p = document.createElement('span');
    p.className = 'step-hl-pill';
    p.textContent = pill;
    header.appendChild(p);
  }
}

function detailSection(labelText, contentHtml) {
  return `<div class="step-detail-label">${esc(labelText)}</div>${contentHtml}`;
}

// ---------------------------------------------------------------------------
// GEN — AI thinking
// ---------------------------------------------------------------------------
function upgradeGenStep(step) {
  if (step.dataset.genDone) return;
  step.dataset.genDone = '1';

  const header = getHeader(step);
  const titleEl = header?.querySelector('.step-title');
  if (!titleEl) return;

  function attachDots() {
    if (step.dataset.dotsDone || !titleEl.classList.contains('shiny-text')) return;
    step.dataset.dotsDone = '1';
    const dots = document.createElement('span');
    dots.className = 'step-thinking-dots';
    dots.innerHTML = '<span></span><span></span><span></span>';
    titleEl.after(dots);
    const obs = new MutationObserver(() => {
      if (!titleEl.classList.contains('shiny-text')) {
        dots.remove();
        delete step.dataset.dotsDone;
        obs.disconnect();
      }
    });
    obs.observe(titleEl, { attributes: true, attributeFilter: ['class'] });
  }

  attachDots();
  const w = new MutationObserver(attachDots);
  w.observe(titleEl, { attributes: true, attributeFilter: ['class'] });
}

// ---------------------------------------------------------------------------
// END
// ---------------------------------------------------------------------------
function upgradeEndStep(step) {
  if (step.dataset.endDone) return;
  step.dataset.endDone = '1';
  const kvps = collectKvps(step);
  const dur  = step.querySelector('.step-timing')?.textContent?.trim() || kvps['duration'] || '';
  const tok  = kvps['tokens'] || '';
  const sub  = [dur, tok ? tok + ' tok' : ''].filter(Boolean).join(' · ');
  injectHeadline(step, 'Completed', sub || 'Task finished', '');
}

// ---------------------------------------------------------------------------
// USE / MCP — tool calls
// ---------------------------------------------------------------------------
function upgradeUseStep(step) {
  if (step.dataset.useDone) return;
  step.dataset.useDone = '1';

  const titleEl  = step.querySelector('.step-title');
  const titleTxt = titleEl?.textContent?.trim() || '';
  const kvps     = collectKvps(step);

  const toolMatch = titleTxt.match(/[Uu]sing tool ['"](.*?)['"]/) ||
                    titleTxt.match(/[Tt]ool[:\s]+([\w_\-\.]+)/);
  const rawTool   = toolMatch ? toolMatch[1] : (kvps['tool'] || kvps['name'] || '');
  const action    = kvps['action'] || kvps['command'] || '';

  const lower = (rawTool || '').toLowerCase();
  if (lower.includes('todo'))          return upgradeTodoStep(step, rawTool, action, kvps);
  if (lower.includes('text_editor') || lower.includes('editor'))
                                       return upgradeEditorStep(step, rawTool, action, kvps);
  if (lower.includes('search'))        return upgradeSearchStep(step, rawTool, kvps);

  const displayName = friendlyTool(rawTool);
  const sub = action ? action : (rawTool || '');

  injectHeadline(step, displayName, sub, '');

  // Expanded detail: KV grid
  const scroll = getScroll(step);
  if (!scroll) return;
  const kvpRows = step.querySelectorAll('.step-kvp');
  if (!kvpRows.length) return;

  let rows = '';
  kvpRows.forEach(kvp => {
    const k = kvp.querySelector('.step-kvp-key')?.textContent?.trim() || '';
    const v = kvp.querySelector('.step-kvp-value')?.textContent?.trim() || '';
    if (!k) return;
    const vShort = v.length > 280 ? v.slice(0,280)+'…' : v;
    rows += `<div class="step-kvp" style="display:contents">
      <span class="step-kvp-key">${esc(k)}</span>
      <span class="step-kvp-value">${esc(vShort)}</span>
    </div>`;
  });
  if (rows) {
    const grid = document.createElement('div');
    grid.className = 'step-kvps';
    grid.innerHTML = rows;
    scroll.insertBefore(grid, scroll.firstChild);
  }
}

// ---------------------------------------------------------------------------
// TODO manager
// ---------------------------------------------------------------------------
function upgradeTodoStep(step, rawTool, action, kvps) {
  const taskId  = kvps['task id'] || kvps['task_id'] || kvps['id'] || '';
  const scroll  = getScroll(step);
  const rawText = scroll?.textContent || '';

  const actionVerb = (action || kvps['action'] || 'update').toLowerCase();
  const remaining  = (rawText.match(/(\d+)\s+remaining/) || [])[1];
  const subLine    = taskId ? `#${taskId} · ${actionVerb}` : actionVerb;

  injectHeadline(step, 'Task Manager', subLine, remaining ? `${remaining} left` : '');

  if (!scroll) return;

  const upcomingMatch = rawText.match(/upcoming:\s*(.+)$/m);
  let tasksHtml = '';
  if (upcomingMatch) {
    const tasks = upcomingMatch[1].split('|').map(t => t.trim()).filter(Boolean).slice(0,4);
    tasksHtml = tasks.map(t => {
      const tm = t.match(/\[(\d+)\]\s*(.*)/);
      const id  = tm ? '#' + tm[1] : '';
      const txt = tm ? tm[2].trim() : t;
      return `<li class="step-task-item"><span class="step-task-id">${esc(id)}</span><span class="step-task-text">${esc(txt.length>80?txt.slice(0,80)+'…':txt)}</span></li>`;
    }).join('');
  }

  const pct = remaining ? Math.max(5, Math.min(95, 100 - parseInt(remaining,10)*12)) : 50;

  const frag = document.createDocumentFragment();
  const bar = document.createElement('div');
  bar.className = 'step-progress-bar';
  bar.innerHTML = `<div class="step-progress-fill" style="width:${pct}%"></div>`;
  frag.appendChild(bar);

  if (tasksHtml) {
    const ul = document.createElement('ul');
    ul.className = 'step-task-list';
    ul.innerHTML = tasksHtml;
    frag.appendChild(ul);
  }

  scroll.insertBefore(frag, scroll.firstChild);
}

// ---------------------------------------------------------------------------
// Text editor
// ---------------------------------------------------------------------------
function upgradeEditorStep(step, rawTool, action, kvps) {
  const op       = (action || kvps['action'] || kvps['command'] || 'read').toLowerCase();
  const filePath = kvps['path'] || kvps['file'] || kvps['filename'] || '';
  const lang     = langFromPath(filePath);
  const filename = filePath.split('/').pop() || 'file';
  const isWrite  = /write|save|create|update|replace/.test(op);
  const opLabel  = isWrite ? 'write' : 'read';

  injectHeadline(step, 'Code Editor', `${opLabel} ${filename}`, lang || '');

  const scroll = getScroll(step);
  if (!scroll) return;

  // Path line
  if (filePath) {
    const pathEl = document.createElement('code');
    pathEl.className = 'step-code-line';
    pathEl.textContent = filePath;
    scroll.insertBefore(pathEl, scroll.firstChild);
  }

  // Diff / preview
  const rawText = scroll.textContent;
  if (isWrite && rawText.trim()) {
    const diff = document.createElement('div');
    diff.className = 'step-diff-block';
    rawText.split('\n').slice(0,10).forEach(l => {
      const span = document.createElement('span');
      span.className = l.startsWith('+') ? 'step-diff-add'
                     : l.startsWith('-') ? 'step-diff-del'
                     : 'step-diff-ctx';
      span.textContent = l;
      diff.appendChild(span);
    });
    scroll.appendChild(diff);
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
function upgradeSearchStep(step, rawTool, kvps) {
  const query  = kvps['query'] || kvps['q'] || kvps['search'] || '';
  const engine = kvps['engine'] || kvps['source'] || '';
  injectHeadline(step, 'Web Search', query || 'searching…', engine);

  const scroll = getScroll(step);
  if (query && scroll) {
    const q = document.createElement('code');
    q.className = 'step-code-line';
    q.textContent = query;
    scroll.insertBefore(q, scroll.firstChild);
  }
}

// ---------------------------------------------------------------------------
// EXE — terminal
// ---------------------------------------------------------------------------
function upgradeExeStep(step) {
  if (step.dataset.exeDone) return;
  step.dataset.exeDone = '1';

  const kvps     = collectKvps(step);
  const titleEl  = step.querySelector('.step-title');
  const titleTxt = titleEl?.textContent?.trim() || '';
  let cwd = '';
  step.querySelectorAll('.step-kvp').forEach(kvp => {
    if (/path|cwd|dir/i.test(kvp.querySelector('.step-kvp-key')?.textContent || ''))
      cwd = kvp.querySelector('.step-kvp-value')?.textContent?.trim() || '';
  });

  const cmdShort = titleTxt.length > 50 ? titleTxt.slice(0,50)+'…' : titleTxt;
  injectHeadline(step, 'Run Code', cmdShort, cwd ? cwd.split('/').slice(-2).join('/') : '');

  const detail = step.querySelector('.process-step-detail');
  if (!detail) return;
  const legacyOutput = detail.querySelector('.terminal-output');
  const rawPre       = !legacyOutput && detail.querySelector('pre');
  const outputEl     = legacyOutput || rawPre;
  const outputText   = outputEl ? outputEl.textContent : '';

  const lines     = (outputText.match(/\n/g) || []).length + 1;
  const exitMatch = outputText.match(/exit(?:\s+code)?[:\s]+(\d+)/i);
  const exitCode  = exitMatch ? parseInt(exitMatch[1],10) : null;
  const exitOk    = exitCode === null || exitCode === 0;

  const card = document.createElement('div');
  card.className = 'terminal-card';
  card.innerHTML = `
    <div class="terminal-titlebar">
      <div class="terminal-dots"><span></span><span></span><span></span></div>
      <span class="terminal-path">${esc(cwd || 'terminal')}</span>
      <span class="terminal-exit">${exitOk?'ok':'err'}${exitCode!==null?' '+exitCode:''}</span>
      <button class="terminal-copy-btn" type="button">copy</button>
    </div>
    ${titleTxt ? `<div class="terminal-cmd">${esc(titleTxt)}</div>` : ''}
    <div class="terminal-output-body">${esc(outputText)}</div>
    <div class="terminal-line-count">${lines} line${lines!==1?'s':''}</div>
  `;
  card.querySelector('.terminal-copy-btn').addEventListener('click', e => {
    e.stopPropagation();
    navigator.clipboard.writeText(outputText).then(() => {
      const btn = e.currentTarget;
      btn.textContent = 'copied';
      setTimeout(() => (btn.textContent = 'copy'), 1400);
    }).catch(() => {});
  });

  const scroll = detail.querySelector('.process-step-detail-scroll') || detail;
  if (outputEl) outputEl.replaceWith(card);
  else scroll.appendChild(card);
}

// ---------------------------------------------------------------------------
// SKL
// ---------------------------------------------------------------------------
function upgradeSkillStep(step) {
  if (step.dataset.sklDone) return;
  step.dataset.sklDone = '1';
  const scroll = getScroll(step);
  if (!scroll) return;
  const text = scroll.textContent.trim();
  const m    = text.match(/[Ll]oaded skill ['"\`]?([\w\-\.]+)/);
  const name = m ? m[1] : text.slice(0, 45);
  injectHeadline(step, 'Load Skill', name, 'skill');
}

// ---------------------------------------------------------------------------
// WWW / WEB
// ---------------------------------------------------------------------------
function upgradeWebStep(step) {
  if (step.dataset.webDone) return;
  step.dataset.webDone = '1';

  const scroll = getScroll(step);
  let url = '', statusCode = null;
  step.querySelectorAll('.step-kvp').forEach(kvp => {
    const k = kvp.querySelector('.step-kvp-key')?.textContent || '';
    const v = kvp.querySelector('.step-kvp-value')?.textContent?.trim() || '';
    if (/url|link|href|uri/i.test(k)) url = v;
    if (/status|code/i.test(k)) statusCode = parseInt(v,10) || null;
  });
  if (!url && scroll) {
    const m = scroll.textContent.match(/https?:\/\/[^\s"'>]+/);
    if (m) url = m[0];
  }

  let domain = '';
  try { domain = new URL(url).hostname.replace(/^www\./,''); } catch {}
  injectHeadline(step, 'Browse Web', domain || url.slice(0,50), statusCode ? String(statusCode) : '');

  if (url && scroll) {
    const a = document.createElement('a');
    a.className = 'step-url-line';
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = url.length > 80 ? url.slice(0,80)+'…' : url;
    scroll.insertBefore(a, scroll.firstChild);
  }
}

// ---------------------------------------------------------------------------
// SUB / RES
// ---------------------------------------------------------------------------
function upgradeSubStep(step) {
  if (step.dataset.subDone) return;
  step.dataset.subDone = '1';
  const kvps  = collectKvps(step);
  const agent = kvps['agent'] || kvps['name'] || kvps['context'] || 'sub-agent';
  const task  = kvps['task'] || kvps['instruction'] || kvps['message'] || '';
  const isRet = badgeType(step) === 'RES';
  injectHeadline(step, isRet ? 'Agent Response' : 'Delegate Agent', agent, '');

  const scroll = getScroll(step);
  if (task && scroll) {
    const p = document.createElement('p');
    p.className = 'step-prose-line';
    p.textContent = task.length > 140 ? task.slice(0,140)+'…' : task;
    scroll.insertBefore(p, scroll.firstChild);
  }
}

// ---------------------------------------------------------------------------
// WRN / ERR
// ---------------------------------------------------------------------------
function upgradeWarnErrStep(step, type) {
  if (step.dataset.warnDone) return;
  step.dataset.warnDone = '1';

  const scroll = getScroll(step);
  const text   = scroll?.textContent?.trim() || '';
  if (!text) return;

  const lines    = text.split('\n');
  const hasStack = lines.some(l => /^\s+at\s/.test(l) || /Traceback/.test(l));
  const mainText = hasStack ? lines[0] : text;
  const stackTxt = hasStack ? lines.slice(1).join('\n') : '';

  injectHeadline(step,
    type === 'error' ? 'Error' : 'Warning',
    mainText.length > 65 ? mainText.slice(0,65)+'…' : mainText,
    '');

  if (!scroll) return;
  const callout = document.createElement('div');
  callout.className = type === 'error' ? 'step-error-callout' : 'step-warning-callout';
  callout.innerHTML = `
    <span class="callout-icon">!</span>
    <div>
      <span class="callout-text"></span>
      ${hasStack ? `<details class="step-stack-detail"><summary>stack trace</summary><pre class="step-stack-pre"></pre></details>` : ''}
    </div>`;
  callout.querySelector('.callout-text').textContent = mainText;
  if (hasStack) callout.querySelector('.step-stack-pre').textContent = stackTxt;
  while (scroll.firstChild) scroll.removeChild(scroll.firstChild);
  scroll.appendChild(callout);
}

// ---------------------------------------------------------------------------
// INF / HDL
// ---------------------------------------------------------------------------
function upgradeInfoStep(step) {
  if (step.dataset.infDone) return;
  step.dataset.infDone = '1';
  const scroll = getScroll(step);
  const text   = scroll?.textContent?.trim() || '';
  injectHeadline(step, 'Info', text.length > 65 ? text.slice(0,65)+'…' : text, '');
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------
function upgradeStep(step) {
  const type = badgeType(step);
  switch (type) {
    case 'GEN':              upgradeGenStep(step);             break;
    case 'END':              upgradeEndStep(step);             break;
    case 'USE': case 'MCP': upgradeUseStep(step);             break;
    case 'EXE':              upgradeExeStep(step);             break;
    case 'SKL': case 'HNT': upgradeSkillStep(step);           break;
    case 'WWW': case 'WEB': upgradeWebStep(step);             break;
    case 'SUB': case 'RES': upgradeSubStep(step);             break;
    case 'WRN':              upgradeWarnErrStep(step,'warning'); break;
    case 'ERR':              upgradeWarnErrStep(step,'error');   break;
    case 'INF': case 'HDL': upgradeInfoStep(step);            break;
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
