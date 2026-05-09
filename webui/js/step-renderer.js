/**
 * step-renderer.js
 * Upgrades agent step DOM nodes to the new polished card designs.
 * Call upgradeAllSteps() after the chat history renders, or observe
 * for new nodes with the MutationObserver at the bottom.
 *
 * Covers:
 *   EXE  → terminal-card with chrome (dots, path, cmd, exit code, copy, line count)
 *   SKL  → skill-card with name + target badge + pulse animation
 *   WWW/WEB → web-card with icon, URL chip, status badge
 *   WRN  → warning callout with icon
 *   ERR  → error callout with icon
 *   GEN  → thinking-dots on active (shiny-text) titles
 */

// ---- Helpers ----------------------------------------------------------------

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function countLines(text) {
  if (!text) return 0;
  return (text.match(/\n/g) || []).length + 1;
}

function domainFrom(url) {
  try { return new URL(url).hostname; } catch { return url.slice(0, 40); }
}

function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  });
}

// ---- EXE — Terminal card ---------------------------------------------------

function upgradeTerminalStep(step) {
  if (step.dataset.terminalUpgraded) return;
  step.dataset.terminalUpgraded = '1';

  const detail = step.querySelector('.process-step-detail');
  if (!detail) return;

  // Find legacy terminal-output or raw pre
  const legacyOutput = detail.querySelector('.terminal-output');
  const rawPre       = !legacyOutput && detail.querySelector('pre');
  const outputEl     = legacyOutput || rawPre;
  const outputText   = outputEl ? outputEl.textContent : '';

  // Try to extract command from the step title or kvps
  const titleEl  = step.querySelector('.step-title');
  const titleTxt = titleEl ? titleEl.textContent.trim() : '';

  // Try to get path from kvp (key contains 'path' or 'cwd')
  let cwd = '';
  step.querySelectorAll('.step-kvp').forEach(kvp => {
    const k = kvp.querySelector('.step-kvp-key');
    const v = kvp.querySelector('.step-kvp-value');
    if (k && v && /path|cwd|dir/i.test(k.textContent)) cwd = v.textContent.trim();
  });

  // Build the terminal card HTML
  const lines     = countLines(outputText);
  const exitMatch = outputText.match(/exit(?:\s+code)?[:\s]+?(\d+)/i);
  const exitCode  = exitMatch ? parseInt(exitMatch[1], 10) : null;
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
      ${exitCode !== null
        ? `<span class="terminal-exit ${exitOk ? 'exit-ok' : 'exit-err'}">${exitOk ? '\u2713' : '\u2717'} ${exitCode}</span>`
        : ''}
      <button class="terminal-copy-btn" type="button">Copy</button>
    </div>
    ${titleTxt ? `<div class="terminal-cmd">${escHtml(titleTxt)}</div>` : ''}
    <div class="terminal-output-body">${escHtml(outputText)}</div>
    <div class="terminal-line-count">${lines.toLocaleString()} line${lines !== 1 ? 's' : ''}</div>
  `;

  // Wire copy button
  card.querySelector('.terminal-copy-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    copyToClipboard(outputText, e.currentTarget);
  });

  // Replace / supplement existing output
  const scroll = detail.querySelector('.process-step-detail-scroll') || detail;
  if (outputEl) outputEl.replaceWith(card);
  else scroll.appendChild(card);
}

// ---- SKL — Skill card ------------------------------------------------------

function upgradeSkillStep(step) {
  if (step.dataset.skillUpgraded) return;
  step.dataset.skillUpgraded = '1';

  const detail = step.querySelector('.process-step-detail');
  if (!detail) return;

  const scroll = detail.querySelector('.process-step-detail-scroll') || detail;

  // Try to find skill name + target from text content
  const text = scroll.textContent.trim();
  // Matches: "Loaded skill 'foo-bar' into EXTRAS."
  const m = text.match(/[Ll]oaded skill ['"]?([\w\-]+)['"]?(?:\s+into\s+([\w]+))?/);
  const skillName = m ? m[1] : text.slice(0, 50);
  const target    = m && m[2] ? m[2] : 'EXTRAS';

  const card = document.createElement('div');
  card.className = 'step-skill-card';
  card.innerHTML = `
    <span class="step-skill-icon" aria-hidden="true">🧩</span>
    <span class="step-skill-name">${escHtml(skillName)}</span>
    <span class="step-skill-target">${escHtml(target)}</span>
  `;

  // Prepend card above existing text
  scroll.insertBefore(card, scroll.firstChild);
}

// ---- WWW/WEB — Web link card -----------------------------------------------

function upgradeWebStep(step) {
  if (step.dataset.webUpgraded) return;
  step.dataset.webUpgraded = '1';

  const detail = step.querySelector('.process-step-detail');
  if (!detail) return;

  const scroll = detail.querySelector('.process-step-detail-scroll') || detail;

  // Look for a URL in kvps or raw text
  let url = '';
  let statusCode = null;

  step.querySelectorAll('.step-kvp').forEach(kvp => {
    const k = kvp.querySelector('.step-kvp-key');
    const v = kvp.querySelector('.step-kvp-value');
    if (!k || !v) return;
    if (/url|link|href|uri/i.test(k.textContent)) url = v.textContent.trim();
    if (/status|code/i.test(k.textContent)) statusCode = parseInt(v.textContent.trim(), 10) || null;
  });

  if (!url) {
    const m = scroll.textContent.match(/https?:\/\/[^\s"'>]+/);
    if (m) url = m[0];
  }

  if (!url) return; // nothing to upgrade

  let statusClass = '';
  let statusLabel = '';
  if (statusCode) {
    if (statusCode < 300)      { statusClass = 'status-ok';    statusLabel = String(statusCode); }
    else if (statusCode < 400) { statusClass = 'status-redir'; statusLabel = String(statusCode); }
    else                       { statusClass = 'status-err';   statusLabel = String(statusCode); }
  }

  const card = document.createElement('div');
  card.className = 'step-web-card';
  card.innerHTML = `
    <span class="step-web-icon material-symbols-outlined">language</span>
    <a class="step-web-url" href="${escHtml(url)}" target="_blank" rel="noopener">${escHtml(url)}</a>
    ${statusLabel ? `<span class="step-web-status ${statusClass}">${escHtml(statusLabel)}</span>` : ''}
  `;

  scroll.insertBefore(card, scroll.firstChild);
}

// ---- WRN/ERR — Callout cards -----------------------------------------------

function upgradeWarnErrStep(step, type) {
  if (step.dataset.warnUpgraded) return;
  step.dataset.warnUpgraded = '1';

  const detail = step.querySelector('.process-step-detail');
  if (!detail) return;

  const scroll = detail.querySelector('.process-step-detail-scroll') || detail;
  const text   = scroll.textContent.trim();
  if (!text) return;

  const isErr  = type === 'error';
  const cls    = isErr ? 'step-error-callout' : 'step-warning-callout';
  const icon   = isErr ? '\u274c' : '\u26a0\ufe0f';

  const callout = document.createElement('div');
  callout.className = cls;
  callout.innerHTML = `
    <span class="callout-icon" aria-hidden="true">${icon}</span>
    <span class="callout-text"></span>
  `;
  callout.querySelector('.callout-text').textContent = text;

  // Wrap existing children
  const existing = Array.from(scroll.childNodes);
  existing.forEach(n => n.remove());
  scroll.appendChild(callout);
}

// ---- GEN — Thinking dots on active steps -----------------------------------

function upgradeGenStep(step) {
  if (step.dataset.genUpgraded) return;
  step.dataset.genUpgraded = '1';

  const titleEl = step.querySelector('.step-title');
  if (!titleEl) return;

  // If it has shiny-text it is still streaming — add dots
  if (titleEl.classList.contains('shiny-text')) {
    if (!titleEl.nextElementSibling?.classList.contains('step-thinking-dots')) {
      const dots = document.createElement('span');
      dots.className = 'step-thinking-dots';
      dots.innerHTML = '<span></span><span></span><span></span>';
      titleEl.after(dots);

      // Remove dots when streaming ends (shiny-text removed)
      const obs = new MutationObserver(() => {
        if (!titleEl.classList.contains('shiny-text')) {
          dots.remove();
          obs.disconnect();
        }
      });
      obs.observe(titleEl, { attributes: true, attributeFilter: ['class'] });
    }
  }
}

// ---- Dispatch per step type ------------------------------------------------

function upgradeStep(step) {
  const badge = step.querySelector('.step-badge');
  if (!badge) return;

  const type = (badge.className.match(/\b(GEN|END|USE|MCP|SUB|RES|EXE|WWW|WEB|HDL|INF|HNT|SKL|WRN|ERR|UTL)\b/) || [])[1];

  switch (type) {
    case 'EXE': upgradeTerminalStep(step); break;
    case 'SKL': upgradeSkillStep(step);    break;
    case 'WWW':
    case 'WEB': upgradeWebStep(step);      break;
    case 'WRN': upgradeWarnErrStep(step, 'warning'); break;
    case 'ERR': upgradeWarnErrStep(step, 'error');   break;
    case 'GEN': upgradeGenStep(step);      break;
    default:    break;
  }
}

// ---- Public API ------------------------------------------------------------

export function upgradeAllSteps() {
  document.querySelectorAll('.process-step').forEach(upgradeStep);
}

// ---- MutationObserver — auto-upgrade new steps as they appear -------------

const _observer = new MutationObserver((mutations) => {
  for (const mut of mutations) {
    for (const node of mut.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.classList.contains('process-step')) {
        upgradeStep(node);
      } else {
        node.querySelectorAll?.('.process-step').forEach(upgradeStep);
      }
    }
  }
});

export function startStepObserver() {
  const chatHistory = document.getElementById('chat-history');
  if (chatHistory) {
    _observer.observe(chatHistory, { childList: true, subtree: true });
  }
}

// Auto-start when module is imported
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    upgradeAllSteps();
    startStepObserver();
  });
} else {
  upgradeAllSteps();
  startStepObserver();
}
