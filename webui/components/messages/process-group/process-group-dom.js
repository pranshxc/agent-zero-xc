/**
 * Process group DOM utilities
 * REDESIGN: Steps default to EXPANDED (persistent), never auto-collapse.
 * The detail panels are always visible — user sees every action the agent takes.
 */
import { store as preferencesStore } from "/components/sidebar/bottom/preferences/preferences-store.js";

export function applyModeSteps(detailMode, showUtils) {
  const mode =
    detailMode ||
    preferencesStore.detailMode ||
    "expanded"; // Default changed to expanded — steps are persistent

  const chatHistory = document.getElementById("chat-history");
  if (!chatHistory) return;

  chatHistory.dataset.detailMode = mode;

  // In the redesign: collapsed mode still shows group header but ALL steps
  // are individually expanded (detail panels always visible)
  const shouldExpand = mode !== "collapsed";
  const messages = chatHistory.querySelectorAll(".process-group");

  for (let i = 0; i < messages.length; i += 1) {
    messages[i].classList.toggle("expanded", shouldExpand);

    // REDESIGN: ALL steps always expanded regardless of mode
    // This is the "Linux as a Tool" principle — nothing hidden in background
    const steps = messages[i].querySelectorAll(".process-step");
    for (let si = 0; si < steps.length; si += 1) {
      // Always expand step details — persistent steps design
      steps[si].classList.add("expanded");

      // Add step number to icon wrap for the step counter badge
      const iconWrap = steps[si].querySelector(".step-icon-wrap");
      if (iconWrap && !iconWrap.dataset.stepNum) {
        iconWrap.dataset.stepNum = String(si + 1);
      }
    }
  }
}

/**
 * Called when a new step is added — ensures it is immediately expanded
 * and numbered correctly.
 */
export function expandNewStep(stepEl, stepIndex) {
  if (!stepEl) return;
  stepEl.classList.add("expanded");

  const iconWrap = stepEl.querySelector(".step-icon-wrap");
  if (iconWrap) {
    iconWrap.dataset.stepNum = String(stepIndex + 1);
  }
}
