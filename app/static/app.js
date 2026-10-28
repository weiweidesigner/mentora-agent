const form = document.querySelector("#chatForm");
const input = document.querySelector("#question");
const button = document.querySelector("#submitButton");
const attachButton = document.querySelector("#attachButton");
const imageInput = document.querySelector("#imageInput");
const attachmentPreview = document.querySelector("#attachmentPreview");
const composerBox = document.querySelector(".composerBox");
const reasoningStrengthControl = document.querySelector("#reasoningStrengthControl");
const reasoningStrengthButton = document.querySelector("#reasoningStrengthButton");
const reasoningStrengthLabel = document.querySelector("#reasoningStrengthLabel");
const reasoningStrengthPopover = document.querySelector("#reasoningStrengthPopover");
const reasoningStrengthPopoverLabel = document.querySelector("#reasoningStrengthPopoverLabel");
const reasoningStrengthSlider = document.querySelector("#reasoningStrengthSlider");
const reasoningStrengthHomeAnchor = document.createComment("reasoning selector home");
reasoningStrengthControl?.before(reasoningStrengthHomeAnchor);
const messages = document.querySelector("#messages");
const generationScrollFollow = window.createGenerationScrollFollow?.(messages);
const shell = document.querySelector(".shell");
const conversation = document.querySelector(".conversation");
const activityDrawer = document.querySelector("#activityDrawer");
const activityBody = document.querySelector("#activityBody");
const activityLabel = document.querySelector("#activityLabel");
const activityElapsed = document.querySelector("#activityElapsed");
const activityClose = document.querySelector("#activityClose");
const sidebar = document.querySelector("#appSidebar");
const sidebarToggle = document.querySelector("#sidebarToggle");
const sidebarCollapseButton = document.querySelector("#sidebarCollapseButton");
const brandHomeButton = document.querySelector("#brandHomeButton");
const newChatButton = document.querySelector("#newChatButton");
const railNewChat = document.querySelector("#railNewChat");
const themeModeControl = document.querySelector("#themeModeControl");
const historyList = document.querySelector("#historyList");
const sessionMenu = document.querySelector("#sessionMenu");
const renameSessionButton = document.querySelector("#renameSessionButton");
const deleteSessionButton = document.querySelector("#deleteSessionButton");
const deleteDialog = document.querySelector("#deleteDialog");
const deleteMessage = document.querySelector("#deleteMessage");
const cancelDeleteButton = document.querySelector("#cancelDeleteButton");
const confirmDeleteButton = document.querySelector("#confirmDeleteButton");
const shareDialog = document.querySelector("#shareDialog");
const shareCloseButton = document.querySelector("#shareCloseButton");
const sharePreviewTitle = document.querySelector("#sharePreviewTitle");
const sharePreviewIframe = document.querySelector("#sharePreviewIframe");
const saveShareImageButton = document.querySelector("#saveShareImageButton");
const saveShareImageText = document.querySelector("#saveShareImageText");
const copyShareLinkButton = document.querySelector("#copyShareLinkButton");
const copyShareLinkText = document.querySelector("#copyShareLinkText");
const generatedImageDialog = document.querySelector("#generatedImageDialog");
const generatedImageFull = document.querySelector("#generatedImageFull");
const generatedImageClose = document.querySelector("#generatedImageClose");
let generatedImageTrigger = null;

function openGeneratedImagePreview(source, trigger) {
  if (!generatedImageDialog || !generatedImageFull) return;
  generatedImageTrigger = trigger;
  generatedImageFull.src = source;
  generatedImageDialog.showModal();
}

generatedImageClose?.addEventListener("click", () => generatedImageDialog?.close());
generatedImageDialog?.addEventListener("click", (event) => {
  if (event.target === generatedImageDialog) generatedImageDialog.close();
});
generatedImageDialog?.addEventListener("close", () => {
  generatedImageFull.removeAttribute("src");
  generatedImageTrigger?.focus();
  generatedImageTrigger = null;
});

let activeController = null;
let scrollHintFrame = 0;
let activityAutoFollow = true;
let activeActivityArticle = null;
let currentSession = null;
let volatileSessions = null;
let lastQuestion = "";
let activeMenuSessionId = null;
let pendingDeleteSessionId = null;
let activeShareSession = null;
let pendingImages = [];

const SESSION_STORAGE_KEY = "aime-chart-sessions-v1";
let serverSessionReady = null;
const THEME_STORAGE_KEY = "aime-chart-theme-v1";
const SUPPORTED_FRAMEWORKS = new Set(["deepseek", "codex"]);
const DEFAULT_REASONING_FRAMEWORK = SUPPORTED_FRAMEWORKS.has(window.AIME_CHAT_CONFIG?.reasoningFramework)
  ? window.AIME_CHAT_CONFIG.reasoningFramework : "deepseek";
const DEFAULT_INFERENCE_MODEL = "deepseek-flash";
const REASONING_EFFORT_STORAGE_KEY = "mentora-reasoning-effort-v1";
const REASONING_EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "ultra"];
const REASONING_EFFORT_LABELS = {
  low: "轻度",
  medium: "中",
  high: "高",
  xhigh: "极高",
  ultra: "Ultra",
};
let currentReasoningEffort = (() => {
  try {
    const stored = String(localStorage.getItem(REASONING_EFFORT_STORAGE_KEY) || "").toLowerCase();
    return REASONING_EFFORT_LEVELS.includes(stored) ? stored : "low";
  } catch {
    return "low";
  }
})();
const storedThemeMode = (() => {
  try { return localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark"; }
  catch { return "dark"; }
})();

function applyReasoningEffort(value, { persist = true } = {}) {
  const effort = REASONING_EFFORT_LEVELS.includes(String(value).toLowerCase())
    ? String(value).toLowerCase()
    : "low";
  const index = REASONING_EFFORT_LEVELS.indexOf(effort);
  const label = REASONING_EFFORT_LABELS[effort];
  currentReasoningEffort = effort;
  if (reasoningStrengthLabel) reasoningStrengthLabel.textContent = label;
  if (reasoningStrengthPopoverLabel) reasoningStrengthPopoverLabel.textContent = label;
  if (reasoningStrengthSlider) {
    reasoningStrengthSlider.value = String(index);
    reasoningStrengthSlider.setAttribute("aria-valuetext", label);
    reasoningStrengthSlider.parentElement.style.setProperty("--strength-progress", `calc(${index * 25}% + ${16 - index * 8}px)`);
    reasoningStrengthSlider.parentElement.querySelectorAll(".reasoningStrengthDots span").forEach((dot, dotIndex) => {
      dot.classList.toggle("is-filled", dotIndex <= index);
    });
  }
  if (currentSession) currentSession.reasoningEffort = effort;
  if (persist) {
    try { localStorage.setItem(REASONING_EFFORT_STORAGE_KEY, effort); }
    catch { /* Storage can be unavailable in privacy mode. */ }
  }
}

function setReasoningStrengthPopover(open) {
  const isOpen = Boolean(open);
  if (reasoningStrengthPopover) reasoningStrengthPopover.hidden = !isOpen;
  reasoningStrengthControl?.classList.toggle("is-open", isOpen);
  reasoningStrengthButton?.setAttribute("aria-expanded", String(isOpen));
  if (isOpen) requestAnimationFrame(() => reasoningStrengthSlider?.focus({ preventScroll: true }));
}

function syncReasoningStrengthComposer() {
  const target = document.querySelector('.portfolioWorkspace:not([hidden]) .pfIdeaComposer')
    || document.querySelector('#widgetWorkspace:not([hidden]) .widgetComposerBox')
    || reasoningStrengthHomeAnchor.parentElement;
  if (!target || !reasoningStrengthControl || reasoningStrengthControl.parentElement === target) return;
  setReasoningStrengthPopover(false);
  const send = target.querySelector('.pfIdeaSubmit, #widgetGenerate');
  if (send) send.before(reasoningStrengthControl);
  else reasoningStrengthHomeAnchor.after(reasoningStrengthControl);
  const textarea = target.querySelector('textarea');
  if (textarea && typeof resizeComposerInput === 'function') resizeComposerInput(textarea, target);
}

reasoningStrengthButton?.addEventListener("click", () => {
  setReasoningStrengthPopover(reasoningStrengthPopover?.hidden !== false);
});

let reasoningPreferenceRevision = 0;
let reasoningPreferenceTimer;
let reasoningPreferenceWrites = Promise.resolve();

function reportReasoningSyncError() {
  const hint = reasoningStrengthControl?.querySelector('.reasoningStrengthHint');
  if (hint) hint.textContent = '定时任务推理强度同步失败，请重新选择';
  reasoningStrengthButton?.setAttribute('title', '定时任务推理强度同步失败，请重新选择');
}

function saveGlobalReasoningEffort(effort) {
  reasoningPreferenceWrites = reasoningPreferenceWrites.catch(() => {}).then(async () => {
    const response = await fetch('/api/day/execution-preferences', {
      method: 'PUT',
      headers: {'Content-Type': 'application/json', 'X-Veya-Day': '1'},
      body: JSON.stringify({reasoningEffort: effort}),
    });
    if (!response.ok) throw new Error('Reasoning preference sync failed');
    const hint = reasoningStrengthControl?.querySelector('.reasoningStrengthHint');
    if (hint) hint.textContent = '思考强度 · 同步定时任务';
    reasoningStrengthButton?.setAttribute('title', '思考强度 · 同步定时任务');
  }).catch(reportReasoningSyncError);
  return reasoningPreferenceWrites;
}

async function loadGlobalReasoningEffort() {
  const revision = reasoningPreferenceRevision;
  try {
    const response = await fetch('/api/day/execution-preferences', {cache: 'no-store'});
    if (!response.ok) throw new Error('Reasoning preference unavailable');
    const preferences = await response.json();
    if (revision !== reasoningPreferenceRevision) return;
    if (REASONING_EFFORT_LEVELS.includes(preferences.reasoningEffort)) {
      applyReasoningEffort(preferences.reasoningEffort);
    } else {
      await saveGlobalReasoningEffort(currentReasoningEffort);
    }
  } catch {
    reportReasoningSyncError();
  }
}

reasoningStrengthSlider?.addEventListener("input", () => {
  applyReasoningEffort(REASONING_EFFORT_LEVELS[Number(reasoningStrengthSlider.value)] || "low");
  reasoningPreferenceRevision += 1;
  clearTimeout(reasoningPreferenceTimer);
  const effort = currentReasoningEffort;
  reasoningPreferenceTimer = setTimeout(() => { void saveGlobalReasoningEffort(effort); }, 120);
});

document.addEventListener("pointerdown", (event) => {
  if (!reasoningStrengthControl?.classList.contains("is-open")) return;
  if (!reasoningStrengthControl.contains(event.target)) setReasoningStrengthPopover(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Tab" && activityDrawer?.getAttribute("aria-modal") === "true") {
    const controls = Array.from(activityDrawer.querySelectorAll('button, a[href], summary, [tabindex="0"]')).filter((node) => node.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  if (event.key !== "Escape" || !reasoningStrengthControl?.classList.contains("is-open")) return;
  setReasoningStrengthPopover(false);
  reasoningStrengthButton?.focus({ preventScroll: true });
});

applyReasoningEffort(currentReasoningEffort, { persist: false });
void loadGlobalReasoningEffort();

function currentThemeMode() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function applyThemeMode(mode, { persist = true } = {}) {
  const theme = mode === "dark" ? "dark" : "light";
  const previous = currentThemeMode();
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  if (themeModeControl) {
    const label = theme === "dark" ? "切换到浅色模式" : "切换到深色模式";
    themeModeControl.setAttribute("aria-pressed", String(theme === "dark"));
    themeModeControl.setAttribute("aria-label", label);
    themeModeControl.title = label;
  }
  if (persist) localStorage.setItem(THEME_STORAGE_KEY, theme);
  if (currentSession) {
    currentSession.themeMode = theme;
    currentSession.updatedAt = Date.now();
  }
  if (activeShareSession) activeShareSession.themeMode = theme;
  if (previous !== theme) {
    window.dispatchEvent(new CustomEvent("aime:theme-change", { detail: { mode: theme } }));
    syncReportFrameThemes(theme);
  }
}

applyThemeMode(storedThemeMode, { persist: false });
const SHARE_ICON = `<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M470.109091 190.836364L339.781818 325.818182c-9.309091 9.309091-27.927273 13.963636-41.890909 13.963636s-27.927273-18.618182-32.581818-32.581818c-4.654545-13.963636 0-32.581818 13.963636-41.890909l195.490909-200.145455c23.272727-23.272727 60.509091-23.272727 83.781819 0l200.145454 200.145455c9.309091 9.309091 13.963636 27.927273 9.309091 41.890909s-13.963636 27.927273-32.581818 32.581818c-13.963636 4.654545-32.581818 0-41.890909-9.309091l-134.981818-139.636363v549.236363c0 23.272727-18.618182 41.890909-41.89091 41.890909s-41.890909-18.618182-41.890909-41.890909V190.836364z m423.563636 335.127272c0-23.272727 18.618182-41.890909 41.890909-41.890909s41.890909 18.618182 41.890909 41.890909V791.272727c0 107.054545-83.781818 190.836364-186.181818 190.836364H232.727273c-102.4 0-186.181818-83.781818-186.181818-190.836364v-265.309091c0-23.272727 18.618182-41.890909 41.890909-41.890909s41.890909 18.618182 41.890909 41.890909V791.272727c0 55.854545 41.890909 102.4 97.745454 102.4H791.272727c55.854545 0 97.745455-46.545455 97.745455-102.4v-265.309091z"></path><path d="M795.927273 986.763636H232.727273c-107.054545 0-195.490909-88.436364-195.490909-200.145454v-265.309091c0-27.927273 23.272727-51.2 51.2-51.2s51.2 23.272727 51.2 51.2v265.309091c0 51.2 41.890909 93.090909 88.436363 93.090909H791.272727c46.545455 0 88.436364-41.890909 88.436364-93.090909v-265.309091c0-27.927273 23.272727-51.2 51.2-51.2 27.927273 0 51.2 23.272727 51.2 51.2v265.309091c9.309091 111.709091-79.127273 200.145455-186.181818 200.145454zM88.436364 488.727273c-18.618182 0-32.581818 13.963636-32.581819 32.581818v265.309091c0 97.745455 79.127273 181.527273 176.872728 181.527273h563.2c97.745455 0 176.872727-79.127273 176.872727-181.527273v-265.309091c0-18.618182-13.963636-32.581818-32.581818-32.581818-18.618182 0-32.581818 13.963636-32.581818 32.581818v265.309091c0 60.509091-46.545455 111.709091-107.054546 111.709091H232.727273c-60.509091 0-107.054545-51.2-107.054546-111.709091v-265.309091c0-18.618182-13.963636-32.581818-37.236363-32.581818zM512 791.272727c-27.927273 0-51.2-23.272727-51.2-51.2V214.109091L349.090909 330.472727c-13.963636 13.963636-32.581818 23.272727-51.2 18.618182-18.618182-4.654545-37.236364-23.272727-41.890909-41.890909-4.654545-18.618182 0-37.236364 13.963636-51.2L465.454545 60.509091c27.927273-27.927273 69.818182-27.927273 97.745455 0l200.145455 200.145454c13.963636 13.963636 18.618182 32.581818 13.963636 51.2-4.654545 18.618182-18.618182 32.581818-37.236364 37.236364-18.618182 4.654545-37.236364 0-51.2-13.963636l-121.018182-121.018182v525.963636c0 27.927273-23.272727 51.2-55.854545 51.2z m-32.581818-623.709091v572.509091c0 18.618182 13.963636 32.581818 32.581818 32.581818s32.581818-13.963636 32.581818-32.581818V167.563636L698.181818 316.509091c9.309091 9.309091 23.272727 13.963636 32.581818 9.309091 13.963636 0 23.272727-9.309091 27.927273-23.272727 4.654545-13.963636 0-23.272727-9.309091-32.581819l-200.145454-200.145454c-18.618182-18.618182-51.2-18.618182-69.818182 0L283.927273 269.963636c-9.309091 9.309091-13.963636 23.272727-9.309091 32.581819 4.654545 13.963636 13.963636 23.272727 23.272727 27.927272 13.963636 0 27.927273-4.654545 37.236364-9.309091l144.290909-153.6z"></path></svg>`;
const COPY_MESSAGE_ICON = `<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M230.4 665.6a25.6 25.6 0 1 1 0 51.2h-102.4A128 128 0 0 1 0 588.8v-460.8A128 128 0 0 1 128 0h460.8A128 128 0 0 1 716.8 128v102.4a25.6 25.6 0 1 1-51.2 0v-102.4A76.8 76.8 0 0 0 588.8 51.2h-460.8A76.8 76.8 0 0 0 51.2 128v460.8A76.8 76.8 0 0 0 128 665.6h102.4z m204.8-307.2A76.8 76.8 0 0 0 358.4 435.2v460.8A76.8 76.8 0 0 0 435.2 972.8h460.8a76.8 76.8 0 0 0 76.8-76.8v-460.8A76.8 76.8 0 0 0 896 358.4h-460.8z m0-51.2h460.8A128 128 0 0 1 1024 435.2v460.8a128 128 0 0 1-128 128h-460.8A128 128 0 0 1 307.2 896v-460.8A128 128 0 0 1 435.2 307.2z"></path></svg>`;
const EDIT_MESSAGE_ICON = `<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M609.240615 236.347077l1.732923 0.157538 1.772308 0.196923 1.693539 0.315077 1.693538 0.354462 1.693539 0.472615 1.654153 0.551385 1.61477 0.630154 1.575384 0.669538 1.536 0.787693 1.496616 0.866461 1.45723 0.905846 1.457231 1.024 1.378462 1.063385 1.299692 1.181538 1.299692 1.220923 101.179077 101.218462 1.220923 1.299692 1.142154 1.339077 1.102769 1.339077 0.984616 1.457231 0.945231 1.457231 0.866461 1.496615 0.748308 1.536 0.708923 1.575385 0.630154 1.614769 0.551384 1.654154 0.433231 1.654154 0.393846 1.693538 0.315077 1.732923 0.196923 1.732923 0.118154 1.772308 0.039385 1.772308-0.039385 1.772307-0.118154 1.772308-0.196923 1.732923-0.315077 1.732923-0.393846 1.693539-0.433231 1.654153-0.551384 1.654154-0.630154 1.614769-0.708923 1.575385-0.748308 1.536-0.866461 1.536-0.945231 1.457231-0.984616 1.417846-1.102769 1.378462-1.142154 1.339076-1.220923 1.299693-79.950769 79.990154-0.039385 0.039384-0.039384 0.039385-198.262154 198.340923-0.669539 0.630154-0.669538 0.630154-0.708923 0.551384-0.708923 0.551385-0.708923 0.512-0.787693 0.512-0.748307 0.433231-0.787693 0.43323-0.827076 0.433231-0.787693 0.354462-0.866461 0.354461-0.827077 0.275693-0.866462 0.275692-0.866461 0.275692-0.866462 0.196923-0.905846 0.157539-143.36 25.324307-1.063385 0.157539-1.024 0.118154-0.984615 0.039384-1.024 0.039385-1.142154-0.039385-1.181538-0.078769-1.142154-0.118154-1.142154-0.196923-1.102769-0.275692-1.142154-0.315077-1.102769-0.354462-1.063385-0.393846-1.063385-0.472615-1.024-0.512-1.024-0.590769-0.984615-0.59077-0.945231-0.669538-0.905846-0.748308-0.905846-0.748307-0.866462-0.827077-0.984615-1.024-0.905846-1.10277-0.827077-1.142153-0.787692-1.220924-0.669539-1.220923-0.630154-1.260307-0.551384-1.299693-0.472616-1.339077-0.354461-1.339076-0.315077-1.378462-0.236308-1.378462-0.118154-1.417846-0.078769-1.417846 0.039385-1.417846 0.118154-1.417846 0.196923-1.417846 25.324307-143.43877 0.196923-0.905846 0.196924-0.866461 0.236307-0.866462 0.275693-0.866461 0.315076-0.866462 0.315077-0.827077 0.393847-0.827077 0.393846-0.787692 0.43323-0.787692 0.472616-0.787693 0.472615-0.748307 0.512-0.748308 0.551385-0.708923 0.590769-0.669539 0.590769-0.708923 0.630154-0.630153 278.291692-278.449231 1.299693-1.220923 1.339077-1.142154 1.378461-1.063385 1.417846-1.024 1.457231-0.905846 1.536-0.866461 1.536-0.787693 1.575385-0.708923 1.614769-0.590769 1.654154-0.551385 1.654154-0.472615 1.693538-0.354462 1.693539-0.315077 1.732923-0.196923 1.772307-0.157538 1.811693-0.039385 1.772307 0.039385z m-266.555077 316.928l-18.195692 102.872615 102.833231-18.156307 3.190154-3.15077 173.174154-173.252923-84.676923-84.716307-176.324924 176.403692z m209.723077-209.801846l84.676923 84.716307 55.020308-55.059692-84.676923-84.716308-55.020308 55.059693z"></path></svg>`;
const CHECK_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.3 4.1L19 6.8" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
const COMPLETE_ICON = `<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M512 1024C229.677176 1024 0 794.322824 0 512 0 229.677176 229.677176 0 512 0 794.322824 0 1024 229.677176 1024 512c0 282.322824-229.677176 512-512 512z m0-963.764706C262.866824 60.235294 60.235294 262.866824 60.235294 512 60.235294 761.072941 262.866824 963.764706 512 963.764706S963.764706 761.072941 963.764706 512C963.764706 262.866824 761.133176 60.235294 512 60.235294z m-34.876235 634.157177a31.744 31.744 0 0 1-22.648471 9.577411h-0.180706a32.225882 32.225882 0 0 1-22.64847-9.33647l-166.249412-166.249412a31.924706 31.924706 0 1 1 45.236706-45.236706l143.420235 143.36 259.072-264.854588a31.924706 31.924706 0 1 1 45.718588 44.694588l-281.72047 288.045177z" fill="currentColor"></path></svg>`;
const ANALYZE_IMAGE_ICON = `<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M841.71335 65.290005 182.285626 65.290005c-64.511269 0-116.995621 52.484352-116.995621 116.995621L65.290005 841.71335c0 64.511269 52.484352 116.995621 116.995621 116.995621l659.427724 0c64.511269 0 116.995621-52.484352 116.995621-116.995621L958.708971 182.285626C958.708971 117.774357 906.225643 65.290005 841.71335 65.290005zM182.285626 107.833961l659.427724 0c41.051975 0 74.451666 33.398668 74.451666 74.451666l0 136.557142c-150.09446 5.26184-290.370297 66.084091-396.978337 172.692131-49.960879 49.961902-89.841168 107.331517-118.694309 169.625282-83.496669-70.835302-204.372667-75.376735-292.65841-13.617136L107.833961 182.285626C107.833961 141.232628 141.232628 107.833961 182.285626 107.833961zM107.833961 841.71335 107.833961 702.627618c76.54228-74.311473 198.833511-74.234725 275.272437 0.24457-24.303522 65.298192-37.026288 135.112234-37.026288 206.91149 0 2.223644 0.343831 4.366448 0.977257 6.381337L182.285626 916.165016C141.232628 916.165016 107.833961 882.766348 107.833961 841.71335zM841.71335 916.165016 387.646807 916.165016c0.633427-2.01489 0.977257-4.157693 0.977257-6.381337 0-146.71755 57.053414-284.572244 160.647817-388.166647 98.570993-98.570993 228.166583-154.963351 366.894158-160.204725L916.166039 841.71335C916.165016 882.766348 882.766348 916.165016 841.71335 916.165016z" fill="currentColor"></path><path d="M312.397986 413.458683c60.8376 0 110.332874-49.494251 110.332874-110.332874s-49.494251-110.332874-110.332874-110.332874-110.332874 49.494251-110.332874 110.332874S251.559363 413.458683 312.397986 413.458683zM312.397986 235.337913c37.378306 0 67.788919 30.40959 67.788919 67.788919s-30.40959 67.788919-67.788919 67.788919-67.788919-30.40959-67.788919-67.788919S275.018657 235.337913 312.397986 235.337913z" fill="currentColor"></path></svg>`;
const SEARCH_GLOBE_ICON = `<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M171.861333 540.444444a341.560889 341.560889 0 0 0 252.586667 301.568c-38.684444-66.616889-65.024-176.071111-68.494222-301.568H171.861333z m0-56.888888h184.092445c3.470222-125.496889 29.809778-234.951111 68.437333-301.568A341.560889 341.560889 0 0 0 171.861333 483.555556z m680.277334 0a341.560889 341.560889 0 0 0-252.586667-301.568c38.684444 66.616889 65.024 176.071111 68.494222 301.568h184.092445z m0 56.888888h-184.092445c-3.470222 125.496889-29.809778 234.951111-68.437333 301.568A341.560889 341.560889 0 0 0 852.138667 540.444444z m-439.239111-56.888888h198.257777C605.639111 306.346667 550.456889 170.666667 512 170.666667S418.360889 306.346667 412.899556 483.555556z m198.200888 56.888888H412.899556C418.360889 717.653333 473.543111 853.333333 512 853.333333s93.639111-135.68 99.100444-312.888889zM512 910.222222A398.222222 398.222222 0 1 1 512 113.777778a398.222222 398.222222 0 0 1 0 796.444444z" fill="currentColor"></path></svg>`;
const SOURCE_ARROW_RIGHT = `<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M640 213.333333l-60.16 60.16L775.253333 469.333333H85.333333v85.333334h689.92l-195.84 195.84L640 810.666667l298.666667-298.666667-298.666667-298.666667z" fill="currentColor"></path></svg>`;
const SOURCE_ARROW_LEFT = `<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M384 810.666667l60.16-60.16L248.746667 554.666667H938.666667v-85.333334H248.746667l195.84-195.84L384 213.333333l-298.666667 298.666667 298.666667 298.666667z" fill="currentColor"></path></svg>`;

function isEditableTarget(target) {
  return Boolean(
    target?.closest?.("input, textarea, [contenteditable='true'], [contenteditable='']"),
  );
}

document.addEventListener("copy", (event) => {
  if (!isEditableTarget(event.target)) event.preventDefault();
});
document.addEventListener("cut", (event) => {
  if (!isEditableTarget(event.target)) event.preventDefault();
});
document.addEventListener("selectstart", (event) => {
  if (!isEditableTarget(event.target)) event.preventDefault();
});

messages.addEventListener('scroll', scheduleScrollHint, {passive:true});
document.querySelector('#scrollToBottomButton')?.addEventListener('click', () => {
  generationScrollFollow?.resume();
  scrollToLatestContent(matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
});
// Growth follows the current generation until the reader takes control.
if (typeof ResizeObserver !== 'undefined') {
  const observed = new Set();
  const changed = () => { scheduleScrollHint(); generationScrollFollow?.changed(); };
  const resize = new ResizeObserver(changed);
  resize.observe(messages);
  const watch = () => {
    for (const node of observed) if (node.parentElement !== messages) { resize.unobserve(node); observed.delete(node); }
    for (const node of messages.children) if (!observed.has(node)) { observed.add(node); resize.observe(node); }
    messages.querySelectorAll('iframe').forEach(frame => generationScrollFollow?.watchFrame(frame));
    changed();
  };
  new MutationObserver(watch).observe(messages, {subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['style','class','hidden','data-thinking-state']});
  watch();
}
window.addEventListener('resize', scheduleScrollHint, {passive:true});

activityBody?.addEventListener(
  "scroll",
  () => {
    activityAutoFollow = isActivityNearBottom();
  },
  { passive: true },
);

const mobileShellQuery = window.matchMedia("(max-width: 760px)");

function isMobileLayout() {
  return mobileShellQuery.matches;
}

function setSidebarCollapsed(collapsed) {
  shell.classList.toggle("sidebar-collapsed", collapsed);
  shell.classList.toggle("sidebar-open", !collapsed);
  sidebarToggle?.setAttribute("aria-label", collapsed ? "展开侧边栏" : "收起侧边栏");
}

function syncResponsiveShell() {
  setSidebarCollapsed(isMobileLayout());
}

syncResponsiveShell();
mobileShellQuery.addEventListener?.("change", () => {
  syncResponsiveShell();
  if (isMobileLayout()) {
    const expanded = Array.from(document.querySelectorAll('.message.assistant[data-activity-inline-expanded="true"]'));
    const current = expanded.filter((article) => !article.querySelector(".thinkingFlow")?.hidden).at(-1);
    expanded.forEach((article) => {
      syncInlineActivity(article);
      article.querySelector(".thinkingTrigger")?.setAttribute("aria-expanded", "false");
    });
    if (current && !activeActivityArticle) openActivityDrawer(current);
  }
  if (!activeActivityArticle || !activityDrawer?.classList.contains("is-open")) return;
  if (isMobileLayout()) openActivityDrawer(activeActivityArticle);
  else {
    const article = activeActivityArticle;
    closeActivityDrawer();
    setInlineActivityExpanded(article, true);
  }
});

renderHistory();
serverSessionReady = syncServerSessions();
window.addEventListener("focus", () => { void syncServerSessions(); });
setInterval(() => {
  if (loadSessions().some((session) => session.activeRunId || ["queued", "running"].includes(session.status))) void syncServerSessions();
}, 5000);
restoreSharedSessionFromUrl();

sidebarToggle?.addEventListener("click", () => {
  const isCollapsed = shell.classList.toggle("sidebar-collapsed");
  shell.classList.toggle("sidebar-open", !isCollapsed);
  sidebarToggle.setAttribute("aria-label", isCollapsed ? "展开侧边栏" : "收起侧边栏");
});

sidebarCollapseButton?.addEventListener("click", () => setSidebarCollapsed(true));

[newChatButton, railNewChat].forEach((control) => {
  control?.addEventListener("click", () => {
    startNewChat(true);
    if (isMobileLayout()) setSidebarCollapsed(true);
  });
});

themeModeControl?.addEventListener("click", () => {
  applyThemeMode(currentThemeMode() === "dark" ? "light" : "dark");
});


brandHomeButton?.addEventListener("click", () => {
  startNewChat(true);
  if (isMobileLayout()) setSidebarCollapsed(true);
});

document.querySelector(".mobileBrand")?.addEventListener("click", () => {
  if (!conversation.classList.contains("is-empty")) startNewChat(false, false);
  setSidebarCollapsed(true);
  requestAnimationFrame(() => conversation.scrollTo({top:0,behavior:"smooth"}));
});
input.addEventListener("input", updateComposerState);
input.addEventListener("keydown", event => handleMessageEnter(event, input, () => {
  if (!button.classList.contains("is-running")) form.requestSubmit();
}));
function handleMessageEnter(event, textarea, send) {
  if (event.key !== "Enter" || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    textarea.setRangeText("\n", textarea.selectionStart, textarea.selectionEnd, "end");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  } else if (!event.repeat) {
    send();
  }
}
attachButton?.addEventListener("click", () => imageInput?.click());
imageInput?.addEventListener("change", async (event) => {
  await addImageFiles(event.target.files);
  event.target.value = "";
});
document.addEventListener("paste", async (event) => {
  if (document.querySelector('#taskWorkspace') && !document.querySelector('#taskWorkspace').hidden) return;
  if (document.querySelector('#widgetWorkspace') && !document.querySelector('#widgetWorkspace').hidden) return;
  const files = Array.from(event.clipboardData?.files || []).filter((file) => file.type.startsWith("image/"));
  if (!files.length) return;
  event.preventDefault();
  await addImageFiles(files);
});
updateComposerState();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (button.classList.contains("is-running")) {
    await stopActiveRun();
    return;
  }
  const question = input.value.trim();
  const images = pendingImages.slice();
  if ((!question && !images.length) || button.disabled) return;

  input.value = "";
  clearPendingImages();
  updateComposerState();
  await submitQuestion(question || "请识别图片并整理信息", { images });
});

function boundedConversationHistory(history) {
  const limit = 8;
  const turns = Array.isArray(history) ? history : [];
  const recent = turns.slice(-limit);
  const anchor = turns.find(turn => turn?.role === 'user');
  // Keep the human's original scope alongside recent follow-ups, without
  // growing the context or promoting assistant text to user instructions.
  return anchor && !recent.includes(anchor) ? [anchor, ...recent.slice(-(limit - 1))] : recent;
}

async function submitQuestion(question, options = {}) {
  const images = Array.isArray(options.images) ? options.images : [];
  lastQuestion = question;
  ensureCurrentSession(question);
  currentSession.themeMode = currentThemeMode();
  if (!String(currentSession.question || "").trim()) currentSession.question = question;
  const framework = DEFAULT_REASONING_FRAMEWORK;
  const model = DEFAULT_INFERENCE_MODEL;
  const reasoningEffort = currentReasoningEffort;
  if (options.replaceSessionQuestion) {
    currentSession.question = question;
    currentSession.messages = [];
  }
  currentSession.messages.push({ role: "user", text: question, images: imageSessionPayload(images) });
  const submittedSession = currentSession;
  submittedSession.reasoningEffort = reasoningEffort;
  submittedSession.status = "queued";
  submittedSession.requestId = `request-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  submittedSession.title = submittedSession.title === "新建对话" ? question.slice(0, 28) : submittedSession.title;
  submittedSession.updatedAt = Date.now();
  saveCurrentSession();
  const userArticle = options.userArticle || addUserMessage(question, { forceScroll: true, images });
  if (options.userArticle) {
    renderUserMessage(userArticle, question);
    removeMessagesAfter(userArticle);
    scrollToLatestContent('auto');
  }
  button.disabled = true;

  const assistant = createAssistantMessage(question);
  showAgentIdentity(assistant, options.agent);
  activeController = new AbortController();
  const controller = activeController;

  try {
    await serverSessionReady;
    const response = await fetch("/api/chat/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        requestId: submittedSession.requestId,
        images: images.map(imageRequestPayload),
        agent: options.agent || '',
        sessionId: submittedSession.id,
        studioSessionId: submittedSession.studioSessionId || null,
        engineSessionId: submittedSession.frameworkSessionIds?.[`${framework}:${model}`] || "",
        reasoningFramework: framework,
        inferenceModel: model,
        reasoningEffort,
        resolvedInferenceModel: "",
        history: boundedConversationHistory(submittedSession.messages.slice(0, -1)),
        sessionTitle: submittedSession.title === "新建对话" ? question : submittedSession.title,
        themeMode: currentThemeMode(),
      }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || "请求失败");
    }
    const run = await response.json();
    applyRunTiming(assistant, "status", run);
    if (run.runStartedAt) submittedSession.thinkingStartedAt = run.runStartedAt;
    submittedSession.activeRunId = run.runId;
    submittedSession.status = "running";
    persistChatSession(submittedSession);
    button.disabled = false;
    updateComposerState();
    if (currentSession?.id === submittedSession.id && !controller.signal.aborted) await followChatRun(submittedSession, assistant, controller);
  } catch (error) {
    if (error.name !== "AbortError" && currentSession?.id === submittedSession.id) {
      if (submittedSession.activeRunId) appendStep(assistant, "后台执行中", "连接已断开，任务继续执行；返回此会话可恢复进度。", "loading", "background-run");
      else showError(assistant, error.message);
    }
  } finally {
    if (activeController === controller) {
      activeController = null;
      button.disabled = false;
      updateComposerState();
      input.focus({preventScroll:true});
    }
  }
}

async function followChatRun(session, article, controller) {
  const response = await fetch(`/api/chat/runs/${encodeURIComponent(session.activeRunId)}/events`, { signal: controller.signal });
  if (!response.ok || !response.body) throw new Error("暂时无法连接后台任务");
  await readEventStream(response.body, (eventName, data) => {
    if (currentSession?.id === session.id && !controller.signal.aborted) handleStreamEvent(article, eventName, data);
  });
}

function persistChatSession(session) {
  const sessions = loadSessions().filter((item) => item.id !== session.id);
  sessions.unshift(session);
  storeSessions(sessions.slice(0, 20));
  renderHistory();
}

function isStaleChatSessionSnapshot(local, remote) {
  if (!local || !['completed', 'failed', 'interrupted'].includes(local.status)
      || !['queued', 'running'].includes(remote.status)) return false;
  // A delayed poll may have a newer wall-clock timestamp, but it cannot move
  // the same run backwards from its terminal state into running again.
  if (local.requestId && remote.requestId) return local.requestId === remote.requestId;
  const localRun = local.activeRunId || local.lastRunId;
  const remoteRun = remote.activeRunId || remote.lastRunId;
  return Boolean(localRun && remoteRun && localRun === remoteRun);
}

async function syncServerSessions() {
  try {
    const response = await fetch("/api/chat/sessions", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    const sessions = new Map(loadSessions().map((session) => [session.id, session]));
    for (const remote of data.sessions || []) {
      if (!isHistoryVisibleSession(remote)) continue;
      const local = sessions.get(remote.id);
      if (isStaleChatSessionSnapshot(local, remote)) continue;
      if (!local || Number(remote.updatedAt) >= Number(local.updatedAt) || (local.activeRunId && !remote.activeRunId)) sessions.set(remote.id, { ...local, ...remote });
    }
    const combined=Array.from(sessions.values()).sort((a,b)=>Number(b.updatedAt)-Number(a.updatedAt));
    storeSessions([...combined.filter(isHistoryVisibleSession).slice(0,20),...combined.filter(session=>!isHistoryVisibleSession(session))]);
    renderHistory();
    const restored = currentSession && sessions.get(currentSession.id);
    if (!activeController && restored && (currentSession.activeRunId || (currentSession.requestId && currentSession.requestId === restored.requestId && currentSession.status !== restored.status))) restoreSession(currentSession.id);
  } catch { /* Browser history remains available while offline. */ }
}

async function resumeChatRun(session, article) {
  applyRunTiming(article, "status", {runStartedAt: session.thinkingStartedAt});
  const controller = new AbortController();
  activeController = controller;
  button.disabled = false;
  updateComposerState();
  try { await followChatRun(session, article, controller); }
  catch (error) {
    if (error.name !== "AbortError" && currentSession?.id === session.id) appendStep(article, "后台执行中", "正在等待连接恢复，任务继续执行。", "loading", "background-run");
  } finally {
    if (activeController === controller) { activeController = null; button.disabled = false; updateComposerState(); }
  }
}

async function stopActiveRun() {
  const session=currentSession;
  const runId=String(session?.activeRunId || "");
  if (!runId || button.classList.contains("is-stopping")) return;
  button.classList.add("is-stopping");
  button.disabled=true;
  try {
    const response=await fetch(`/api/chat/runs/${encodeURIComponent(runId)}/cancel`,{method:"POST"});
    if (!response.ok) throw new Error("停止任务失败");
    const result=await response.json();
    if (result.status !== "interrupted") return;
    activeController?.abort();
    activeController=null;
    if (currentSession?.id === session.id && currentSession.activeRunId === runId) {
      currentSession.status="interrupted";
      currentSession.activeRunId="";
      currentSession.lastRunId=runId;
      currentSession.updatedAt=Date.now();
      currentSession.error="";
      persistChatSession(currentSession);
      const article=Array.from(messages.querySelectorAll(".message.assistant")).at(-1);
      if (article && !article.activityEnded) showStopped(article,"已停止本轮任务");
    }
  } catch (error) {
    button.title=error.message || "停止任务失败";
  } finally {
    button.classList.remove("is-stopping");
    button.disabled=false;
    updateComposerState();
  }
}

activityClose?.addEventListener("click", closeActivityDrawer);
document.addEventListener("toggle", rememberActivityDisclosure, true);
setInterval(() => {
  document.querySelectorAll('.message.assistant[data-thinking-state="active"]').forEach((article) => {
    if (!article.activityEnded && article.isConnected) updateThinkingSummary(article, "", { live: true, clockOnly: true });
  });
}, 1000);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if(typeof closeGeneratedFilePreview==='function')closeGeneratedFilePreview();
    closeShareDialog();
    closeActivityDrawer();
    if (isMobileLayout()) setSidebarCollapsed(true);
  }
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "o") {
    if (isEditableTarget(event.target)) return;
    event.preventDefault();
    startNewChat(true);
  }
});

document.addEventListener("click", (event) => {
  if (!sessionMenu?.hidden && !event.target.closest?.("#sessionMenu, .historyMore")) {
    closeSessionMenu();
  }
  if (
    isMobileLayout()
    && shell?.classList.contains("sidebar-open")
    && !event.target.closest?.("#appSidebar")
  ) {
    setSidebarCollapsed(true);
  }
  if (
    isMobileLayout()
    && activityDrawer?.classList.contains("is-open")
    && !event.target.closest?.("#activityDrawer, .thinkingTrigger, .sourceSummaryTrigger")
  ) {
    closeActivityDrawer();
  }
});

renameSessionButton?.addEventListener("click", () => {
  if (!activeMenuSessionId) return;
  closeSessionMenu();
  beginRenameSession(activeMenuSessionId);
});

deleteSessionButton?.addEventListener("click", () => {
  if (!activeMenuSessionId) return;
  openDeleteDialog(activeMenuSessionId);
});

cancelDeleteButton?.addEventListener("click", closeDeleteDialog);
deleteDialog?.addEventListener("click", (event) => {
  if (event.target === deleteDialog) closeDeleteDialog();
});
confirmDeleteButton?.addEventListener("click", confirmDeleteSession);
shareCloseButton?.addEventListener("click", closeShareDialog);
shareDialog?.addEventListener("click", (event) => {
  if (event.target === shareDialog) closeShareDialog();
});
copyShareLinkButton?.addEventListener("click", copyShareLink);
saveShareImageButton?.addEventListener("click", saveShareImage);
function handleSavedResultAction(event) {
  const favoriteButton = event.target?.closest?.('.favoriteResultButton');
  if (favoriteButton) {
    event.preventDefault();event.stopPropagation();
    window.MentoraCaseFavorites?.open(favoriteButton.closest('.message.assistant'),favoriteButton);
    return;
  }
  const shareButton = event.target?.closest?.(".shareResultButton");
  if (shareButton) {
    event.preventDefault();
    event.stopPropagation();
    const article = shareButton.closest(".message.assistant");
    openShareDialog(article);
    return;
  }
  const sourceButton = event.target?.closest?.(".sourceSummaryTrigger");
  if (sourceButton) {
    event.preventDefault();
    event.stopPropagation();
    const article = sourceButton.closest(".message.assistant");
    if (article) toggleActivityDrawer(article);
    return;
  }
}
messages?.addEventListener("click", handleSavedResultAction);
document.getElementById("taskWorkspace")?.addEventListener("click", handleSavedResultAction);

function createAssistantMessage(question, options = {}) {
  const lang = normalizeLang(detectLanguage(question));
  const article = document.createElement("article");
  article.className = "message assistant";
  article.dataset.startedAt = String(Date.now());
  article.dataset.question = question;
  article.dataset.thinkingState = "active";
  article.dataset.lang = lang;
  article.dataset.currentThinking = copyFor(lang, "thinking");
  article.activitySources = [];
  article.agentEvents = [];
  article.activitySourceCount = 0;
  article.activityEnded = false;
  article.activityStepKeys = new Set();
  article.innerHTML = `
    <div class="bubble assistantBubble">
      <button class="thinkingTrigger is-thinking" type="button" aria-label="查看活动">
        <span class="thinkingSummaryText">${escapeHtml(copyFor(lang, "thinking"))}</span>
        <span class="thinkingChevron" aria-hidden="true"></span>
      </button>
      <ol class="thinkingSteps"></ol>
      <div class="routeChips" hidden></div>
      <div class="finalAnswer"></div>
    </div>
  `;
  article.querySelector(".thinkingTrigger").addEventListener("click", () => toggleActivityDrawer(article));
  updateThinkingSummary(article, "", { live: true });
  article.taskContext = options.taskContext || null;
  if (options.target) options.target.append(article);
  else { generationScrollFollow?.start(article); appendMessage(article, true); }
  return article;
}

function showAgentIdentity(article, agent) {
  if (agent !== 'mentora-deal') {
    if (agent === 'mentora') { article.querySelector('.assistantAgentIdentity')?.remove(); article.dataset.agent = agent; }
    return;
  }
  article.dataset.agent = agent;
  let identity = article.querySelector('.assistantAgentIdentity');
  if (!identity) {
    identity = document.createElement('div');
    identity.className = 'assistantAgentIdentity';
    const avatar = document.createElement('img');
    const base = new URL(document.querySelector('.brandMark')?.src || '/static/assets/mentora-logo.svg', location.href);
    avatar.src = base.href; avatar.alt = ''; avatar.width = 24; avatar.height = 24;
    const name = document.createElement('span'); name.textContent = 'Mentora Deal';
    identity.append(avatar, name);
    article.querySelector('.assistantBubble')?.prepend(identity);
  }
}

function applyRunTiming(article, eventName, data) {
  const raw = data?.runStartedAt;
  const start = Number(raw) || Date.parse(raw);
  if (Number.isFinite(start) && start > 0) article.dataset.startedAt = String(start);
  if (eventName === "final" || eventName === "error") {
    const supplied = data?.thinkingElapsed;
    const elapsed = supplied != null && Number.isFinite(Number(supplied)) ? Number(supplied)
      : Date.now() - Number(article.dataset.startedAt || Date.now());
    article.dataset.cachedElapsedMs = String(Math.max(0, elapsed));
  }
}

// These chunks were genuinely generated while HTML was rendering. Give the
// browser a paint between batches, while preserving the recorded final/event
// order. This paces presentation only; it never fabricates model deltas.
function queuePreparedStreamEvent(article, eventName, data) {
  article.preparedStreamEvents ||= [];
  article.preparedStreamEvents.push([eventName,data]);
  if (article.preparedStreamFrame) return;
  const advance = () => {
    article.preparedStreamFrame = null;
    if (article.activityEnded || !article.isConnected) { article.preparedStreamEvents = []; return; }
    let characters = 0;
    while (article.preparedStreamEvents.length && characters < 32) {
      const [event,value] = article.preparedStreamEvents.shift();
      handleStreamEvent(article,event,value,true);
      characters += event === 'answer_text' ? String(value.delta || value.text || '').length : 0;
    }
    if (article.preparedStreamEvents.length) article.preparedStreamFrame = requestAnimationFrame(advance);
  };
  article.preparedStreamFrame = requestAnimationFrame(advance);
}

function handleStreamEvent(article, eventName, data, prepared = false) {
  if (!prepared && eventName !== 'error' && (data?.bufferedByVisualization || article.preparedStreamEvents?.length)) {
    queuePreparedStreamEvent(article,eventName,data);
    return;
  }
  if (eventName === 'error') {
    cancelAnimationFrame(article.preparedStreamFrame);
    article.preparedStreamFrame = null;
    article.preparedStreamEvents = [];
  }
  applyRunTiming(article, eventName, data);
  showAgentIdentity(article, data?.agent);
  const lang = setArticleLanguage(article, data?.lang || article.dataset.lang || "en");
  if (eventName === "model_activity") {
    setModelActivity(article, data?.phase);
    return;
  }
  if (eventName === "status") {
    if (String(data?.phase || '').startsWith('flux-')) renderImageGenerationLoading(article,data);
    if (!shouldRenderStatusEvent(data)) return;
    appendStep(article, statusTitle(data, lang), statusDetail(data, lang), "loading", statusStepKey(data, lang));
    return;
  }
  if (eventName === "route") {
    appendRoutePlanStep(article, data);
    renderRoute(article, data.steps || []);
    return;
  }
  if (eventName === "agent_event") {
    appendAgentChatEvent(article, data);
    return;
  }
  if (eventName === "tool_step") {
    appendToolStep(article, data);
    return;
  }
  if (eventName === "progress") {
    if (data?.provisional) {
      renderStreamAnswerText(article,{blockId:data.blockId,text:data.text || '',replace:true});
      return;
    }
    if (!article.activityEnded) renderPublicProgress(article, data);
    return;
  }
  if (eventName === "answer_text") {
    renderStreamAnswerText(article, data);
    return;
  }
  if (eventName === "module") {
    appendStreamVisualizationModule(article, data);
    return;
  }
  if (eventName === "visualization" || eventName === "visualize_widget") {
    queueStreamVisualization(article, data);
    return;
  }
  if (eventName === "vision_asset") {
    appendImageAnalysisStep(article, data);
    return;
  }
  if (eventName === "module_error") {
    appendModuleErrorStep(article, data);
    return;
  }
  if (eventName === "final") {
    const images=(data.reportArtifacts || []).filter(isGeneratedImageArtifact);
    if(images.length && article.querySelector('.imageGenerationLoading')) {
      const token={};article.pendingImageFinal=token;
      renderImageGenerationLoading(article,{phase:'flux-transfer',progressPct:100,message:'图片已生成，正在载入资源'});
      appendStep(article,'图片已生成，正在载入资源','','loading','flux-transfer');
      Promise.all(images.map(waitForGeneratedImage)).then(()=>{
        if(article.pendingImageFinal===token && !article.activityEnded)renderFinalAnswer(article,data);
      }).catch(()=>{
        if(article.pendingImageFinal===token)showError(article,'图片资源载入失败，请重新打开会话重试。',{skipSessionRecord:!!article.taskContext});
      });
      return;
    }
    renderFinalAnswer(article, data);
    return;
  }
  if (eventName === "error") {
    article.streamBlocks = Array.isArray(data.streamBlocks) ? data.streamBlocks : [];
    if (data.code === "cancelled") {
      showStopped(article, data.detail || "已停止本轮任务");
      return;
    }
    showError(article, data.detail || "生成失败", {skipSessionRecord:!!article.taskContext});
  }
}

const streamVisualizationCodeCache = new Map();

// Sessions are stored in the browser, so an already-open conversation can
// still point to the empty artifact emitted before the StreamViz hand-off fix.
// Resolve that one legacy URL before either the live renderer or iframe path
// sees it; this restores the existing chat without asking the user to rerun.
const legacyArtifactRedirects = Object.freeze({
  "/generated/native-streamviz-bf812c5bdd59.html": "/generated/deepseek-ashare-review-streamviz-20261009.html",
});

const legacySessionArtifactRecoveries = Object.freeze([
  {
    // Older saved records kept the prose but dropped the visualization event.
    // Match the original request as well, because the saved interpretation can
    // contain formatted markup that splits the report headline into fragments.
    matches: ["美股市场表现"],
    artifact: {
      url: "/generated/deepseek-streamviz-us-market-2026-10-10.html",
      path: "/generated/deepseek-streamviz-us-market-2026-10-10.html",
      title: "美股市场表现：指数贴近年内高位，但上涨宽度在收缩",
      renderMode: "iframe",
    },
  },
  {
    matches: ["A股市场今天表现"],
    artifact: {
      url: "/generated/deepseek-ashare-streamviz.html",
      path: "/generated/deepseek-ashare-streamviz.html",
      title: "今日 A 股：跌多涨少的中位数行情，涨停潮集中在创业板与科创板",
      renderMode: "iframe",
    },
  },
  {
    matches: ["A股、港股市场今天表现"],
    artifact: {
      url: "/generated/deepseek-ashare-hk-market-20261012.html",
      path: "/generated/deepseek-ashare-hk-market-20261012.html",
      title: "A 股与港股今日表现：同一种结构，两种温度",
      renderMode: "iframe",
    },
  },
  {
    matches: ["港股市场今天表现"],
    artifact: {
      url: "/generated/deepseek-hk-market-20261012-streamviz.html",
      path: "/generated/deepseek-hk-market-20261012-streamviz.html",
      title: "港股今日盘中表现：金融与平台股撑指数，硬件与新能源车拖后腿",
      renderMode: "iframe",
    },
  },
]);

function recoverLegacySessionArtifacts(session = {}) {
  const searchable = [session.question, session.title, session.interpretation]
    .map((value) => String(value || ""))
    .join("\n");
  const recovery = legacySessionArtifactRecoveries.find((item) =>
    item.matches.every((needle) => searchable.includes(needle))
  );
  if (!recovery) return false;
  const currentArtifactUrl = Array.isArray(session.reportArtifacts)
    ? session.reportArtifacts.find((item) => item?.url)?.url
    : "";
  // Recovery is only for missing artifacts or this exact legacy report.
  // A later run of the same question must retain its newly generated HTML.
  const existingUrl = currentArtifactUrl || String(session.reportUrl || "");
  if (existingUrl && existingUrl !== recovery.artifact.url) return false;
  const currentRenderMode = Array.isArray(session.reportArtifacts)
    ? session.reportArtifacts.find((item) => item?.url === currentArtifactUrl)?.renderMode
    : "";
  const currentPath = Array.isArray(session.reportArtifacts)
    ? session.reportArtifacts.find((item) => item?.url === currentArtifactUrl)?.path
    : "";
  if (currentArtifactUrl === recovery.artifact.url
    && session.reportUrl === recovery.artifact.url
    && currentRenderMode === recovery.artifact.renderMode
    && currentPath === recovery.artifact.path) return false;
  session.reportArtifacts = [{ ...recovery.artifact }];
  session.reportUrl = recovery.artifact.url;
  return true;
}

function canonicalArtifact(item = {}) {
  const url = String(item.url || item.htmlUrl || "").trim();
  const canonicalUrl = legacyArtifactRedirects[url] || url;
  return canonicalUrl === url ? item : { ...item, url: canonicalUrl, htmlUrl: canonicalUrl };
}

// StreamViz reports the sandbox document's full height through postMessage.
// Keep the host frame in sync directly as well: older renderer bundles can
// clamp their own React state before applying that measurement.
window.addEventListener("message", (event) => {
  const data = event.data;
  if (data?.type === "visualize-widget:rendered") {
    document.querySelectorAll(".streamvizArtifactHost .visualize-widget-frame").forEach((frame) => {
      if (frame.contentWindow !== event.source) return;
      const host = frame.closest(".streamvizArtifactHost");
      host.dataset.streamvizRendered = String(data.hasContent === true);
      if (data.hasContent === true && host.closest(".message.assistant")?.dataset.thinkingState === "active") {
        host.dataset.streamvizRenderedDuringGeneration = "true";
      }
      if (data.hasContent === true) clearTimeout(host.streamvizFallbackTimer);
    });
    return;
  }
  if (data?.type !== "visualize-widget:size") return;
  const height = Math.ceil(Number(data.height));
  if (!Number.isFinite(height) || height < 1 || height > 20000) return;

  document.querySelectorAll(".streamvizArtifactHost .visualize-widget-frame").forEach((frame) => {
    if (frame.contentWindow !== event.source) return;
    const applyHeight = () => {
      const panel = frame.closest(".visualize-widget-panel");
      const value = `${height}px`;
      panel?.style.setProperty("--runtime-visualize-widget-height", value, "important");
      panel?.style.setProperty("--visualize-widget-height", value, "important");
      panel?.style.setProperty("height", value, "important");
      frame.style.setProperty("height", value, "important");
    };
    applyHeight();
    requestAnimationFrame(applyHeight);
  });
});

function streamVisualizationCompatible(code) {
  const source = String(code || "");
  // Documents that execute scripts or embed a document have their own
  // rendering lifecycle.  Keep them out of the sanitising StreamViz sandbox
  // and show them in the report iframe unchanged.
  if (!source.trim() || /<iframe\b/i.test(source) || /<script\b/i.test(source)) return false;
  if (/<(?:script|img|link|source|video|audio)\b[^>]*(?:src|href)\s*=\s*["'](?:\/|\.\.?\/)/i.test(source)) return false;
  return true;
}

function prepareStreamVisualizationCode(code) {
  const source = String(code || "");
  if (!source.trim() || source.includes('data-aime-streamviz-root="true"')) return source;
  const bodyPattern = /(<body\b[^>]*>)([\s\S]*?)(<\/body\s*>)/i;
  if (!bodyPattern.test(source)) return `<div data-aime-streamviz-root="true">${source}</div>`;
  return source.replace(
    bodyPattern,
    (_match, open, content, close) => `${open}<div data-aime-streamviz-root="true">${content}</div>${close}`,
  );
}

function streamVisualizationReplayPlan(code) {
  const source = String(code || "");
  // prepareStreamVisualizationCode gives every compatible document a stable
  // root.  Replay from that root so the complete head/theme is available on
  // every frame, regardless of which report template produced the body.
  const root = /<[a-z][\w:-]*\b[^>]*\bdata-aime-streamviz-root\s*=\s*["']true["'][^>]*>/i.exec(source);
  if (!root) return null;
  const start = root.index;
  const remaining = Math.max(0, source.length - start);
  return {
    start,
    // Keep the replay visible for normal reports without making large cached
    // documents take tens of seconds to finish.
    step: Math.max(180, Math.ceil(remaining / 48)),
  };
}

function mountStreamVisualization(host, payload) {
  host.streamvizPendingPayload = payload;
  if (host.streamvizRenderFrame) return;
  host.streamvizRenderFrame = requestAnimationFrame(() => {
    host.streamvizRenderFrame = null;
    if (!host.isConnected) return;
    if (!window.AimeStreamViz?.mount) {
      if (!host.streamvizReadyListener) {
        host.streamvizReadyListener = true;
        window.addEventListener('aime:streamviz-ready', () => {
          host.streamvizReadyListener = false;
          mountStreamVisualization(host, host.streamvizPendingPayload);
        }, {once:true});
      }
      return;
    }
    try {
      window.AimeStreamViz.mount(host, host.streamvizPendingPayload);
      host.dataset.streamvizMounted = 'true';
    } catch { host.dataset.streamvizFailed = 'true'; }
  });
}

function guardStreamVisualization(host, item, index) {
  host.dataset.artifactUrl = String(item.url || "");
  const fallback = () => {
    if (!host.isConnected || host.dataset.streamvizRendered === "true") return;
    window.AimeStreamViz?.unmount?.(host);
    host.replaceWith(createArtifactFallbackFrame(item, index));
  };
  clearTimeout(host.streamvizFallbackTimer);
  host.streamvizFallbackTimer = setTimeout(fallback, host.dataset.streamvizFailed === "true" ? 0 : 8000);
  return host;
}

// Lift same-origin chart tooltips into the page so iframe edges cannot clip them.
let reportTooltipPortal = null;
let activeReportTooltip = null;
function dismissReportTooltip() {
  document.querySelectorAll('.bar-line-tooltip-portal,.group-line-tooltip-portal,.bar-chart-tooltip-portal,.grouped-bar-tooltip-portal').forEach(tip=>tip.classList.remove('active'));
  if (reportTooltipPortal) reportTooltipPortal.hidden = true;
  if (activeReportTooltip) {
    activeReportTooltip.tip.classList.remove("show", "active", "visible");
    activeReportTooltip = null;
  }
}
function installReportTooltipPortal(frame) {
  frame.reportTooltipCleanup?.();
  const doc = frame.contentDocument;
  if (!doc?.body) return;
  const win = frame.contentWindow;
  const observers = [];
  const attached = new WeakSet();
  const copyNode = (source) => {
    if (source.nodeType === 3) return document.createTextNode(source.textContent);
    if (source.nodeType !== 1 || !["DIV","SPAN","B","STRONG","SMALL","BR","UL","LI","P"].includes(source.tagName)) return document.createDocumentFragment();
    const clone = document.createElement(source.tagName.toLowerCase());
    const style = win.getComputedStyle(source);
    for (const property of ["display","box-sizing","flex-direction","flex-wrap","flex-grow","flex-shrink","flex-basis","grid-template-columns","grid-auto-flow","gap","row-gap","column-gap","align-items","align-self","justify-content","min-width","max-width","min-height","padding","margin","color","background-color","border-radius","font-size","font-weight","font-family","font-variant-numeric","font-feature-settings","letter-spacing","line-height","white-space","text-align","overflow","text-overflow"]) clone.style.setProperty(property, style.getPropertyValue(property));
    if (source.matches(".tip-dot,.tooltip-dot,.swatch")) {
      clone.style.width = style.width;
      clone.style.height = style.height;
    }
    for (const child of source.childNodes) clone.append(copyNode(child));
    return clone;
  };
  const attach = (tip) => {
    if (attached.has(tip)) return;
    attached.add(tip);
    let scheduled = false;
    const update = () => {
      if (!frame.isConnected || !tip.isConnected) {
        if (activeReportTooltip?.tip === tip) dismissReportTooltip();
        return;
      }
      const style = win.getComputedStyle(tip);
      const shown = tip.matches(".show,.active,.visible") || tip.style.opacity === "1";
      if (!shown || style.display === "none") {
        if (activeReportTooltip?.tip === tip && reportTooltipPortal) reportTooltipPortal.hidden = true;
        return;
      }
      if (!reportTooltipPortal) {
        reportTooltipPortal = document.createElement("aside");
        reportTooltipPortal.className = "reportTooltipPortal";
        reportTooltipPortal.setAttribute("role", "tooltip");
        document.body.append(reportTooltipPortal);
      }
      const portal = reportTooltipPortal;
      portal.dataset.arrow = tip.dataset.tooltipArrow === "none" ? "none" : "bottom";
      activeReportTooltip = { frame, tip };
      portal.replaceChildren(...Array.from(tip.childNodes, copyNode));
      portal.hidden = false;
      portal.style.setProperty("--report-tooltip-bg", style.backgroundColor);
      for (const property of ["color","padding","font-size","font-family","line-height","border-radius"]) portal.style.setProperty(property, style.getPropertyValue(property));
      const box = tip.getBoundingClientRect();
      const chart = frame.getBoundingClientRect();
      const scaleX = chart.width / (frame.clientWidth || chart.width);
      portal.style.width = Math.min(box.width * scaleX, window.innerWidth - 16) + "px";
      const arrowValue = style.getPropertyValue("--arrow-x") || style.getPropertyValue("--arrow-left") || style.getPropertyValue("--tooltip-arrow-left") || "50%";
      const arrow = arrowValue.includes("%") ? box.width * parseFloat(arrowValue) / 100 : parseFloat(arrowValue);
      const anchor = gesture?.direction==="horizontal" ? chart.left+gesture.currentX : chart.left + (box.left + (Number.isFinite(arrow) ? arrow : box.width / 2)) * scaleX;
      const left = Math.max(8, Math.min(window.innerWidth - portal.offsetWidth - 8, (gesture?.direction==="horizontal" ? anchor-portal.offsetWidth/2 : chart.left + box.left * scaleX)));
      portal.style.left = left + "px";
      const scaleY = chart.height / (frame.clientHeight || chart.height);
      // Preserve the native bottom/arrow anchor, as in rating charts. The portal
      // may extend above its iframe; only the outer page viewport constrains it.
      const preferredTop = chart.top + box.bottom * scaleY - portal.offsetHeight;
      portal.style.top = Math.max(8, Math.min(window.innerHeight - portal.offsetHeight - 8, preferredTop)) + "px";
      portal.style.setProperty("--report-tooltip-arrow-x", Math.max(12, Math.min(portal.offsetWidth - 12, anchor - left)) + "px");
      // Keep native layout measurements, but only the outer portal paints the tooltip.
      if (tip.style.visibility !== "hidden" || tip.style.getPropertyPriority("visibility") !== "important") tip.style.setProperty("visibility", "hidden", "important");
    };
    const observer = new win.MutationObserver(() => {
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(() => { scheduled = false; update(); });
      }
    });
    observer.observe(tip, { attributes: true, attributeFilter: ["style","class"], childList: true, subtree: true });
    observers.push(observer);
  };
  const discover = () => doc.querySelectorAll(".tooltip,.chart-tooltip").forEach(attach);
  discover();
  const discovery = new win.MutationObserver(discover);
  discovery.observe(doc.body, { childList: true, subtree: true });
  let gesture = null;
  const onDown = (event) => { if (event.pointerType === "touch") gesture = { x:event.clientX,y:event.clientY,currentX:event.clientX,direction:"pending" }; };
  const onMove = (event) => {
    if (!gesture || event.pointerType !== "touch") return;
    const dx = Math.abs(event.clientX - gesture.x), dy = Math.abs(event.clientY - gesture.y);
    if(gesture.direction==="pending"&&Math.max(dx,dy)>6)gesture.direction=dx>=dy?"horizontal":"vertical";
    gesture.currentX=event.clientX;
    if(gesture.direction==="horizontal"&&activeReportTooltip?.frame===frame&&reportTooltipPortal&&reportTooltipPortal.dataset.arrow!=="none"){
      const anchor=frame.getBoundingClientRect().left+event.clientX,width=reportTooltipPortal.offsetWidth;
      const left=Math.max(8,Math.min(window.innerWidth-width-8,anchor-width/2));
      reportTooltipPortal.style.left=left+"px";
      reportTooltipPortal.style.setProperty("--report-tooltip-arrow-x",Math.max(12,Math.min(width-12,anchor-left))+"px");
    }
    if (gesture.direction==="vertical") {
      dismissReportTooltip();
      event.stopPropagation();
    }
  };
  const onEnd = () => { gesture = null; };
  doc.addEventListener("pointerdown",onDown,{capture:true,passive:true});
  doc.addEventListener("pointermove",onMove,{capture:true,passive:true});
  doc.addEventListener("pointercancel",onEnd,{passive:true});
  doc.addEventListener("pointerup",onEnd,{passive:true});
  frame.reportTooltipCleanup = () => {
    observers.forEach(observer=>observer.disconnect());discovery.disconnect();
    doc.removeEventListener("pointerdown",onDown,true);doc.removeEventListener("pointermove",onMove,true);
    doc.removeEventListener("pointercancel",onEnd);doc.removeEventListener("pointerup",onEnd);
    if (activeReportTooltip?.frame===frame) dismissReportTooltip();
  };
}
window.addEventListener("scroll",dismissReportTooltip,{capture:true,passive:true});
window.addEventListener("resize",dismissReportTooltip,{passive:true});
document.addEventListener("pointerdown",dismissReportTooltip,{capture:true,passive:true});
window.addEventListener("veya:chat-navigate",dismissReportTooltip);

const addToWidgetIcon = `<svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M960 224a32 32 0 0 0-32-32h-832a32 32 0 0 0-31.488 26.24L64 224v704a32 32 0 0 0 26.24 31.488L96 960H512a32 32 0 1 1 0 64H96a96 96 0 0 1-95.552-86.784L0 928v-704a96 96 0 0 1 86.784-95.552L96 128h832a96 96 0 0 1 95.552 86.784L1024 224V512a32 32 0 1 1-64 0V224zM801.92 576c16.64 0 30.08 13.44 30.08 30.08V768l161.92 0.064c16.64 0 30.08 13.44 30.08 30.08v3.84c0 16.64-13.44 30.08-30.08 30.08L832 831.936v161.92c0 16.64-13.44 30.144-30.08 30.144h-3.84A30.08 30.08 0 0 1 768 993.92V831.936L606.08 832A30.08 30.08 0 0 1 576 801.92v-3.84c0-16.64 13.44-30.08 30.08-30.08l161.92-.064V606.08c0-16.64 13.44-30.08 30.08-30.08h3.84zM736 0a32 32 0 1 1 0 64h-448a32 32 0 0 1 0-64h448z"/></svg>`;
function withArtifactWidgetControl(node,item={}){
  if(!node)return node;
  const existing=node.closest?.('.chatArtifactShell');if(existing)return existing;
  const shell=document.createElement('div');shell.className='chatArtifactShell';
  shell.dataset.artifactUrl=String(item.url||node.dataset?.artifactUrl||'');
  shell.dataset.artifactTitle=String(item.title||item.label||'');
  const button=document.createElement('button');button.type='button';button.className='artifactAddToWidget';button.title='添加到 Widget';button.setAttribute('aria-label','添加到 Widget');button.innerHTML=addToWidgetIcon;
  const add=(title,trigger=button)=>window.dispatchEvent(new CustomEvent('mentora:add-artifact-to-widget',{detail:{url:shell.dataset.artifactUrl,title:title||shell.dataset.artifactTitle||'可视化组件',trigger}}));
  button.addEventListener('click',event=>{event.stopPropagation();add(shell.dataset.artifactTitle||button.parentElement?.textContent.trim());});
  shell.append(node);
  const observed=new WeakSet();
  const attachToTitle=(root=shell)=>{
    if(!observed.has(root)){
      observed.add(root);
      new MutationObserver(()=>attachToTitle(root)).observe(root,{childList:true,subtree:true});
    }
    const doc=root.ownerDocument||root;
    const title=root.querySelector('.kline-title strong[data-business-title],.chart-title,.waterfall-title,.treemap-title,.pie-title,.card-title,#title,h1,h2');
    const actionHost=title?.closest('header')?.querySelector('[data-widget-title-action-anchor]')||title;
    if(title?.textContent.trim()&&!actionHost.querySelector('[data-widget-title-action]')&&!title.querySelector('[data-widget-title-action]')&&button.parentElement!==actionHost&&!button.isConnected){
      if(!doc.querySelector('[data-widget-title-button-style]')){
        const style=doc.createElement('style');style.dataset.widgetTitleButtonStyle='true';
        style.textContent='.artifactAddToWidget{display:inline-flex!important;position:static!important;vertical-align:middle;align-items:center;justify-content:flex-start;box-sizing:border-box;width:28px;height:28px;margin:0 0 0 6px;padding:5px 10px 5px 0;border:0;border-radius:6px;background:transparent;color:inherit;opacity:0;pointer-events:none;transition:opacity .15s ease;cursor:pointer;flex-shrink:0}.artifactAddToWidget:hover,.artifactAddToWidget:focus-visible{opacity:1;pointer-events:auto;background:#8882}.artifactAddToWidget svg{display:block;width:18px;height:18px;fill:currentColor}.artifactAddToWidget.is-added{color:#34d399}';
        style.textContent+=(doc===document?'.chatArtifactShell:hover .artifactAddToWidget':'html:hover .artifactAddToWidget')+'{opacity:.65;pointer-events:auto}';
        doc.head.append(style);
      }
      const tail=title.lastChild;
      if(tail?.nodeType===Node.TEXT_NODE)tail.textContent=tail.textContent.trimEnd();
      title.style.overflow='visible';title.style.maxHeight='none';actionHost.append(button);
      shell.dataset.artifactTitle=title.textContent.trim();
    }
    // One artifact owns one host action. Its outer title takes precedence over
    // titles in nested chart documents; moving one button among those titles
    // makes their MutationObservers move it back forever.
    if(title?.textContent.trim())return;
    for(const frame of root.querySelectorAll('iframe')){
      const connect=()=>{
        // StreamViz keeps an opaque-origin sandbox. Its own runtime attaches the
        // action; the parent verifies the frame before accepting its message.
        frame.contentWindow?.postMessage({type:'mentora:widget-control'},'*');
        try{if(frame.contentDocument?.body)attachToTitle(frame.contentDocument.body);}catch{}
      };
      if(!observed.has(frame)){observed.add(frame);frame.addEventListener('load',connect);}
      connect();
    }
  };
  attachToTitle();
  return shell;
}

window.addEventListener('message',event=>{
  if(!['mentora:add-widget','mentora:widget-ready'].includes(event.data?.type))return;
  const frame=Array.from(document.querySelectorAll('.chatArtifactShell iframe')).find(f=>f.contentWindow===event.source);
  if(!frame)return;
  if(event.data.type==='mentora:widget-ready'){frame.contentWindow.postMessage({type:'mentora:widget-control'},'*');return;}
  const shell=frame.closest('.chatArtifactShell');
  window.dispatchEvent(new CustomEvent('mentora:add-artifact-to-widget',{detail:{url:shell.dataset.artifactUrl,title:String(event.data.title||shell.dataset.artifactTitle||'可视化组件').slice(0,160),trigger:shell.querySelector('.artifactAddToWidget')}}));
});

function isImageGalleryArtifact(item) {
  return item?.contentKind==='image-gallery' || item?.type==='external-image-search' || /(?:image[-_]search|photo[-_]gallery)/i.test(String(item?.url || ''));
}

function artifactLoadingMessage(item) {
  return isImageGalleryArtifact(item)?'正在加载图片':'正在加载内容';
}

function createArtifactFallbackFrame(item, index, options = {}) {
  if(isGeneratedImageArtifact(item))return createGeneratedImageArtifact(item);
  const loadingStartedAt = Date.now();
  const demoLoadingMs = Math.max(0, Number(options.demoLoadingMs || 0));
  const shell = document.createElement("div");
  shell.className = `reportFrameShell is-chart-loading${demoLoadingMs ? " is-case-demo" : ""}`;
  shell.dataset.artifactUrl = String(item.url || "");
  const loading = document.createElement("div");
  loading.className = "chartLoadingOverlay";
  loading.hidden = false;
  loading.setAttribute("role", "status");
  const loadingLabel=document.createElement('span');loadingLabel.className='chartLoadingLabel';loadingLabel.textContent=artifactLoadingMessage(item);loading.append(loadingLabel);
  const frame = document.createElement("iframe");
  frame.className = "reportDocumentFrame";
  shell.append(frame);
  shell.append(loading);
  frame.dataset.artifactUrl = String(item.url || "");
  frame.title = `Analysis chart ${index + 1}`;
  frame.scrolling = "no";
  const source = new URL(item.url, window.location.origin);
  // Use the server-side document shell for generated HTML. It preserves the
  // artifact's scripts while applying the same width and surface tokens as the
  // surrounding conversation and share page.
  if (/^\/(?:(?:mentora|veya)\/)?generated\/[^/]+\.html$/.test(source.pathname)) {
    // URL.pathname is already percent-encoded, including Chinese filenames.
    // Preserve it when switching routes so filenames are not encoded twice.
    const artifactSource = new URL(source.href);
    artifactSource.pathname=source.pathname.replace('/generated/','/share-artifact/');
    artifactSource.searchParams.set("theme", currentThemeMode());
    artifactSource.searchParams.set("v", String(Date.now()));
    frame.src = artifactSource.href;
  } else {
    if (source.pathname.includes("/static/cases/")) source.searchParams.set("theme", currentThemeMode());
    frame.src = source.href;
  }
  frame.addEventListener("load", () => {
    if (new URL(frame.src, window.location.origin).pathname.includes("/static/cases/")) {
      const root = frame.contentDocument?.documentElement;
      if (root) root.dataset.theme = new URL(frame.src).searchParams.get("theme") || currentThemeMode();
    }
    const doc = frame.contentDocument;
    if (doc?.head && !doc.documentElement.dataset.businessUi && !doc.querySelector('[data-case-palette]')) {
      const sharedControls = doc.createElement('script');
      const runtimeScript = document.querySelector('script[src*="/static/app.js"]');
      sharedControls.src = new URL('cases/theme.js?v=20261014-business-controls', runtimeScript?.src || new URL('/static/app.js', location.origin)).href;
      sharedControls.addEventListener('load', () => resizeReportDocumentFrame(frame), {once:true});
      doc.head.append(sharedControls);
    }
    doc?.addEventListener("wheel", (event) => {
      if (event.target?.closest?.("svg.markmap") && !event.ctrlKey && !event.metaKey) event.stopImmediatePropagation();
    }, { capture: true, passive: true });
    window.installTradingViewSurface?.(frame);
    resizeReportDocumentFrame(frame);
    installReportTooltipPortal(frame);
    setTimeout(() => requestAnimationFrame(() => {
      loading.remove();
      shell.classList.remove("is-chart-loading");
      shell.dataset.artifactReady = "true";
    }), Math.max(0, demoLoadingMs - (Date.now() - loadingStartedAt)));
  });
  return shell;
}

function syncReportFrameThemes(mode = currentThemeMode()) {
  document.querySelectorAll(".reportDocumentFrame").forEach((frame) => {
    try {
      const source = new URL(frame.src, window.location.origin);
      if (!source.pathname.includes("/share-artifact/") && !source.pathname.includes("/static/cases/")) return;
      if (source.searchParams.get("theme") === mode) return;
      source.searchParams.set("theme", mode);
      frame.src = source.href;
      frame.addEventListener("load", () => resizeReportDocumentFrame(frame), { once: true });
    } catch {
      // Leave non-URL or cross-origin report frames unchanged.
    }
  });
}

async function artifactCode(url) {
  const absoluteUrl = new URL(url, window.location.origin).href;
  if (!streamVisualizationCodeCache.has(absoluteUrl)) {
    const request = fetch(absoluteUrl, { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    });
    streamVisualizationCodeCache.set(absoluteUrl, request);
    request.finally(() => {
      if (streamVisualizationCodeCache.get(absoluteUrl) === request) {
        streamVisualizationCodeCache.delete(absoluteUrl);
      }
    });
  }
  return streamVisualizationCodeCache.get(absoluteUrl);
}

function createStreamVisualizationArtifact(item, index, options = {}) {
  item = canonicalArtifact(item);
  if(isGeneratedImageArtifact(item))return createGeneratedImageArtifact(item);
  if (Number(options.demoLoadingMs) > 0) return createArtifactFallbackFrame(item, index, { demoLoadingMs: options.demoLoadingMs });
  const host = document.createElement("div");
  host.className = `streamvizArtifactHost${options.live ? " is-live" : ""}`;
  host.dataset.loadingKind = 'artifact';
  host.dataset.artifactUrl = String(item.url || "");
  mountStreamVisualization(host, {
    title: item.title || item.label || "",
    code: "",
    exportCode: "",
    final: false,
    showActions: false,
    loadingMessage: options.loadingMessage || artifactLoadingMessage(item),
    loadingDwellMs: 0,
  });
  artifactCode(item.url).then(async (rawCode) => {
    if (!host.isConnected) return;
    if (/<main\b[^>]*\bdata-artifact-type\s*=\s*["'](?:data-transform|execution-receipt)["']/i.test(rawCode)) {
      window.AimeStreamViz?.unmount?.(host);
      host.remove();
      return;
    }
    if (!streamVisualizationCompatible(rawCode)) {
      if(/data-image-search-gallery=|<title>图片搜索<\/title>/i.test(rawCode))item={...item,contentKind:'image-gallery'};
      window.AimeStreamViz?.unmount?.(host);
      host.replaceWith(createArtifactFallbackFrame(item, index));
      return;
    }
    const code = prepareStreamVisualizationCode(rawCode);
    const replayPlan = options.replay ? streamVisualizationReplayPlan(code) : null;
    if (replayPlan && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      // This is a cached case replay, not a fabricated live model event. Load
      // the complete theme first, then reveal any compatible HTML body through
      // the same incremental renderer while retaining one artifact host.
      for (let end = replayPlan.start; end < code.length; end += replayPlan.step) {
        if (!host.isConnected || options.signal?.aborted) return;
        mountStreamVisualization(host, {
          title: item.title || item.label || "",
          code: code.slice(0, end),
          exportCode: "",
          final: false,
          showActions: false,
          loadingDwellMs: 0,
        });
        await new Promise((resolve) => window.setTimeout(resolve, 24));
      }
      if (!host.isConnected || options.signal?.aborted) return;
    }
    mountStreamVisualization(host, {
      title: item.title || item.label || "",
      code,
      exportCode: code,
      final: true,
      showActions: options.showActions === true,
      loadingMessage: options.loadingMessage || artifactLoadingMessage(item),
      loadingDwellMs: 0,
    });
    host.dataset.artifactCodeReady = "true";
    guardStreamVisualization(host, item, index);
  }).catch(() => {
    if (!host.isConnected) return;
    window.AimeStreamViz?.unmount?.(host);
    host.replaceWith(createArtifactFallbackFrame(item, index));
  });
  return host;
}

function orderedStreamFlow(article) {
  const target = article.querySelector('.finalAnswer');
  if (!target) return null;
  article.orderedStream = true;
  let flow = target.querySelector('.interleavedFlow');
  if (!flow) {
    flow = document.createElement('section');
    flow.className = 'interleavedFlow mixedReport';
    target.appendChild(flow);
  }
  return flow;
}

function replayOrderedStream(article, blocks, container) {
  // Restored blocks use the same spacing owner as live ordered output.
  container.classList.add('interleavedFlow');
  article.replayBlockOrder = new Map(blocks.map((block,index) => [block.kind === 'tool_step' ? 'tool:' + (block.data?.callId || block.id) : block.id,index + 1]));
  article.nextActivityOrder = Math.max(article.nextActivityOrder || 0,blocks.length);
  const history = article.querySelector('.thinkingSteps');
  if (history) {
    for (const item of history.children) {
      const order = article.replayBlockOrder.get(item.dataset.publicBlockId || 'tool:' + item.dataset.toolCallId);
      if (order) item.dataset.activityOrder = String(order);
    }
    [...history.children].filter(item=>item.dataset.activityOrder).sort((a,b)=>Number(a.dataset.activityOrder)-Number(b.dataset.activityOrder)).forEach(item=>history.append(item));
  }
  article.streamVisualizationArtifacts ||= [];
  for (const block of blocks) {
    if (block.kind !== 'visualization') continue;
    const item = canonicalArtifact(block.data || {});
    const url = item.htmlUrl || item.url;
    if (url && !article.streamVisualizationArtifacts.some(artifact => artifact.url === url))
      article.streamVisualizationArtifacts.push({...item, url});
  }
  for (const original of blocks) {
    const block = original.kind === 'progress' && original.data?.provisional
      ? {kind:'text',id:original.id,text:original.data.text || ''} : original;
    if (block.kind === 'progress') {
      renderPublicProgress(article,{...block.data,blockId:block.id});
      continue;
    }
    if (block.kind === 'text') {
      const node = document.createElement('div');
      node.className = 'streamAnswerPreview';
      node.dataset.blockId = block.id || '';
      node.streamText = String(block.text || '');
      container.appendChild(node);
      syncStreamAnswerPlacement(article, node);
    } else if (block.kind === 'visualization' && block.data?.native) {
      const item = canonicalArtifact(block.data || {});
      const url = item.htmlUrl || item.url;
      if (url && !Array.from(container.querySelectorAll('[data-artifact-url]')).some(node => streamChartReferenceKey(node.dataset.artifactUrl) === streamChartReferenceKey(url))) {
        const lane = document.createElement('section');
        lane.className = 'streamvizLiveLane';
        lane.dataset.streamKey = block.id || url;
        lane.appendChild(withArtifactWidgetControl(createStreamVisualizationArtifact({...item,url},0),{...item,url}));
        container.appendChild(lane);
      }
    }
  }
}

function streamVisualizationLane(article, key = 'visualization') {
  const target = article.querySelector(".finalAnswer");
  if (!target) return null;
  const flow = orderedStreamFlow(article);
  let lane = Array.from(flow.querySelectorAll('.streamvizLiveLane')).find(node => node.dataset.streamKey === key);
  if (!lane) {
    lane = document.createElement("section");
    lane.className = "streamvizLiveLane";
    lane.dataset.streamKey = key;
    lane.setAttribute("aria-label", "正在生成的可视化");
    flow.appendChild(lane);
  }
  return lane;
}

function appendStreamVisualizationModule(article, data = {}) {
  data = canonicalArtifact(data);
  const url = String(data.htmlUrl || data.url || "").trim();
  if (!url) return;
  article.streamVisualizationArtifacts = Array.isArray(article.streamVisualizationArtifacts)
    ? article.streamVisualizationArtifacts
    : [];
  if (!article.streamVisualizationArtifacts.some((item) => item.url === url)) {
    article.streamVisualizationArtifacts.push({
      ...data,
      url,
      path: data.path || "",
      title: data.label || data.title || "",
    });
  } else Object.assign(article.streamVisualizationArtifacts.find(item => item.url === url), data, {url});
  if (article.activityEnded) return;
  // A tool artifact is inventory until the prose references it. Once referenced,
  // resolve its existing slot immediately, even while text is still streaming.
  syncStreamAnswerPlacement(article);
  keepScrollPosition(isNearBottom());
}

function streamChartReferenceKey(reference) {
  try {
    const url = new URL(String(reference || "").trim(), window.location.origin);
    if (url.origin !== window.location.origin) return "";
    const match = decodeURIComponent(url.pathname).match(/\/(?:generated|share-artifact)\/([^/\\\x00]+\.html)$/i);
    return match ? `/generated/${match[1]}` : "";
  } catch { return ""; }
}

function syncStreamAnswerPlacement(article, preview) {
  if (article.activityEnded && !preview) return;
  const target = article.querySelector(".finalAnswer");
  if (!target) return;
  if (!preview) {
    target.querySelectorAll(".streamAnswerPreview").forEach(node => syncStreamAnswerPlacement(article, node));
    return;
  }
  const raw = String(preview.streamText || "").replace(/\[\[AIME_(?:SKILLS|FILE):[\s\S]*?(?:\]\]|$)/g, "");
  const tokens = [], pattern = /\[\[AIME_CHART:([^\]]+)\]\]/g;
  let cursor = 0, match;
  while ((match = pattern.exec(raw))) {
    tokens.push({text: raw.slice(cursor, match.index)});
    tokens.push({reference: match[1].trim()});
    cursor = pattern.lastIndex;
  }
  let tail = raw.slice(cursor);
  const open = tail.lastIndexOf("[[");
  const marker = "[[AIME_CHART:";
  if (open >= 0 && (marker.startsWith(tail.slice(open)) || tail.slice(open).startsWith(marker))) tail = tail.slice(0, open);
  tokens.push({text: tail});
  preview.streamAnswerNodes ||= new Map();
  const desired = [], seen = new Set();
  let textIndex = 0;
  for (const token of tokens) {
    if (token.text !== undefined) {
      const text = sanitizeUserFacingInsight(token.text);
      const key = `text:${textIndex++}`;
      if (!text.trim()) continue;
      let node = preview.streamAnswerNodes.get(key);
      if (!node) {
        node = document.createElement("div");
        node.className = "streamingAnswer reportInterpretation";
        preview.streamAnswerNodes.set(key, node);
      }
      if (node.streamText !== text) {
        node.innerHTML = formatInsight(text);
        node.streamText = text;
        // Preserve the established provenance chips during streaming, not only
        // at final settlement. Do not attach uncited tool inventory here.
        if (node.querySelector('a.answer-citation-link')) attachInlineAnswerSources(node, article.activitySources || []);
      }
      desired.push(node);
      continue;
    }
    const key = streamChartReferenceKey(token.reference);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    // A streamed tool already occupies its chronological invocation position.
    // The final delivery marker must not pull that live iframe below later prose.
    const invokedHost = Array.from(target.querySelectorAll('[data-artifact-url]'))
      .find(node => streamChartReferenceKey(node.dataset.artifactUrl) === key && node.closest('.streamvizLiveLane'));
    if (invokedHost) continue;
    let slot = preview.streamAnswerNodes.get(key);
    if (!slot) {
      slot = document.createElement("section");
      slot.className = "streamChartSlot";
      slot.dataset.chartReference = key;
      slot.setAttribute("aria-label", "图表");
      const status = document.createElement("div");
      status.className = "streamChartPending";
      status.setAttribute("role", "status");
      status.textContent = "正在准备图表…";
      slot.append(status);
      preview.streamAnswerNodes.set(key, slot);
    }
    if (!slot.isConnected) preview.append(slot);
    if (!slot.querySelector("[data-artifact-url]")) {
      const existing = Array.from(target.querySelectorAll("[data-artifact-url]"))
        .find(node => streamChartReferenceKey(node.dataset.artifactUrl) === key);
      const artifact = (article.streamVisualizationArtifacts || []).find(item =>
        [item.url, item.path].some(reference => streamChartReferenceKey(reference) === key));
      let host = existing?.closest(".chatArtifactShell") || existing;
      if (!host && artifact) {
        const node = artifact.renderMode === "iframe" ? createArtifactFallbackFrame(artifact, 0)
          : createStreamVisualizationArtifact(artifact, 0, {live: true});
        host = withArtifactWidgetControl(node, artifact);
      }
      if (host) {
        slot.querySelector(".streamChartPending")?.remove();
        if (host.isConnected && slot.isConnected && slot.moveBefore) slot.moveBefore(host, null);
        else slot.append(host);
      }
    }
    desired.push(slot);
  }
  // Keep hosts connected across text snapshots: replacing preview.innerHTML
  // would reset iframe state and StreamViz roots on every token.
  const lastText = desired.filter(node => node.classList.contains('streamingAnswer')).at(-1);
  desired.forEach((node, index) => {
    if (node.classList.contains('streamingAnswer')) node.classList.toggle('is-streaming', !article.activityEnded && preview.dataset.blockId === article.activeAnswerBlockId && node === lastText);
    const before = preview.children[index] || null;
    if (before === node) return;
    if (node.isConnected && preview.moveBefore) preview.moveBefore(node, before);
    else preview.insertBefore(node, before);
  });
  Array.from(preview.children).filter(node => !desired.includes(node)).forEach(node => {
    if (node.classList.contains("streamChartSlot") && node.querySelector("[data-artifact-url]")) {
      streamVisualizationLane(article)?.append(node);
    } else node.remove();
  });
}

function renderPublicProgress(article, data = {}) {
  const text = modelActivitySummary(data.thoughtSummary || data.text || data.detail || data.message, article.dataset.lang || 'zh-CN');
  const list = article.querySelector('.thinkingSteps');
  if (!text || !list) return;
  const key = String(data.blockId || `model-progress:${text}`);
  let item = Array.from(list.children).find(node => node.dataset.publicBlockId === key);
  if (!item) {
    item = document.createElement('li');
    item.className = 'is-model-summary';
    item.dataset.publicBlockId = key;
    item.innerHTML = '<div class="activityStepTitle"></div>';
    item.dataset.activityOrder = String(article.replayBlockOrder?.get(key) || article.publicBlockOrder?.get(key) || (article.nextActivityOrder = (article.nextActivityOrder || 0) + 1));
    const next = Array.from(list.children).find(row => Number(row.dataset.activityOrder) > Number(item.dataset.activityOrder));
    list.insertBefore(item,next || null);
  }
  item.querySelector('.activityStepTitle').textContent = text;
  item.classList.toggle('is-loading', !article.activityEnded && !item.nextElementSibling);
  item.classList.toggle('is-done', Boolean(article.activityEnded || item.nextElementSibling));
  list.querySelectorAll('li.is-model-summary').forEach(previous => {
    if (previous !== item) {
      previous.classList.remove('is-loading');
      previous.classList.add('is-done');
    }
  });
  if (!item.nextElementSibling) {
    article.dataset.publicThoughtText = text;
    article.dataset.currentThinking = text;
    article.dataset.activityPhase = 'thinking';
    delete article.dataset.currentActivityCallId;
  }
  if (article.taskContext && data.kind === 'analysis') article.dataset.hasAnalysisSummary = 'true';
  updateThinkingSummary(article, '', {live:!article.activityEnded});
  syncActivityDrawer(article);
}

function renderStreamAnswerText(article, data = {}) {
  const target = article.querySelector(".finalAnswer");
  if (!target || article.activityEnded) return;
  const key = String(data.blockId || 'legacy-answer');
  article.publicBlockOrder ||= new Map();
  if (!article.publicBlockOrder.has(key)) article.publicBlockOrder.set(key, article.nextActivityOrder = (article.nextActivityOrder || 0) + 1);
  // Public answer deltas render immediately, including unlabelled provider text.
  // Only explicit progress events belong in the live thinking summary.
  const flow = orderedStreamFlow(article);
  let preview = Array.from(flow.querySelectorAll('.streamAnswerPreview')).find(node => node.dataset.blockId === key);
  if (data.discard) {
    preview?.remove();
    const hasAnswerText = Array.from(flow.querySelectorAll('.streamAnswerPreview'))
      .some(node => String(node.streamText || node.textContent || '').trim());
    if (!hasAnswerText && article.answerTextStarted) {
      article.answerTextStarted = false;
      article.activeAnswerBlockId = '';
      article.dataset.activityPhase = 'thinking';
      if (!article.visualizationStarted) {
        if (article.activityExpandedBeforeAnswer === undefined) delete article.dataset.activityInlineExpanded;
        else article.dataset.activityInlineExpanded = article.activityExpandedBeforeAnswer;
      }
      delete article.activityExpandedBeforeAnswer;
      updateThinkingSummary(article, '', {live:!article.activityEnded});
    }
    return;
  }
  if (!preview) {
    preview = document.createElement('div');
    preview.className = 'streamAnswerPreview';
    preview.dataset.blockId = key;
    flow.appendChild(preview);
  }
  preview.streamText = Object.prototype.hasOwnProperty.call(data, 'delta') ? (preview.streamText || '') + String(data.delta || '') : String(data.text || '');
  const stick = isNearBottom();
  if (preview.streamText.trim()) {
    const firstAnswer = !article.answerTextStarted;
    if (firstAnswer && !article.visualizationStarted) {
      article.activityExpandedBeforeAnswer = article.dataset.activityInlineExpanded;
      article.dataset.activityInlineExpanded = 'false';
      if (typeof activeActivityArticle !== 'undefined' && activeActivityArticle === article) closeActivityDrawer();
    }
    article.activeAnswerBlockId = data.final ? '' : key;
    article.querySelectorAll('.streamingAnswer.is-streaming').forEach(node => node.classList.remove('is-streaming'));
    article.answerTextStarted = true;
    article.dataset.activityPhase = 'answer';
    if (firstAnswer) updateThinkingSummary(article, '', {live:true});
    else syncInlineActivity(article);
  }
  syncStreamAnswerPlacement(article, preview);
  revealPendingVisualizations(article);
  keepScrollPosition(stick);
}

function queueStreamVisualization(article, data = {}) {
  if (article.activityEnded) return;
  if (!data.discard && !data.final && !article.visualizationStarted) {
    article.visualizationStarted = true;
    setInlineActivityExpanded(article, false);
  }
  upsertStreamVisualization(article, data);
  syncStreamAnswerPlacement(article);
}

function revealPendingVisualizations(article) {
  const pending = article.pendingVisualizations || [];
  article.pendingVisualizations = [];
  pending.forEach(data => upsertStreamVisualization(article, data));
  const modules = article.pendingVisualizationModules || [];
  article.pendingVisualizationModules = [];
  modules.forEach(data => appendStreamVisualizationModule(article, data));
}

function upsertStreamVisualization(article, data = {}) {
  const key = String(data.id || data.callId || data.toolCallId || "visualization");
  const lane = streamVisualizationLane(article, key);
  if (!lane) return;
  if (article.nonVisualVisualizationIds?.has(key)) return;
  if (data.discard) {
    const provisional = Array.from(article.querySelector(".finalAnswer").querySelectorAll(".streamvizArtifactHost"))
      .find((item) => item.dataset.visualizationId === key);
    if (provisional) {
      clearTimeout(provisional.streamvizFallbackTimer);
      window.AimeStreamViz?.unmount?.(provisional);
      provisional.remove();
    }
    return;
  }
  let host = Array.from(article.querySelector(".finalAnswer").querySelectorAll(".streamvizArtifactHost"))
    .find((item) => item.dataset.visualizationId === key);
  if (!host && data.htmlUrl) host = Array.from(article.querySelectorAll(".streamvizArtifactHost[data-artifact-url]"))
    .find(item => streamChartReferenceKey(item.dataset.artifactUrl) === streamChartReferenceKey(data.htmlUrl));
  if (host) host.dataset.visualizationId = key;
  if (!host) {
    host = document.createElement("div");
    host.className = "streamvizArtifactHost is-live";
    host.dataset.visualizationId = key;
    lane.appendChild(host);
  }
  if (data.htmlUrl) host.dataset.artifactUrl = String(data.htmlUrl);
  if (data.reset) host.streamVisualizationCode = "";
  if (data.reset) host.streamVisualizationRawArguments = "";
  if (Object.prototype.hasOwnProperty.call(data, "argumentDelta")) {
    host.streamVisualizationRawArguments = `${host.streamVisualizationRawArguments || ""}${String(data.argumentDelta || "")}`;
  } else if (data.toolRawInput !== undefined) {
    host.streamVisualizationRawArguments = String(data.toolRawInput || "");
  }
  if (Object.prototype.hasOwnProperty.call(data, "delta")) {
    host.streamVisualizationCode = `${host.streamVisualizationCode || ""}${String(data.delta || "")}`;
  } else {
    const replacement = data.widget_code ?? data.widgetCode ?? data.html;
    if (replacement !== undefined) host.streamVisualizationCode = String(replacement || "");
  }
  if (/<main\b[^>]*\bdata-artifact-type\s*=\s*["'](?:data-transform|execution-receipt)["']/i.test(host.streamVisualizationCode || "")) {
    article.nonVisualVisualizationIds = article.nonVisualVisualizationIds || new Set();
    article.nonVisualVisualizationIds.add(key);
    window.AimeStreamViz?.unmount?.(host);
    host.remove();
    return;
  }
  // StreamViz parses incomplete tool JSON/HTML and patches its existing iframe.
  // Forward real deltas immediately; its own loader handles an empty prefix.
  host.dataset.visualizationPhase = data.final ? 'completed' : 'running';
  host.classList.toggle('is-live', !data.final);
  if (data.final && data.htmlUrl && !host.streamVisualizationCode && !host.streamVisualizationRawArguments) {
    const completed = createStreamVisualizationArtifact({url:data.htmlUrl,title:data.title || ''},0);
    completed.dataset.visualizationId = key;
    host.replaceWith(completed);
    return;
  }
  mountStreamVisualization(host, {
    title: data.title || "",
    code: host.streamVisualizationCode || "",
    toolRawInput: host.streamVisualizationRawArguments || "",
    native: Boolean(data.native),
    exportCode: data.export_code || data.exportCode || host.streamVisualizationCode || "",
    loadingMessage: data.loading_message || data.loadingMessage || "正在生成可视化",
    loadingMessages: data.loading_messages || data.loadingMessages || [],
    final: Boolean(data.final),
    showActions: data.showActions !== false,
    loadingDwellMs: 0,
  });
  keepScrollPosition(isNearBottom());
}

window.addEventListener("aime:streamviz-followup", (event) => {
  const prompt = String(event.detail?.prompt || "").trim();
  if (prompt && !button.disabled) {
    const images = pendingImages.slice();
    clearPendingImages();
    updateComposerState();
    void submitQuestion(prompt, { images, agent:event.detail?.agent || '' });
  }
});

function handleImageSearchRefinement(event) {
  if(event.data?.type!=='mentora:image-search-refine'||typeof event.data.prompt!=='string')return;
  const prompt=event.data.prompt.trim();
  if(!prompt||prompt.length>1000)return;
  // Only a mounted result iframe may request a draft, never a background page.
  const frame=Array.from(document.querySelectorAll('.reportDocumentFrame,.chatArtifactShell iframe')).find(node=>node.contentWindow===event.source);
  if(!frame||!frame.closest('.message.assistant'))return;
  const accepted=!input.disabled&&!input.readOnly&&(!input.value.trim()||input.value.trim()===prompt);
  if(accepted){input.value=prompt;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}
  event.source.postMessage({type:'mentora:image-search-refine-ack',ok:accepted},event.origin==='null'?'*':event.origin);
}
window.addEventListener('message',handleImageSearchRefinement);

function addMessage(role, html, options = {}) {
  if (role === "user") {
    return addUserMessage(decodeHtml(html), options);
  }
  const article = document.createElement("article");
  article.className = `message ${role}`;
  article.innerHTML = `<div class="bubble">${html}</div>`;
  appendMessage(article, Boolean(options.forceScroll));
  return article;
}

function addUserMessage(text, options = {}) {
  const article = document.createElement("article");
  article.className = "message user";
  renderUserMessage(article, text, options.images || []);
  appendMessage(article, Boolean(options.forceScroll));
  return article;
}

function renderUserMessage(article, text, images = [], options = {}) {
  article.className = "message user";
  article.dataset.rawText = text;
  const imageItems = Array.isArray(images) ? images : [];
  const imageHtml = imageItems.length
    ? `<div class="userImageStrip">${imageItems
        .map(
          (image) => `
            <figure class="userImageThumb">
              <img src="${escapeHtml(image.dataUrl || "")}" alt="${escapeHtml(image.name || "uploaded image")}" />
            </figure>
          `,
        )
        .join("")}</div>`
    : "";
  article.innerHTML = `
    <div class="userMessageWrap">
      ${imageHtml}
      <div class="bubble userBubble">${escapeHtml(text)}</div>
      <div class="userActions" aria-label="消息操作">
        <button class="userActionButton copyUserMessage" type="button" data-tooltip="复制消息" aria-label="复制消息">
          <span class="actionIcon copyIcon" aria-hidden="true">${COPY_MESSAGE_ICON}</span>
          <span class="actionIcon checkIcon" aria-hidden="true">${CHECK_ICON}</span>
        </button>
        ${options.allowEdit === false ? "" : `<button class="userActionButton editUserMessage" type="button" data-tooltip="编辑消息" aria-label="编辑消息">
          <span class="actionIcon" aria-hidden="true">${EDIT_MESSAGE_ICON}</span>
        </button>`}
      </div>
    </div>
  `;
  const copyButton = article.querySelector(".copyUserMessage");
  copyButton?.addEventListener("mouseenter", () => setUserBubbleSelection(article, true));
  copyButton?.addEventListener("mouseleave", () => setUserBubbleSelection(article, false));
  copyButton?.addEventListener("click", () => copyUserMessage(article));
  article.querySelector(".editUserMessage")?.addEventListener("click", () => options.onEdit ? options.onEdit() : beginEditUserMessage(article));
}

async function copyUserMessage(article) {
  const button = article.querySelector(".copyUserMessage");
  const text = article.dataset.rawText || article.querySelector(".userBubble")?.textContent || "";
  const images = Array.from(article.querySelectorAll(".userImageThumb img"))
    .map((image) => ({
      src: image.getAttribute("src") || "",
      alt: image.getAttribute("alt") || "image",
    }))
    .filter((image) => image.src);
  try {
    if (images.length && window.ClipboardItem && navigator.clipboard?.write) {
      const htmlContent = userMessageClipboardHtml(text, images);
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([clipboardPlainText(text, images)], { type: "text/plain" }),
          "text/html": new Blob([htmlContent], { type: "text/html" }),
        }),
      ]);
    } else {
      await navigator.clipboard.writeText(text);
    }
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    const wrap = article.querySelector(".userMessageWrap") || article.querySelector(".userBubble");
    if (wrap) {
      range.selectNodeContents(wrap);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand("copy");
      selection.removeAllRanges();
    }
  }
  button?.classList.add("is-copied");
  setUserBubbleSelection(article, false);
  window.setTimeout(() => button?.classList.remove("is-copied"), 3000);
}

function clipboardPlainText(text, images) {
  const imageNote = images.length ? `\n${images.map((image) => `[image: ${image.alt || "image"}]`).join("\n")}` : "";
  return `${text || ""}${imageNote}`;
}

function userMessageClipboardHtml(text, images) {
  const imageHtml = images
    .map((image) => `<p><img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}" style="max-width:360px;height:auto;" /></p>`)
    .join("");
  const textHtml = text ? `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>` : "";
  return `<!doctype html><html><body>${imageHtml}${textHtml}</body></html>`;
}

function beginEditUserMessage(article, options = {}) {
  if (article.classList.contains("is-editing")) return;
  const original = article.dataset.rawText || "";
  article.classList.add("is-editing");
  article.innerHTML = `
    <div class="userEditBox">
      <textarea class="userEditInput" rows="1">${escapeHtml(original)}</textarea>
      <div class="userEditActions">
        <button class="userEditCancel" type="button">取消</button>
        <button class="userEditSend" type="button">发送</button>
      </div>
    </div>
  `;
  const textarea = article.querySelector(".userEditInput");
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  autoResizeUserEdit(textarea);
  textarea.addEventListener("input", () => autoResizeUserEdit(textarea));
  const restore = () => renderUserMessage(article, original, options.images || [], options.renderOptions || {});
  const submit = () => {
    if (!options.onSubmit) return submitEditedUserMessage(article);
    const text = textarea.value.trim();
    if (text && !textarea.disabled) return options.onSubmit(text);
  };
  article.querySelector(".userEditCancel")?.addEventListener("click", restore);
  article.querySelector(".userEditSend")?.addEventListener("click", submit);
  textarea.addEventListener("keydown", (event) => {
    handleMessageEnter(event, textarea, submit);
    if (event.key === "Escape") {
      event.preventDefault();
      restore();
    }
  });
}

async function addImageFiles(fileList) {
  const files = Array.from(fileList || []).filter((file) => file.type.startsWith("image/"));
  if (!files.length) return;
  const remaining = Math.max(0, 6 - pendingImages.length);
  const selected = files.slice(0, remaining);
  const loaded = await Promise.all(
    selected
      .filter((file) => file.size <= 8 * 1024 * 1024)
      .map(async (file) => ({
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name: file.name || "image",
        mimeType: file.type || "image/png",
        size: file.size,
        dataUrl: await fileToDataUrl(file),
      })),
  );
  pendingImages = pendingImages.concat(loaded);
  renderAttachmentPreview();
  updateComposerState();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

function renderAttachmentPreview() {
  if (!attachmentPreview) return;
  attachmentPreview.hidden = pendingImages.length === 0;
  composerBox?.classList.toggle("has-attachments", pendingImages.length > 0);
  attachmentPreview.innerHTML = pendingImages
    .map(
      (image) => `
        <div class="attachmentThumb" data-id="${escapeHtml(image.id)}">
          <img src="${escapeHtml(image.dataUrl)}" alt="${escapeHtml(image.name)}" />
          <button type="button" class="attachmentRemove" aria-label="移除图片">×</button>
        </div>
      `,
    )
    .join("");
  attachmentPreview.querySelectorAll(".attachmentRemove").forEach((control) => {
    control.addEventListener("click", () => {
      const id = control.closest(".attachmentThumb")?.dataset.id;
      pendingImages = pendingImages.filter((image) => image.id !== id);
      renderAttachmentPreview();
      updateComposerState();
    });
  });
}

function clearPendingImages() {
  pendingImages = [];
  renderAttachmentPreview();
}

function imageRequestPayload(image) {
  return {
    name: image.name || "image",
    mimeType: image.mimeType || "image/png",
    dataUrl: image.dataUrl || "",
  };
}

function imageSessionPayload(images) {
  return images.map((image) => ({
    name: image.name || "image",
    mimeType: image.mimeType || "image/png",
    dataUrl: image.dataUrl || "",
  }));
}

function autoResizeUserEdit(textarea) {
  if (!textarea) return;
  textarea.style.height = "0px";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
}

async function submitEditedUserMessage(article) {
  const textarea = article.querySelector(".userEditInput");
  const sendButton = article.querySelector(".userEditSend");
  const next = textarea?.value.trim();
  if (!next || sendButton?.disabled) return;
  if (activeController) activeController.abort();
  sendButton.disabled = true;
  sendButton.textContent = "发送中";
  try {
    await submitQuestion(next, { userArticle: article, replaceSessionQuestion: true });
  } finally {
    sendButton.disabled = false;
    sendButton.textContent = "发送";
  }
}

function removeMessagesAfter(article) {
  let next = article.nextElementSibling;
  while (next) {
    const current = next;
    next = next.nextElementSibling;
    current.remove();
  }
  closeActivityDrawer();
}

function setUserBubbleSelection(article, active) {
  const bubble = article.querySelector(".userBubble");
  if (!bubble) return;
  bubble.classList.toggle("is-highlighted", active);
  const selection = window.getSelection();
  if (!selection) return;
  if (!active) {
    selection.removeAllRanges();
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(bubble);
  selection.removeAllRanges();
  selection.addRange(range);
}

function appendMessage(article, forceScroll = false) {
  conversation.classList.remove("is-empty");
  messages.appendChild(article);
  if (forceScroll) scrollToLatestContent('auto');
  else scheduleScrollHint();
}

function setModelActivity(article, phase) {
  if (article.activityEnded || !["started", "completed"].includes(phase)) return;
  article.dataset.hasModelActivity = "true";
  article.dataset.activityPhase = phase === "started" ? "thinking" : article.answerTextStarted ? "answer" : "idle";
  syncActivityDrawer(article);
}

function isConnectionProgressText(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return /^(?:正在连接 ?Agent|正在連接 ?Agent|连接模型|連接模型|Connecting to (?:agent|model))/i.test(text);
}

function appendStep(article, text, detail = "", state = "loading", stepKey = "") {
  if (!text || isConnectionProgressText(text)) return;
  const list = article.querySelector(".thinkingSteps");
  const normalizedKey = stepKey || `${text}::${detail}::${state}`;
  if (!article.activityStepKeys) article.activityStepKeys = new Set();
  if (article.activityStepKeys.has(normalizedKey)) {
    return;
  }
  article.activityStepKeys.add(normalizedKey);
  article.dataset.activityPhase = article.answerTextStarted ? "answer" : "summary";
  const shouldStick = isNearBottom();
  list.querySelectorAll("li.is-loading:not(.is-tool-step)").forEach((item) => {
    item.classList.remove("is-loading");
    item.classList.add("is-done");
  });
  const item = document.createElement("li");
  item.className = state === "error" ? "is-error" : state === "done" ? "is-done" : "is-loading";
  item.innerHTML = `
    <div class="activityStepTitle">${escapeHtml(text)}</div>
    ${detail && String(detail).trim() !== String(text).trim() ? `<div class="activityStepDetail">${escapeHtml(detail)}</div>` : ""}
  `;
  list.appendChild(item);
  if (state !== "error") {
    article.dataset.currentThinking = detail || text;
  }
  updateThinkingSummary(article, copyFor(article.dataset.lang || "en", "thinking"), { live: true });
  syncActivityDrawer(article);
  keepScrollPosition(shouldStick);
}

function appendRichStep(article, { titleHtml, detailHtml = "", drawerDetailHtml = "", state = "loading", stepKey = "", currentThinking = "", className = "" }) {
  if (!titleHtml) return null;
  const list = article.querySelector(".thinkingSteps");
  const normalizedKey = stepKey || `${titleHtml}::${detailHtml}::${state}`;
  if (!article.activityStepKeys) article.activityStepKeys = new Set();
  if (article.activityStepKeys.has(normalizedKey)) return null;
  article.activityStepKeys.add(normalizedKey);
  const shouldStick = isNearBottom();
  list.querySelectorAll("li.is-loading:not(.is-tool-step)").forEach((item) => {
    item.classList.remove("is-loading");
    item.classList.add("is-done");
  });
  const item = document.createElement("li");
  item.className = `${state === "error" ? "is-error" : state === "done" ? "is-done" : "is-loading"} ${className}`.trim();
  item.innerHTML = `
    <div class="activityStepTitle">${titleHtml}</div>
    ${detailHtml ? `<div class="activityStepDetail">${detailHtml}</div>` : ""}
    ${drawerDetailHtml ? `<div class="activityDrawerOnly">${drawerDetailHtml}</div>` : ""}
  `;
  list.appendChild(item);
  if (state !== "error") {
    article.dataset.currentThinking = currentThinking || item.textContent.trim();
  }
  updateThinkingSummary(article, copyFor(article.dataset.lang || "en", "thinking"), { live: true });
  syncActivityDrawer(article);
  keepScrollPosition(shouldStick);
  return item;
}

function appendNewsSearchStep(article, data) {
  const lang = article.dataset.lang || "en";
  const title = newsSearchTitle(data, lang);
  const sources = uniqueNewsDomains(data?.sources || []);
  const visibleSources = sources.slice(0, 3);
  const sourceChips = visibleSources
    .map((source) => {
      const label = escapeHtml(source.domain || "ainvest.com");
      const href = source.url ? ` href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer"` : "";
      const logo = sourceLogoForDomain(source.domain || source.url || "ainvest.com");
      return `<a class="newsSearchPill"${href}><img class="newsSearchLogo" src="${escapeHtml(logo)}" alt="" /><span>${label}</span></a>`;
    })
    .join("");
  const hiddenCount = Math.max(0, sources.length - visibleSources.length);
  const more = hiddenCount > 0 ? `<span class="newsSearchMore">${escapeHtml(newsSearchMoreText(lang, hiddenCount))}</span>` : "";
  const detailHtml = `<div class="newsSearchPills">${sourceChips}${more}</div>`;
  appendRichStep(article, {
    titleHtml: `<span class="newsSearchIcon">${SEARCH_GLOBE_ICON}</span><span>${escapeHtml(title)}</span>`,
    detailHtml,
    state: "loading",
    stepKey: `news-search:${data?.code || ""}:${sources.map((source) => source.domain).join("|")}`,
    currentThinking: title,
    className: "is-news-search",
  });
}

function appendToolStep(article, data) {
  if (article.activityEnded) return;
  if (data?.skillId) {
    data = {...data,
      params: [JSON.stringify(data.input || {}, null, 2)],
      observation: data.phase === "failed" ? JSON.stringify(data.error || {}, null, 2)
        : data.phase === "completed" ? JSON.stringify(data.output ?? null, null, 2) : "",
    };
  }
  const lang = normalizeLang(article.dataset.lang || data?.lang || "en");
  const tool = String(data?.tool || data?.script || "Tool").trim();
  const script = String(data?.script || "").trim();
  const code = String(data?.code || "").trim();
  const params = Array.isArray(data?.params) ? data.params.map((item) => String(item)) : [];
  const shellCommand = Array.isArray(data?.shellCommand) ? data.shellCommand.map((item) => String(item)) : [];
  const output = String(data?.observation || "").trim();
  const preObservation = String(data?.preObservation || "").trim();
  const phase = String(data?.phase || "").trim().toLowerCase();
  const observation = phase === "started" ? "" : publicToolObservation([preObservation, output].filter(Boolean).join("\n"), lang);
  const callId = String(data?.callId || "").trim();
  const fileChanges = activityFileChangesFromTool(data, tool, observation, phase);
  if (script === "multimodal_vision" && mergeVisionToolStep(article, { script, code, params, shellCommand, lang })) {
    return;
  }
  const dynamicTitle = toolActivityTitle(data, script, tool, code, params, shellCommand, lang);
  const layaClassified = data?.activitySemantics?.provider === 'local-laya' && data.activitySemantics.status === 'classified';
  const thought = layaClassified ? String(data?.thoughtSummary || '').trim() : modelActivitySummary(data?.thoughtSummary, lang);
  const publicProgress = [data?.nextThought, thought].map(value => layaClassified && value === thought ? thought : modelActivitySummary(value, lang))
    .find(value => value && ![tool, script].some(name => name && value.toLowerCase() === name.toLowerCase()));
  // A new tool action supersedes older progress; completion of an older
  // parallel call must not overwrite a newer progress update.
  if (phase === 'started' && !data?.semanticUpdate) article.dataset.currentActivityCallId = callId;
  if (publicProgress && ((phase === 'started' && !data?.semanticUpdate) || (data?.semanticUpdate && article.dataset.currentActivityCallId === callId))) article.dataset.publicThoughtText = publicProgress;
  const flowingText = article.dataset.publicThoughtText || publicProgress || article.dataset.currentThinking || copyFor(lang, "thinking");
  let actionArgument = shellCommand.length ? shellCommand.map(shellQuote).join(" ") : "";
  let input = null;
  if (!actionArgument && params[0]) {
    try {
      input = JSON.parse(params[0]);
      const argument = input?.command || input?.cmd || input?.file_path || input?.path || input?.url || input?.query || input?.pattern;
      actionArgument = Array.isArray(argument) ? argument.join(" ") : typeof argument === "string" ? argument : "";
    } catch { actionArgument = params[0]; }
  }
  if (/write|edit|patch/i.test(tool) && (!actionArgument || actionArgument.startsWith("{"))) {
    actionArgument = observation.match(/<path>([^<]+)<\/path>/i)?.[1]
      || observation.match(/(?:cannot (?:modify|write)|created|updated|wrote)[^"\n]*"([^"]+)"/i)?.[1]
      || actionArgument;
  }
  const kind = activityToolKind(script || tool);
  const renderTool = (item) => {
    const wasOpen = item.querySelector("details")?.open || false;
    const previousThought = modelActivitySummary(item.querySelector(".activityThoughtSummary")?.textContent, lang);
    const command = actionArgument || item.dataset.toolArgument || "";
    const inputText = kind === "shell" || (kind === "edit" && command) ? command : params.join("\n") || item.dataset.toolInput || "";
    const running = !["completed", "failed"].includes(phase);
    const chinese = lang === "zh-Hans" || lang === "zh-Hant";
    const verb = activityToolVerb(kind, running, chinese);
    const actionText = [verb, command || tool].join(" ");
    const state = phase === "failed" ? (chinese ? "失败" : "Failed") : running ? (chinese ? "执行中" : "Running") : (chinese ? "成功" : "Success");
    const statusIcon = running ? '<span class="activityRunningDot" aria-hidden="true"></span>' : phase === "failed" ? "×" : "✓";
    const fileChangeMarkup = fileChanges.length ? activityFileChangesMarkup(fileChanges, lang) : "";
    const panel = `<section class="activityCommandPanel"><div class="activityCommandLabel">${escapeHtml(kind === "shell" ? "Shell" : tool)}</div>
      ${inputText ? `<pre class="toolStepInput"><code>${escapeHtml(kind === "shell" ? `$ ${inputText}` : inputText)}</code></pre>` : ""}
      ${observation ? `<pre class="toolStepOutputBlock"><code>${escapeHtml(observation)}</code></pre>` : ""}
      <div class="activityToolState" role="status" data-status="${running ? "running" : phase}">${statusIcon} ${escapeHtml(state)}</div></section>`;
    item.dataset.toolName = tool;
    item.dataset.activityOrder ||= String(article.replayBlockOrder?.get('tool:' + callId) || (article.nextActivityOrder = (article.nextActivityOrder || 0) + 1));
    if (article.replayBlockOrder && item.parentElement) {
      const next = Array.from(item.parentElement.children).find(row => row !== item && Number(row.dataset.activityOrder) > Number(item.dataset.activityOrder));
      if (next) item.parentElement.insertBefore(item,next);
    }
    item.dataset.toolKind = kind;
    item.dataset.toolArgument = command;
    item.dataset.toolInput = inputText;
    item.dataset.toolPhase = phase;
    if (data?.activitySemantics) item.dataset.activitySemantics = JSON.stringify(data.activitySemantics);
    item.dataset.fileChanges = fileChanges.length ? JSON.stringify(fileChanges) : "";
    const toolDetails = `<details class="activityTool"${wasOpen ? " open" : ""}>
        <summary class="activityAction" title="${escapeHtml(actionText)}"><span class="activityActionIcon" aria-hidden="true">${activityActionIcon(script || tool)}</span><span class="activityActionText">${escapeHtml(actionText)}</span><span class="activityActionChevron" aria-hidden="true"></span></summary>
        <div class="toolStepDetail">${panel}</div>
      </details>`;
    item.innerHTML = `${thought || previousThought ? `<p class="activityThoughtSummary">${escapeHtml(thought || previousThought)}</p>` : ""}
      ${fileChangeMarkup}${fileChanges.length ? "" : toolDetails}`;
    item.classList.remove("is-loading", "is-done", "is-error");
    item.classList.add(phase === "failed" ? "is-error" : phase === "completed" ? "is-done" : "is-loading");
    if (!data?.semanticUpdate) article.dataset.activityPhase = running || article.dataset.activityPhase === "tool" ? "tool" : article.answerTextStarted ? "answer" : article.dataset.hasModelActivity ? "idle" : "thinking";
  };
  if ((["completed", "failed"].includes(phase) || data?.semanticUpdate) && callId) {
    const existingItem = Array.from(article.querySelectorAll(".thinkingSteps li.is-tool-step"))
      .find((item) => item.dataset.toolCallId === callId);
    if (existingItem) {
      renderTool(existingItem);
      article.dataset.currentThinking = flowingText;
      updateThinkingSummary(article, copyFor(lang, "thinking"), { live: true });
      syncActivityDrawer(article);
      return;
    }
  }
  const item = appendRichStep(article, {
    titleHtml: `<span>${escapeHtml(dynamicTitle)}</span>`,
    state: phase === "failed" ? "error" : "loading",
    stepKey: `tool-step:${callId || data?.index || ""}:${phase || "step"}:${script}:${code}:${params.join("|")}`,
    currentThinking: flowingText,
    className: "is-tool-step",
  });
  if (item && callId) item.dataset.toolCallId = callId;
  if (item && data?.skillId) item.dataset.skillCallId = callId;
  if (item) {
    const previous = item.previousElementSibling;
    if (thought && previous?.classList.contains("is-model-summary") && previous.textContent.trim() === thought) previous.remove();
    renderTool(item);
    updateThinkingSummary(article, "", { live: true });
    syncActivityDrawer(article);
  }

}

function activityToolKind(tool) {
  const name = String(tool || "").toLowerCase();
  if (/bash|shell|exec|command/.test(name)) return "shell";
  if (/write|edit|patch|file[ _-]*changes?/.test(name)) return "edit";
  if (/search|web|fetch|browse|grep|glob/.test(name)) return "search";
  if (/read|file/.test(name)) return "read";
  return "tool";
}

function activityFileChangesFromTool(data, tool, observation, phase) {
  const explicit = Array.isArray(data?.fileChanges) ? data.fileChanges.filter((change) => change?.name) : [];
  if (explicit.length || phase !== "completed" || !/write|edit|patch/i.test(tool)) return explicit;
  const path = observation.match(/<path>([^<]+)<\/path>/i)?.[1]?.trim();
  if (!path || !/\/(?:outputs)\//.test(path) || !/<type>file<\/type>/i.test(observation)) return [];
  const relativePath = `outputs/${path.split("/outputs/")[1]}`;
  let added = null;
  try {
    const input = JSON.parse(String(data?.params?.[0] || ""));
    if (typeof input.content === "string") added = input.content.split(/\r?\n/).length;
  } catch {}
  return [{
    path,
    relativePath,
    name: path.split("/").at(-1),
    kind: /\bCreated file\b/i.test(observation) ? "created" : "edited",
    added,
    removed: added == null ? null : 0,
    previewable: true,
  }];
}

function activityFileChangesMarkup(changes, lang) {
  const chinese = /^zh/.test(lang || '');
  return `<div class="activityFileChanges">${changes.map((change, index) => {
    const kind = String(change.kind || "edited");
    const label = chinese
      ? (kind === "created" ? "已创建" : kind === "deleted" ? "已删除" : "已编辑")
      : (kind === "created" ? "Created" : kind === "deleted" ? "Deleted" : "Edited");
    const hasStats = change.added != null && change.removed != null
      && Number.isFinite(Number(change.added)) && Number.isFinite(Number(change.removed));
    const added = hasStats ? Math.max(0, Number(change.added) || 0) : 0;
    const removed = hasStats ? Math.max(0, Number(change.removed) || 0) : 0;
    const previewable = change.previewable !== false && kind !== "deleted";
    const attributes = `type="button" data-file-change-index="${index}" data-file-name="${escapeHtml(change.name)}" data-relative-path="${escapeHtml(change.relativePath || "")}" data-change-kind="${escapeHtml(kind)}" aria-label="${escapeHtml(label + " " + change.name)}"`;
    const name = `<span class="activityFileChangeNameText">${escapeHtml(change.name)}</span>`;
    return `<div class="activityFileChange${previewable ? " is-previewable" : ""}">
      <span class="activityFileChangeIcon" aria-hidden="true">${activityActionIcon("edit")}</span>
      <span class="activityFileChangeStatus">${escapeHtml(label)}</span>
      ${previewable ? `<button class="activityFileChangeName" data-tooltip="${escapeHtml(change.path || change.relativePath || change.name)}" ${attributes}>${name}</button>` : `<span class="activityFileChangeName">${name}</span>`}
      ${hasStats ? `<span class="activityFileChangeStats"><span class="is-added">+${added}</span> <span class="is-removed">-${removed}</span></span>` : ""}
      ${kind === "created" ? '<span class="activityFileCreatedDot" aria-hidden="true"></span>' : ""}
      ${previewable ? `<button class="activityFileChangeExpand" ${attributes}><span class="activityFileChangeChevron" aria-hidden="true"></span></button>` : ""}
    </div>`;
  }).join("")}</div>`;
}

function bindActivityFileChangeButtons(root) {
  root?.querySelectorAll?.(".activityFileChange [data-file-change-index]").forEach((button) => {
    if (button.dataset.boundFilePreview === "true") return;
    button.dataset.boundFilePreview = "true";
    button.addEventListener("click", () => {
      const relativePath = button.dataset.relativePath || "";
      const name = button.dataset.fileName || relativePath.split("/").at(-1) || "file.txt";
      const kind = button.dataset.changeKind === "created" ? "created" : "edited";
      if (!relativePath) return;
      const query = new URLSearchParams({path: relativePath, change: kind, theme: currentThemeMode()});
      const download = new URLSearchParams({path: relativePath});
      const suffix = name.includes(".") ? name.split(".").at(-1).toUpperCase() : "TXT";
      void openGeneratedFilePreview({
        name,
        type: suffix,
        open: `/api/workspace-file/preview?${query}`,
        download: `/api/workspace-file/download?${download}`,
        workspaceFile: true,
      }, button);
    });
  });
}

function activityToolVerb(kind, running, chinese) {
  const verbs = chinese
    ? {shell: ["正在运行", "已运行"], read: ["正在读取", "已读取"], edit: ["正在编辑", "已编辑"], search: ["正在搜索", "已搜索"], tool: ["正在调用", "已调用"]}
    : {shell: ["Running", "Ran"], read: ["Reading", "Read"], edit: ["Editing", "Edited"], search: ["Searching", "Searched"], tool: ["Calling", "Called"]};
  return verbs[kind || "tool"][running ? 0 : 1];
}

function activitySummaryKey(text) {
  return String(text || "").normalize("NFKC").replace(/\s+/g, "").replace(/[。.!！?？]+$/, "");
}

function rememberActivityDisclosure(event) {
  const detail = event.target;
  if (!detail.isConnected || !detail.matches?.("details[data-activity-key]") || !detail.closest(".thinkingFlow, .thinkingCurrentTool, #activityBody")) return;
  const article = detail.closest(".message.assistant") || activeActivityArticle;
  if (!article) return;
  if (!article.activityDisclosureState) article.activityDisclosureState = new Map();
  article.activityDisclosureState.set(detail.dataset.activityKey, detail.open);
  const views = [article.querySelector(".thinkingFlow"), article.querySelector(".thinkingCurrentTool"), activeActivityArticle === article ? activityBody : null];
  views.forEach((view) => view?.querySelectorAll("details[data-activity-key]").forEach((copy) => {
    if (copy !== detail && copy.dataset.activityKey === detail.dataset.activityKey && copy.open !== detail.open) copy.open = detail.open;
  }));
}

function bindActivityCommandPanels(root) {
  root?.querySelectorAll?.(".activityCommandCopy").forEach((button) => {
    if (button.commandCopyBound) return;
    button.commandCopyBound = true;
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const command = button.closest(".activityCommandPanel")?.querySelector(".toolStepInput code")?.textContent.replace(/^\$ ?/, "") || "";
      if (!command) return;
      const label = button.dataset.copyLabel;
      try {
        await navigator.clipboard.writeText(command);
        button.classList.add("is-copied");
        button.setAttribute("aria-label", button.dataset.copiedLabel);
        button.title = button.dataset.copiedLabel;
      } catch {
        button.setAttribute("aria-label", button.dataset.failedLabel);
        button.title = button.dataset.failedLabel;
      }
      window.setTimeout(() => {
        button.classList.remove("is-copied");
        button.setAttribute("aria-label", label);
        button.title = label;
      }, 1600);
    });
  });
}

function activityToolMarkup(article, item, key) {
  const clone = item.cloneNode(true);
  const running = item.classList.contains("is-loading") && !article.activityEnded;
  const rowClass = `activityToolRow ${item.className}${running ? ' is-current-tool' : ''}`;
  clone.querySelectorAll(".activityThoughtSummary, .activityStepTitle, :scope > .activityStepDetail").forEach((node) => node.remove());
  let details = clone.querySelector("details.activityTool");
  if (!details) return `<li class="${rowClass}">${clone.innerHTML}</li>`;
  const tool = item.dataset.toolName || "工具详情";
  const kind = item.dataset.toolKind || activityToolKind(tool);
  const chinese = /^zh/.test(article.dataset.lang || "zh");
  let input = item.dataset.toolInput || item.querySelector(".toolStepInput code")?.textContent || "";
  let argument = item.dataset.toolArgument || "";
  if (!argument && input) {
    try { const parsed = JSON.parse(input); argument = parsed.command || parsed.cmd || parsed.file_path || parsed.path || parsed.url || ""; } catch { argument = input.replace(/^\$\s*/, ""); }
  }
  if (!argument) {
    const previousAction = item.querySelector(".activityActionText")?.textContent || "";
    argument = previousAction
      .replace(/^(?:bash|shell|exec_command)\s*·\s*/i, "")
      .replace(/^(?:正在运行|已运行|正在读取|已读取|正在编辑|已编辑|正在搜索|已搜索|正在调用|已调用|Running|Ran|Reading|Read|Editing|Edited|Searching|Searched|Calling|Called)\s+/i, "")
      .trim() || tool;
  }
  argument = Array.isArray(argument) ? argument.join(" ") : String(argument);
  const action = `${activityToolVerb(kind, running, chinese)} ${argument}`;
  const summary = details.querySelector("summary");
  if (summary) {
    summary.className = "activityAction";
    summary.title = argument;
    summary.innerHTML = `<span class="activityActionIcon" aria-hidden="true">${activityActionIcon(kind === 'tool' ? tool : kind)}</span><span class="activityActionText">${escapeHtml(action)}</span><span class="activityActionChevron" aria-hidden="true"></span>`;
  }
  if (!details.querySelector(".activityCommandPanel")) {
    const output = item.querySelector(".toolStepOutputBlock")?.textContent || "";
    const previous = details.querySelector(".toolStepDetail");
    if (kind === "shell" && (input || argument || output)) {
      const status = item.classList.contains("is-error") ? (chinese ? "失败" : "Failed") : running ? (chinese ? "执行中" : "Running") : (chinese ? "成功" : "Success");
      if (previous) previous.remove();
      details.insertAdjacentHTML("beforeend", `<div class="toolStepDetail"><section class="activityCommandPanel"><div class="activityCommandLabel">Shell</div><pre class="toolStepInput"><code>${escapeHtml(`$ ${argument}`)}</code></pre>${output ? `<pre class="toolStepOutputBlock"><code>${escapeHtml(output)}</code></pre>` : ""}<div class="activityToolState">${escapeHtml(status)}</div></section></div>`);
    }
  }
  const status = details.querySelector(".activityToolState");
  if (status && !running && !["completed", "failed"].includes(item.dataset.toolPhase)) {
    const returned = item.dataset.toolPhase !== "started" && item.querySelector(".toolStepOutputBlock")?.textContent.trim();
    status.textContent = returned ? (chinese ? "已返回结果" : "Result returned") : (chinese ? "未记录完成结果" : "Completion not recorded");
    status.dataset.status = returned ? "returned" : "unknown";
  }
  if (kind === "shell") {
    const panel = details.querySelector(".activityCommandPanel");
    const command = panel?.querySelector(".toolStepInput");
    if (panel && command && !command.closest(".activityShellCommand")) {
      panel.classList.add("activityShellPanel");
      const disclosure = document.createElement("details");
      disclosure.className = "activityShellCommand";
      disclosure.dataset.activityKey = `command:${key}`;
      disclosure.open = article.activityDisclosureState?.get(disclosure.dataset.activityKey) ?? false;
      const toggle = document.createElement("summary");
      toggle.className = "activityShellCommandToggle";
      toggle.title = chinese ? "点击展开或收起全部命令" : "Click to expand or collapse the full command";
      command.before(disclosure);
      toggle.append(command);
      disclosure.append(toggle);
      const heading = panel.querySelector(".activityCommandLabel");
      const header = document.createElement("header");
      header.className = "activityCommandHeader";
      panel.prepend(header);
      if (heading) header.append(heading);
      const copyLabel = chinese ? "复制命令" : "Copy command";
      const copiedLabel = chinese ? "已复制" : "Copied";
      const failedLabel = chinese ? "复制失败，请重试" : "Copy failed, try again";
      header.insertAdjacentHTML("beforeend", `<button class="activityCommandCopy" type="button" aria-label="${copyLabel}" title="${copyLabel}" data-copy-label="${copyLabel}" data-copied-label="${copiedLabel}" data-failed-label="${failedLabel}"><svg viewBox="0 0 1024 1024" fill="currentColor" aria-hidden="true"><path d="M896 832h-64v-64h64a64 64 0 0 0 64-64V128a64 64 0 0 0-64-64H320a64 64 0 0 0-64 64v64H192V128a128 128 0 0 1 128-128h576a128 128 0 0 1 128 128v576a128 128 0 0 1-128 128z"/><path d="M704 1024H128a128 128 0 0 1-128-128V320a128 128 0 0 1 128-128h576a128 128 0 0 1 128 128v576a128 128 0 0 1-128 128zM128 256a64 64 0 0 0-64 64v576a64 64 0 0 0 64 64h576a64 64 0 0 0 64-64V320a64 64 0 0 0-64-64z"/></svg></button>`);
    }
  }
  details.dataset.activityKey = key;
  details.open = article.activityDisclosureState?.get(key) ?? false;
  return `<li class="${rowClass}">${clone.innerHTML}</li>`;
}

function buildActivityFlow(article, options = {}) {
  const list = article.querySelector(".thinkingSteps");
  if (!list) return "";
  const chinese = /^zh/.test(article.dataset.lang || "zh");
  const tokens = [], seen = new Set();
  let group = null;
  const addSummary = (value, stage, layaClassified = false) => {
    const text = layaClassified ? String(value || '').trim() : modelActivitySummary(value, article.dataset.lang || "zh-CN");
    const key = activitySummaryKey(text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    tokens.push({text, stage});
    group = null;
  };
  Array.from(list.children).forEach((item, index) => {
    const title = item.querySelector(".activityStepTitle")?.textContent.trim() || "";
    if (item.classList.contains("is-initial-status") || isConnectionProgressText(title)) {
      return;
    }
    if (item.classList.contains("is-tool-step")) {
      let semantics = {};
      try { semantics = JSON.parse(item.dataset.activitySemantics || '{}'); } catch {}
      addSummary(item.querySelector(".activityThoughtSummary")?.textContent || "", index, semantics.provider === 'local-laya' && semantics.status === 'classified');
      if (item.dataset.fileChanges) {
        group = null;
        tokens.push({tools: [{item, key: `tool:${item.dataset.toolCallId || index}`}]});
        return;
      }
      if (!group) { group = {tools: []}; tokens.push(group); }
      group.tools.push({item, key: `tool:${item.dataset.toolCallId || index}`});
    } else {
      addSummary(title, index);
      const detail = item.querySelector(":scope > .activityStepDetail");
      if (detail && !detail.querySelector("pre, .toolStepDetail")) addSummary(detail.textContent, index);
    }
  });
  const renderToken = (token) => {
    if (token.text) return `<li class="activityNarrative"><p>${escapeHtml(token.text)}</p></li>`;
    const tools = token.tools;
    if (tools.length === 1) return activityToolMarkup(article, tools[0].item, tools[0].key);
    const counts = new Map();
    tools.forEach(({item}) => {
      const kind = item.dataset.toolKind || activityToolKind(item.dataset.toolName);
      counts.set(kind, (counts.get(kind) || 0) + 1);
    });
    const names = chinese ? {shell:"条命令",read:"个文件",edit:"个文件",search:"次搜索",tool:"次工具调用"} : {shell:"commands",read:"files",edit:"files",search:"searches",tool:"tool calls"};
    const verbs = chinese ? {shell:"运行",read:"读取",edit:"编辑",search:"执行",tool:"执行"} : {shell:"Ran",read:"Read",edit:"Edited",search:"Performed",tool:"Made"};
    const active = tools.filter(({item}) => item.classList.contains("is-loading") && !article.activityEnded);
    const label = (chinese && !active.length ? "已" : "") + Array.from(counts, ([kind, count]) => `${verbs[kind]} ${count} ${names[kind]}`).join(chinese ? "、" : ", ");
    const key = `group:${tools[0].key}`;
    const open = article.activityDisclosureState?.get(key) ?? tools.some(({key}) => article.activityDisclosureState?.get(key) === true);
    const icon = ["edit", "search", "read", "shell", "tool"].find((kind) => counts.has(kind));
    return `<li class="activityToolGroup" data-tool-state="${active.length ? 'running' : 'completed'}"><details class="activityGroup" data-activity-key="${escapeHtml(key)}"${open ? " open" : ""}>
      <summary class="activityAction activityGroupAction"><span class="activityActionIcon" aria-hidden="true">${activityActionIcon(icon)}</span><span class="activityActionText">${escapeHtml(label)}</span><span class="activityActionChevron" aria-hidden="true"></span></summary>
      <ul class="activityGroupItems">${tools.map(({item,key}) => activityToolMarkup(article,item,key)).join("")}</ul></details>
      ${active.length ? `<ul class="activityCurrentAction">${active.map(({item,key}) => activityToolMarkup(article,item,key)).join("")}</ul>` : ""}</li>`;
  };
  // Keep the newest public stage and its tool records in the compact view.
  // The source list always retains the complete execution history.
  const latestStage = tokens.findLastIndex(token => token.text);
  const visible = options.latestOnly
    ? tokens.slice(latestStage < 0 ? Math.max(0, tokens.length - 1) : latestStage)
    : tokens;
  return `<ol class="activityFlowList">${visible.map(renderToken).join("")}</ol>`;
}

function isInlineActivityExpanded(article) {
  return article.dataset.activityInlineExpanded === "true";
}

function syncInlineActivity(article) {
  const source = article.querySelector(".thinkingSteps");
  if (!source) return null;
  article.querySelectorAll(".thinkingElapsedLive").forEach(node => node.remove());
  source.hidden = true;
  let currentTool = article.querySelector(".thinkingCurrentTool");
  if (!currentTool) {
    currentTool = document.createElement("div");
    currentTool.className = "thinkingCurrentTool";
    source.before(currentTool);
  }
  const expanded = isInlineActivityExpanded(article);
  // Stream the latest public stage until answer content starts. Later tool
  // events must not bring this preview back alongside text or visualization.
  currentTool.hidden = Boolean(article.activityEnded || article.answerTextStarted ||
    article.visualizationStarted || article.dataset.thinkingState !== "active" || expanded);
  if (currentTool.hidden) {
    currentTool.replaceChildren();
    delete currentTool.dataset.signature;
  } else if (currentTool.dataset.signature !== source.innerHTML) {
    currentTool.innerHTML = buildActivityFlow(article, {latestOnly:true});
    bindActivityFileChangeButtons(currentTool);
    bindActivityCommandPanels(currentTool);
    currentTool.dataset.signature = source.innerHTML;
  }
  let view = article.querySelector(".thinkingFlow");
  if (!view) {
    view = document.createElement("div");
    view.className = "thinkingFlow";
    view.id = `thinking-${crypto.randomUUID()}`;
    source.before(view);
  }
  view.hidden = !expanded;
  const signature = `${article.activityEnded}:${article.dataset.activityPhase || ""}:${source.innerHTML}`;
  if (article.activityFlowSignature !== signature) {
    const focused = view.contains(document.activeElement) ? document.activeElement.closest("details")?.dataset.activityKey : "";
    view.innerHTML = buildActivityFlow(article);
    bindActivityFileChangeButtons(view);
    bindActivityCommandPanels(view);
    if (focused) Array.from(view.querySelectorAll("details[data-activity-key]")).find((item) => item.dataset.activityKey === focused)?.querySelector("summary")?.focus({preventScroll:true});
    article.activityFlowSignature = signature;
  }
  return view;
}

function activityActionIcon(tool) {
  const name = String(tool).toLowerCase();
  if (name === "tool-group") {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><rect x="3" y="4" width="4" height="4" rx="1"/><path d="M11 6h10"/><rect x="3" y="10" width="4" height="4" rx="1"/><path d="M11 12h10"/><rect x="3" y="16" width="4" height="4" rx="1"/><path d="M11 18h10"/></svg>';
  }
  if (activityToolKind(name) === "tool" || /(?:^|[\s._-])skill(?:$|[\s._-])/.test(name)) {
    return '<svg viewBox="0 0 1024 1024" fill="currentColor" aria-hidden="true"><path d="M639.75 56c17.496 0 31.712 14.042 31.995 31.47l.004.53v179.999l95.25.001c17.496 0 31.713 14.042 31.996 31.47l.004.53v212c0 147.199-111.18 268.716-254.499 284.634V936c0 17.673-14.327 32-32 32-17.497 0-31.714-14.042-31.996-31.47l-.005-.53V796.633C337.332 780.727 226 659.363 226 512V300c0-17.673 14.327-32 32-32l95.249-.001V88c0-17.673 14.328-32 32-32 17.497 0 31.714 14.042 31.996 31.47l.005.53-.001 179.999h190.5V88c0-17.673 14.327-32 32-32zM639.539 331.998l-254.077.001-.212.001-.211-.002-95.039.001V512c0 121.597 97.631 220.406 218.82 222.37l3.609.029 3.876-.032 3.517-.085c118.418-3.82 213.244-100.07 215.148-218.645l.029-3.637V331.999H639.96l-.212.001-.21-.002z"/></svg>';
  }
  if (activityToolKind(name) === "search") {
    return '<svg data-icon-kind="search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>';
  }
  const path = /bash|shell|exec|command|python/.test(name)
    ? '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m7 8 4 4-4 4m6 0h4"/>'
    : /write|edit|patch/.test(name)
    ? '<path d="m16 3 5 5L9 20l-6 1 1-6L16 3ZM14 5l5 5"/>'
    : /read|file/.test(name)
    ? '<path d="M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v15"/>'
    : '<path d="m8 5-6 7 6 7m8-14 6 7-6 7m-3-16-2 18"/>';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

function publicToolObservation(value, lang = "zh-Hans") {
  let text = String(value || "").trim();
  for (let depth = 0; depth < 2; depth += 1) {
    try {
      const envelope = JSON.parse(text);
      if (!envelope || typeof envelope !== "object") break;
      if (envelope.callId && envelope.name && "arguments" in envelope) return "";
      if (envelope.failed === true) {
        const missing = /cannot read|not found|no such file/i.test(String(envelope.summary || ""));
        if (lang === "zh-Hans" || lang === "zh-CN") return missing ? "所需中间文件未生成，已停止读取并切换可用结果。" : "工具执行失败，已记录错误并停止重复尝试。";
        if (lang === "zh-Hant") return missing ? "所需中間檔案未產生，已停止讀取並切換可用結果。" : "工具執行失敗，已記錄錯誤並停止重複嘗試。";
        return missing ? "The required intermediate file was not created; reading stopped and an available result will be used." : "The tool failed; the error was recorded and duplicate attempts were stopped.";
      }
      if (envelope.message?.role === "tool" || envelope.message?.source?.kind === "tool") {
        text = (envelope.message.content || []).filter(block => block.type === "text").map(block => block.text || "").join("\n").trim();
        continue;
      }
      break;
    } catch { break; /* Plain tool text is already the observation. */ }
  }
  if (/^No files found\.?$/i.test(text)) return "";
  const hasKeyCheck = /\b[A-Z][A-Z0-9_]*_API_KEY\s+(?:set|configured|present)\b|key present above\s*\(count\)/i.test(text);
  if (!hasKeyCheck) return text;
  const cleaned = text
    .replace(/^\s*\d+\s*\n\s*key present above\s*\(count\)\s*$/gim, "")
    .split("\n")
    .filter(line => !/^\s*(?:[A-Z][A-Z0-9_]*_API_KEY\s+(?:set|configured|present)\b.*|key present above\s*\(count\)|=+\s*\w+\s+key configured\?\s*=+|[A-Z][A-Z0-9_]*_MODEL\s*:\s*(?:None|null)|len\s+\d+|model\s+(?:None|null))\s*$/i.test(line))
    .join("\n").trim();
  return /^\d+$/.test(cleaned) ? "" : cleaned;
}

function cachedToolStepData(step, index = 0) {
  const detail = String(step?.detail || "").trim();
  const callMatch = detail.match(/^调用[：:]\s*([^\n]+)$/m);
  const paramsMatch = detail.match(/^参数[：:]\s*([^\n]*)$/m);
  const resultMarker = detail.match(/^结果[：:]\s*/m);
  const durationMatch = detail.match(/\n耗时[：:]\s*[^\n]*\s*$/);
  const tool = String(step?.tool || callMatch?.[1] || "Tool").trim();
  let observation = "";
  if (resultMarker?.index != null) {
    const resultStart = resultMarker.index + resultMarker[0].length;
    const resultEnd = durationMatch?.index != null && durationMatch.index > resultStart ? durationMatch.index : detail.length;
    observation = detail.slice(resultStart, resultEnd).trim();
  }
  const displayInput = String(step?.input || step?.params || paramsMatch?.[1] || "").trim()
    || (normalizeLang(step?.lang || "zh-CN") === "zh-Hans" ? "无额外 CLI 参数" : "No extra CLI arguments");
  return {
    tool,
    script: tool,
    phase: step?.state === "error" ? "failed" : "completed",
    callId: String(step?.callId || `cached-tool-${index}`),
    thoughtSummary: step?.title || "",
    displayDetail: tool,
    displayInput,
    observation: observation || detail,
  };
}

function appendCachedActivityStep(article, step, index = 0) {
  const detail = String(step?.detail || "");
  if (step?.tool || /^调用[：:]/m.test(detail)) {
    appendToolStep(article, cachedToolStepData(step, index));
    return;
  }
  appendStep(article, step?.title || "继续分析", detail || "此案例未保存该步骤的执行明细", step?.state || "done", `case-step-${index}`);
}

function compactReasoningTitle(value, lang) {
  lang = normalizeLang(lang);
  let text = stripStagePrefix(String(value || ""))
    .replace(/\s+/g, " ")
    .replace(/^[#*\-\d.、\s]+/, "")
    .trim();
  if (!text) return "";
  text = text.split(/[。！？!?\n]/, 1)[0].trim();
  if (lang === "zh-Hans" || lang === "zh-Hant") {
    if (/^我/.test(text)) return text;
    text = text
      .replace(/^(?:这一步|這一步|本步|当前步骤|當前步驟)\s*(?:需要|将|將|会|會|先要|先)?\s*/, "")
      .replace(/^(?:首先|先|需要|将|將|会|會)\s*/, "");
    if (/^(?:检查|檢查|读取|讀取|搜索|搜尋|检索|檢索|获取|取得|整理|计算|計算|生成|分析|验证|驗證|比较|比較|识别|識別|定位|调用|調用|执行|執行|汇总|彙總|综合|綜合)/.test(text)) {
      text = `正在${text}`;
    }
    return text;
  }
  return text;
}

function modelActivitySummary(value, lang = "") {
  const text = typeof value === "string" ? value.trim() : "";
  // Public descriptions must match the conversation language. Keep commands and
  // file paths in the action details; never add a translation model to the stream.
  if (/^zh/.test(normalizeLang(lang)) && text && !/[\u3400-\u9fff]/.test(text)) return "";
  // Recognize old generated labels for migration only. Never generate a summary.
  const legacy = /^(?:正在(?:执行本地计算|執行本地計算|处理数据与准备分析|處理資料與準備分析|检查项目与运行环境|檢查專案與執行環境|读取相关 Skill 规范|讀取相關 Skill 規範|核对图表数据契约|核對圖表資料契約|定位所需文件与能力|定位所需檔案與能力|获取外部数据与证据|取得外部資料與證據|整理并计算数据|整理並計算資料|检索相关事实与市场信息|檢索相關事實與市場資訊|推进当前分析步骤|推進目前分析步驟|汇总分析结果|生成报告|生成 HTML 报告|读取所需技能|等待网络响应|读取后台任务结果|处理数据与准备分析)|Preparing data and analysis|Checking the project and runtime environment|Reading the relevant Skill instructions|Checking the chart data contract|Locating the required files and capabilities|Retrieving external data and evidence|Organizing and calculating the data|Searching for relevant facts and market context|Advancing the current analysis step)[。.!！]?$/i;
  if (legacy.test(text) || /^(?:正在执行|正在執行|执行工具[:：]|執行工具[:：]|Running(?: tool:)?\s+)\s*(?:bash|shell|exec_command|command_execution|write|read|edit|glob|grep|python|\S+\.(?:py|sh))[。.!！]?$/i.test(text)) return "";
  if (/^(?:DeepSeek Harness\s+使用|AutoGen AgentChat\s*[·:])/i.test(text)) return "";
  return text;
}

function toolActivityTitle(data, script, fallback, code, params, shellCommand, lang) {
  if (data?.activitySemantics?.provider === 'local-laya' && data.activitySemantics.status === 'classified' && data.thoughtSummary) return String(data.thoughtSummary);
  const reasoningTitle = modelActivitySummary(data?.thoughtSummary, lang);
  if (reasoningTitle) return reasoningTitle;
  return String(data?.tool || script || fallback || "Tool").trim();
}

function refreshSavedToolStepTitles(root, lang) {
  root?.querySelectorAll?.(".activityStepTitle, .activityThoughtSummary, .toolStepThought, .activityStepDetail").forEach((node) => {
    const summaryLang = node.matches(".activityStepDetail") ? "" : lang;
    if (node.textContent.trim() && !modelActivitySummary(node.textContent, summaryLang)) {
      if (modelActivitySummary(node.textContent) === "") root.dataset.legacyActivity = "true";
      const toolName = node.textContent.trim().match(/^(?:正在执行|正在執行|执行工具[:：]|Running(?: tool:)?\s+)\s*(bash|shell|exec_command|command_execution|write|read|edit|glob|grep)\s*$/i)?.[1];
      if (toolName && node.closest("li")) node.closest("li").dataset.toolName = toolName;
      node.remove();
    }
  });
  root?.querySelectorAll?.(".is-agentchat-step").forEach((item) => {
    if (!item.querySelector(".activityStepTitle, .activityThoughtSummary")) item.remove();
  });
  root?.querySelectorAll?.("li.is-tool-step").forEach((item) => {
    const detail = item.querySelector(":scope > .activityStepDetail");
    if (detail && /^(?:(?:[^·\n]+\s*·\s*)?(?:DSH|CODEX)|(?:bash|shell|exec_command|command_execution|\S+\.(?:py|sh))(?:\s*·.*)?)$/i.test(detail.textContent.trim())) {
      detail.remove();
    }
    item.querySelectorAll(".toolStepBlock").forEach((block) => {
      if (/^SKILL\s*(?:输入|輸入|input)/i.test(block.querySelector(".toolStepBlockLabel")?.textContent.trim() || "")) block.remove();
    });
    item.querySelectorAll(".toolStepOutputBlock").forEach((block) => {
      const code = block.querySelector("pre code");
      if (!code) return;
      const cleaned = publicToolObservation(code.textContent);
      if (!cleaned) block.remove();
      else if (cleaned !== code.textContent) code.textContent = cleaned;
    });
    const title = item.querySelector(".activityStepTitle");
    const shellInput = Array.from(item.querySelectorAll(".toolStepBlockLabel")).some((node) => node.textContent.trim() === "Shell");
    const tool = item.dataset.toolName && item.dataset.toolName !== "Tool" ? item.dataset.toolName : (shellInput ? "shell" : "工具详情");
    item.dataset.toolName = tool;
    item.dataset.toolKind = activityToolKind(tool);
    if (shellInput && !item.dataset.toolArgument) {
      const block = Array.from(item.querySelectorAll(".toolStepBlock")).find((node) => node.querySelector(".toolStepBlockLabel")?.textContent.trim() === "Shell");
      const raw = block?.querySelector("pre")?.textContent.trim() || "";
      try { const input = JSON.parse(raw); item.dataset.toolArgument = input.command || input.cmd || raw; }
      catch { item.dataset.toolArgument = raw; }
    }
    if (item.querySelector(".activityTool")) {
      const action = item.querySelector(".activityActionText");
      if (action?.textContent.trim() === "Tool") action.textContent = tool;
      return;
    }
    if (title) title.className = "activityThoughtSummary";
    const details = document.createElement("details");
    details.className = "activityTool";
    details.innerHTML = `<summary class="activityAction"><span class="activityActionIcon" aria-hidden="true">${activityActionIcon(tool)}</span><span class="activityActionText">${escapeHtml(tool)}</span><span class="activityActionChevron" aria-hidden="true"></span></summary>`;
    item.querySelectorAll(":scope > .activityStepDetail, :scope > .activityDrawerOnly").forEach((node) => {
      node.classList.remove("activityDrawerOnly");
      details.append(node);
    });
    item.append(details);
  });
}

function appendAgentChatEvent(article, data) {
  const lang = normalizeLang(article.dataset.lang || data?.lang || "en");
  const phase = String(data?.phase || "run");
  const status = String(data?.status || "");
  const agent = String(data?.agent || "aime_chart_agent");
  const message = String(data?.message || "AutoGen AgentChat");
  const engine = String(data?.engine || "AutoGen AgentChat");
  const trace = Array.isArray(data?.trace) ? data.trace.map((item) => String(item)) : [];
  const contracts = Array.isArray(data?.contracts) ? data.contracts.map((item) => String(item)) : [];
  const isChinese = lang === "zh-Hans" || lang === "zh-Hant";
  const phaseLabel = phase === "planning"
    ? (isChinese ? "规划 Agent" : "Planning agent")
    : phase === "interpretation"
      ? (isChinese ? "解读 Agent" : "Interpretation agent")
      : (isChinese ? "Agent 运行" : "Agent run");
  const statusLabel = status === "started"
    ? (isChinese ? "开始" : "started")
    : status === "completed"
      ? (isChinese ? "完成" : "completed")
      : status === "fallback"
        ? (isChinese ? "已回退" : "fallback")
        : status;
  const isModelConnection = phase === "run" && status === "started" && /DeepSeek Harness/i.test(engine);
  const blocks = [];
  if (trace.length) {
    blocks.push(toolBlockHtml(isChinese ? "AgentChat 工具轨迹" : "AgentChat tool trace", trace.join("\n")));
  }
  if (contracts.length) {
    blocks.push(toolBlockHtml(isChinese ? "已读取组件契约" : "Component contracts read", contracts.join("\n")));
  }
  const eventRecord = {
    engine,
    agent,
    phase,
    status,
    message,
    runId: String(data?.runId || ""),
    trace,
    contracts,
  };
  if (!Array.isArray(article.agentEvents)) article.agentEvents = [];
  article.agentEvents.push(eventRecord);
  article.dataset.agentRunId = eventRecord.runId || article.dataset.agentRunId || "";
  if (isModelConnection) return;
  const summary = modelActivitySummary(data?.thoughtSummary, lang);
  if (!summary) return;
  appendRichStep(article, {
    titleHtml: `<span>${escapeHtml(summary)}</span>`,
    detailHtml: "",
    drawerDetailHtml: blocks.length ? `<div class="toolStepDetail">${blocks.join("")}</div>` : "",
    state: status === "failed" ? "error" : "loading",
    stepKey: `agentchat:${phase}:${status}:${agent}`,
    currentThinking: `${phaseLabel} ${statusLabel}`.trim(),
    className: "is-agentchat-step",
  });
}

function appendModuleErrorStep(article, data) {
  const lang = normalizeLang(article.dataset.lang || data?.lang || "en");
  const script = String(data?.script || "").trim();
  const message = errorDetail(data?.message, lang);
  const shellCommand = Array.isArray(data?.shellCommand) ? data.shellCommand.map((item) => String(item)) : [];
  const drawerBlocks = [];
  if (shellCommand.length) {
    drawerBlocks.push(toolBlockHtml("", formatShellCommand(shellCommand)));
  }
  if (message) {
    drawerBlocks.push(toolBlockHtml(skillErrorLabel(lang), message));
  }
  appendRichStep(article, {
    titleHtml: `<span>${escapeHtml(copyFor(lang, "moduleErrorTitle"))}</span>`,
    detailHtml: message ? `<div class="toolStepDetail"><p class="toolStepThought">${escapeHtml(message)}</p></div>` : "",
    drawerDetailHtml: drawerBlocks.length ? `<div class="toolStepDetail">${drawerBlocks.join("")}</div>` : "",
    state: "error",
    stepKey: `module-error:${script || message || ""}:${shellCommand.join("|")}`,
    currentThinking: message || copyFor(lang, "moduleErrorTitle"),
    className: "is-module-error",
  });
}

function conciseToolObservation(output, lang) {
  if (!output) return "";
  if (lang === "zh-Hans") return "工具已返回结果，继续用于后续分析。";
  if (lang === "zh-Hant") return "工具已返回結果，繼續用於後續分析。";
  return "The tool returned a result for the next step.";
}

function mergeVisionToolStep(article, data) {
  const item = Array.from(article.querySelectorAll(".thinkingSteps li.is-vision")).at(-1);
  if (!item || item.dataset.visionOutputAttached === "true") return false;
  item.dataset.visionOutputAttached = "true";
  const detail = document.createElement("div");
  detail.className = "activityDrawerOnly";
  const blocks = [];
  const shellCommand = Array.isArray(data?.shellCommand) ? data.shellCommand.map((item) => String(item)) : [];
  if (shellCommand.length) {
    blocks.push(toolBlockHtml("", formatShellCommand(shellCommand)));
  } else {
    blocks.push(toolBlockHtml("", formatSkillInput(data.script, data.code, data.params, data.lang)));
  }
  detail.innerHTML = `<div class="toolStepDetail">${blocks.join("")}</div>`;
  item.appendChild(detail);
  const lang = normalizeLang(data.lang || article.dataset.lang || "en");
  article.dataset.currentThinking = lang === "zh-Hans" ? "正在分析图片" : "Analyzing image";
  updateThinkingSummary(article, copyFor(lang, "thinking"), { live: true });
  syncActivityDrawer(article);
  return true;
}

function codeInterpreterInputBlocks(observation, params, lang) {
  const payload = parseJsonObjectText(observation);
  const question = payload?.question || cliValue(params, "--question") || "";
  const transformCode = payload?.transformCode || "";
  const rawData = payload && Object.prototype.hasOwnProperty.call(payload, "rawData")
    ? payload.rawData
    : cliValue(params, "--data-json") || cliValue(params, "--data") || "";
  const blocks = [];
  if (question) {
    blocks.push(toolBlockHtml(codeInterpreterGoalLabel(lang), question));
  }
  if (transformCode) {
    blocks.push(toolBlockHtml(codeInterpreterScriptLabel(lang), transformCode));
  }
  blocks.push(toolBlockHtml(codeInterpreterContentLabel(lang), formatBlockValue(rawData)));
  return blocks;
}

function parseJsonObjectText(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(raw.slice(start, end + 1));
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function formatBlockValue(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function toolBlockHtml(label, value) {
  return `
    <div class="toolStepBlock">
      <div class="toolStepBlockLabel">${escapeHtml(label)}</div>
      <pre><code>${escapeHtml(String(value || ""))}</code></pre>
    </div>
  `;
}

function appendRoutePlanStep(article, data) {
  const lang = normalizeLang(article.dataset.lang || data?.lang || "en");
  const steps = Array.isArray(data?.steps) ? data.steps : [];
  const detailParts = [];
  const modelUnderstanding = actionStrategyText(steps, lang, data?.strategy || "");
  if (!modelUnderstanding) return;
  detailParts.push(`<p class="toolStepThought">${escapeHtml(modelUnderstanding)}</p>`);
  const cliBlocks = routeCliPlanBlocks(steps, lang);
  appendRichStep(article, {
    titleHtml: `<span>${escapeHtml(routeTitle(data, lang))}</span>`,
    detailHtml: `<div class="toolStepDetail">${detailParts.join("")}</div>`,
    drawerDetailHtml: cliBlocks.length ? `<div class="toolStepDetail">${cliBlocks.join("")}</div>` : "",
    state: "loading",
    stepKey: "route",
    currentThinking: routeTitle(data, lang),
    className: "is-route-plan",
  });
}

function routeCliPlanBlocks(steps, lang) {
  return steps
    .filter((step) => step?.kind === "account-action")
    .map((step) => {
      const title = normalizeLang(lang) === "zh-Hans"
        ? `计划工具：${toolDisplayName(step.script, step.label, lang)}`
        : `Planned tool: ${toolDisplayName(step.script, step.label, lang)}`;
      const detail = [step.thought, step.reason, step.expectedObservation].filter(Boolean).join("\n");
      return `
        <div class="toolStepBlock">
          <div class="toolStepBlockLabel">${escapeHtml(title)}</div>
          <pre><code>${escapeHtml(detail)}</code></pre>
        </div>
      `;
    });
}

function shellQuote(value) {
  const text = String(value ?? "");
  if (!text) return "''";
  if (/^[A-Za-z0-9_./:=,@%+-]+$/.test(text)) return text;
  return `"${text.replace(/(["\\$`])/g, "\\$1")}"`;
}

function toolCommand(script, params, code) {
  const parts = [];
  if (script) parts.push("python", script);
  params.forEach((param) => parts.push(param));
  if (!parts.length && code) parts.push(code);
  return parts.map(shellQuote).join(" ");
}

function formatShellCommand(command) {
  const parts = Array.isArray(command) ? command.map((item) => String(item)) : [];
  if (!parts.length) return "";
  return parts.map(shellQuote).join(" \\\n  ");
}

function formatSkillInput(script, code, params, lang) {
  lang = normalizeLang(lang);
  const pieces = [];
  if (code && code !== "N/A") pieces.push(`code=${code}`);
  if (params.length) pieces.push(params.map(shellQuote).join(" "));
  if (
    script === "yahoo_data.py" &&
    cliValue(params, "--metric") === "net_income" &&
    ["quarterly", "annual"].includes(cliValue(params, "--period-type")) &&
    cliValue(params, "--range-length")
  ) {
    const windowSize = cliValue(params, "--range-length");
    const periodType = cliValue(params, "--period-type");
    if (lang === "zh-Hans") {
      const periodText = periodType === "annual" ? "财年" : "季度";
      pieces.push(`说明：--range-length ${windowSize} 是同比计算所需的内部取数窗口，不代表用户请求 ${windowSize} 个${periodText}。`);
    } else if (lang === "zh-Hant") {
      const periodText = periodType === "annual" ? "財年" : "季度";
      pieces.push(`說明：--range-length ${windowSize} 是同比計算所需的內部取數視窗，不代表使用者要求 ${windowSize} 個${periodText}。`);
    } else {
      pieces.push(`Note: --range-length ${windowSize} is the internal data window needed for YoY calculation, not the number of periods requested by the user.`);
    }
  }
  if (!pieces.length) return lang === "zh-Hans" ? "无额外 CLI 参数" : "No extra CLI arguments";
  return pieces.join("\n");
}

function skillNameTitle(script, fallback, lang) {
  lang = normalizeLang(lang);
  if (script === "uploaded_image_vision") {
    if (lang === "zh-Hans") return "正在分析图片";
    if (lang === "zh-Hant") return "正在分析圖片";
    return "Analyzing image";
  }
  if (script === "visual_validation") {
    if (lang === "zh-Hans") return "正在校验图表展示合理性";
    if (lang === "zh-Hant") return "正在校驗圖表展示合理性";
    return "Checking whether the chart display is reasonable";
  }
  if (lang === "zh-Hans") return `执行工具：${toolDisplayName(script, fallback, lang)}`;
  if (lang === "zh-Hant") return `執行工具：${toolDisplayName(script, fallback, lang)}`;
  return `Running tool: ${toolDisplayName(script, fallback, lang)}`;
}

function skillInputLabel(lang) {
  lang = normalizeLang(lang);
  if (lang === "zh-Hans") return "SKILL输入（CLI参数）";
  if (lang === "zh-Hant") return "SKILL 輸入（CLI 參數）";
  return "SKILL input (CLI arguments)";
}

function shellCommandLabel(lang) {
  lang = normalizeLang(lang);
  if (lang === "zh-Hans") return "Shell 命令（实际执行）";
  if (lang === "zh-Hant") return "Shell 命令（實際執行）";
  return "Shell command (actual execution)";
}

function skillOutputLabel(lang) {
  lang = normalizeLang(lang);
  if (lang === "zh-Hans") return "工具返回";
  if (lang === "zh-Hant") return "工具回傳";
  return "Tool result";
}

function skillErrorLabel(lang) {
  lang = normalizeLang(lang);
  if (lang === "zh-Hans") return "错误信息";
  if (lang === "zh-Hant") return "錯誤資訊";
  return "Error message";
}

function codeInterpreterGoalLabel(lang) {
  lang = normalizeLang(lang);
  if (lang === "zh-Hans") return "处理目标";
  if (lang === "zh-Hant") return "處理目標";
  return "Transformation goal";
}

function codeInterpreterScriptLabel(lang) {
  lang = normalizeLang(lang);
  if (lang === "zh-Hans") return "模型生成脚本";
  if (lang === "zh-Hant") return "模型生成腳本";
  return "Model-generated script";
}

function codeInterpreterContentLabel(lang) {
  lang = normalizeLang(lang);
  if (lang === "zh-Hans") return "待处理内容";
  if (lang === "zh-Hant") return "待處理內容";
  return "Content to process";
}

function actionStrategyText(_steps, _lang, strategy = "") {
  const modelStrategy = String(strategy || "").trim();
  if (!modelStrategy) return "";
  return stripStagePrefix(modelStrategy).replace(/^执行计划[:：]\s*/, "");
}

function localizedMetricName(metric, lang) {
  lang = normalizeLang(lang);
  const key = String(metric || "").replace(/^-+/, "");
  const zh = { cumulative_return: "累计收益率数据", return_pct: "日收益率数据", market_cap: "市值数据", close: "收盘价数据", volume: "成交量数据" };
  const hant = { cumulative_return: "累計收益率資料", return_pct: "日收益率資料", market_cap: "市值資料", close: "收盤價資料", volume: "成交量資料" };
  const ja = { cumulative_return: "累積リターンデータ", return_pct: "日次リターンデータ", market_cap: "時価総額データ", close: "終値データ", volume: "出来高データ" };
  const ko = { cumulative_return: "누적 수익률 데이터", return_pct: "일간 수익률 데이터", market_cap: "시가총액 데이터", close: "종가 데이터", volume: "거래량 데이터" };
  const en = { cumulative_return: "cumulative return data", return_pct: "daily return data", market_cap: "market cap data", close: "closing price data", volume: "volume data" };
  const dict = lang === "zh-Hans" ? zh : lang === "zh-Hant" ? hant : lang === "ja" ? ja : lang === "ko" ? ko : en;
  return dict[key] || key.replace(/_/g, " ");
}

function cliValue(params, flag) {
  const index = params.indexOf(flag);
  if (index < 0) return "";
  return params[index + 1] || "";
}

function toolDisplayName(script, fallback, lang) {
  lang = normalizeLang(lang);
  const names = {
    "yahoo_data.py": { "zh-Hans": "雅虎数据", "zh-Hant": "雅虎資料", ja: "Yahoo データ", ko: "야후 데이터", en: "Yahoo Data" },
    "code_interpreter.py": { "zh-Hans": "整理数据", "zh-Hant": "整理資料", ja: "データ整理", ko: "데이터 정리", en: "Organize Data" },
    "external_info_search.py": { "zh-Hans": "外部信息搜索", "zh-Hant": "外部資訊搜尋", ja: "外部情報検索", ko: "외부 정보 검색", en: "External Info Search" },
    "ainvest_news_search.py": { "zh-Hans": "AInvest 新闻搜索", "zh-Hant": "AInvest 新聞搜尋", ja: "AInvest ニュース検索", ko: "AInvest 뉴스 검색", en: "AInvest News Search" },
    "ugc_watchlist_add.py": { "zh-Hans": "批量加入自选", "zh-Hant": "批量加入自選", ja: "ウォッチリストへ一括追加", ko: "관심종목 일괄 추가", en: "Batch Watchlist Add" },
    "ainvest_create_price_alert.sh": { "zh-Hans": "预警管理", "zh-Hant": "預警管理", ja: "価格アラート管理", ko: "가격 알림 관리", en: "Price Alert Management" },
    "ainvest_list_price_alerts.sh": { "zh-Hans": "预警管理", "zh-Hant": "預警管理", ja: "価格アラート管理", ko: "가격 알림 관리", en: "Price Alert Management" },
    "ainvest_delete_price_alert.sh": { "zh-Hans": "预警管理", "zh-Hant": "預警管理", ja: "価格アラート管理", ko: "가격 알림 관리", en: "Price Alert Management" },
    "url_content_reader.py": { "zh-Hans": "链接内容读取", "zh-Hant": "連結內容讀取", ja: "リンク内容読み取り", ko: "링크 콘텐츠 읽기", en: "URL Content Reader" },
    "multimodal_vision": { "zh-Hans": "多模态读图", "zh-Hant": "多模態讀圖", ja: "マルチモーダル読図", ko: "멀티모달 차트 분석", en: "Multimodal Chart Reading" },
    "visual_validation": { "zh-Hans": "视觉校验", "zh-Hant": "視覺校驗", ja: "視覚検証", ko: "시각 검증", en: "Visual Validation" },
    "uploaded_image_vision": { "zh-Hans": "图片识别", "zh-Hant": "圖片識別", ja: "画像認識", ko: "이미지 인식", en: "Image Recognition" },
  };
  return names[script]?.[lang] || names[script]?.en || fallback || script || "Tool";
}

function toolStepDescription(script, fallback, code, params, lang) {
  lang = normalizeLang(lang);
  if (script === "uploaded_image_vision" || script === "visual_validation" || script === "multimodal_vision") return "";
  if (/^(?:DSH|CODEX)$/i.test(String(code || "").trim())) return "";
  if (script === "bash" || fallback === "bash") return "";
  const symbolText = cliValue(params, "--symbols") || code;
  if (script === "yahoo_data.py") {
    const metric = localizedMetricName(cliValue(params, "--metric"), lang);
    return [metric, symbolText].filter(Boolean).join(" · ");
  }
  if (script === "code_interpreter.py") {
    if (lang === "zh-Hans") return "执行数据计算";
    if (lang === "zh-Hant") return "執行資料計算";
    if (lang === "ja") return "データ計算を実行";
    if (lang === "ko") return "데이터 계산 실행";
    return "Running data calculation";
  }
  if (script === "external_info_search.py") {
    const query = cliValue(params, "--query");
    const source = cliValue(params, "--source");
    if (lang === "zh-Hans") return query ? `检索：${query}` : "获取最新可溯源信息";
    if (lang === "zh-Hant") return query ? `檢索：${query}` : "取得最新可溯源資訊";
    return query ? `Search: ${query}` : source ? `Searching with ${source}` : "";
  }
  return [fallback, code].filter((item) => item && item !== "MARKET" && item !== "N/A").join(" · ");
}

function isQuietToolScript(script) {
  return script === "uploaded_image_vision" || script === "visual_validation" || script === "multimodal_vision";
}

function newsSearchTitle(data, lang) {
  lang = normalizeLang(lang);
  const code = data?.code ? String(data.code).trim() : "";
  const label = code && code !== "N/A" ? code : "";
  if (lang === "zh-Hans") return label ? `浏览 ${label} 相关新闻和市场资讯` : "浏览相关新闻和市场资讯";
  if (lang === "zh-Hant") return label ? `瀏覽 ${label} 相關新聞和市場資訊` : "瀏覽相關新聞和市場資訊";
  if (lang === "ja") return label ? `${label} の関連ニュースと市場情報を閲覧` : "関連ニュースと市場情報を閲覧";
  if (lang === "ko") return label ? `${label} 관련 뉴스와 시장 정보를 탐색` : "관련 뉴스와 시장 정보를 탐색";
  if (lang === "es") return label ? `Browsing ${label} news and market context` : "Browsing related news and market context";
  if (lang === "fr") return label ? `Browsing ${label} news and market context` : "Browsing related news and market context";
  return label ? `Browsing ${label} news and market context` : "Browsing related news and market context";
}

function newsSearchMoreText(lang, count) {
  lang = normalizeLang(lang);
  if (lang === "zh-Hans") return `再显示 ${count} 个`;
  if (lang === "zh-Hant") return `再顯示 ${count} 個`;
  if (lang === "ja") return `さらに ${count} 件`;
  if (lang === "ko") return `${count}개 더 보기`;
  return `show ${count} more`;
}

function uniqueNewsDomains(sources) {
  const seen = new Set();
  const result = [];
  sources.forEach((source) => {
    const url = typeof source === "string" ? source : source?.url || "";
    const domain = (typeof source === "object" && source?.domain) || domainFromUrl(url);
    const key = domain || url;
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push({
      domain,
      url,
    });
  });
  if (!result.length) result.push({ domain: "ainvest.com", url: "https://www.ainvest.com/news/" });
  return result;
}

function domainFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch (_error) {
    return "";
  }
}

function isPublicEvidenceUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
    if (!/^https?:$/.test(url.protocol) || !hostname || hostname.includes("{")) return false;
    if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) return false;
    if (/^(?:127\.|0\.|10\.|192\.168\.|169\.254\.)/.test(hostname)) return false;
    const private172 = hostname.match(/^172\.(\d{1,3})\./);
    if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return false;
    if (hostname === "::1") return false;
    if (["api.deepseek.com", "api.moonshot.cn", "api.search.brave.com", "googleapis.com", "www.googleapis.com"].includes(hostname)) return false;
    const path = url.pathname.toLowerCase();
    if (hostname === "duckduckgo.com" && path.startsWith("/html")) return false;
    if (hostname.endsWith("bing.com") && path.startsWith("/search")) return false;
    if (hostname === "sogou.com" && path.startsWith("/web")) return false;
    if (hostname === "cninfo.com.cn" && path.includes("/fulltextsearch/")) return false;
    if (hostname === "news.google.com" && path.startsWith("/rss")) return false;
    if (hostname === "feeds.finance.yahoo.com" && path.startsWith("/rss")) return false;
    return true;
  } catch (_error) {
    return false;
  }
}

function sourcesFromInsightMarkdown(value) {
  const sources = [];
  String(value || "").replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, title, url) => {
    if (!isPublicEvidenceUrl(url)) return _match;
    const siteName = String(title || "").replace(/(?:官方)?公告$/, "").trim() || domainFromUrl(url) || "Source";
    sources.push({ siteName, url, title: String(title || siteName), summary: "", iconUrl: "" });
    return _match;
  });
  return sources;
}

function mergeSourcesByUrl(...groups) {
  const map = new Map();
  groups.flat().forEach((item) => {
    if (!item?.url || !isPublicEvidenceUrl(item.url)) return;
    const key = String(item.url).trim().replace(/\/$/, "").toLowerCase();
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, { ...item });
      return;
    }
    const existing = map.get(key);
    ["siteName", "title", "summary", "iconUrl"].forEach((field) => {
      if (!existing[field] && item[field]) existing[field] = item[field];
    });
  });
  return Array.from(map.values());
}

function sourceLogoForDomain(value) {
  const domain = String(value || "").toLowerCase();
  if (domain.includes("ainvest.com")) return "/static/assets/ainvest-source-logo.png";
  if (domain.includes("kimi") || domain.includes("moonshot")) return "/static/assets/kimi-search-logo.png";
  return sourceFallbackLogoSrc();
}

function sourceFallbackLogoSrc(siteName = "") {
  const key = String(siteName || "").trim().toLowerCase();
  if (key.includes("ainvest")) return "/static/assets/ainvest-source-logo.png";
  if (key.includes("kimi") || key.includes("moonshot")) return "/static/assets/kimi-search-logo.png";
  return "/static/assets/source-fallback.svg";
}

function sourceImageFallbackAttribute(siteName = "") {
  return `this.onerror=null;this.src='${sourceFallbackLogoSrc(siteName)}';`;
}

document.addEventListener("error", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLImageElement)) return;
  if (!target.matches(".source-chip-logo,.source-card-logo,.sourceSummaryLogo,.activitySourceLogo")) return;
  target.onerror = null;
  target.src = sourceFallbackLogoSrc(target.getAttribute("data-source-site") || "");
}, true);

function appendImageAnalysisStep(article, data) {
  const list = article.querySelector(".thinkingSteps");
  const shouldStick = isNearBottom();
  list.querySelectorAll("li.is-loading").forEach((item) => {
    item.classList.remove("is-loading");
    item.classList.add("is-done");
  });
  const item = document.createElement("li");
  item.className = "is-loading is-vision";
  const lang = normalizeLang(article.dataset.lang || data?.lang || "en");
  const title = copyFor(lang, "analyzingImage");
  const code = data?.code ? escapeHtml(String(data.code)) : "";
  const label = data?.label ? escapeHtml(String(data.label)) : "";
  const meta = [code, label].filter(Boolean).join(" · ");
  const imageUrl = escapeHtml(data?.imageUrl || "");
  item.innerHTML = `
    <div class="activityVisionHeader">
      <div class="activityVisionTitle">${escapeHtml(title)}</div>
    </div>
    <div class="activityVisionCard is-loading">
      <div class="activityVisionBackdrop" aria-hidden="true">
        <img src="${imageUrl}" alt="" />
      </div>
      <div class="activityVisionPreview">
        <img src="${imageUrl}" alt="${meta || "chart preview"}" />
      </div>
    </div>
  `;
  list.appendChild(item);
  const card = item.querySelector(".activityVisionCard");
  const previewImage = item.querySelector(".activityVisionPreview img");
  const backdropImage = item.querySelector(".activityVisionBackdrop img");
  const revealVisionPreview = () => {
    if (!previewImage || !card) return;
    if (!previewImage.naturalWidth || !previewImage.naturalHeight) return;
    card.classList.remove("is-loading");
    card.classList.add("is-ready");
    if (backdropImage && backdropImage.complete) backdropImage.classList.add("is-ready");
    syncActivityDrawer(article);
  };
  previewImage?.addEventListener("load", revealVisionPreview, { once: true });
  previewImage?.addEventListener("error", () => {
    card?.classList.add("is-error");
  }, { once: true });
  if (previewImage?.complete) revealVisionPreview();
  article.dataset.currentThinking = title;
  updateThinkingSummary(article, copyFor(lang, "thinking"), { live: true });
  syncActivityDrawer(article);
  keepScrollPosition(shouldStick);
}

function renderRoute(article, steps) {
  if (!steps.length) return;
  const chips = article.querySelector(".routeChips");
  chips.hidden = true;
  chips.innerHTML = steps
    .map((step) => {
      const label = escapeHtml(step.label || step.script || "模块");
      const reason = escapeHtml(step.reason || "");
      return `<span title="${reason}">${label}</span>`;
    })
    .join("");
  syncActivityDrawer(article);
}

function renderFinalAnswer(article, data) {
  clearImageGenerationLoading(article);
  const previewOnly = article.dataset.sessionPersistence === 'none' || article.classList.contains('cachedCaseAnswer');
  const persistResult = !article.taskContext && !previewOnly;
  const target = article.querySelector(".finalAnswer");
  article.answerTextStarted = true;
  revealPendingVisualizations(article);
  completeThinking(article);
  updateThinkingSummary(article, copyFor(article.dataset.lang || "en", "thoughtFor"));
  article.dataset.thinkingState = "done";
  const streamedArtifacts = Array.isArray(article.streamVisualizationArtifacts)
    ? article.streamVisualizationArtifacts
    : [];
  if ((!Array.isArray(data.reportArtifacts) || !data.reportArtifacts.some((item) => item?.url)) && streamedArtifacts.length) {
    data.reportArtifacts = streamedArtifacts;
  }
  if (!data.reportUrl && data.reportArtifacts?.[0]?.url) data.reportUrl = data.reportArtifacts[0].url;
  (data.reportArtifacts || []).forEach(item => appendStreamVisualizationModule(article, item));
  syncStreamAnswerPlacement(article);
  article.activityEnded = true;
  data.sources = mergeSourcesByUrl(
    Array.isArray(data.sources) ? data.sources : [],
    sourcesFromInsightMarkdown(data.interpretation || ""),
  );
  article.activitySources = data.sources;
  article.activitySourceCount = article.activitySources.length;
  article.videos = Array.isArray(data.videos) ? data.videos : [];
  article.actionLinks = Array.isArray(data.actionLinks) ? data.actionLinks : [];
  article.shareSession = article.taskContext
    ? {...data, ...article.taskContext, messages:[{role:"user",text:article.taskContext.question}]}
    : buildShareSessionForArticle(article, data);
  const actionsHtml = buildResultActions(article, article.dataset.lang || "en");
  const capabilityBarHtml = buildCapabilityBar(article.actionLinks, article.dataset.lang || "en");
  if (article.orderedStream) {
    // The completed answer is the same ordered DOM that was streamed. Never
    // flatten its prose or move an existing chart behind later text.
    // streamingAnswer is also the established rich-text styling scope.
    // Stop only the live cursor; retain table, emphasis and citation styling.
    target.querySelectorAll('.is-streaming').forEach(node => node.classList.remove('is-streaming'));
    attachInlineAnswerSources(target.querySelector('.interleavedFlow') || target, data.sources);
    // Tool inventory is not an instruction to append unreferenced charts.
    renderFileDeliverables(article,data);
    target.insertAdjacentHTML('beforeend', `${capabilityBarHtml}${actionsHtml}`);
    attachResultActionHandlers(article);
    if (persistResult) recordAssistantResult(data);
    syncActivityDrawer(article);
    return;
  }
  // Keep the live hosts connected until the final layout atomically moves them.
  // Their React roots and sandbox documents survive the result handoff.
  article.completedStreamVisualizationHosts = new Map();
  target.querySelectorAll(".streamvizArtifactHost[data-artifact-url], .reportFrameShell[data-artifact-url], .reportDocumentFrame[data-artifact-url]").forEach((host) => {
    if (host.classList.contains("reportDocumentFrame") && host.closest(".reportFrameShell")) return;
    article.completedStreamVisualizationHosts.set(host.dataset.artifactUrl, host);
  });
  const finalShell = document.createElement("div");
  finalShell.innerHTML = `
    <section class="mixedReport" aria-live="polite"></section>
    ${capabilityBarHtml}
    <div class="deferredActions" hidden>${actionsHtml}</div>
  `;
  target.appendChild(finalShell);
  const revealActions = () => {
    Array.from(target.children).forEach((child) => {
      if (child === finalShell) return;
      child.querySelectorAll(".streamvizArtifactHost").forEach((host) => window.AimeStreamViz?.unmount?.(host));
      child.remove();
    });
    const actions = finalShell.querySelector(".deferredActions");
    if (actions) actions.hidden = false;
    attachResultActionHandlers(article);
  };
  renderMixedReportFlow(article, data, finalShell.querySelector(".mixedReport"), revealActions);
  if (persistResult) recordAssistantResult(data);
  syncActivityDrawer(article);
  scheduleScrollHint();
}

function buildShareSessionForArticle(article, data = {}) {
  // Sharing builds a detached snapshot, never creates/changes a chat session.
  const previewOnly = article?.dataset?.sessionPersistence === 'none' || article?.classList?.contains('cachedCaseAnswer');
  const question = data.question || article?.dataset?.question || nearbyUserQuestionForArticle(article);
  const base = previewOnly ? null : currentSession;
  const session = base ? {...base, messages:[...(base.messages || [])]} : {
    id:`share-${Date.now()}-${Math.random().toString(36).slice(2,9)}`,
    title:String(question || 'Mentora').slice(0,28),question,
    messages:question?[{role:'user',text:question,images:[]}]:[],
    createdAt:Date.now(),
  };
  if (Array.isArray(data.streamBlocks)) session.streamBlocks = data.streamBlocks;
  session.updatedAt = Date.now();
  session.reportUrl = data.reportUrl || session.reportUrl || "";
  session.reportArtifacts = Array.isArray(data.reportArtifacts)
    ? data.reportArtifacts
    : (Array.isArray(session.reportArtifacts) ? session.reportArtifacts : []);
  session.code = data.code || session.code || "";
  session.interpretation = data.interpretation || session.interpretation || "";
  session.sources = Array.isArray(data.sources) ? data.sources : (Array.isArray(session.sources) ? session.sources : []);
  session.videos = Array.isArray(data.videos) ? data.videos : (Array.isArray(session.videos) ? session.videos : []);
  session.actionLinks = Array.isArray(data.actionLinks) ? data.actionLinks : (Array.isArray(session.actionLinks) ? session.actionLinks : []);
  session.agentRunId = data.agentRunId || article?.dataset?.agentRunId || session.agentRunId || "";
  session.agentEvents = Array.isArray(article?.agentEvents) ? article.agentEvents : (Array.isArray(session.agentEvents) ? session.agentEvents : []);
  session.thinkingStepsHtml = article?.querySelector?.(".thinkingSteps")?.innerHTML || session.thinkingStepsHtml || "";
  session.thinkingStartedAt = Number(article?.dataset?.startedAt || session.thinkingStartedAt || Date.now());
  session.thinkingElapsed = Math.max(0, Date.now() - session.thinkingStartedAt);
  return session;
}

function reportUrlFromArticle(article) {
  const frame = article?.querySelector?.(".reportDocumentFrame");
  const raw = frame?.getAttribute?.("src") || frame?.src || "";
  if (!raw) return "";
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin === window.location.origin) return `${url.pathname}${url.search}${url.hash}`;
    return url.href;
  } catch {
    return raw;
  }
}

function nearbyUserQuestionForArticle(article) {
  let node = article?.previousElementSibling || null;
  while (node) {
    if (node.classList?.contains("user")) {
      return node.querySelector(".userBubble")?.textContent?.trim() || "";
    }
    node = node.previousElementSibling;
  }
  return lastQuestion || currentSession?.question || "";
}

function transientShareSessionForArticle(article) {
  const reportUrl = reportUrlFromArticle(article);
  const answerHtml = article?.querySelector?.(".mixedReport")?.innerHTML || "";
  if (!reportUrl && !answerHtml) return null;
  const question = nearbyUserQuestionForArticle(article);
  const title = currentSession?.title && currentSession.title !== "新建对话"
    ? currentSession.title
    : (question || document.title || "Mentora");
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    title,
    question,
    reportUrl,
    answerHtml,
    interpretation: "",
    sources: Array.isArray(article?.activitySources) ? article.activitySources : [],
    messages: question ? [{ role: "user", text: question, images: [] }] : [],
    thinkingStepsHtml: article?.querySelector?.(".thinkingSteps")?.innerHTML || "",
    thinkingStartedAt: Number(article?.dataset?.startedAt || Date.now()),
    thinkingElapsed: Number(article?.dataset?.cachedElapsedMs) || Math.max(0, Date.now() - Number(article?.dataset?.startedAt || Date.now())),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function stripSourceInventoryFromInsight(value, sources) {
  let text = String(value || "");
  if (!Array.isArray(sources) || !sources.length) return text;
  text = text.replace(
    /(?:^|\n)#{1,6}\s*(?:\*\*|__)?(?:主要来源|参考来源|來源|出处|Sources?|References?)(?:\*\*|__)?\s*\n[\s\S]*?(?=\n#{1,6}\s|$)/gi,
    "\n",
  );
  const paragraphs = text.split(/\n\s*\n/);
  const sourceOnly = /^(?:>\s*)?(?:#{1,6}\s*)?(?:\*\*|__)?(?:主要来源|参考来源|資料來源|数据来源|來源|出处|Sources?|References?)(?:\*\*|__)?\s*[：:]/i;
  const sourcedFrom = /^(?:上述|以上|本段|该结论|該結論).{0,16}(?:综合自|綜合自|来源于|來源於|based on|sources?)/i;
  return paragraphs
    .filter((part) => {
      const normalized = part.trim();
      if (!normalized) return false;
      const hasLink = /https?:\/\/|\[[^\]]+\]\([^)]+\)/.test(normalized);
      return !sourceOnly.test(normalized) && !(hasLink && sourcedFrom.test(normalized));
    })
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sourceChipHtml(sources) {
  const items = (Array.isArray(sources) ? sources : []).filter((item) => item?.url && isPublicEvidenceUrl(item.url));
  if (!items.length) return "";
  const first = items[0];
  const siteName = String(first.siteName || domainFromUrl(first.url) || "Source");
  const iconUrl = first.iconUrl || sourceLogoSrc(siteName, first.url);
  const extraLabel = items.length > 1 ? ` +${items.length - 1}` : "";
  return `
    <span class="module-source inline-answer-source" data-source-index="0" data-sources="${escapeHtml(JSON.stringify(items))}">
      <a class="source-chip" href="${escapeHtml(first.url)}" target="_blank" rel="noreferrer noopener" aria-label="打开来源 ${escapeHtml(siteName)}">
        <img class="source-chip-logo" src="${escapeHtml(iconUrl)}" data-source-site="${escapeHtml(siteName)}" onerror="${escapeHtml(sourceImageFallbackAttribute(siteName))}" alt="" />
        <span class="source-chip-name">${escapeHtml(siteName + extraLabel)}</span>
      </a>
      <span class="source-card" role="dialog" aria-label="${escapeHtml(first.title || siteName)}">
        <span class="source-card-nav">
          <button class="source-card-arrow" type="button" data-source-prev aria-label="上一个来源"></button>
          <button class="source-card-arrow" type="button" data-source-next aria-label="下一个来源"></button>
          <span class="source-card-count">1/${items.length}</span>
        </span>
        <a class="source-card-body" href="${escapeHtml(first.url)}" target="_blank" rel="noreferrer noopener">
          <span class="source-card-brand">
            <img class="source-card-logo" src="${escapeHtml(iconUrl)}" data-source-site="${escapeHtml(siteName)}" onerror="${escapeHtml(sourceImageFallbackAttribute(siteName))}" alt="" />
            <span class="source-card-site">${escapeHtml(siteName)}</span>
          </span>
          <span class="source-card-title">${escapeHtml(first.title || siteName)}</span>
          <span class="source-card-summary">${escapeHtml(first.summary || "")}</span>
        </a>
      </span>
    </span>`;
}

function attachInlineAnswerSources(container, sources) {
  if (!container) return;
  const normalizedUrl = (value) => String(value || "").trim().replace(/\/$/, "").toLowerCase();
  const sourceByUrl = new Map(
    (Array.isArray(sources) ? sources : [])
      .filter((item) => item?.url)
      .map((item) => [normalizedUrl(item.url), item]),
  );
  const citedUrls = new Set();
  container.querySelectorAll('.inline-answer-source[data-sources]').forEach(chip => {
    try {
      const items = JSON.parse(chip.dataset.sources || '[]');
      if (Array.isArray(items)) {
        items.forEach(source => { if (source?.url) citedUrls.add(normalizedUrl(source.url)); });
        const enriched = items.map(source => sourceByUrl.get(normalizedUrl(source.url)) || source);
        if (enriched.length && JSON.stringify(enriched) !== JSON.stringify(items)) {
          chip.dataset.sources = JSON.stringify(enriched);
          const index = Math.min(Number(chip.dataset.sourceIndex) || 0, enriched.length - 1);
          renderModuleSource(chip, enriched[index], index, enriched.length);
        }
      }
    } catch { /* Preserve an existing source chip without guessing metadata. */ }
  });
  container.querySelectorAll("a.answer-citation-link[data-source-url]").forEach((link) => {
    const url = link.dataset.sourceUrl || link.href || "";
    const source = sourceByUrl.get(normalizedUrl(url)) || {
      siteName: String(link.textContent || "").replace(/(?:官方)?公告$/, "").trim() || domainFromUrl(url) || "Source",
      title: String(link.textContent || "").trim() || domainFromUrl(url) || "Source",
      url,
      summary: "",
      iconUrl: "",
    };
    citedUrls.add(normalizedUrl(source.url));
    const holder = document.createElement("span");
    holder.innerHTML = sourceChipHtml([source]);
    const chip = holder.firstElementChild;
    if (!chip) return;
    link.replaceWith(chip);
    renderModuleSource(chip, source, 0, 1);
  });
  // When the answer already places citations inline, keep provenance bound to
  // those exact claims. Uncited tool inventory belongs in the activity drawer,
  // not as an unrelated +N bundle on the first paragraph.
  if (citedUrls.size) return;
  const seenUrls = new Set();
  const grouped = (Array.isArray(sources) ? sources : [])
    .filter((item) => {
      const url = normalizedUrl(item?.url);
      if (!url || citedUrls.has(url) || seenUrls.has(url) || !isPublicEvidenceUrl(item?.url)) return false;
      seenUrls.add(url);
      return true;
    })
    .sort((left, right) => {
    const leftVideo = /video|视频|影片/i.test(String(left.siteName || "")) ? 1 : 0;
    const rightVideo = /video|视频|影片/i.test(String(right.siteName || "")) ? 1 : 0;
    return leftVideo - rightVideo;
  });
  if (!grouped.length) return;
  const candidates = Array.from(container.querySelectorAll(".streamingAnswer p, .streamingAnswer li"))
    .filter((node) => node.textContent.trim().length >= 28 && !node.closest(".relatedVideoSection"));
  const target = candidates[0] || container.querySelector(".streamingAnswer p, .streamingAnswer li");
  if (!target) return;
  target.insertAdjacentHTML("beforeend", sourceChipHtml(grouped));
  const source = target.querySelector(".inline-answer-source");
  if (source) renderModuleSource(source, grouped[0], 0, grouped.length);
}

function prepareInsightForVideos(value, videos) {
  const text = String(value || "");
  if (!Array.isArray(videos) || !videos.length) return { text, hadMarker: false };
  const lines = text.split(/\r?\n/);
  const headingPattern = /^(#{1,6})\s*(?:相关视频|視頻結果|相关影片|相關影片|视频结果|视频推荐|Video Results?|Related Videos?)\s*$/i;
  const output = [];
  let replacing = false;
  let markerAdded = false;
  let headingLevel = 7;
  for (const line of lines) {
    const match = line.trim().match(headingPattern);
    if (match && !markerAdded) {
      headingLevel = match[1].length;
      output.push(line, "", "@@AIME_VIDEO_LANE@@", "");
      markerAdded = true;
      replacing = true;
      continue;
    }
    if (replacing) {
      const nextHeading = line.trim().match(/^(#{1,6})\s+/);
      if (!nextHeading || nextHeading[1].length > headingLevel) continue;
      replacing = false;
    }
    output.push(line);
  }
  return { text: output.join("\n").replace(/\n{3,}/g, "\n\n").trim(), hadMarker: markerAdded };
}

function formatVideoDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  if (!total) return "";
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = Math.floor(total % 60);
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function openVideoPlayer(video) {
  const url = String(video?.videoUrl || video?.url || "").trim();
  if (!url) return;
  let overlay = document.querySelector(".aimeVideoOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "aimeVideoOverlay";
    overlay.innerHTML = `
      <div class="aimeVideoDialog" role="dialog" aria-modal="true" aria-label="视频播放器">
        <button class="aimeVideoClose" type="button" aria-label="关闭">×</button>
        <div class="aimeVideoPlayer"></div>
        <a class="aimeVideoSourceLink" target="_blank" rel="noreferrer noopener"></a>
      </div>`;
    const close = () => {
      overlay.classList.remove("is-open");
      overlay.querySelector(".aimeVideoPlayer").replaceChildren();
    };
    overlay.querySelector(".aimeVideoClose").addEventListener("click", close);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
    document.body.appendChild(overlay);
  }
  const player = overlay.querySelector(".aimeVideoPlayer");
  const sourceLink = overlay.querySelector(".aimeVideoSourceLink");
  const isFile = /\.(?:mp4|webm|ogg)(?:[?#].*)?$/i.test(url);
  const media = document.createElement(isFile ? "video" : "iframe");
  media.src = url;
  media.title = String(video?.title || "Video");
  if (isFile) {
    media.controls = true;
    media.autoplay = true;
    media.poster = videoCoverThumbnailUrl(video?.coverUrl, 768);
  } else {
    media.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    media.allowFullscreen = true;
  }
  player.replaceChildren(media);
  sourceLink.href = String(video?.url || url);
  sourceLink.textContent = String(video?.title || "在来源页面打开");
  overlay.classList.add("is-open");
}

function videoCoverThumbnailUrl(coverUrl, width = 384) {
  try {
    const cover = new URL(String(coverUrl || ""));
    const prefixes = {"resources.ainvest.com": "/iwcprod-crawl-downloader-hub-pod.media/", "cdn.ainvest.com": "/discovery-video/"};
    if (cover.protocol !== "https:" || cover.username || cover.password || cover.port || cover.hash || !prefixes[cover.hostname] || !cover.pathname.startsWith(prefixes[cover.hostname])) return String(coverUrl || "");
    return `/api/video-thumbnail?width=${width}&url=${encodeURIComponent(cover.href)}`;
  } catch { return ""; }
}

function buildVideoLane(videos, options = {}) {
  if (!Array.isArray(videos) || !videos.length) return null;
  const section = document.createElement("section");
  section.className = "relatedVideoSection";
  const heading = options.showHeading ? `<h2 class="relatedVideoHeading">相关视频</h2>` : "";
  section.innerHTML = `${heading}<div class="relatedVideoLane">${videos.map((video, index) => {
    const duration = formatVideoDuration(video.durationSeconds);
    const date = String(video.publishedDate || video.publishedAt || "").slice(0, 10);
    const sourceUrl = String(video.url || video.videoUrl || "");
    return `
      <article class="relatedVideoCard" data-video-index="${index}">
        <button class="relatedVideoMedia" type="button" aria-label="播放 ${escapeHtml(video.title || "视频")}">
          ${video.coverUrl ? `<img src="${escapeHtml(videoCoverThumbnailUrl(video.coverUrl))}" srcset="${escapeHtml(videoCoverThumbnailUrl(video.coverUrl))} 384w, ${escapeHtml(videoCoverThumbnailUrl(video.coverUrl, 768))} 768w" sizes="(max-width:760px) 88vw, 390px" width="768" height="432" alt="" loading="lazy" decoding="async">` : `<span class="relatedVideoPosterFallback"></span>`}
          <span class="relatedVideoPlay" aria-hidden="true"></span>
          ${duration ? `<span class="relatedVideoDuration">${escapeHtml(duration)}</span>` : ""}
        </button>
        <div class="relatedVideoBody">
          <div class="relatedVideoMeta">${escapeHtml([date, video.siteName || "AInvest Videos"].filter(Boolean).join(" · "))}</div>
          <a class="relatedVideoTitle" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer noopener">${escapeHtml(video.title || "AInvest Video")}</a>
          ${video.summary ? `<p class="relatedVideoSummary">${escapeHtml(video.summary)}</p>` : ""}
        </div>
      </article>`;
  }).join("")}</div>`;
  section.querySelectorAll(".relatedVideoMedia").forEach((button, index) => {
    button.querySelector("img")?.addEventListener("error", () => button.classList.add("is-cover-unavailable"), { once:true });
    button.addEventListener("click", () => openVideoPlayer(videos[index]));
  });
  return section;
}

function renderImageGenerationLoading(article, data = {}) {
  if (article.activityEnded) return;
  const target=article.querySelector('.finalAnswer');
  if (!target) return;
  let loading=target.querySelector('.imageGenerationLoading');
  if (!loading) {
    loading=document.createElement('section');
    loading.className='imageGenerationLoading';
    loading.setAttribute('role','status');
    loading.setAttribute('aria-live','polite');
    loading.setAttribute('aria-busy','true');
    const dots=[];
    for(let y=0;y<23;y++) {
      dots.push(`<g class="imageGenerationWave" style="animation-delay:${(-y*.16).toFixed(2)}s">`);
      for(let x=0;x<27;x++) {
      const distance=((x-13)/7)**2+((y-11)/7)**2;
      const strength=Math.exp(-distance);
      dots.push(`<circle cx="${24+x*24}" cy="${24+y*24}" r="${(1.2+2.8*strength).toFixed(2)}" opacity="${(.2+.8*strength).toFixed(2)}"/>`);
      }
      dots.push('</g>');
    }
    loading.innerHTML='<div class="imageGenerationField"><svg viewBox="0 0 672 576" aria-hidden="true"><g class="imageGenerationDots">'+dots.join('')+'</g></svg><span class="imageGenerationProgress"></span></div>';
    target.append(loading);
  }
  // Open conversations may retain the older loading DOM across reconnects.
  // Migrate that DOM in place instead of preserving its removed caption.
  loading.querySelectorAll('.imageGenerationLabel').forEach(node=>node.remove());
  const chinese=/^zh/.test(article.dataset.lang || 'zh-CN');
  loading.setAttribute('aria-label',data.message || (chinese?'正在生成图片':'Generating image'));
  const progress=loading.querySelector('.imageGenerationProgress');
  const percent=data.progressPct;
  // Service-driven progress, with a 10% display floor for the initial stage.
  // Keep the raw value for diagnostics; never advance progress using a timer.
  if (typeof percent==='number' && Number.isFinite(percent) && percent>=0 && percent<=100) {
    progress.textContent=Math.max(10,Math.round(percent))+'%';
    loading.dataset.progressPct=String(percent);
  } else if (!loading.dataset.progressPct) progress.textContent=chinese?'准备中':'Preparing';
}

function clearImageGenerationLoading(article) {
  article.pendingImageFinal=null;
  article.querySelectorAll('.imageGenerationLoading').forEach(node=>node.remove());
}

function isGeneratedImageArtifact(item) {
  if (item.mediaType === "image") return true;
  if (item.imageUrl && /\.(?:png|jpe?g|webp|gif)(?:[?#]|$)/i.test(item.imageUrl)) return true;
  return /(?:^|\/)generated\/flux-[^/]+\.html$/i.test(new URL(item.url||item.htmlUrl, window.location.origin).pathname);
}

function generatedImageUrl(value) {
  const url=new URL(value,window.location.origin);
  // The reverse proxy rewrites quoted root paths in JS as well as HTML.
  // Escaped regexes keep this check canonical for old, unprefixed chat data.
  if(url.origin!==window.location.origin || !/^\/generated\//.test(url.pathname))return url.href;
  const script=Array.from(document.scripts).find(script=>/\/static\/app\.js(?:[?#]|$)/.test(script.src));
  const asset=new URL(script?.src || document.baseURI,window.location.origin);
  const mount=asset.pathname.match(/^(.*)\/static\/app\.js$/)?.[1]??new URL('.',document.baseURI).pathname.replace(/\/$/,'');
  if(mount)url.pathname=mount+url.pathname;
  return url.href;
}

function generatedImageSource(item) {
  const artifactUrl = new URL(item.url||item.htmlUrl, window.location.origin);
  artifactUrl.pathname = artifactUrl.pathname.replace(/\.html$/i, ".png");
  return generatedImageUrl(item.imageUrl || artifactUrl.pathname);
}

function waitForGeneratedImage(item) {
  return new Promise((resolve,reject)=>{
    const image=new Image();
    const finish=(callback,value)=>{clearTimeout(timer);image.onload=null;image.onerror=null;callback(value);};
    const timer=setTimeout(()=>finish(reject,new Error('Image resource timed out')),90000);
    image.onload=()=>Promise.resolve(image.decode?.()).then(()=>image.naturalWidth>0?finish(resolve):finish(reject,new Error('Empty image')),error=>finish(reject,error));
    image.onerror=()=>finish(reject,new Error('Image resource unavailable'));
    image.src=generatedImageSource(item);
  });
}

function createGeneratedImageArtifact(item) {
  const image = document.createElement("img");
  image.className = "reportGeneratedImage";
  image.alt = item.alt || "本地生成图片";
  image.loading = "eager";
  image.decoding = "async";
  image.hidden=true;
  image.src = generatedImageSource(item);
  image.addEventListener("load", async () => {
    try{if(image.decode)await image.decode();}catch{image.dispatchEvent(new Event('error'));return;}
    if (image.naturalWidth % 16 === 8 && image.naturalHeight % 16 === 8) image.classList.add("reportGeneratedImageLegacyFrame");
    image.hidden=false;
    preview.dataset.imageReady='true';
  });
  const preview = document.createElement("div");
  preview.className = "reportGeneratedImageButton";
  preview.dataset.imageReady='false';
  image.addEventListener('error',()=>{preview.dataset.imageReady='error';preview.setAttribute('role','alert');preview.textContent='图片资源载入失败，请重新打开重试。';});
  preview.dataset.artifactUrl=String(item.url||item.htmlUrl||'');
  preview.append(image);
  return preview;
}

function fileDeliverables(data) {
  const items=Array.isArray(data.fileArtifacts)?data.fileArtifacts:[];
  const skillSource=JSON.stringify(data.selectedSkill||data.label||'').toLowerCase();
  const allowHtml=skillSource.includes('streamviz');
  const seen=new Set(),files=[];
  for(const item of items){
    try{
      const url=new URL(item.url||item.htmlUrl,window.location.origin);
      const match=url.pathname.match(/^(.*\/)generated\/([^/]+)$/);
      if(url.origin!==window.location.origin||!match)continue;
      const storedName=decodeURIComponent(match[2]);
      if(/[\\/]/.test(storedName)||storedName==='..'||seen.has(url.pathname))continue;
      if(!/\.(?:html|pdf|docx|xlsx|pptx|csv|txt|md|json|png|jpe?g|webp|svg|zip)$/i.test(storedName))continue;
      if(/\.html$/i.test(storedName)&&!allowHtml)continue;
      const suffix=storedName.slice(storedName.lastIndexOf('.'));
      const internal=value=>/^(?:streamviz[-_]job|html[-_]render)[-_]|^[0-9a-f]{8}-[0-9a-f-]{27,}/i.test(String(value||''));
      const report=(data.reportArtifacts||[]).find(report=>{
        try{return new URL(report.url||report.htmlUrl,window.location.origin).pathname===url.pathname;}catch{return false;}
      })||{};
      const title=[item.name,item.title,item.label,report.title,report.label].find(value=>typeof value==='string'&&value.trim()&&!internal(value)&&!/^streamviz$/i.test(value));
      const resolveName=internal(storedName)&&!title;
      let stem=title||(!resolveName?storedName:'HTML 报告');
      if(stem.toLowerCase().endsWith(suffix.toLowerCase()))stem=stem.slice(0,-suffix.length);
      stem=stem.replace(/deepseek[-_ ]*/gi,'').replace(/[\x00-\x1f\x7f<>:"/\\|?*]+/g,' ').replace(/\s+/g,' ').replace(/^[-_ .]+|[-_ .]+$/g,'');
      const name=(stem.slice(0,100)||'生成文件')+suffix;
      const theme=currentThemeMode(),type=name.split('.').at(-1).toUpperCase();
      const open=type==='HTML'?`${match[1]}share-artifact/${match[2]}?theme=${theme}`:url.pathname;
      files.push({name,type,open,resolveName,metadata:`${match[1]}api/artifacts/${match[2]}/metadata`,download:`${match[1]}api/artifacts/${match[2]}/download?theme=${theme}&name=${encodeURIComponent(name)}`});
      seen.add(url.pathname);
    }catch{/* Invalid or external paths are never exposed as generated files. */}
  }
  return files;
}

function bindGeneratedFileDownload(link){
  link.addEventListener('click',async event=>{
    const url=new URL(link.href,window.location.origin);url.searchParams.set('theme',currentThemeMode());link.href=url.pathname+url.search;
    // Legacy server attachment headers still contain the internal provider prefix.
    if(!/deepseek/i.test(decodeURIComponent(url.pathname)))return;
    event.preventDefault();
    if(link.getAttribute('aria-busy')==='true')return;
    const name=link.download;link.setAttribute('aria-busy','true');
    try{
      const response=await fetch(url.pathname+url.search,{credentials:'same-origin',cache:'no-store'});
      if(!response.ok)throw new Error('download failed');
      const objectUrl=URL.createObjectURL(await response.blob());
      const anchor=document.createElement('a');anchor.href=objectUrl;anchor.download=name;anchor.hidden=true;document.body.append(anchor);anchor.click();anchor.remove();
      setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);link.title='下载文件';
    }catch{link.title='下载失败，请重试';}
    finally{link.removeAttribute('aria-busy');}
  });
}

function filePreviewControlIcon(kind){
  const paths={
    expand:'M475.3408 850.5344h-266.24a37.2736 37.2736 0 0 1-37.2736-37.2736v-266.24a37.2736 37.2736 0 1 1 74.5472 0v228.9664h228.9664a37.2736 37.2736 0 0 1 0 74.5472zM830.3104 495.5648a37.2736 37.2736 0 0 1-37.2736-37.2736V229.3248h-228.9664a37.2736 37.2736 0 1 1 0-74.5472h266.24a37.2736 37.2736 0 0 1 37.2736 37.2736v266.24a37.2736 37.2736 0 0 1-37.2736 37.2736z',
    collapse:'M384 512a128 128 0 0 0 128-128V170.666667a42.666667 42.666667 0 1 0-85.333333 0v213.333333a42.666667 42.666667 0 0 1-42.666667 42.666667H170.666667a42.666667 42.666667 0 1 0 0 85.333333h213.333333z m277.333333 42.666667a128 128 0 0 0-128 128v170.666666a42.666667 42.666667 0 1 0 85.333334 0v-170.666666a42.666667 42.666667 0 0 1 42.666666-42.666667H853.333333a42.666667 42.666667 0 1 0 0-85.333333h-192z',
    download:'M828.1 896.7H199.9c-73.2 0-132.8-59.6-132.8-132.8V514.5c0-17.7 14.3-32 32-32s32 14.3 32 32v249.4c0 37.9 30.9 68.8 68.8 68.8h628.2c37.9 0 68.8-30.9 68.8-68.8V514.5c0-17.7 14.3-32 32-32s32 14.3 32 32v249.4c0 73.2-59.6 132.8-132.8 132.8z M512.4 740.7c-17.7 0-32-14.3-32-32V151.8c0-17.7 14.3-32 32-32s32 14.3 32 32v556.9c0 17.7-14.3 32-32 32z M518.5 737.4c-8.2 0-16.4-3.1-22.6-9.4-12.5-12.5-12.5-32.8 0-45.3l156.9-156.9c12.5-12.5 32.8-12.5 45.3 0s12.5 32.8 0 45.3L541.1 728c-6.2 6.3-14.4 9.4-22.6 9.4z M506.2 737.2c-8.2 0-16.4-3.1-22.6-9.4L326.7 570.9c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l156.9 156.9c12.5 12.5 12.5 32.8 0 45.3-6.3 6.3-14.5 9.4-22.7 9.4z',
    close:'M865.6 809.6c16 16 16 41.6 0 56-8 8-17.6 11.2-28.8 11.2s-20.8-3.2-28.8-11.2L512 568 214.4 865.6c-8 8-17.6 11.2-28.8 11.2s-20.8-3.2-28.8-11.2c-16-16-16-41.6 0-56L456 512 158.4 214.4c-16-16-16-41.6 0-56 16-16 41.6-16 56 0L512 456 809.6 158.4c16-16 41.6-16 56 0 16 16 16 41.6 0 56L568 512l297.6 297.6z'
  };
  return `<svg class="fileControlIcon fileControlIcon--${kind}" viewBox="0 0 1024 1024" fill="currentColor" aria-hidden="true"><path d="${paths[kind]}"/></svg>`;
}

function renderFileDeliverables(article,data){
  const answer=article.querySelector('.finalAnswer');
  if(!answer)return;
  answer.classList.remove('has-generated-files');
  answer.querySelector('.generatedFileList')?.remove();
  const files=fileDeliverables(data);
  if(!files.length)return;
  answer.classList.add('has-generated-files');
  const list=document.createElement('section');list.className='generatedFileList';list.setAttribute('aria-label','生成的文件');
  list.innerHTML=files.map(file=>`<div class="generatedFileCard"><svg class="generatedFileIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></svg><button class="generatedFileOpen" type="button" aria-haspopup="dialog" aria-label="预览 ${escapeHtml(file.name)}"><span class="generatedFileName" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span><span class="generatedFileType">${escapeHtml(file.type)}</span></button><a class="generatedFileDownload" href="${escapeHtml(file.download)}" download="${escapeHtml(file.name)}" aria-label="下载文件 ${escapeHtml(file.name)}" title="下载文件">${filePreviewControlIcon('download')}</a></div>`).join('');
  list.querySelectorAll('.generatedFileOpen').forEach((button,index)=>{
    button.addEventListener('click',()=>void openGeneratedFilePreview(files[index],button));
  });
  list.querySelectorAll('.generatedFileDownload').forEach(bindGeneratedFileDownload);
  files.forEach((file,index)=>{
    if(!file.resolveName)return;
    fetch(file.metadata,{credentials:'same-origin',cache:'no-store'}).then(response=>response.ok?response.json():null).then(metadata=>{
      if(!list.isConnected||!metadata?.name)return;
      file.name=String(metadata.name);
      const url=new URL(file.download,window.location.origin);url.searchParams.set('name',file.name);file.download=url.pathname+url.search;
      const card=list.children[index],label=card.querySelector('.generatedFileName'),button=card.querySelector('.generatedFileOpen'),link=card.querySelector('.generatedFileDownload');
      label.textContent=file.name;label.title=file.name;button.setAttribute('aria-label',`预览 ${file.name}`);
      link.href=file.download;link.download=file.name;link.setAttribute('aria-label',`下载文件 ${file.name}`);
    }).catch(()=>{/* Keep the readable generic title if metadata is unavailable. */});
  });
  const report=answer.querySelector('.mixedReport');
  if(report)report.after(list);else answer.append(list);
}

function ensureGeneratedFilePreview(){
  let panel=document.getElementById('generatedFilePreview');
  if(panel)return panel;
  const host=document.querySelector('.shell');if(!host)return null;
  panel=document.createElement('aside');panel.id='generatedFilePreview';panel.className='generatedFilePreview';panel.hidden=true;
  panel.setAttribute('aria-label','文件预览');panel.setAttribute('role','dialog');panel.setAttribute('tabindex','-1');
  panel.innerHTML=`<header class="filePreviewHeader"><span class="filePreviewTitle"></span><div class="filePreviewActions"><a class="filePreviewDownload" title="下载文件" aria-label="下载文件" download>${filePreviewControlIcon('download')}</a><div class="filePreviewWindowControls"><button class="filePreviewExpand" type="button" title="全屏" aria-label="全屏" aria-pressed="false">${filePreviewControlIcon('expand')}${filePreviewControlIcon('collapse')}</button><button class="filePreviewClose" type="button" title="关闭预览" aria-label="关闭预览">${filePreviewControlIcon('close')}</button></div></div></header><div class="filePreviewBody"><p class="filePreviewStatus" role="status">正在加载文件…</p><iframe class="filePreviewFrame" title="文件预览" hidden></iframe><button class="filePreviewRetry" type="button" hidden>重试</button></div>`;
  host.append(panel);
  bindGeneratedFileDownload(panel.querySelector('.filePreviewDownload'));
  panel.querySelector('.filePreviewClose').addEventListener('click',()=>closeGeneratedFilePreview());
  panel.querySelector('.filePreviewExpand').addEventListener('click',()=>{
    const expanded=panel.classList.toggle('is-expanded');host.classList.toggle('file-preview-expanded',expanded);
    const button=panel.querySelector('.filePreviewExpand');button.setAttribute('aria-pressed',String(expanded));button.setAttribute('aria-label',expanded?'退出全屏':'全屏');button.title=expanded?'退出全屏':'全屏';
    syncGeneratedFilePreviewMode(panel);
  });
  panel.querySelector('.filePreviewRetry').addEventListener('click',()=>void openGeneratedFilePreview(panel.file, panel.returnFocus));
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();closeGeneratedFilePreview();}});
  window.addEventListener('veya:chat-navigate',()=>closeGeneratedFilePreview(false));
  window.addEventListener('resize',()=>{if(!panel.hidden)syncGeneratedFilePreviewMode(panel);});
  window.addEventListener('aime:theme-change',()=>{if(!panel.hidden&&panel.file)void openGeneratedFilePreview(panel.file,panel.returnFocus);});
  return panel;
}

function syncGeneratedFilePreviewMode(panel){
  const mobile=window.innerWidth<1024;
  const overlay=!panel.hidden&&(mobile||panel.classList.contains('is-expanded'));
  for(const [sibling,wasInert] of panel.inertSiblings||[]){if(!wasInert)sibling.removeAttribute('inert');}
  panel.inertSiblings=null;
  if(overlay){
    if(mobile)panel.setAttribute('aria-modal','true');else panel.removeAttribute('aria-modal');
    panel.inertSiblings=new Map();
    for(const sibling of panel.parentElement.children){
      if(sibling===panel||(!mobile&&sibling.classList.contains('appSidebar')))continue;
      panel.inertSiblings.set(sibling,sibling.hasAttribute('inert'));sibling.setAttribute('inert','');
    }
  }else{
    panel.removeAttribute('aria-modal');
  }
}

function closeGeneratedFilePreview(restoreFocus=true){
  const panel=document.getElementById('generatedFilePreview');if(!panel||panel.hidden)return;
  panel.controller?.abort();clearTimeout(panel.loadTimeout);panel.querySelector('.filePreviewFrame').removeAttribute('src');panel.hidden=true;
  panel.classList.remove('is-expanded');
  panel.querySelector('.filePreviewExpand').setAttribute('aria-pressed','false');
  panel.querySelector('.filePreviewExpand').setAttribute('aria-label','全屏');panel.querySelector('.filePreviewExpand').title='全屏';
  syncGeneratedFilePreviewMode(panel);
  const host=document.querySelector('.shell');host?.classList.remove('file-preview-open','file-preview-expanded');
  if(restoreFocus&&panel.returnFocus?.isConnected)panel.returnFocus.focus({preventScroll:true});
}

async function openGeneratedFilePreview(file,trigger){
  const open=new URL(file.open,window.location.origin),downloadUrl=new URL(file.download,window.location.origin);
  if(file.type==='HTML'||file.workspaceFile)open.searchParams.set('theme',currentThemeMode());downloadUrl.searchParams.set('theme',currentThemeMode());
  file={...file,open:open.pathname+open.search,download:downloadUrl.pathname+downloadUrl.search};
  const panel=ensureGeneratedFilePreview();if(!panel)return;
  if(typeof closeActivityDrawer==='function')closeActivityDrawer();
  const host=document.querySelector('.shell');
  panel.controller?.abort();clearTimeout(panel.loadTimeout);const controller=new AbortController();panel.controller=controller;
  panel.file=file;panel.returnFocus=trigger;panel.hidden=false;host.classList.add('file-preview-open');
  syncGeneratedFilePreviewMode(panel);
  const title=panel.querySelector('.filePreviewTitle');title.textContent=file.name;title.title=file.name;
  const download=panel.querySelector('.filePreviewDownload');download.href=file.download;download.download=file.name;
  const status=panel.querySelector('.filePreviewStatus'),frame=panel.querySelector('.filePreviewFrame'),retry=panel.querySelector('.filePreviewRetry');
  frame.onload=null;frame.onerror=null;frame.removeAttribute('src');frame.hidden=true;status.hidden=false;status.textContent='正在加载文件…';retry.hidden=true;
  panel.querySelector('.filePreviewClose').focus({preventScroll:true});
  if(!['HTML','PDF','PNG','JPG','JPEG','WEBP','SVG','TXT','MD','JSON','CSV','PY','JS','MJS','CJS','TS','TSX','JSX','CSS','SCSS','XML','YAML','YML','TOML','SH','SQL'].includes(file.type)){
    status.textContent='此格式暂不支持预览，可点击右上角下载查看。';return;
  }
  panel.loadTimeout=setTimeout(()=>{
    if(controller.signal.aborted||panel.controller!==controller)return;
    controller.abort();frame.hidden=true;status.hidden=false;status.textContent='文件加载超时，请重试。';retry.hidden=false;
  },20000);
  try{
    const response=await fetch(file.open,{credentials:'same-origin',cache:'no-store',signal:controller.signal});
    if(!response.ok)throw new Error('文件暂时无法加载');
    void response.body?.cancel?.().catch?.(()=>{});
    if(controller.signal.aborted||panel.controller!==controller)return;
    frame.onload=()=>{
      if(controller.signal.aborted||panel.controller!==controller)return;
      try{if(frame.contentWindow?.location.href==='about:blank')return;}catch{}
      clearTimeout(panel.loadTimeout);
      status.hidden=true;frame.hidden=false;
      try{frame.contentDocument?.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented)closeGeneratedFilePreview();});}catch{}
    };
    frame.onerror=()=>{if(panel.controller===controller&&!controller.signal.aborted){clearTimeout(panel.loadTimeout);status.hidden=false;status.textContent='文件加载失败，请重试。';retry.hidden=false;}};
    frame.title=file.name;frame.src=file.open;
  }catch(error){
    if(controller.signal.aborted||panel.controller!==controller)return;
    clearTimeout(panel.loadTimeout);
    status.textContent='文件加载失败，请重试。';retry.hidden=false;
  }
}

async function renderMixedReportFlow(article, data, container, onDone) {
  if (!container) {
    onDone?.();
    return;
  }
  if(typeof renderFileDeliverables==='function')renderFileDeliverables(article,data);
  if (Array.isArray(data.streamBlocks) && data.streamBlocks.length) {
    article.streamVisualizationArtifacts = (data.reportArtifacts || []).map(canonicalArtifact);
    replayOrderedStream(article,data.streamBlocks,container);
    attachInlineAnswerSources(container, mergeSourcesByUrl(data.sources || [], sourcesFromInsightMarkdown(data.interpretation || '')));
    onDone?.();
    return;
  }
  const replaceNodes = (nodes) => {
    container.replaceChildren(...nodes);
    container.querySelectorAll(".streamvizFinalSlot").forEach((slot) => {
      const host = slot.streamvizHost;
      // Atomic moves keep the iframe browsing context alive in modern Chrome.
      // A widget shell created during the final handoff is detached even when
      // the iframe it wraps was previously connected. moveBefore() rejects
      // that cross-hierarchy insertion, so only use it for connected hosts.
      if (host.isConnected && slot.parentElement.moveBefore) slot.parentElement.moveBefore(host, slot);
      else slot.parentElement.insertBefore(host, slot);
      slot.remove();
    });
  };
  const reportArtifacts = Array.isArray(data.reportArtifacts)
    ? data.reportArtifacts.filter((item) => item && item.url)
    : [];
  if (!reportArtifacts.length && data.reportUrl) reportArtifacts.push({ url: data.reportUrl });
  // Deployment prefixes and preview URLs refer to the same generated file.
  const chartReferenceKey = reference => {
    try {
      const url = new URL(String(reference).trim(), window.location.origin);
      if (url.origin !== window.location.origin) return null;
      const pathname = decodeURIComponent(url.pathname);
      const match = pathname.match(/\/(?:generated|share-artifact)\/([^/\\\x00]+\.html)$/i);
      return match ? ["", "generated", match[1]].join("/") : null;
    } catch { return null; }
  };
  const references = new Map();
  const registerArtifact = (item, index) => {
    for (const reference of [item.path, item.url].filter(Boolean)) {
      references.set(String(reference).trim(), index);
      const key = chartReferenceKey(reference);
      if (key) references.set(key, index);
    }
  };
  reportArtifacts.forEach(registerArtifact);
  const appScript = Array.from(document.scripts).find(script => /\/static\/app\.js(?:[?#]|$)/.test(script.src));
  const deploymentPrefix = appScript ? new URL(appScript.src).pathname.split("/static/app.js")[0]
    : window.location.pathname.match(/^\/(?:mentora|veya)(?=\/|$)/)?.[0] || "";
  const interpretationWithCharts = String(data.interpretation || "").replace(/\[\[AIME_CHART:([^\]]*)\]\]/g, (marker, rawReference) => {
    const reference = rawReference.trim();
    const key = chartReferenceKey(reference);
    if (references.has(reference) || (key && references.has(key))) return marker;
    // Saved Deal results may retain the placement marker but omit metadata.
    // Recover only same-origin generated HTML; never mount arbitrary URLs.
    if (key) {
      const item = {url: deploymentPrefix + key, renderMode: "iframe"};
      registerArtifact(item, reportArtifacts.length);
      reportArtifacts.push(item);
      return marker;
    }
    return "\n\n图表暂不可用，请重新生成。\n\n";
  }).replace(/\[\[AIME_CHART:[^\]]*$/g, "");

  const sources = Array.isArray(data.sources) ? data.sources.filter((item) => item?.url) : [];
  const videos = Array.isArray(data.videos) ? data.videos.filter((item) => item && (item.videoUrl || item.url)) : [];
  const sourcePrepared = stripSourceInventoryFromInsight(sanitizeUserFacingInsight(interpretationWithCharts), sources);
  const videoPrepared = prepareInsightForVideos(sourcePrepared, videos);
  const makeVideoLane = () => buildVideoLane(videos, { showHeading: !videoPrepared.hadMarker });
  if (!data.reportUrl && !reportArtifacts.length) {
    const nodes = [];
    videoPrepared.text.split(/(@@AIME_VIDEO_LANE@@)/g).forEach((part) => {
      if (part === "@@AIME_VIDEO_LANE@@") {
        const lane = makeVideoLane();
        if (lane) nodes.push(lane);
      } else if (part.trim()) {
        const text = document.createElement("div");
        text.className = "streamingAnswer reportInterpretation";
        text.innerHTML = formatInsight(part.trim());
        nodes.push(text);
      }
    });
    if (videos.length && !videoPrepared.hadMarker) {
      const lane = makeVideoLane();
      if (lane) nodes.push(lane);
    }
    replaceNodes(nodes);
    attachInlineAnswerSources(container, sources);
    onDone?.();
    return;
  }
  const makeFrame = (item, index) => {
    const streamedHost = article.completedStreamVisualizationHosts?.get(item.url);
    if (streamedHost) {
      article.completedStreamVisualizationHosts.delete(item.url);
      streamedHost.classList.remove("is-live");
      if (streamedHost.classList.contains("streamvizArtifactHost")) guardStreamVisualization(streamedHost, item, index);
      const slot = document.createElement("div");
      slot.className = "streamvizFinalSlot";
      slot.streamvizHost = withArtifactWidgetControl(streamedHost,item);
      return slot;
    }
    if (isGeneratedImageArtifact(item)) return createGeneratedImageArtifact(item);
    if (item.renderMode === "iframe") return withArtifactWidgetControl(createArtifactFallbackFrame(item, index, { demoLoadingMs: article.classList.contains("cachedCaseAnswer") ? item.caseDemoLoadingMs : 0 }),item);
    return withArtifactWidgetControl(createStreamVisualizationArtifact(item, index, { showActions: false, demoLoadingMs: article.classList.contains("cachedCaseAnswer") ? item.caseDemoLoadingMs : 0 }),item);
  };
  // A single FLUX result is visual-only, including previously saved conversations
  // whose interpretation still contains the old completion message.
  if (reportArtifacts.length === 1 && !videos.length && !sources.length) {
    const item = reportArtifacts[0];
    if (isGeneratedImageArtifact(item)) {
      replaceNodes([makeFrame(item, 0)]);
      onDone?.();
      return;
    }
  }
  const interpretation = sanitizeUserFacingInsight(videoPrepared.text);
  if (reportArtifacts.length && interpretation) {
    let tokenized = interpretation.replace(
      /^#{1,6}\s*(?:生成图表|图表文件|图表输出|Generated Charts?|Chart Files?)\s*$/gim,
      "",
    );
    tokenized = tokenized.replace(/\[\[AIME_CHART:([^\]]*)\]\]/g, (_marker, rawReference) => {
      const reference = rawReference.trim();
      const index = references.get(reference) ?? references.get(chartReferenceKey(reference));
      return index === undefined ? "" : `\n\n@@AIME_CHART_${index}@@\n\n`;
    });
    const rendered = new Set();
    const nodes = [];
    tokenized.split(/(@@AIME_CHART_\d+@@|@@AIME_VIDEO_LANE@@)/g).forEach((part) => {
      const match = part.match(/^@@AIME_CHART_(\d+)@@$/);
      if (part === "@@AIME_VIDEO_LANE@@") {
        const lane = makeVideoLane();
        if (lane) nodes.push(lane);
        return;
      }
      if (match) {
        const index = Number(match[1]);
        if (reportArtifacts[index] && !rendered.has(index)) {
          nodes.push(makeFrame(reportArtifacts[index], index));
          rendered.add(index);
        }
        return;
      }
      if (part.trim()) {
        const text = document.createElement("div");
        text.className = "streamingAnswer reportInterpretation";
        text.innerHTML = formatInsight(part.trim());
        nodes.push(text);
      }
    });
    // Tool artifacts are evidence inventory, not a display instruction.
    // Only charts referenced by the final narrative are mounted.
    if (videos.length && !videoPrepared.hadMarker) {
      const lane = makeVideoLane();
      if (lane) nodes.push(lane);
    }
    replaceNodes(nodes);
    container.querySelectorAll(".reportDocumentFrame").forEach((frame) => {
      resizeReportDocumentFrame(frame);
      window.setTimeout(() => resizeReportDocumentFrame(frame), 300);
      window.setTimeout(() => resizeReportDocumentFrame(frame), 1000);
    });
    attachInlineAnswerSources(container, sources);
    onDone?.();
    return;
  }
  // No narrative placement means no automatic first/latest-chart fallback.
  replaceNodes([]);
  attachInlineAnswerSources(container, sources);
  onDone?.();
}

function sanitizeUserFacingInsight(value) {
  let source = String(value || "");
  const finalHeadingPattern = /^#{1,6}\s*(?:核心结论|分析结论|结论|市场要闻|市場要聞|Core Conclusion|Key Findings|Market Brief)\s*$/gim;
  const finalHeadings = Array.from(source.matchAll(finalHeadingPattern));
  if (finalHeadings.length > 1) {
    source = source.slice(finalHeadings.at(-1).index || 0);
  }
  const heading = source.search(/^#{1,6}\s+/m);
  if (heading > 0) {
    const preamble = source.slice(0, heading).toLowerCase();
    if (["let me", "rendered successfully", "final response", "整理最终", "组织最终", "渲染成功", "让我", "按照11.2", "不要输出过程说明", "第一非空字符"]
      .some((marker) => preamble.includes(marker))) {
      source = source.slice(heading);
    }
  }
  return source
    .replace(/[（(][^（）\n()]*\b(?:assets_total|total_debt|holder_equity_total|other_cost|requested_field_unavailable|stream_id)[^（）\n()]*[）)]/gi, "")
    .replace(/^(#{1,6}[^\n]+)$/gm, line => line.replace(/[（(][^（）\n()]*(?:本次.*(?:抓取|取数)|组件字段|组件内)[^（）\n()]*[）)]/g, ""))
    .replace(/^.*(?:All charts render|Final artifacts are in place|structural verification).*$/gim, "")
    .replace(/[（(]`?[^（）\n()]*?(?:financial_reports_visual\/|abroad\/finance\/)[^（）\n()]*[）)]/g, "")
    .replace(/^(?!.*\[\[AIME_CHART:).*?(?:执行说明|产物[：:]|产物文件|生成产物|分析中间件|outputs\/|payload\.json|subjects not matched share|--sample).*$/gim, "")
    .replace(/^(?:已完成|我已完成|本次已用).*?(?:渲染|执行|校验|生成|取数).*$/gm, "")
    .replace(/来自\s+`?fetch_yahoo_data\([^\n)]*\)`?\s*的\s*/gi, "")
    .replace(/^.*(?:用户?未点名[^\n]*(?:已省略|未纳入)|工具返回字段|调用参数|transferMode|payload_json).*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitInsightAroundChart(value) {
  const source = String(value || "").trim();
  if (!source) return { before: "", after: "" };
  const section = source.match(/^##\s+(?:数据依据|Evidence|关键数据|图表证据)\s*$/im);
  if (section && Number.isInteger(section.index) && section.index > 0) {
    return {
      before: source.slice(0, section.index).trim(),
      after: source.slice(section.index).trim(),
    };
  }
  const paragraphBreak = source.indexOf("\n\n");
  if (paragraphBreak > 0) {
    const nextBreak = source.indexOf("\n\n", paragraphBreak + 2);
    const splitAt = nextBreak > 0 ? nextBreak : paragraphBreak;
    return { before: source.slice(0, splitAt).trim(), after: source.slice(splitAt).trim() };
  }
  return { before: source, after: "" };
}

function streamPlainTextInto(target, text) {
  return new Promise((resolve) => {
    const source = String(text || "").trim();
    if (!source) {
      resolve();
      return;
    }
    let index = 0;
    const step = () => {
      index = Math.min(source.length, index + 10);
      target.textContent = source.slice(0, index);
      keepScrollPosition(isNearBottom());
      if (index < source.length) {
        window.setTimeout(step, 18);
        return;
      }
      resolve();
    };
    step();
  });
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function streamAnswerText(target, text, onDone) {
  if (!target) {
    onDone?.();
    return;
  }
  const source = String(text || "").trim();
  if (!source) {
    target.remove();
    onDone?.();
    return;
  }
  target.classList.add("is-streaming");
  let index = 0;
  const step = () => {
    index = Math.min(source.length, index + 12);
    target.innerHTML = formatInsight(source.slice(0, index));
    keepScrollPosition(isNearBottom());
    if (index < source.length) {
      window.setTimeout(step, 18);
      return;
    }
    target.classList.remove("is-streaming");
    onDone?.();
  };
  step();
}

function showError(article, message, options = {}) {
  clearImageGenerationLoading(article);
  const target = article.querySelector(".finalAnswer") || article.querySelector(".bubble");
  const shouldStick = isNearBottom();
  article.querySelectorAll(".thinkingSteps li.is-loading").forEach((item) => {
    item.classList.remove("is-loading");
    item.classList.add("is-error");
  });
  article.dataset.thinkingState = "error";
  article.activityEnded = true;
  updateThinkingSummary(article, copyFor(article.dataset.lang || "en", "stoppedAfter"));
  if (article.orderedStream) target.insertAdjacentHTML('beforeend', `<p class="error">${escapeHtml(message)}</p>`);
  else target.innerHTML = `<p class="error">${escapeHtml(message)}</p>`;
  if (!options.skipSessionRecord) recordAssistantError(article, message);
  syncActivityDrawer(article);
  keepScrollPosition(shouldStick);
}

function showStopped(article, message="已停止本轮任务", options={}) {
  if (!article || article.activityEnded) return;
  clearImageGenerationLoading(article);
  const target=article.querySelector(".finalAnswer") || article.querySelector(".bubble");
  article.querySelectorAll(".thinkingSteps li.is-loading").forEach((item)=>{
    item.classList.remove("is-loading","is-error");
    item.classList.add("is-done");
  });
  article.dataset.thinkingState="stopped";
  article.activityEnded=true;
  updateThinkingSummary(article,copyFor(article.dataset.lang || "en","stoppedAfter"));
  if (target && !target.textContent.trim()) target.innerHTML=`<p class="stopped">${escapeHtml(message)}</p>`;
  if (!options.skipSessionRecord) recordAssistantStopped(article,message);
  syncActivityDrawer(article);
}

function completeThinking(article) {
  article.querySelectorAll(".thinkingSteps li").forEach((item) => {
    if (item.classList.contains("is-error")) return;
    item.classList.remove("is-loading", "is-error");
    item.classList.add("is-done");
  });
}

function updateThinkingSummary(article, prefix, options = {}) {
  const target = article.querySelector(".thinkingSummaryText");
  if (!target) return;
  const startedAt = Number(article.dataset.startedAt || Date.now());
  const elapsed = Math.max(1000, article.dataset.cachedElapsedMs ? Number(article.dataset.cachedElapsedMs) : Date.now() - startedAt);
  const lang = normalizeLang(article.dataset.lang || "en");
  const chinese = lang === "zh-Hans" || lang === "zh-Hant";
  const minutes = Math.floor(elapsed / 60000);
  const seconds = Math.floor(elapsed / 1000) % 60;
  const duration = chinese ? `${minutes ? `${minutes}分钟 ` : ""}${seconds}秒` : formatDuration(elapsed);
  target.textContent = article.dataset.elapsedUnrecorded === "true"
    ? (chinese ? "查看执行记录" : "View activity")
    : `${chinese ? "已处理" : "Worked for"} ${duration}`;
  const list = article.querySelector(".thinkingSteps");
  if (list) {
    if (!options.live) {
      list.querySelectorAll("details[open]").forEach((detail) => { detail.open = false; });
      delete article.dataset.thinkingCollapsed;
      if (article.activityWasLive) {
        article.activityDisclosureState?.clear();
        article.dataset.activityInlineExpanded = "false";
      }
    }
  }
  const flow = options.clockOnly ? article.querySelector(".thinkingFlow") : syncInlineActivity(article);
  if (flow) flow.hidden = !isInlineActivityExpanded(article);
  article.activityWasLive = Boolean(options.live);
  const trigger = article.querySelector(".thinkingTrigger");
  if (trigger) {
    const thinking = Boolean(options.live && !article.answerTextStarted);
    trigger.classList.toggle("is-thinking", thinking);
    trigger.classList.toggle("is-complete", !options.live && article.dataset.thinkingState !== "error");
    trigger.classList.toggle("is-error", article.dataset.thinkingState === "error");
    trigger.disabled = false;
    trigger.setAttribute("aria-label", thinking ? (chinese ? "展开或收起全部推理" : "Expand or collapse all reasoning") : (chinese ? "查看执行记录" : "View activity"));
    trigger.setAttribute("aria-expanded", String(Boolean(flow && !flow.hidden)));
    trigger.setAttribute("aria-controls", flow?.id || "activityDrawer");
  }
  if (activeActivityArticle === article && activityElapsed) {
    activityElapsed.textContent = article.dataset.cachedElapsedMs ? formatDuration(Number(article.dataset.cachedElapsedMs)) : article.dataset.elapsedUnrecorded === "true" || article.classList.contains("cachedCaseAnswer") ? "原始耗时未记录" : article.dataset.cachedActivityCount ? "缓存记录" : formatDuration(elapsed);
  }
}

function setInlineActivityExpanded(article, expanded) {
  if (activeActivityArticle) closeActivityDrawer();
  article.dataset.activityInlineExpanded = String(expanded);
  const flow = syncInlineActivity(article);
  const trigger = article.querySelector(".thinkingTrigger");
  trigger?.setAttribute("aria-expanded", String(expanded));
  if (flow) trigger?.setAttribute("aria-controls", flow.id);
}

function toggleActivityDrawer(article) {
  if (!article.activityEnded && article.dataset.thinkingState === "active") {
    const flow = syncInlineActivity(article);
    setInlineActivityExpanded(article, Boolean(flow?.hidden));
    return;
  }
  if (!isMobileLayout()) {
    const flow = syncInlineActivity(article);
    setInlineActivityExpanded(article, Boolean(flow?.hidden));
    return;
  }
  if (activeActivityArticle === article && activityDrawer?.classList.contains("is-open")) {
    closeActivityDrawer();
    return;
  }
  openActivityDrawer(article);
}

function openActivityDrawer(article) {
  if (!isMobileLayout()) {
    setInlineActivityExpanded(article, true);
    return;
  }
  if(typeof closeGeneratedFilePreview==='function')closeGeneratedFilePreview(false);
  activeActivityArticle = article;
  activityAutoFollow = !article.classList.contains("cachedCaseAnswer") && article.dataset.historicalTaskRun !== "true";
  shell?.classList.add("activity-open");
  activityDrawer?.classList.add("is-open");
  activityDrawer?.setAttribute("aria-hidden", "false");
  article.querySelector(".thinkingTrigger")?.setAttribute("aria-expanded", "true");
  article.querySelector(".thinkingTrigger")?.setAttribute("aria-controls", "activityDrawer");
  if (isMobileLayout()) {
    activityDrawer?.setAttribute("role", "dialog");
    activityDrawer?.setAttribute("aria-modal", "true");
    activityDrawer?.setAttribute("aria-label", "执行记录");
    let backdrop = document.querySelector(".activityBackdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.className = "activityBackdrop";
      backdrop.addEventListener("click", closeActivityDrawer);
      document.body.append(backdrop);
    }
    backdrop.hidden = false;
    activityClose?.focus();
  }
  if ((article.classList.contains("cachedCaseAnswer") || article.dataset.historicalTaskRun === "true") && activityBody) activityBody.scrollTop = 0;
  syncActivityDrawer(article);
}

function closeActivityDrawer() {
  const previousArticle = activeActivityArticle;
  shell?.classList.remove("activity-open");
  activityDrawer?.classList.remove("is-open");
  activityDrawer?.setAttribute("aria-hidden", "true");
  activityDrawer?.removeAttribute("aria-modal");
  document.querySelector(".activityBackdrop")?.setAttribute("hidden", "");
  previousArticle?.querySelector(".thinkingTrigger")?.setAttribute("aria-expanded", "false");
  if (activityDrawer?.contains(document.activeElement)) previousArticle?.querySelector(".thinkingTrigger")?.focus();
  activeActivityArticle = null;
}

function syncActivityDrawer(article) {
  syncInlineActivity(article);
  if (!activityDrawer || !activityBody || activeActivityArticle !== article) return;
  const shouldStick = !article.classList.contains("cachedCaseAnswer") && article.dataset.historicalTaskRun !== "true" && (activityAutoFollow || isActivityNearBottom());
  const previousScrollTop = activityBody.scrollTop;
  const startedAt = Number(article.dataset.startedAt || Date.now());
  const elapsed = article.dataset.cachedElapsedMs ? Number(article.dataset.cachedElapsedMs) : Math.max(0, Date.now() - startedAt);
  const lang = normalizeLang(article.dataset.lang || "en");
  if (activityLabel) activityLabel.textContent = copyFor(lang, "activity");
  activityElapsed.textContent = article.dataset.cachedElapsedMs ? formatDuration(Number(article.dataset.cachedElapsedMs)) : article.dataset.elapsedUnrecorded === "true" || article.classList.contains("cachedCaseAnswer") ? "原始耗时未记录" : article.dataset.cachedActivityCount ? "缓存记录" : formatDuration(elapsed);

  activityBody.innerHTML = buildActivityFlow(article);
  bindActivityFileChangeButtons(activityBody);
  bindActivityCommandPanels(activityBody);
  if (shouldStick) {
    scrollActivityToLatest(true);
  } else {
    requestAnimationFrame(() => {
      activityBody.scrollTop = previousScrollTop;
    });
  }
}

function isActivityNearBottom() {
  if (!activityBody) return true;
  return activityBody.scrollHeight - activityBody.scrollTop - activityBody.clientHeight < 96;
}

function scrollActivityToLatest(shouldStick = activityAutoFollow) {
  if (!activityBody || !shouldStick) return;
  requestAnimationFrame(() => {
    if (!activityDrawer?.classList.contains("is-open")) return;
    activityBody.scrollTo({ top: activityBody.scrollHeight, behavior: "auto" });
  });
}

function buildActivityTerminal(article, lang, elapsed, state) {
  if (!article.activityEnded) return "";
  const title = article.dataset.elapsedUnrecorded === "true" ? "执行已完成" : state === "error" ? `${copyFor(lang, "stoppedAfter")} ${formatDuration(elapsed)}` : `${copyFor(lang, "thoughtFor")} ${formatDuration(elapsed)}`;
  const detail = state === "error" ? copyFor(lang, "stoppedLabel") : copyFor(lang, "completedLabel");
  return `
    <li class="is-terminal ${state === "error" ? "is-error" : "is-done"}">
      <div class="activityTerminalTitle">${escapeHtml(title)}</div>
      <div class="activityTerminalDetail">${escapeHtml(detail)}</div>
    </li>
  `;
}

function activitySourceItems(items) {
  const comparable = value => String(value || "").replace(/^[\s*•·—–-]+/, "").replace(/[\s。.!！:：]+$/g, "").trim().toLowerCase();
  const navigation = /^(?:财经|焦点|首页|主页|新闻|热点|更多|导航|finance|focus|home|news|menu)$/i;
  return (Array.isArray(items) ? items : []).flatMap(item => {
    if (!item?.url || !isPublicEvidenceUrl(item.url)) return [];
    const title = String(item.title || item.moduleLabel || item.code || "").trim();
    const originalSite = String(item.siteName || "").trim();
    const rawSummary = String(item.summary || "").trim();
    const summary = [title, originalSite].some(value => value && comparable(value) === comparable(rawSummary)) ? "" : rawSummary;
    // A bare navigation label is not a research citation. Keep it only if
    // the provider supplied a distinct, substantive summary.
    if (navigation.test(title || originalSite) && !summary) return [];
    const siteName = !originalSite || comparable(originalSite) === comparable(title)
      ? domainFromUrl(item.url) || originalSite : originalSite;
    return [{...item, siteName, title: comparable(title) === comparable(siteName) ? "" : title, summary}];
  });
}

function buildActivitySources(article, lang) {
  const sources = activitySourceItems(article.activitySources);
  if (!sources.length) return "";
  const title = `${copyFor(lang, "sources")} · ${sources.length}`;
  const cards = sources
    .map((item) => `
      <a class="activitySourceCard" href="${escapeHtml(item.url || "#")}" target="_blank" rel="noreferrer noopener">
        <div class="activitySourceBrand">
          <img class="activitySourceLogo" src="${escapeHtml(item.iconUrl || sourceLogoSrc(item.siteName, item.url))}" data-source-site="${escapeHtml(item.siteName || "")}" onerror="${escapeHtml(sourceImageFallbackAttribute(item.siteName || ""))}" alt="" />
          <span>${escapeHtml(item.siteName || "AInvest")}</span>
        </div>
        ${item.title ? `<div class="activitySourceTitle">${escapeHtml(item.title)}</div>` : ""}
        ${item.summary ? `<div class="activitySourceSummary">${escapeHtml(item.summary)}</div>` : ""}
      </a>
    `)
    .join("");
  return `
    <section class="activitySourcesSection">
      <div class="activitySourcesTitle">${escapeHtml(title)}</div>
      <div class="activitySourcesList">${cards}</div>
    </section>
  `;
}

function favoriteHeartIcon(saved=false) {
  const outer='M556.5 918.9c-24.6 25-64.4 25-89 0L149.4 595.8c-7.2-7.3-13.2-15.2-19.2-23.2l-4-5.4c-91-118.7-81-288.1 23.2-394C246.8 74.5 397.3 59 512 131.8 626.8 59 777.3 74.5 874.6 173.3c104.3 105.9 114.3 275.3 23.2 394l-3.9 5.2c-6 8.1-12.1 16-19.4 23.4l-318 323z';
  const inner='M356.1 177.4c-52.2 0-104.1 20.3-143.4 60.2-72.3 73.5-79.2 191.1-15.9 273.7l4.7 6.3c3.5 4.7 6.9 9.5 11.1 13.8L512 835.3l299.2-303.9c4.3-4.4 7.7-9.2 11.2-13.9l4.6-6.1c63.4-82.6 56.5-200.3-15.8-273.8C738 163.3 621.4 157 539.9 223L512 245.7 484.1 223c-37.8-30.5-83-45.6-128-45.6z';
  return '<svg viewBox="0 0 1024 1024" fill="currentColor" stroke="none" aria-hidden="true"><path d="'+outer+(saved?'':inner)+'"/></svg>';
}

function buildResultActions(article, lang) {
  const shareButton = `<button class="resultActionButton shareResultButton" type="button" aria-label="分享" data-tip="分享">
        <span class="resultActionIcon">${SHARE_ICON}</span>
      </button>`;
  const favoriteButton = article.classList.contains("cachedCaseAnswer") ? "" : `<button class="resultActionButton favoriteResultButton" type="button" aria-label="收藏到我的" data-tip="收藏"><span class="resultActionIcon">${favoriteHeartIcon()}</span></button>`;
  return `
    <div class="resultActionsRow">
      ${shareButton}
      ${favoriteButton}
    </div>
  `;
}

function buildCapabilityBar(links, lang) {
  const items = (Array.isArray(links) ? links : []).filter((item) => /^https:\/\/(?:www\.)?(?:ainvest\.com|chart\.ainvest\.com)\//i.test(String(item?.url || "")));
  if (!items.length) return "";
  const actionLabel = normalizeLang(lang) === "zh-Hant" ? "開啟" : normalizeLang(lang) === "zh-Hans" ? "打开" : "Open";
  const linkHtml = items.map((item) => {
    const isWatchlist = item.skill === "ainvest-watchlist";
    const isAlert = item.skill === "ainvest-alert";
    const icon = isWatchlist
      ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5Z"></path><path d="M7.5 8.25h9M7.5 12h9M7.5 15.75h5"></path></svg>`
      : isAlert
        ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"></path><path d="M9.8 21h4.4"></path></svg>`
        : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18.5 9.2 12l3.4 2.8L20 5.5"></path><path d="M15.7 5.5H20v4.3"></path></svg>`;
    return `
      <a class="capabilityBarLink" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer noopener" data-skill="${escapeHtml(item.skill || "")}">
        <span class="capabilityBarIcon">${icon}</span>
        <span class="capabilityBarText">
          <span class="capabilityBarTitle">${escapeHtml(item.label || actionLabel)}</span>
          <span class="capabilityBarDescription">${escapeHtml(item.description || "")}</span>
        </span>
        <span class="capabilityBarAction">${escapeHtml(actionLabel)}<span aria-hidden="true">→</span></span>
      </a>
    `;
  }).join("");
  return `<nav class="capabilityBar" aria-label="AInvest 操作">${linkHtml}</nav>`;
}

function buildSourceTrigger(article, lang) {
  const groups = groupSourcesBySite(Array.isArray(article.activitySources) ? article.activitySources : []);
  if (!groups.length) return "";
  const logos = groups.slice(0, 4).map((item) => {
    const src = item.iconUrl || sourceLogoSrc(item.siteName, item.url);
    if (src) {
      return `<img class="sourceSummaryLogo" src="${escapeHtml(src)}" data-source-site="${escapeHtml(item.siteName || "")}" onerror="${escapeHtml(sourceImageFallbackAttribute(item.siteName || ""))}" alt="" />`;
    }
    return `<span class="sourceSummaryLogo sourceSummaryFallback">${escapeHtml(String(item.siteName || "S").slice(0, 1).toUpperCase())}</span>`;
  }).join("");
  return `
    <button class="sourceSummaryTrigger resultActionButton" type="button" aria-label="${escapeHtml(copyFor(lang, "sources"))}">
      <span class="sourceSummaryLogos">${logos}</span>
      <span class="sourceSummaryLabel">${escapeHtml(copyFor(lang, "sources"))}</span>
    </button>
  `;
}

function attachResultActionHandlers(article) {
  article.dataset.resultActionsReady = "true";
  if (article.querySelector(".favoriteResultButton")) void window.MentoraCaseFavorites?.sync?.(article);
}

function uniqueSourcesBySite(sources) {
  const seen = new Set();
  return (Array.isArray(sources) ? sources : []).filter((item) => {
    const key = String(item?.siteName || item?.url || "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function groupSourcesBySite(sources) {
  const map = new Map();
  (Array.isArray(sources) ? sources : []).forEach((item) => {
    const key = String(item?.siteName || domainFromUrl(item?.url || "") || item?.url || "").trim().toLowerCase();
    if (!key) return;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }
    map.set(key, { ...item, count: 1 });
  });
  return Array.from(map.values());
}

function sourceLogoSrc(siteName, url = "") {
  const key = String(siteName || "").trim().toLowerCase();
  const domain = domainFromUrl(url) || key;
  if (!domain || domain.includes("ainvest")) return "/static/assets/ainvest-source-logo.png";
  return sourceFallbackLogoSrc(siteName || domain);
}

function detectLanguage(value) {
  const text = String(value || "");
  if (/[\u3040-\u30ff]/.test(text)) return "ja";
  if (/[\uac00-\ud7af]/.test(text)) return "ko";
  if (/[\u0e00-\u0e7f]/.test(text)) return "th";
  if (/[\u3400-\u9fff]/.test(text)) {
    return /[禮週這個麼嗎幾廣買賣華爾街評級獲數據點樣嘅啲唔係冇]/.test(text) ? "zh-Hant" : "zh-Hans";
  }
  const lower = text.toLowerCase();
  if (/[¿¡ñáéíóúü]/i.test(text) || /\b(cuánto|subió|ayer|acciones|precio|análisis)\b/.test(lower)) return "es";
  if (/[àâçéèêëîïôûùüÿœ]/i.test(text) || /\b(combien|hier|analyse|action|prix)\b/.test(lower)) return "fr";
  if (/[äöüß]/i.test(text) || /\b(wie viel|gestern|aktie|preis|analyse)\b/.test(lower)) return "de";
  if (/[ãõáéíóúç]/i.test(text) || /\b(quanto|ontem|ação|preço|análise)\b/.test(lower)) return "pt";
  return "en";
}

function normalizeLang(lang) {
  const value = String(lang || "").trim();
  if (!value) return "en";
  const lower = value.toLowerCase().replace("_", "-");
  if (lower === "zh" || lower === "zh-cn" || lower === "zh-sg" || lower === "zh-hans") return "zh-Hans";
  if (lower === "zh-tw" || lower === "zh-hk" || lower === "zh-mo" || lower === "zh-hant") return "zh-Hant";
  if (lower.startsWith("zh-hans-")) return "zh-Hans";
  if (lower.startsWith("zh-hant-")) return "zh-Hant";
  return value;
}

function setArticleLanguage(article, lang) {
  const normalized = normalizeLang(lang);
  if (article) article.dataset.lang = normalized;
  return normalized;
}

const COPY = {
  "zh-Hans": {
    activity: "活动",
    thinking: "正在思考",
    thoughtFor: "已思考",
    stoppedAfter: "已停止",
    prepareTitle: "准备分析问题",
    answerCompleted: "完整图文解读已生成",
    chartTitle: "图表已生成",
    analyzingImage: "正在分析图片",
    screenshotTitle: "正在准备图表截图",
    screenshotDetail: "正在生成图表截图，准备交给多模态模型进行视觉分析。",
    multimodalTitle: "正在进行多模态读图",
    multimodalDetail: "正在从图表结构、拐点与对比关系中提炼投资相关洞见。",
    chartDetail: "已经完成一个图表模块，正在把接口数据和图形变化纳入最终解读。",
    moduleErrorTitle: "部分模块数据生成失败",
    moduleErrorDetail: "该组件数据生成失败，已跳过并继续处理其它模块。",
    receivedTitle: "已接收问题",
    receivedDetail: "正在拆解你的问题，判断需要行情、财务、估值还是综合数据。",
    metadataTitle: "读取模块元数据",
    metadataDetail: "正在读取可用脚本和模块说明，让模型决定应该调用哪些分析能力。",
    executeTitle: "执行分析组件",
    executeDetail: "正在运行模型选中的 Python 脚本，拉取接口数据并生成可渲染图表。",
    interpretTitle: "生成数据解读",
    interpretDetail: "正在整理图表背后的数据证据，准备生成投顾视角的解读文本。",
    skippedTitle: "跳过失败模块",
    skippedDetail: "部分外部数据源返回异常，正在保留成功模块并继续完成报告。",
    routeTitle: "模型完成模块选择",
    routeDetail: "模型根据用户问题和模块元数据选择后续要执行的组件。",
    completedLabel: "已结束",
    stoppedLabel: "已停止",
	    thinkingSection: "思考过程",
	    sources: "来源",
	    toolOutputLabel: "输出",
	    fallbackDetail: "正在推进当前分析步骤。",
	  },
  "zh-Hant": {
    activity: "活動",
    thinking: "正在思考",
    thoughtFor: "已思考",
    stoppedAfter: "已停止",
    prepareTitle: "準備分析問題",
    answerCompleted: "完整圖文解讀已生成",
    chartTitle: "圖表已生成",
    analyzingImage: "正在分析圖片",
    screenshotTitle: "正在準備圖表截圖",
    screenshotDetail: "正在生成圖表截圖，準備交給多模態模型做視覺分析。",
    multimodalTitle: "正在進行多模態讀圖",
    multimodalDetail: "正在從圖表結構、拐點與對比關係中提煉投資相關洞見。",
    chartDetail: "已完成一個圖表模組，正在把介面資料和圖形變化納入最終解讀。",
    moduleErrorTitle: "部分模組資料生成失敗",
    moduleErrorDetail: "該模組資料生成失敗，已跳過並繼續處理其他模組。",
    receivedTitle: "已接收問題",
    receivedDetail: "正在拆解你的問題，判斷需要行情、財務、估值還是綜合資料。",
    metadataTitle: "讀取模組資料",
    metadataDetail: "正在讀取可用腳本和模組說明，讓模型決定應該呼叫哪些分析能力。",
    executeTitle: "執行分析元件",
    executeDetail: "正在執行模型選中的 Python 腳本，拉取介面資料並生成可渲染圖表。",
    interpretTitle: "生成資料解讀",
    interpretDetail: "正在整理圖表背後的資料證據，準備生成投顧視角的解讀文本。",
    skippedTitle: "跳過失敗模組",
    skippedDetail: "部分外部資料來源回傳異常，正在保留成功模組並繼續完成報告。",
    routeTitle: "模型完成模組選擇",
    routeDetail: "模型根據你的問題和模組資料選擇後續要執行的元件。",
    completedLabel: "已結束",
    stoppedLabel: "已停止",
	    thinkingSection: "思考過程",
	    sources: "來源",
	    toolOutputLabel: "輸出",
	    fallbackDetail: "正在推進目前分析步驟。",
	  },
  ja: {
    activity: "アクティビティ",
    thinking: "考えています",
    thoughtFor: "考えました",
    stoppedAfter: "停止しました",
    prepareTitle: "分析を準備中",
    answerCompleted: "回答が完成しました",
    chartTitle: "チャートを生成しました",
    analyzingImage: "画像を分析しています",
    screenshotTitle: "チャート画像を準備中",
    screenshotDetail: "チャートのスクリーンショットを生成し、マルチモーダル分析に渡しています。",
    multimodalTitle: "マルチモーダルで読図中",
    multimodalDetail: "チャート構造、転換点、系列比較から投資判断に関わる示唆を抽出しています。",
    chartDetail: "チャートモジュールを生成し、データと図形の変化を最終解釈に反映しています。",
    moduleErrorTitle: "一部のモジュールでデータ生成に失敗しました",
    moduleErrorDetail: "そのモジュールはデータを生成できなかったため、スキップして残りの分析を続けています。",
    receivedTitle: "質問を受け取りました",
    receivedDetail: "質問を分解し、株価、財務、バリュエーション、または複合データが必要かを判断しています。",
    metadataTitle: "モジュール情報を読み込み中",
    metadataDetail: "利用可能なスクリプトとモジュール説明を読み込み、モデルが適切な分析機能を選べるようにしています。",
    executeTitle: "分析コンポーネントを実行中",
    executeDetail: "モデルが選んだ Python スクリプトを実行し、インターフェースデータを取得して表示可能なチャートを生成しています。",
    interpretTitle: "データ解釈を生成中",
    interpretDetail: "チャートの根拠データを整理し、投資アドバイザー視点の解釈文を準備しています。",
    skippedTitle: "失敗したモジュールをスキップしました",
    skippedDetail: "一部の外部データソースでエラーが発生したため、成功したモジュールを使ってレポートを続行しています。",
    routeTitle: "モデルがモジュールを選択しました",
    routeDetail: "モデルが質問とモジュール情報に基づいて実行するコンポーネントを選びました。",
    completedLabel: "完了",
    stoppedLabel: "停止",
	    thinkingSection: "Thinking",
	    sources: "Source",
	    toolOutputLabel: "出力",
	    fallbackDetail: "現在の分析ステップを進めています。",
	  },
  ko: {
    activity: "활동",
    thinking: "생각 중",
    thoughtFor: "생각 완료",
    stoppedAfter: "중지됨",
    prepareTitle: "분석 준비 중",
    answerCompleted: "답변이 완성되었습니다",
    chartTitle: "차트 생성 완료",
    analyzingImage: "이미지를 분석하는 중",
    screenshotTitle: "차트 스크린샷 준비 중",
    screenshotDetail: "멀티모달 모델에 전달할 차트 이미지를 생성하고 있습니다.",
    multimodalTitle: "멀티모달 차트 분석 중",
    multimodalDetail: "차트 구조, 전환 지점, 시리즈 간 비교에서 투자 관련 신호를 추출하고 있습니다.",
    chartDetail: "차트 모듈이 준비되었습니다. 데이터와 시각적 변화를 최종 해석에 반영하고 있습니다.",
    moduleErrorTitle: "일부 모듈 데이터 생성 실패",
    moduleErrorDetail: "해당 모듈은 데이터를 생성하지 못해 건너뛰고 나머지 분석을 계속합니다.",
    receivedTitle: "질문 수신",
    receivedDetail: "질문을 분해해 시세, 재무, 밸류에이션 또는 종합 데이터가 필요한지 판단하고 있습니다.",
    metadataTitle: "모듈 메타데이터 읽는 중",
    metadataDetail: "사용 가능한 스크립트와 모듈 설명을 읽어 모델이 적절한 분석 기능을 선택하도록 합니다.",
    executeTitle: "분석 컴포넌트 실행 중",
    executeDetail: "모델이 선택한 Python 스크립트를 실행하고 인터페이스 데이터를 가져와 렌더링 가능한 차트를 생성합니다.",
    interpretTitle: "데이터 해석 생성 중",
    interpretDetail: "차트 근거 데이터와 인터페이스 데이터를 정리해 투자 자문 관점의 해석을 준비합니다.",
    skippedTitle: "실패한 모듈 건너뜀",
    skippedDetail: "일부 외부 데이터 소스 오류로 성공한 모듈만 사용해 보고서를 계속 작성합니다.",
    routeTitle: "모델이 모듈을 선택했습니다",
    routeDetail: "모델이 질문과 모듈 메타데이터를 바탕으로 실행할 컴포넌트를 선택했습니다.",
    completedLabel: "완료",
    stoppedLabel: "중지됨",
	    thinkingSection: "Thinking",
	    sources: "Source",
	    toolOutputLabel: "출력",
	    fallbackDetail: "현재 분석 단계를 진행하고 있습니다.",
	  },
  th: {
    activity: "กิจกรรม",
    thinking: "กำลังคิด",
    thoughtFor: "คิดแล้ว",
    stoppedAfter: "หยุดหลังจาก",
    prepareTitle: "กำลังเตรียมการวิเคราะห์",
    answerCompleted: "สร้างคำตอบเสร็จแล้ว",
    chartTitle: "สร้างกราฟแล้ว",
    analyzingImage: "กำลังวิเคราะห์ภาพ",
    screenshotTitle: "กำลังเตรียมภาพกราฟ",
    screenshotDetail: "กำลังสร้างภาพหน้าจอของกราฟเพื่อส่งต่อไปยังการวิเคราะห์แบบมัลติโหมด",
    multimodalTitle: "กำลังวิเคราะห์กราฟแบบมัลติโหมด",
    multimodalDetail: "กำลังดึงสัญญาณที่เกี่ยวข้องกับการลงทุนจากโครงสร้าง จุดเปลี่ยน และการเปรียบเทียบชุดข้อมูล",
    chartDetail: "โมดูลกราฟพร้อมแล้ว กำลังนำข้อมูลและรูปแบบภาพไปใช้ในคำอธิบายสุดท้าย",
    moduleErrorTitle: "บางโมดูลสร้างข้อมูลไม่สำเร็จ",
    moduleErrorDetail: "โมดูลนั้นสร้างข้อมูลไม่ได้ จึงข้ามไปและดำเนินการวิเคราะห์ส่วนที่เหลือต่อ",
    receivedTitle: "ได้รับคำถามแล้ว",
    receivedDetail: "กำลังแยกคำถามเพื่อพิจารณาว่าต้องใช้ข้อมูลตลาด การเงิน มูลค่า หรือข้อมูลผสม",
    metadataTitle: "กำลังอ่านข้อมูลโมดูล",
    metadataDetail: "กำลังอ่านสคริปต์และคำอธิบายโมดูลที่มี เพื่อให้โมเดลเลือกเครื่องมือวิเคราะห์ที่เหมาะสม",
    executeTitle: "กำลังเรียกใช้องค์ประกอบวิเคราะห์",
    executeDetail: "กำลังรันสคริปต์ Python ที่เลือก ดึงข้อมูล และสร้างกราฟที่แสดงผลได้",
    interpretTitle: "กำลังสร้างคำอธิบายข้อมูล",
    interpretDetail: "กำลังจัดระเบียบหลักฐานจากกราฟและข้อมูลก่อนเขียนคำอธิบายในมุมมองที่ปรึกษาการลงทุน",
    skippedTitle: "ข้ามโมดูลที่ล้มเหลว",
    skippedDetail: "แหล่งข้อมูลภายนอกบางส่วนผิดพลาด จึงเก็บโมดูลที่สำเร็จไว้สำหรับรายงาน",
    routeTitle: "โมเดลเลือกโมดูลแล้ว",
    routeDetail: "โมเดลเลือกองค์ประกอบที่จะเรียกใช้จากคำถามและข้อมูลโมดูล",
    planTitle: "กำลังวางแผนขั้นตอนถัดไป",
    planDetail: "กำลังนำผลจากขั้นตอนก่อนหน้าไปกำหนดเครื่องมือและข้อมูลที่จะใช้ต่อ",
    observeTitle: "ได้รับผลลัพธ์จากเครื่องมือแล้ว",
    observeDetail: "กำลังใช้ผลลัพธ์นี้เป็นบริบทสำหรับขั้นตอนวิเคราะห์ถัดไป",
    completedLabel: "เสร็จสิ้น",
    stoppedLabel: "หยุดแล้ว",
    thinkingSection: "Thinking",
    sources: "Source",
    fallbackDetail: "กำลังดำเนินขั้นตอนวิเคราะห์ปัจจุบัน",
  },
  en: {
    activity: "Activity",
    thinking: "Thinking",
    thoughtFor: "Thought for",
    stoppedAfter: "Stopped after",
    prepareTitle: "Preparing analysis",
    answerCompleted: "Answer completed",
    chartTitle: "Chart generated",
    analyzingImage: "Analyzing image",
    screenshotTitle: "Preparing chart screenshots",
    screenshotDetail: "Generating chart screenshots to pass into the multimodal analysis step.",
    multimodalTitle: "Running multimodal chart analysis",
    multimodalDetail: "Extracting investment-relevant signals from chart structure, inflection points, and series relationships.",
    chartDetail: "A chart module is ready. I am combining the data and visual pattern into the final interpretation.",
    moduleErrorTitle: "Some module data failed",
    moduleErrorDetail: "That module could not generate data, so it was skipped while the rest of the analysis continued.",
    receivedTitle: "Question received",
    receivedDetail: "Breaking down your question to decide whether it needs market, financial, valuation, or combined data.",
    metadataTitle: "Reading module metadata",
    metadataDetail: "Reading available scripts and module descriptions so the model can choose the right analysis tools.",
    executeTitle: "Running analysis component",
    executeDetail: "Running the selected Python script, fetching interface data, and generating a renderable chart.",
    interpretTitle: "Generating data interpretation",
    interpretDetail: "Organizing chart evidence and interface data before writing the advisor-style interpretation.",
    skippedTitle: "Skipped failed modules",
    skippedDetail: "Some external data sources returned errors; successful modules are being kept for the report.",
    routeTitle: "Model selected modules",
    routeDetail: "The model selected the components to run based on your question and the module metadata.",
    planTitle: "Planning next step",
    planDetail: "Using the previous observation to decide the next tool and data operation.",
    observeTitle: "Tool observation received",
    observeDetail: "Using this result as context for the next analysis step.",
    completedLabel: "Completed",
    stoppedLabel: "Stopped",
	    thinkingSection: "Thinking",
	    sources: "Source",
	    toolOutputLabel: "Output",
	    fallbackDetail: "Continuing the current analysis step.",
	  },
  es: {
    activity: "Actividad", thinking: "Pensando", thoughtFor: "Pensado durante", stoppedAfter: "Detenido después de",
    prepareTitle: "Preparando el análisis", answerCompleted: "Respuesta completada", chartTitle: "Gráfico generado",
    analyzingImage: "Analizando imagen",
    screenshotTitle: "Preparando capturas del gráfico",
    screenshotDetail: "Generando capturas del gráfico para el análisis multimodal.",
    multimodalTitle: "Ejecutando análisis multimodal",
    multimodalDetail: "Extrayendo señales de inversión a partir de la estructura y los puntos de giro del gráfico.",
    chartDetail: "El módulo de gráfico está listo. Estoy integrando los datos y el patrón visual en la interpretación final.",
    moduleErrorTitle: "Falló la generación de datos en algunos módulos", moduleErrorDetail: "Ese módulo no pudo generar datos, así que se omitió mientras continuaba el análisis.",
    receivedTitle: "Pregunta recibida", receivedDetail: "Desglosando tu pregunta para decidir si requiere datos de mercado, financieros, de valoración o combinados.",
    metadataTitle: "Leyendo metadatos de módulos", metadataDetail: "Leyendo scripts disponibles y descripciones de módulos para elegir las herramientas de análisis adecuadas.",
    executeTitle: "Ejecutando componente de análisis", executeDetail: "Ejecutando el script de Python seleccionado, obteniendo datos y generando un gráfico renderizable.",
    interpretTitle: "Generando interpretación de datos", interpretDetail: "Organizando la evidencia del gráfico y los datos antes de escribir la interpretación.",
    skippedTitle: "Módulos fallidos omitidos", skippedDetail: "Algunas fuentes externas fallaron; se conservarán los módulos exitosos para el informe.",
    routeTitle: "El modelo seleccionó módulos", routeDetail: "El modelo seleccionó los componentes según tu pregunta y los metadatos de módulos.", completedLabel: "Completado", stoppedLabel: "Detenido", thinkingSection: "Thinking", sources: "Source", fallbackDetail: "Continuando el paso actual del análisis.",
  },
  fr: {
    activity: "Activité", thinking: "Réflexion en cours", thoughtFor: "Réflexion pendant", stoppedAfter: "Arrêté après",
    prepareTitle: "Préparation de l’analyse", answerCompleted: "Réponse terminée", chartTitle: "Graphique généré",
    analyzingImage: "Analyse de l’image",
    screenshotTitle: "Préparation des captures du graphique",
    screenshotDetail: "Génération des captures du graphique pour l’analyse multimodale.",
    multimodalTitle: "Analyse multimodale du graphique",
    multimodalDetail: "Extraction de signaux d’investissement à partir de la structure et des points d’inflexion du graphique.",
    chartDetail: "Un module de graphique est prêt. J’intègre les données et le motif visuel dans l’interprétation finale.",
    moduleErrorTitle: "Échec de données sur certains modules", moduleErrorDetail: "Ce module n’a pas pu générer de données et a été ignoré pendant la suite de l’analyse.",
    receivedTitle: "Question reçue", receivedDetail: "Analyse de votre question pour déterminer les données nécessaires.",
    metadataTitle: "Lecture des métadonnées", metadataDetail: "Lecture des scripts disponibles et des descriptions de modules pour choisir les bons outils.",
    executeTitle: "Exécution du composant", executeDetail: "Exécution du script Python sélectionné, récupération des données et génération du graphique.",
    interpretTitle: "Génération de l’interprétation", interpretDetail: "Organisation des données et preuves visuelles avant la rédaction de l’interprétation.",
    skippedTitle: "Modules en échec ignorés", skippedDetail: "Certaines sources externes ont échoué; les modules réussis sont conservés pour le rapport.",
    routeTitle: "Modules sélectionnés par le modèle", routeDetail: "Le modèle a choisi les composants selon votre question et les métadonnées.", completedLabel: "Terminé", stoppedLabel: "Arrêté", thinkingSection: "Thinking", sources: "Source", fallbackDetail: "Poursuite de l’étape d’analyse actuelle.",
  },
  de: {
    activity: "Aktivität", thinking: "Denke nach", thoughtFor: "Nachgedacht für", stoppedAfter: "Gestoppt nach",
    prepareTitle: "Analyse wird vorbereitet", answerCompleted: "Antwort abgeschlossen", chartTitle: "Diagramm erstellt",
    analyzingImage: "Bild wird analysiert",
    screenshotTitle: "Diagramm-Screenshots werden vorbereitet",
    screenshotDetail: "Es werden Screenshots des Diagramms für die multimodale Analyse erzeugt.",
    multimodalTitle: "Multimodale Diagrammanalyse läuft",
    multimodalDetail: "Es werden investitionsrelevante Signale aus Struktur, Wendepunkten und Reihenbeziehungen extrahiert.",
    chartDetail: "Ein Diagrammmodul ist bereit. Daten und visuelle Muster werden in die finale Interpretation eingebunden.",
    moduleErrorTitle: "Einige Moduldaten fehlgeschlagen", moduleErrorDetail: "Dieses Modul konnte keine Daten erzeugen und wurde übersprungen.",
    receivedTitle: "Frage erhalten", receivedDetail: "Die Frage wird zerlegt, um die benötigten Datenarten zu bestimmen.",
    metadataTitle: "Modulmetadaten werden gelesen", metadataDetail: "Verfügbare Skripte und Modulbeschreibungen werden gelesen, um passende Analysewerkzeuge auszuwählen.",
    executeTitle: "Analysekomponente wird ausgeführt", executeDetail: "Das ausgewählte Python-Skript wird ausgeführt, Daten werden abgerufen und ein Diagramm erzeugt.",
    interpretTitle: "Dateninterpretation wird erstellt", interpretDetail: "Diagrammbelege und Daten werden vor der Interpretation organisiert.",
    skippedTitle: "Fehlgeschlagene Module übersprungen", skippedDetail: "Einige externe Quellen lieferten Fehler; erfolgreiche Module werden weiterverwendet.",
    routeTitle: "Modell hat Module ausgewählt", routeDetail: "Das Modell hat Komponenten anhand Ihrer Frage und der Modulmetadaten ausgewählt.", completedLabel: "Abgeschlossen", stoppedLabel: "Gestoppt", thinkingSection: "Thinking", sources: "Source", fallbackDetail: "Der aktuelle Analyseschritt wird fortgesetzt.",
  },
  pt: {
    activity: "Atividade", thinking: "Pensando", thoughtFor: "Pensou por", stoppedAfter: "Parou após",
    prepareTitle: "Preparando análise", answerCompleted: "Resposta concluída", chartTitle: "Gráfico gerado",
    analyzingImage: "Analisando imagem",
    screenshotTitle: "Preparando capturas do gráfico",
    screenshotDetail: "Gerando capturas do gráfico para a etapa multimodal.",
    multimodalTitle: "Executando análise multimodal",
    multimodalDetail: "Extraindo sinais de investimento a partir da estrutura e dos pontos de inflexão do gráfico.",
    chartDetail: "Um módulo de gráfico está pronto. Estou combinando os dados e o padrão visual na interpretação final.",
    moduleErrorTitle: "Falha em alguns dados de módulo", moduleErrorDetail: "Esse módulo não conseguiu gerar dados e foi ignorado enquanto a análise continuava.",
    receivedTitle: "Pergunta recebida", receivedDetail: "Dividindo sua pergunta para decidir quais dados são necessários.",
    metadataTitle: "Lendo metadados dos módulos", metadataDetail: "Lendo scripts disponíveis e descrições de módulos para escolher as ferramentas certas.",
    executeTitle: "Executando componente de análise", executeDetail: "Executando o script Python selecionado, buscando dados e gerando um gráfico renderizável.",
    interpretTitle: "Gerando interpretação dos dados", interpretDetail: "Organizando evidências do gráfico e dados antes de escrever a interpretação.",
    skippedTitle: "Módulos com falha ignorados", skippedDetail: "Algumas fontes externas falharam; os módulos bem-sucedidos serão mantidos no relatório.",
    routeTitle: "O modelo selecionou módulos", routeDetail: "O modelo selecionou componentes com base na pergunta e nos metadados.", completedLabel: "Concluído", stoppedLabel: "Interrompido", thinkingSection: "Thinking", sources: "Source", fallbackDetail: "Continuando a etapa atual da análise.",
  },
};

function copyFor(lang, key) {
  const dictionary = COPY[normalizeLang(lang)] || COPY.en;
  return dictionary[key] || COPY.en[key] || key;
}

function statusEventKey(data) {
  if (data && typeof data === "object" && data.key) return data.key;
  if (data?.phase === "deepseek-connect") return "agent-connect";
  if (data?.status === "start") return "start";
  const message = typeof data === "string" ? data : String(data?.message || "");
  if (message.includes("已接收问题") || message.includes("已接收問題")) return "received";
  if (message.includes("读取") || message.includes("讀取") || message.includes("SKILL.md")) return "metadata";
  if (message.includes("执行") || message.includes("執行")) return "execute";
  if (message.includes("图表已生成") || message.includes("圖表已生成")) return "chart";
  if (message.includes("开始截图") || message.includes("開始截圖")) return "screenshot";
  if (message.includes("多模态") || message.includes("多模態")) return message.includes("完成") ? "interpret" : "multimodal";
  if (message.includes("跳过失败模块") || message.includes("跳過失敗模組")) return "skipped";
  return "fallback";
}

function shouldRenderStatusEvent(data) {
  const hidden = new Set(["agent-connect", "received", "execute", "screenshot", "multimodal"]);
  return !hidden.has(statusEventKey(data));
}

function stripStagePrefix(message) {
  return String(message || "").replace(/^(Thought|Action|Observation(?: expected)?):\s*/i, "");
}

function statusTitle(data, lang) {
  if (data?.title) return String(data.title);
  lang = normalizeLang(lang);
  const key = statusEventKey(data);
  if (key === "agent-connect") return lang === "zh-Hans" ? "正在连接Agent" : lang === "zh-Hant" ? "正在連接Agent" : "Connecting to Agent";
  if (key === "start") return lang === "zh-Hans" ? "开始分析" : "Start analysis";
  if (key === "received") return copyFor(lang, "receivedTitle");
  if (key === "metadata") return lang === "zh-Hans" ? "加载技能 SKILL 目录" : copyFor(lang, "metadataTitle");
  if (key === "ideate") return lang === "zh-Hans" ? "构思行动计划" : "Draft action plan";
  if (key === "execute") return copyFor(lang, "executeTitle");
  if (key === "chart") return copyFor(lang, "chartTitle");
  if (key === "screenshot") return copyFor(lang, "screenshotTitle");
  if (key === "multimodal") return copyFor(lang, "multimodalTitle");
  if (key === "interpret") return lang === "zh-Hans" ? "生成回答" : copyFor(lang, "interpretTitle");
  if (key === "action-pending") return lang === "zh-Hans" ? "等待调用自选股 SKILL" : "Waiting to call Watchlist SKILL";
  if (key === "action-execute") return lang === "zh-Hans" ? "调用自选股 SKILL" : "Calling Watchlist SKILL";
  if (key === "skipped") return copyFor(lang, "skippedTitle");
  if (key === "thought") return "Thought";
  if (key === "action") return "Action";
  if (key === "plan") return COPY[lang]?.planTitle || "Thought";
  if (key === "observe") return lang === "zh-Hans" ? "调整行动计划" : "Adjust action plan";
  return stripStagePrefix(typeof data === "string" ? data : data?.message || data?.detail || copyFor(lang, "fallbackDetail"));
}

function statusDetail(data, lang) {
  if (data?.detail) return String(data.detail);
  lang = normalizeLang(lang);
  const key = statusEventKey(data);
  if (key === "agent-connect") return "";
  if (key === "start") return lang === "zh-Hans" ? "开始读取用户输入，准备进入分析流程。" : "Reading the user request and preparing the analysis flow.";
  if (key === "received") return copyFor(lang, "receivedDetail");
  if (key === "metadata") return lang === "zh-Hans" ? "正在读取可用 SKILL 目录和能力描述。" : copyFor(lang, "metadataDetail");
  if (key === "ideate") return lang === "zh-Hans" ? "正在结合用户输入和 SKILL 描述，判断先做什么、接下来做什么。" : "Combining the user request with SKILL descriptions to decide the action sequence.";
  if (key === "execute") return copyFor(lang, "executeDetail");
  if (key === "chart") return copyFor(lang, "chartDetail");
  if (key === "screenshot") return copyFor(lang, "screenshotDetail");
  if (key === "multimodal") return copyFor(lang, "multimodalDetail");
  if (key === "interpret") return lang === "zh-Hans" ? "正在综合 SKILL 输出、搜索结果和图表结果生成最终回答。" : copyFor(lang, "interpretDetail");
  if (key === "action-pending") return lang === "zh-Hans" ? "搜索和分析完成后，将提取最终推荐标的，再执行写入与 GET 验证。" : "After research and analysis, the final symbols will be extracted, written, and verified with GET.";
  if (key === "action-execute") return lang === "zh-Hans" ? String(data?.message || "正在写入 AInvest 自选股并验证结果。") : "Writing to AInvest Watchlist and verifying the result.";
  if (key === "skipped") return copyFor(lang, "skippedDetail");
  if (key === "thought") return stripStagePrefix(data?.message || "Deciding the next step from the user question.");
  if (key === "action") return stripStagePrefix(data?.message || "Calling a SKILL CLI tool.");
  if (key === "plan") return stripStagePrefix(data?.message || COPY[lang]?.planDetail || copyFor(lang, "fallbackDetail"));
  if (key === "observe") return stripStagePrefix(data?.message || COPY[lang]?.observeDetail || copyFor(lang, "fallbackDetail"));
  return stripStagePrefix(typeof data === "string" ? data : data?.message || copyFor(lang, "fallbackDetail"));
}

function routeTitle(data, lang) {
  lang = normalizeLang(lang);
  if (lang === "zh-Hans") return "行动计划";
  if (lang === "zh-Hant") return "行動計畫";
  if (lang === "ja") return "行動計画";
  if (lang === "ko") return "실행 계획";
  if (lang === "th") return "แผนการดำเนินงาน";
  return "Action plan";
}

function routeDetail(data, lang) {
  return actionStrategyText(data?.steps || [], lang, data?.strategy || "");
}

function errorDetail(message, lang) {
  lang = normalizeLang(lang);
  return lang === "zh-Hans" ? message || copyFor(lang, "moduleErrorDetail") : copyFor(lang, "moduleErrorDetail");
}

function statusStepKey(data, lang) {
  const key = statusEventKey(data);
  const message = typeof data === "string" ? data : String(data?.message || "");
  if (key === "start") return "status-start";
  if (key === "ideate") return "status-ideate";
  if (key === "received") return "status-received";
  if (key === "metadata") return "status-metadata";
  if (key === "execute") return `status-execute:${message}`;
  if (key === "chart") return "chart-generated";
  if (key === "screenshot") return "screenshot-start";
  if (key === "multimodal") return "multimodal-start";
  if (key === "interpret") return "interpret-start";
  if (key === "action-pending") return "action-pending";
  if (key === "action-execute") return "action-execute";
  if (key === "skipped") return "skipped-failed";
  return `status:${statusTitle(data, lang)}`;
}

function startNewChat(createSession = false, focusInput = false) {
  window.dispatchEvent(new Event("veya:chat-navigate"));
  if (activeController) activeController.abort();
  activeController = null;
  activeActivityArticle = null;
  currentSession = null;
  messages.innerHTML = "";
  conversation.classList.add("is-empty");
  closeActivityDrawer();
  input.value = "";
  clearPendingImages();
  updateComposerState();
  button.disabled = false;
  if (focusInput) input.focus();
  else input.blur();
  if (createSession) ensureCurrentSession("");
  conversation.scrollTo({ top: 0, left: 0, behavior: "instant" });
}

function updateComposerState() {
  resizeComposerInput();
  const hasText = input.value.trim().length > 0;
  const hasImages = pendingImages.length > 0;
  const running=Boolean(activeController && currentSession?.activeRunId && ["queued","running"].includes(currentSession.status));
  button.classList.toggle("is-running",running);
  button.classList.toggle("is-ready",!running && (hasText || hasImages));
  button.setAttribute("aria-label",running ? "停止任务" : "发送");
  button.title=running ? "停止任务" : "";
}

function resizeComposerInput(inputElement = input, boxElement = composerBox) {
  const input = inputElement, composerBox = boxElement;
  if (!input) return;
  const measuredScrollHeight = () => {
    const originalValue = input.value;
    if (!/\n+$/.test(originalValue)) return input.scrollHeight;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.value = originalValue.replace(/\n+$/g, "");
    const height = input.scrollHeight;
    input.value = originalValue;
    input.setSelectionRange(start, end);
    return height;
  };
  input.style.height = "0px";
  let style = window.getComputedStyle(input);
  let lineHeight = Number.parseFloat(style.lineHeight) || 24;
  let verticalPadding =
    (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
  let minHeight = lineHeight + verticalPadding;
  let scrollHeight = measuredScrollHeight();
  const shouldUseMultiline = input.value.includes("\n") || scrollHeight > minHeight + 2;
  const wasMultiline = composerBox?.classList.contains("is-multiline");
  composerBox?.classList.toggle("is-multiline", shouldUseMultiline);
  if (wasMultiline !== shouldUseMultiline) {
    input.style.height = "0px";
    style = window.getComputedStyle(input);
    lineHeight = Number.parseFloat(style.lineHeight) || 24;
    verticalPadding =
      (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
    minHeight = lineHeight + verticalPadding;
    scrollHeight = measuredScrollHeight();
  }
  const maxHeight = lineHeight * 5 + verticalPadding;
  const nextHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));
  input.style.height = `${nextHeight}px`;
  input.style.overflowY = scrollHeight > maxHeight + 1 ? "auto" : "hidden";
}

function ensureCurrentSession(question) {
  if (currentSession) return currentSession;
  currentSession = {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    title: "新建对话",
    question,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    reasoningFramework: DEFAULT_REASONING_FRAMEWORK,
    inferenceModel: DEFAULT_INFERENCE_MODEL,
    reasoningEffort: currentReasoningEffort,
    engineSessionId: "",
    frameworkSessionIds: {},
    resolvedInferenceModel: "",
    themeMode: currentThemeMode(),
  };
  return currentSession;
}

async function recordAssistantResult(data) {
  if (!currentSession) return;
  const resultSession = currentSession;
  if (data.chatRunId && resultSession.messages.some((item) => item.role === 'assistant' && item.chatRunId === data.chatRunId)) return;
  resultSession.status = 'completed';
  resultSession.activeRunId = '';
  resultSession.lastRunId = data.chatRunId || '';
  const assistantArticle = Array.from(messages.querySelectorAll(".message.assistant")).at(-1);
  resultSession.updatedAt = Date.now();
  resultSession.themeMode = resultSession.themeMode || currentThemeMode();
  resultSession.error = "";
  resultSession.reportUrl = data.reportUrl;
  resultSession.reportArtifacts = Array.isArray(data.reportArtifacts) ? data.reportArtifacts : [];
  resultSession.fileArtifacts = Array.isArray(data.fileArtifacts) ? data.fileArtifacts : [];
  resultSession.streamBlocks = Array.isArray(data.streamBlocks) ? data.streamBlocks : [];
  resultSession.code = data.code;
  resultSession.interpretation = data.interpretation || "";
  resultSession.sources = Array.isArray(data.sources) ? data.sources : [];
  resultSession.videos = Array.isArray(data.videos) ? data.videos : [];
  resultSession.actionLinks = Array.isArray(data.actionLinks) ? data.actionLinks : [];
  resultSession.agentRunId = data.agentRunId || assistantArticle?.dataset?.agentRunId || "";
  resultSession.reasoningFramework = data.reasoningFramework || DEFAULT_REASONING_FRAMEWORK;
  resultSession.inferenceModel = data.inferenceModel || DEFAULT_INFERENCE_MODEL;
  resultSession.resolvedInferenceModel = data.resolvedInferenceModel || resultSession.resolvedInferenceModel || "";
  resultSession.engineSessionId = String(data.engineSessionId || resultSession.engineSessionId || "");
  resultSession.frameworkSessionIds = resultSession.frameworkSessionIds || {};
  if (data.engineSessionId) {
    const engineKey = `${resultSession.reasoningFramework}:${resultSession.inferenceModel}`;
    resultSession.frameworkSessionIds[engineKey] = String(data.engineSessionId);
  }
  resultSession.studioSessionId = Number(data.studioSessionId || resultSession.studioSessionId) || null;
  resultSession.agentEvents = Array.isArray(assistantArticle?.agentEvents) ? assistantArticle.agentEvents : [];
  resultSession.thinkingStepsHtml = assistantArticle?.querySelector(".thinkingSteps")?.innerHTML || "";
  resultSession.thinkingStartedAt = Number(assistantArticle?.dataset?.startedAt || Date.now());
  resultSession.thinkingElapsed = Math.max(0, Date.now() - resultSession.thinkingStartedAt);
  resultSession.messages.push({
    role: "assistant",
    chatRunId: data.chatRunId || "",
    reportUrl: data.reportUrl,
    agent: data.agent || assistantArticle?.dataset.agent || '',
    reportArtifacts: resultSession.reportArtifacts,
    fileArtifacts: resultSession.fileArtifacts,
    streamBlocks: resultSession.streamBlocks,
    code: data.code,
    label: data.selectedSkill?.label || "",
    selectedSkill: data.selectedSkill || null,
    interpretation: data.interpretation || "",
    sources: resultSession.sources,
    videos: resultSession.videos,
    actionLinks: resultSession.actionLinks,
    agentEvents: resultSession.agentEvents,
    agentRunId: resultSession.agentRunId,
    thinkingStepsHtml: resultSession.thinkingStepsHtml,
    thinkingElapsed: resultSession.thinkingElapsed,
    reasoningFramework: resultSession.reasoningFramework,
  });
  resultSession.agent = data.agent || assistantArticle?.dataset.agent || '';
  if (assistantArticle) assistantArticle.shareSession = resultSession;
  // Persist the terminal result before any optional naming request. Otherwise
  // a background session poll can replay the answer while naming is pending.
  persistChatSession(resultSession);
  if (!resultSession.customTitle) {
    const completedRequestId = resultSession.requestId;
    const completedRunId = resultSession.lastRunId;
    const title = await summarizeSessionTitle(resultSession.question, resultSession.interpretation);
    const latest = loadSessions().find(session => session.id === resultSession.id);
    // A follow-up, navigation or manual rename may have happened while waiting.
    // Patch only the title of this result; never persist the old session again.
    if (!latest || latest.customTitle || latest.requestId !== completedRequestId || latest.lastRunId !== completedRunId) return;
    latest.title = title;
    resultSession.title = title;
    if (currentSession?.id === latest.id && currentSession.requestId === completedRequestId) currentSession.title = title;
    persistChatSession(latest);
  }
}

function recordAssistantError(article, message) {
  if (!currentSession) return;
  currentSession.status = "failed";
  currentSession.activeRunId = "";
  currentSession.updatedAt = Date.now();
  currentSession.error = String(message || "生成失败");
  currentSession.reportUrl = currentSession.reportUrl || "";
  currentSession.interpretation = currentSession.interpretation || "";
  currentSession.thinkingStepsHtml = article?.querySelector?.(".thinkingSteps")?.innerHTML || currentSession.thinkingStepsHtml || "";
  currentSession.thinkingStartedAt = Number(article?.dataset?.startedAt || currentSession.thinkingStartedAt || Date.now());
  currentSession.thinkingElapsed = Math.max(0, Date.now() - currentSession.thinkingStartedAt);
  currentSession.messages.push({
    role: "assistant",
    error: currentSession.error,
    streamBlocks: article?.streamBlocks || [],
  });
  currentSession.title = String(currentSession.question || "新建对话").trim().slice(0, 28) || "新建对话";
  saveCurrentSession();
}

function recordAssistantStopped(article,message) {
  if (!currentSession) return;
  const runId=String(currentSession.activeRunId || currentSession.lastRunId || "");
  currentSession.status="interrupted";
  currentSession.activeRunId="";
  currentSession.lastRunId=runId;
  currentSession.updatedAt=Date.now();
  currentSession.error="";
  currentSession.thinkingStepsHtml=article?.querySelector?.(".thinkingSteps")?.innerHTML || "";
  currentSession.thinkingStartedAt=Number(article?.dataset?.startedAt || Date.now());
  currentSession.thinkingElapsed=Math.max(0,Date.now()-currentSession.thinkingStartedAt);
  if (!currentSession.messages.some((item)=>item.role==="assistant" && item.chatRunId===runId && item.errorCode==="cancelled")) {
    currentSession.messages.push({role:"assistant",error:String(message),errorCode:"cancelled",chatRunId:runId,thinkingStepsHtml:currentSession.thinkingStepsHtml,thinkingElapsed:currentSession.thinkingElapsed});
  }
  persistChatSession(currentSession);
}

async function summarizeSessionTitle(question, interpretation) {
  try {
    const response = await fetch("/api/session-title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, interpretation }),
    });
    if (!response.ok) throw new Error("title failed");
    const data = await response.json();
    const title = String(data.title || "").trim();
    if (title) return title.slice(0, 28);
  } catch {
    // Use the question as a quiet fallback when the naming model is unavailable.
  }
  return String(question || "新建对话").trim().slice(0, 18);
}

function loadSessions() {
  try {
    const parsed = volatileSessions ?? JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((session) => isRestorableSession(session)).map((session) => session.title === "New Chat" ? { ...session, title: "新建对话" } : session);
  } catch {
    return [];
  }
}

function storeSessions(sessions) {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions));
    volatileSessions = null;
    return true;
  } catch {
    // Keep the existing persisted history intact. Storage quota/private-mode
    // failures must not prevent opening Share or using the current chat.
    volatileSessions = sessions;
    return false;
  }
}

function isRestorableSession(session) {
  if (!session || typeof session !== "object") return false;
  const hasUserQuestion = Boolean(String(session.question || "").trim())
    || (Array.isArray(session.messages) && session.messages.some((item) => item?.role === "user" && String(item.text || "").trim()));
  const hasRestorableResult = Boolean(session.reportUrl || session.interpretation || session.error)
    || (Array.isArray(session.reportArtifacts) && session.reportArtifacts.some((item) => item?.url))
    || (Array.isArray(session.messages) && session.messages.some((item) => item?.role === "assistant" && (item.reportUrl || item.error)));
  return hasUserQuestion && (hasRestorableResult || Boolean(session.activeRunId) || ["queued", "running"].includes(session.status));
}

function saveCurrentSession() {
  if (!currentSession) return;
  const sessions = loadSessions().filter((item) => item.id !== currentSession.id);
  sessions.unshift(currentSession);
  storeSessions(sessions.slice(0, 20));
  renderHistory();
}

function isHistoryVisibleSession(session) {
  return session?.sessionScope !== 'widget' && !String(session?.id || '').startsWith('widget-');
}

function renderHistory() {
  if (!historyList) return;
  const sessions = loadSessions().filter(isHistoryVisibleSession);
  if (!sessions.length) {
    historyList.innerHTML = `<div class="historyEmpty">暂无对话</div>`;
    return;
  }
  historyList.innerHTML = sessions
    .map((session) => `
      <div class="historyItem ${currentSession?.id === session.id ? "is-selected" : ""}" data-session-id="${escapeHtml(session.id)}">
        <button class="historyOpen" type="button" data-session-id="${escapeHtml(session.id)}">
          <span class="historyName">${escapeHtml(session.title || session.question || "未命名对话")}</span>
          ${["queued", "running"].includes(session.status) ? `<span class="historyRunIndicator" role="img" aria-label="${session.status === "queued" ? "排队中" : "执行中"}" title="${session.status === "queued" ? "排队中" : "执行中"}"></span>` : ""}
        </button>
        <button class="historyMore" type="button" aria-label="更多操作" data-session-id="${escapeHtml(session.id)}">
          <svg viewBox="0 0 1024 1024" aria-hidden="true"><path d="M170.666667 512m-85.333334 0a85.333333 85.333333 0 1 0 170.666667 0 85.333333 85.333333 0 1 0-170.666667 0Z"></path><path d="M512 512m-85.333333 0a85.333333 85.333333 0 1 0 170.666666 0 85.333333 85.333333 0 1 0-170.666666 0Z"></path><path d="M853.333333 512m-85.333333 0a85.333333 85.333333 0 1 0 170.666667 0 85.333333 85.333333 0 1 0-170.666667 0Z"></path></svg>
        </button>
      </div>
    `)
    .join("");
  historyList.querySelectorAll(".historyOpen").forEach((item) => {
    item.addEventListener("click", () => restoreSession(item.dataset.sessionId));
  });
  historyList.querySelectorAll(".historyMore").forEach((item) => {
    item.addEventListener("click", (event) => {
      event.stopPropagation();
      openSessionMenu(item.dataset.sessionId, item);
    });
  });
}

// Replay only recorded public activity. Never replay final/module events or run tools again.
async function restoreSavedActivity(article, activity = {}) {
  const list = article.querySelector('.thinkingSteps');
  if (!list || article.dataset.activityRestored === 'true' || article.activityRestorePending) return;
  const summary = article.querySelector('.thinkingSummaryText');
  const savedLabel = summary?.textContent;
  const originalHtml = list.innerHTML;
  article.activityRestorePending = true;
  try {
    let events = Array.isArray(activity.events) ? activity.events : [];
    const steps = Array.isArray(activity.steps) ? activity.steps : [];
    if (!events.length && activity.runId) {
      const response = await fetch(`/api/chat/runs/${encodeURIComponent(activity.runId)}/activity`, {cache:'no-store'});
      if (!response.ok) throw new Error('activity unavailable');
      const saved = await response.json();
      events = Array.isArray(saved.events) ? saved.events : [];
    }
    if (events.length) {
      list.replaceChildren();
      article.activityStepKeys = new Set();
    }
    article.activityEnded = false;
    for (const [index, step] of steps.entries()) {
      if (!step || !step.title) continue;
      if (typeof appendCachedActivityStep === 'function') appendCachedActivityStep(article, step, index);
      else appendStep(article, String(step.title), String(step.detail || ''), step.state === 'error' ? 'error' : 'done', `saved-step:${index}`);
    }
    for (const [index, record] of events.entries()) {
      if (!record || typeof record !== 'object') continue;
      const data = record?.data || {};
      if (record.event === 'tool_step') appendToolStep(article, data);
      else if (record.event === 'agent_event') appendAgentChatEvent(article, data);
      else if (record.event === 'module_error') appendModuleErrorStep(article, data);
      else if (record.event === 'status' && shouldRenderStatusEvent(data)) {
        const lang = article.dataset.lang || 'zh-CN';
        appendStep(article, statusTitle(data, lang), statusDetail(data, lang), 'done', `saved-status:${index}`);
      } else if (record.event === 'progress') {
        const rawText = data.thoughtSummary || data.text || data.detail || data.message || '';
        const text = typeof modelActivitySummary === 'function' ? modelActivitySummary(rawText, article.dataset.lang || 'zh-CN') : String(rawText).trim();
        if (text) appendStep(article, String(data.title || text), data.title ? text : '', 'done', `saved-progress:${index}`);
      }
    }
    list.querySelectorAll('li.is-loading').forEach(item => {item.classList.remove('is-loading');item.classList.add('is-done');});
    if (Number(activity.elapsedMs) > 0) article.dataset.cachedElapsedMs = String(activity.elapsedMs);
    if (!list.children.length) appendStep(article, '执行明细未保存', '此记录没有可恢复的执行步骤，未补造过程。', 'done', 'saved-activity-empty');
    article.dataset.activityRestored = 'true';
  } catch {
    if (!list.children.length && originalHtml) list.innerHTML = originalHtml;
    if (!list.children.length) appendStep(article, '执行记录暂时不可用', '原始记录未改动，重新打开会话可重试。', 'done', 'saved-activity-unavailable');
  } finally {
    list.querySelectorAll('li.is-loading').forEach(item => {item.classList.remove('is-loading');item.classList.add('is-done');});
    article.activityRestorePending = false;
    article.activityEnded = true;
    if (typeof refreshSavedToolStepTitles === 'function') refreshSavedToolStepTitles(list, article.dataset.lang || 'zh-CN');
    list.hidden = true;
    if (summary && savedLabel !== undefined) summary.textContent = savedLabel;
    const trigger = article.querySelector('.thinkingTrigger');
    trigger?.classList.remove('is-thinking');
    trigger?.classList.toggle('is-complete', article.dataset.thinkingState !== 'error');
    syncActivityDrawer(article);
  }
}

// History and scheduled runs share the same answer shell and report renderer.
async function renderSavedAssistantAnswer(article, data, options = {}) {
  article.dataset.question = options.question || article.dataset.question || '';
  const lang = article.dataset.lang || detectLanguage(options.question || "");
  article.dataset.lang = lang;
  article.dataset.thinkingState = "done";
  article.activityEnded = true;
  article.activitySources = mergeSourcesByUrl(Array.isArray(data.sources) ? data.sources : [], sourcesFromInsightMarkdown(data.interpretation || ""));
  article.activitySourceCount = article.activitySources.length;
  article.videos = Array.isArray(data.videos) ? data.videos : [];
  article.actionLinks = Array.isArray(data.actionLinks) ? data.actionLinks : [];
  article.agentEvents = article.agentEvents || [];
  article.activityStepKeys = new Set();
  article.dataset.elapsedUnrecorded = String(!(options.thinkingElapsed > 0));
  if (options.thinkingElapsed > 0) article.dataset.cachedElapsedMs = String(options.thinkingElapsed);
  article.innerHTML = `
    <div class="bubble assistantBubble">
      <button class="thinkingTrigger is-complete" type="button" aria-label="${escapeHtml(options.thinkingAriaLabel || "查看活动")}">
        <span class="thinkingSummaryText">${escapeHtml(options.thinkingLabel || "查看执行记录")}</span>
        <span class="thinkingChevron" aria-hidden="true"></span>
      </button>
      <ol class="thinkingSteps" hidden>${options.thinkingStepsHtml || ""}</ol>
      <div class="finalAnswer">
        <section class="mixedReport" aria-live="polite"></section>
        ${buildCapabilityBar(article.actionLinks, lang)}
        <div class="deferredActions" hidden>${buildResultActions(article, lang)}</div>
      </div>
    </div>`;
  refreshSavedToolStepTitles(article.querySelector(".thinkingSteps"), lang);
  if (!options.onThinkingClick && typeof updateThinkingSummary === "function") updateThinkingSummary(article, "");
  void restoreSavedActivity(article, {...(data.activity || {}), runId:data.chatRunId || options.chatRunId || '', elapsedMs:options.thinkingElapsed});
  if(typeof showAgentIdentity==='function')showAgentIdentity(article, data.agent || (data.selectedSkill?.key==='mentora-deal'?'mentora-deal':''));
  article.querySelector(".thinkingTrigger").addEventListener("click", options.onThinkingClick || (() => toggleActivityDrawer(article)));
  await renderMixedReportFlow(article, {...data, sources:article.activitySources}, article.querySelector(".mixedReport"), () => {
    article.querySelector(".deferredActions").hidden = false;
    attachResultActionHandlers(article);
  });
}

function appendRestoredAssistantTurn(session, turn, isLatest = false) {
  const fallback = isLatest ? session : {};
  const value = (key, defaultValue) => turn?.[key] !== undefined ? turn[key] : (fallback?.[key] ?? defaultValue);
  const interpretation = String(value("interpretation", "") || "");
  const reportUrl = value("reportUrl", "");
  const reportArtifacts = Array.isArray(value("reportArtifacts", [])) ? value("reportArtifacts", []) : [];
  const actionLinks = Array.isArray(value("actionLinks", [])) ? value("actionLinks", []) : [];
  const error = String(value("error", "") || "");
  const errorCode = String(value("errorCode", "") || "");
  const question = String(session.question || session.title || "");
  if (!reportUrl && !interpretation && !reportArtifacts.some((item) => item?.url) && !actionLinks.length) {
    if (!error) return;
    const article = createAssistantMessage(question);
    const blocks = value('streamBlocks', []);
    if (blocks.length) {
      replayOrderedStream(article, blocks, orderedStreamFlow(article));
    }
    article.dataset.startedAt = String(Date.now() - Number(value("thinkingElapsed", 0) || 0));
    article.agentEvents = Array.isArray(value("agentEvents", [])) ? value("agentEvents", []) : [];
    article.dataset.agentRunId = String(value("agentRunId", "") || "");
    const savedSteps = article.querySelector(".thinkingSteps");
    if (savedSteps) {
      savedSteps.innerHTML = String(value("thinkingStepsHtml", "") || "");
      refreshSavedToolStepTitles(savedSteps, detectLanguage(question));
    }
    if (errorCode === "cancelled") showStopped(article, error, { skipSessionRecord: true });
    else showError(article, error, { skipSessionRecord: true });
    return;
  }
  const lang = detectLanguage(question);
  const article = document.createElement("article");
  article.className = "message assistant";
  article.dataset.startedAt = String(session.updatedAt || Date.now());
  article.dataset.thinkingState = "done";
  article.dataset.lang = lang;
  article.activityEnded = true;
  article.activitySources = mergeSourcesByUrl(
    Array.isArray(value("sources", [])) ? value("sources", []) : [],
    sourcesFromInsightMarkdown(interpretation),
  );
  article.videos = Array.isArray(value("videos", [])) ? value("videos", []) : [];
  article.agentEvents = Array.isArray(value("agentEvents", [])) ? value("agentEvents", []) : [];
  article.dataset.agentRunId = String(value("agentRunId", "") || "");
  article.activitySourceCount = article.activitySources.length;
  article.actionLinks = actionLinks;
  article.activityStepKeys = new Set();
  article.shareSession = session;
  appendMessage(article, true);
  renderSavedAssistantAnswer(article, {
    agent: value("agent", ""), reportUrl, reportArtifacts, fileArtifacts:value("fileArtifacts",[]), streamBlocks:value('streamBlocks', []),
    selectedSkill:value("selectedSkill",null), label:value("label",""), interpretation,
    sources: article.activitySources, videos: article.videos, actionLinks: article.actionLinks,
  }, {
    thinkingLabel: `${copyFor(lang, "thoughtFor")} ${formatDuration(Number(value("thinkingElapsed", 0) || 0))}`,
    thinkingStepsHtml: String(value("thinkingStepsHtml", "") || ""),
    thinkingElapsed: Number(value("thinkingElapsed", 0) || 0),
    chatRunId: String(value('chatRunId', isLatest ? session.lastRunId || '' : '') || ''),
  });
}

function restoreSession(sessionId) {
  window.dispatchEvent(new Event("veya:chat-navigate"));
  if (activeController) activeController.abort();
  activeController = null;
  button.disabled = false;
  updateComposerState();
  const session = loadSessions().find((item) => item.id === sessionId);
  if (!session) return;
  const recoveredArtifacts = recoverLegacySessionArtifacts(session);
  const previousModel = session.inferenceModel || DEFAULT_INFERENCE_MODEL;
  const previousFramework = session.reasoningFramework || DEFAULT_REASONING_FRAMEWORK;
  currentSession = session;
  currentSession.reasoningFramework = DEFAULT_REASONING_FRAMEWORK;
  currentSession.inferenceModel = DEFAULT_INFERENCE_MODEL;
  currentSession.reasoningEffort = currentReasoningEffort;
  currentSession.frameworkSessionIds = currentSession.frameworkSessionIds || {};
  const restoredEngineKey = `${previousFramework}:${previousModel}`;
  if (currentSession.engineSessionId && !currentSession.frameworkSessionIds[restoredEngineKey]) {
    currentSession.frameworkSessionIds[restoredEngineKey] = currentSession.engineSessionId;
  }
  messages.innerHTML = "";
  conversation.classList.remove("is-empty");
  const savedTurns = Array.isArray(session.messages) ? session.messages : [];
  const assistantIndexes = savedTurns.map((item, index) => item?.role === "assistant" ? index : -1).filter((index) => index >= 0);
  if (savedTurns.some((item) => item?.role === "user")) {
    const latestAssistant = assistantIndexes.at(-1);
    savedTurns.forEach((item, index) => {
      if (item?.role === "user") addUserMessage(item.text || "", { forceScroll: true, images: Array.isArray(item.images) ? item.images : [] });
      else if (item?.role === "assistant") appendRestoredAssistantTurn(session, item, index === latestAssistant);
    });
  } else {
    const userMessage = savedTurns.find((item) => item?.role === "user");
    addUserMessage(session.question || userMessage?.text || session.title || "", {
      forceScroll: true,
      images: Array.isArray(userMessage?.images) ? userMessage.images : [],
    });
    appendRestoredAssistantTurn(session, session, true);
  }
  closeActivityDrawer();
  if (session.activeRunId && ["queued", "running"].includes(session.status)) {
    const pendingQuestion = savedTurns.filter((item) => item?.role === "user").at(-1)?.text || session.question;
    const article = createAssistantMessage(pendingQuestion);
    void resumeChatRun(session, article);
  }
  if (recoveredArtifacts) saveCurrentSession();
  renderHistory();
}

async function restoreSharedSessionFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const shareId = params.get("share");
  if (!shareId) return;
  window.location.replace(`/share/${encodeURIComponent(shareId)}`);
  return;
  const session = loadSessions().find((item) => item.id === shareId);
  if (session) {
    restoreSession(shareId);
    return;
  }
  try {
    const response = await fetch(`/api/share-session/${encodeURIComponent(shareId)}`);
    if (!response.ok) return;
    const sharedSession = await response.json();
    if (!sharedSession?.id) return;
    const sessions = loadSessions().filter((item) => item.id !== sharedSession.id);
    sessions.unshift(sharedSession);
    storeSessions(sessions.slice(0, 20));
    restoreSession(sharedSession.id);
  } catch {
  }
}

function openShareDialog(article) {
  const session = (
    article?.shareSession
      ? article.shareSession
      : currentSession && (currentSession.reportUrl || currentSession.interpretation || currentSession.answerHtml)
        ? currentSession
        : transientShareSessionForArticle(article)
  );
  if (!session) return;
  session.themeMode = currentThemeMode();
  session.shareViewportWidth = Math.round(
    window.visualViewport?.width || window.innerWidth || document.documentElement.clientWidth || 1320,
  );
  if (article) article.shareSession = session;
  const mixedReport = article?.querySelector?.(".mixedReport");
  if (mixedReport?.innerHTML) session.answerHtml = typeof shareAnswerMarkup==='function'?shareAnswerMarkup({...session,answerHtml:mixedReport.innerHTML}):mixedReport.innerHTML;
  const contentWidth=mixedReport?.getBoundingClientRect?.().width;
  if(Number.isFinite(contentWidth)&&contentWidth>0)session.shareContentWidth=Math.round(contentWidth);
  session.shareContextClasses=['cachedCaseAnswer','cachedReplay'].filter(name=>article?.classList?.contains(name));
  const text=mixedReport?.querySelector?.('.streamingAnswer')||mixedReport?.querySelector?.('.reportInterpretation');
  if(text&&typeof getComputedStyle==='function'){
    const style=getComputedStyle(text);
    session.shareBodyFontSize=parseFloat(style.fontSize);
    session.shareBodyLineHeight=parseFloat(style.lineHeight);
  }
  activeShareSession = session;
  if (currentSession?.id === session.id) saveCurrentSession();
  const title = session.question || session.title || "Mentora";
  const shareTitle = document.querySelector("#shareTitle");
  if (shareTitle) shareTitle.textContent = title;
  if (sharePreviewTitle) sharePreviewTitle.textContent = "";
  if (sharePreviewIframe) {
    sharePreviewIframe.shareViewportWidth=session.shareContentWidth?Math.max(360,Math.min(3840,session.shareContentWidth+56)):session.shareViewportWidth;
    sharePreviewIframe.removeAttribute("src");
    sharePreviewIframe.srcdoc = buildShareAnswerDocument(session);
    sharePreviewIframe.onload = () => prepareSharePreviewFrame(sharePreviewIframe);
  }
  if (copyShareLinkText) copyShareLinkText.textContent = "复制链接";
  if (shareDialog) shareDialog.hidden = false;
}

function closeShareDialog() {
  if (!shareDialog) return;
  shareDialog.hidden = true;
  if (sharePreviewIframe) {
    sharePreviewIframe.shareResizeObserver?.disconnect();
    sharePreviewIframe.removeAttribute("src");
    sharePreviewIframe.removeAttribute("srcdoc");
  }
  activeShareSession = null;
}

function shareAnswerMarkup(session) {
  const container = document.createElement("div");
  container.innerHTML = String(session?.answerHtml || "");
  const artifacts = Array.isArray(session?.reportArtifacts) ? session.reportArtifacts : [];
  const artifactUrls = artifacts.map((item) => item?.url || item?.htmlUrl).filter(Boolean);
  if (!artifactUrls.length && session?.reportUrl) artifactUrls.push(session.reportUrl);
  let artifactIndex = 0;
  // A cloned React iframe has neither its runtime nor its host message channel.
  // Share the saved document at the original position instead of copying it.
  container.querySelectorAll(".reportDocumentFrame, .streamvizArtifactHost, .visualize-widget-block, .fileReportReference").forEach((host) => {
    if (!container.contains(host)) return;
    if(host.classList.contains('reportDocumentFrame')){artifactIndex+=1;return;}
    const url = host.dataset.artifactUrl || artifactUrls[artifactIndex];
    artifactIndex += 1;
    if (!url) { host.remove(); return; }
    const frame = document.createElement("iframe");
    frame.className = "reportDocumentFrame";
    frame.src = url;
    frame.title = `Analysis chart ${artifactIndex}`;
    frame.scrolling = "no";
    host.replaceWith(frame);
  });
  container.querySelectorAll(".visualize-widget-frame").forEach((frame) => frame.remove());
  const theme = session?.themeMode === "dark" ? "dark" : "light";
  container.querySelectorAll(".reportDocumentFrame").forEach((frame) => {
    const url = new URL(frame.getAttribute("src") || "", window.location.origin);
    if (url.origin !== window.location.origin) return;
    if (/^\/(?:(?:mentora|veya)\/)?generated\//.test(url.pathname)) url.pathname = url.pathname.replace("/generated/", "/share-artifact/");
    if (/^\/(?:(?:mentora|veya)\/)?share-artifact\//.test(url.pathname)) {
      url.searchParams.set("theme", theme);
      frame.setAttribute("src", `${url.pathname}${url.search}`);
    }
    frame.removeAttribute("style");
    frame.removeAttribute("data-resize-observed");
  });
  return container.innerHTML;
}

function buildShareAnswerDocument(session) {
  const title = escapeHtml(session?.question || session?.title || "Mentora");
  const theme = session?.themeMode === "dark" ? "dark" : "light";
  const answer = shareAnswerMarkup(session);
  const contextClasses=(Array.isArray(session?.shareContextClasses)?session.shareContextClasses:[]).filter(name=>['cachedCaseAnswer','cachedReplay'].includes(name)).join(' ');
  const typography=[];
  for(const [key,name,low,high] of [['shareBodyFontSize','--share-body-font-size',10,40],['shareBodyLineHeight','--share-body-line-height',12,100]]){
    const value=Number(session?.[key]);if(Number.isFinite(value)&&value>=low&&value<=high)typography.push(`${name}:${value}px`);
  }
  return `<!doctype html>
<html lang="zh-CN" data-theme="${theme}" style="color-scheme:${theme}">
<head>
  <meta charset="utf-8" />
  <base href="${window.location.origin}/" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <link rel="stylesheet" href="/static/styles.css" />
  <link rel="stylesheet" href="/static/vendor/streamviz/streamviz.css" />
  <link rel="stylesheet" href="/static/share-answer.css" />
  <link rel="stylesheet" href="/static/image-viewer.css?v=20261027-viewer5" />
</head>
<body style="${escapeHtml(typography.join(';'))}">
  <main class="shareAnswerDocument ${escapeHtml(contextClasses)}">
    <h1 class="shareAnswerTitle">${title}</h1>
    <section class="mixedReport">${answer}</section>
  </main>
  <script src="/static/image-viewer.js?v=20261027-viewer5"></script>
  <script src="/static/share-chart-layout.js"></script>
</body>
</html>`;
}

function shareUrlForSession(session) {
  return new URL(`/share/${encodeURIComponent(session.id)}`, window.location.origin).toString();
}

function resizeSharePreviewFrame(frame) {
  try {
    if(frame.shareViewportWidth&&frame.parentElement?.clientWidth){
      frame.style.width=`${frame.shareViewportWidth}px`;
      frame.style.zoom=String(Math.min(1,frame.parentElement.clientWidth/frame.shareViewportWidth));
    }
    const body = frame.contentDocument?.body;
    const root = frame.contentDocument?.documentElement;
    const content = frame.contentDocument?.querySelector(".shareAnswerDocument");
    const contentHeight = content ? Math.ceil(content.getBoundingClientRect().bottom + parseFloat(getComputedStyle(body).paddingBottom || 0)) : 0;
    const height = contentHeight || Math.max(
      body?.scrollHeight || 0,
      body?.offsetHeight || 0,
      root?.scrollHeight || 0,
      root?.offsetHeight || 0,
      520,
    );
    frame.style.height = `${height}px`;
  } catch {
    frame.style.height = "760px";
  }
}

function prepareSharePreviewFrame(frame) {
  try {
    const doc = frame.contentDocument;
    if (doc) {
      frame.shareResizeObserver?.disconnect();
      if ("ResizeObserver" in window) {
        frame.shareResizeObserver = new ResizeObserver(() => resizeSharePreviewFrame(frame));
        frame.shareResizeObserver.observe(doc.querySelector(".shareAnswerDocument") || doc.body);
      }
      doc.querySelectorAll(".reportDocumentFrame").forEach((chartFrame) => {
        const resizeChart = () => {
          doc.defaultView?.resizeShareCharts?.();
          resizeSharePreviewFrame(frame);
        };
        chartFrame.addEventListener("load", resizeChart, { once: true });
        resizeChart();
      });
    }
  } catch {
  }
  resizeSharePreviewFrame(frame);
  window.setTimeout(() => resizeSharePreviewFrame(frame), 400);
  window.setTimeout(() => resizeSharePreviewFrame(frame), 1200);
}

async function copyShareLink() {
  if (!activeShareSession) return;
  if (!await persistShareSession(activeShareSession)) {
    if (copyShareLinkText) copyShareLinkText.textContent = "生成链接失败，请重试";
    return;
  }
  const url = shareUrlForSession(activeShareSession);
  let copied = false;
  try {
    await navigator.clipboard.writeText(url);
    copied = true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = url;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    copied = document.execCommand("copy");
    textarea.remove();
  }
  if (copyShareLinkText) {
    copyShareLinkText.textContent = copied ? "已复制" : "复制失败";
    setTimeout(() => {
      if (copyShareLinkText) copyShareLinkText.textContent = "复制链接";
    }, 1800);
  }
}

async function persistShareSession(session) {
  session.themeMode = currentThemeMode();
  session.shareViewportWidth = Math.round(
    window.visualViewport?.width || window.innerWidth || document.documentElement.clientWidth || 1320,
  );
  try {
    const response = await fetch("/api/share-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function saveShareImage() {
  if (!activeShareSession || !saveShareImageButton) return;
  const title = activeShareSession.title || activeShareSession.question || "Mentora";
  saveShareImageButton.disabled = true;
  if (saveShareImageText) saveShareImageText.textContent = "正在生成…";
  try {
    if (!activeShareSession.id || !(await persistShareSession(activeShareSession))) {
      throw new Error("保存分享内容失败");
    }
    const response = await fetch(`/api/share-answer-image?share_id=${encodeURIComponent(activeShareSession.id)}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `图片生成失败（${response.status}）`);
    }
    const blob = await response.blob();
    if (!blob.size || !blob.type.startsWith("image/")) throw new Error("服务端未返回有效图片");
    const link = document.createElement("a");
    link.download = `${safeFileName(title)}-aime-chart.png`;
    link.href = URL.createObjectURL(blob);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 60000);
    if (saveShareImageText) saveShareImageText.textContent = "已开始下载";
  } catch (error) {
    if (saveShareImageText) saveShareImageText.textContent = "保存失败";
    window.alert(error?.message || "保存图片失败");
  } finally {
    window.setTimeout(() => {
      saveShareImageButton.disabled = false;
      if (saveShareImageText) saveShareImageText.textContent = "保存图片";
    }, 1800);
  }
}

function wrapCanvasText(text, maxWidth, font) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = font;
  const source = String(text || "").replace(/\n+/g, " ").trim();
  if (!source) return [];
  const tokens = source.includes(" ") ? source.split(/\s+/) : Array.from(source);
  const lines = [];
  let line = "";
  for (const token of tokens) {
    const separator = source.includes(" ") ? " " : "";
    const testLine = line ? `${line}${separator}${token}` : token;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = token;
    } else {
      line = testLine;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawCanvasLines(ctx, lines, x, y, lineHeight) {
  lines.forEach((line) => {
    ctx.fillText(line, x, y);
    y += lineHeight;
  });
  return y;
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  let line = "";
  let lineCount = 0;
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(lineCount === maxLines - 1 ? `${line.slice(0, 80)}...` : line, x, y);
      lineCount += 1;
      if (lineCount >= maxLines) return;
      y += lineHeight;
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line && lineCount < maxLines) ctx.fillText(line, x, y);
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function safeFileName(value) {
  return String(value || "aime-chart").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60);
}

function openSessionMenu(sessionId, anchor) {
  activeMenuSessionId = sessionId;
  const rect = anchor.getBoundingClientRect();
  sessionMenu.hidden = false;
  sessionMenu.style.left = `${Math.min(rect.right - 8, window.innerWidth - 178)}px`;
  sessionMenu.style.top = `${rect.bottom + 6}px`;
}

function closeSessionMenu() {
  if (!sessionMenu) return;
  sessionMenu.hidden = true;
  activeMenuSessionId = null;
}

function beginRenameSession(sessionId) {
  const row = historyList?.querySelector(`.historyItem[data-session-id="${cssEscape(sessionId)}"]`);
  const name = row?.querySelector(".historyName");
  if (!row || !name) return;
  const original = name.textContent.trim();
  name.contentEditable = "true";
  name.classList.add("is-editing");
  name.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(name);
  selection.removeAllRanges();
  selection.addRange(range);

  const finish = () => {
    name.contentEditable = "false";
    name.classList.remove("is-editing");
    const next = name.textContent.trim() || original || "未命名对话";
    renameSession(sessionId, next);
  };
  name.addEventListener("blur", finish, { once: true });
  name.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      name.blur();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      name.textContent = original;
      name.blur();
    }
  });
}

function renameSession(sessionId, title) {
  const sessions = loadSessions();
  const target = sessions.find((item) => item.id === sessionId);
  if (!target) return;
  target.title = title.slice(0, 40);
  target.customTitle = true;
  target.updatedAt = Date.now();
  storeSessions(sessions);
  if (currentSession?.id === sessionId) currentSession = target;
  void fetch(`/api/chat/sessions/${encodeURIComponent(sessionId)}`, {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:target.title})}).catch(() => {});

  renderHistory();
}

function openDeleteDialog(sessionId) {
  pendingDeleteSessionId = sessionId;
  const session = loadSessions().find((item) => item.id === sessionId);
  const title = session?.title || session?.question || "this chat";
  deleteMessage.textContent = "删除后，此对话及其消息将无法恢复。";
  closeSessionMenu();
  deleteDialog.hidden = false;
}

function closeDeleteDialog() {
  pendingDeleteSessionId = null;
  if (deleteDialog) deleteDialog.hidden = true;
}

async function confirmDeleteSession() {
  if (!pendingDeleteSessionId) return;
  const removingId = pendingDeleteSessionId;
  try {
    const response = await fetch(`/api/chat/sessions/${encodeURIComponent(removingId)}`, {method:"DELETE"});
    if (!response.ok && response.status !== 404) throw new Error("删除失败");
  } catch { deleteMessage.textContent = "暂时无法同步删除，请稍后重试。"; return; }
  const target = loadSessions().find((item) => item.id === removingId);
  const deletingCurrent = currentSession?.id === removingId;
  const sessions = loadSessions().filter((item) => item.id !== removingId);

  storeSessions(sessions);
  closeDeleteDialog();
  if (deletingCurrent) startNewChat();
  renderHistory();
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/"/g, '\\"');
}

function formatDuration(ms) {
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

async function readEventStream(body, onEvent) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";
    chunks.forEach((chunk) => dispatchSseChunk(chunk, onEvent));
  }
  if (buffer.trim()) dispatchSseChunk(buffer, onEvent);
}

function dispatchSseChunk(chunk, onEvent) {
  let eventName = "message";
  const dataLines = [];
  chunk.split(/\n/).forEach((line) => {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  });
  if (!dataLines.length) return;
  try {
    onEvent(eventName, JSON.parse(dataLines.join("\n")));
  } catch {
    onEvent("error", { detail: "流式数据解析失败" });
  }
}

document.addEventListener("click", (event) => {
  const inlineChip = event.target?.closest?.(".inline-answer-source .source-chip");
  if (inlineChip && window.matchMedia("(hover: none), (max-width: 720px)").matches) {
    const source = inlineChip.closest(".module-source");
    if (source && !source.classList.contains("is-open")) {
      event.preventDefault();
      event.stopPropagation();
      document.querySelectorAll(".module-source.is-open").forEach((item) => item.classList.remove("is-open"));
      source.classList.add("is-open");
      positionSourceCard(source);
      return;
    }
  }
  const control = event.target?.closest?.("[data-source-prev], [data-source-next]");
  if (!control) return;
  const source = control.closest(".module-source");
  if (!source) return;
  event.preventDefault();
  event.stopPropagation();
  const direction = control.hasAttribute("data-source-prev") ? -1 : 1;
  rotateModuleSource(source, direction);
});

document.addEventListener("click", (event) => {
  if (event.target?.closest?.(".module-source")) return;
  document.querySelectorAll(".module-source.is-open").forEach((item) => item.classList.remove("is-open"));
});

document.addEventListener("mouseover", (event) => {
  const source = event.target?.closest?.(".module-source");
  if (source) positionSourceCard(source);
});

document.addEventListener("focusin", (event) => {
  const source = event.target?.closest?.(".module-source");
  if (source) positionSourceCard(source);
});

function rotateModuleSource(source, direction) {
  const sources = parseModuleSources(source);
  if (sources.length <= 1) return;
  const current = Number(source.dataset.sourceIndex || "0");
  const nextIndex = (current + direction + sources.length) % sources.length;
  source.dataset.sourceIndex = String(nextIndex);
  renderModuleSource(source, sources[nextIndex], nextIndex, sources.length);
}

function parseModuleSources(source) {
  try {
    const value = JSON.parse(source.dataset.sources || "[]");
    return Array.isArray(value) ? value.filter((item) => item && item.url) : [];
  } catch {
    return [];
  }
}

function renderModuleSource(source, item, index, total) {
  const chip = source.querySelector(".source-chip");
  const body = source.querySelector(".source-card-body");
  const card = source.querySelector(".source-card");
  if (chip) chip.href = item.url || "#";
  if (body) body.href = item.url || "#";
  if (card) card.setAttribute("aria-label", item.title || item.siteName || "Source");
  const site = source.querySelector(".source-card-site");
  const title = source.querySelector(".source-card-title");
  const summary = source.querySelector(".source-card-summary");
  const count = source.querySelector(".source-card-count");
  const chipName = source.querySelector(".source-chip-name");
  const chipLogo = source.querySelector(".source-chip-logo");
  const cardLogo = source.querySelector(".source-card-logo");
  const iconUrl = item.iconUrl || sourceLogoSrc(item.siteName, item.url);
  if (site) site.textContent = item.siteName || "AInvest";
  if (title) title.textContent = item.title || item.siteName || "AInvest";
  if (summary) summary.textContent = item.summary || "";
  if (count) count.textContent = `${index + 1}/${total}`;
  if (chipName) chipName.textContent = `${item.siteName || domainFromUrl(item.url || "") || "来源"}${total > 1 ? ` +${total - 1}` : ""}`;
  if (chipLogo && iconUrl) {
    chipLogo.dataset.sourceSite = item.siteName || "";
    chipLogo.onerror = () => { chipLogo.onerror = null; chipLogo.src = sourceFallbackLogoSrc(item.siteName || ""); };
    chipLogo.src = iconUrl;
  }
  if (cardLogo && iconUrl) {
    cardLogo.dataset.sourceSite = item.siteName || "";
    cardLogo.onerror = () => { cardLogo.onerror = null; cardLogo.src = sourceFallbackLogoSrc(item.siteName || ""); };
    cardLogo.src = iconUrl;
  }
  positionSourceCard(source);
}

function positionSourceCard(source) {
  const card = source?.querySelector?.(".source-card");
  if (!card) return;
  const prev = source.querySelector("[data-source-prev]");
  const next = source.querySelector("[data-source-next]");
  if (prev && !prev.querySelector("svg")) prev.innerHTML = SOURCE_ARROW_LEFT;
  if (next && !next.querySelector("svg")) next.innerHTML = SOURCE_ARROW_RIGHT;
  card.style.visibility = "hidden";
  card.style.opacity = "0";
  card.style.left = "0px";
  card.style.top = "0px";
  card.style.right = "auto";
  card.style.bottom = "auto";
  card.style.transform = "none";
  const chipRect = source.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const margin = 12;
  const width = Math.min(420, window.innerWidth - margin * 2);
  let left = chipRect.left + chipRect.width / 2 - width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
  let top = chipRect.top - (cardRect.height || 240) - 12;
  if (top < margin) top = Math.min(window.innerHeight - (cardRect.height || 240) - margin, chipRect.bottom + 12);
  top = Math.max(margin, top);
  card.style.width = `${width}px`;
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  card.style.visibility = "";
  card.style.opacity = "";
}

function resizeReportDocumentFrame(frame) {
  const contentHeight = (doc) => {
    const body = doc?.body;
    const root = doc?.documentElement;
    if (!body || !root) return 520;
    if (doc.querySelector('.smart-money')) frame.dataset.businessComponent = 'smart_money';
    const canvas = doc.querySelector?.(".report-canvas");
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      if (rect.height > 80) return Math.ceil(rect.bottom);
    }
    const intrinsicContainer = doc.querySelector?.('.multi-kline, .kline-component, [data-timeline-container="true"], #wrap, .component-root, .chart-container, main');
    if (intrinsicContainer) {
      const rect = intrinsicContainer.getBoundingClientRect();
      const report = frame.closest('.mixedReport');
      const compactFileDelivery = frame.closest('.finalAnswer.has-generated-files')
        && frame.parentElement === report?.lastElementChild;
      const terminal = intrinsicContainer.matches('main')
        ? intrinsicContainer.lastElementChild?.lastElementChild
        : null;
      if (compactFileDelivery && terminal) {
        const terminalRect = terminal.getBoundingClientRect();
        if (terminalRect.height > 0 && rect.bottom - terminalRect.bottom > 8) {
          return Math.ceil(terminalRect.bottom + 8);
        }
      }
      if (rect.height > 0) return Math.ceil(rect.height);
    }
    return Math.ceil(Math.max(
      body.scrollHeight || 0,
      body.offsetHeight || 0,
      root.scrollHeight || 0,
      root.offsetHeight || 0,
      0,
    ));
  };
  const resize = () => {
    try {
      const doc = frame.contentDocument;
      frame.style.minHeight = "0";
      const height = contentHeight(doc);
      // Native charts may include two pixels for the iframe edge. Avoid a
      // resize loop between their height message and this intrinsic measure.
      if (Math.abs(frame.getBoundingClientRect().height - height) > 2) frame.style.height = `${height}px`;
    } catch {
      frame.style.minHeight = "0";
      frame.style.height = "620px";
    }
  };
  resize();
  setTimeout(resize, 80);
  setTimeout(resize, 300);
  setTimeout(resize, 900);
  try {
    const doc = frame.contentDocument;
    if (doc?.body && "ResizeObserver" in window && !frame.dataset.resizeObserved) {
      frame.dataset.resizeObserved = "true";
      new ResizeObserver(resize).observe(doc.body);
    }
  } catch {
    resize();
  }
}

window.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "analysis-planner-report-height" && data.type !== "analysis-planner-chart-height") return;
  const frame = Array.from(document.querySelectorAll(".reportDocumentFrame"))
    .find((item) => item.contentWindow === event.source);
  if (!frame) return;
  if (frame.contentDocument?.querySelector('[data-tv-surface]')) {
    resizeReportDocumentFrame(frame);
    return;
  }
  const height = Number(data.height);
  if (!Number.isFinite(height) || height <= 80) return;
  frame.style.minHeight = "0";
  if (Math.abs(frame.getBoundingClientRect().height - height) > 2) frame.style.height = `${Math.ceil(height)}px`;
});

function isNearBottom() {
  return messages.scrollHeight - messages.scrollTop - messages.clientHeight < 140;
}

function keepScrollPosition() {
  generationScrollFollow?.changed();
  scheduleScrollHint();
}

function scrollToLatestContent(behavior='auto') {
  requestAnimationFrame(() => { messages.scrollTo({top:messages.scrollHeight,behavior}); scheduleScrollHint(); });
}

function scheduleScrollHint() {
  if (scrollHintFrame) return;
  scrollHintFrame=requestAnimationFrame(() => { scrollHintFrame=0; updateScrollHint(); });
}

function updateScrollHint() {
  const hint=document.querySelector('#scrollToBottomButton');
  if (!hint) return;
  const unseen=messages.scrollHeight-messages.scrollTop-messages.clientHeight>16;
  const active=Array.from(messages.querySelectorAll('.message.assistant')).some(article => !article.activityEnded && article.dataset.thinkingState==='active');
  const chinese=/^zh/.test(normalizeLang(messages.querySelector('.message.assistant:last-child')?.dataset.lang || 'zh-CN'));
  const label=active ? (chinese?'生成中，点击查看最新内容':'Generating — view latest content') : (chinese?'查看最新内容':'View latest content');
  hint.hidden=!unseen;
  hint.classList.toggle('is-loading',active);
  hint.setAttribute('aria-label',label);
  hint.title=label;
}

function formatInsight(value) {
  const lines = String(value || "").replace(/\r\n?/g, "\n").split("\n");
  if (!lines.some((line) => line.trim())) return "<p>暂无解读文本。</p>";
  const blocks = [];
  let paragraph = [];
  let listType = "";
  let listItems = [];
  let codeLines = [];
  let inCode = false;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!listItems.length) return;
    blocks.push(`<${listType}>${listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</${listType}>`);
    listType = "";
    listItems = [];
  };
  const flushTextBlocks = () => {
    flushParagraph();
    flushList();
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    const line = rawLine.trim();
    if (line.startsWith("```")) {
      flushTextBlocks();
      if (inCode) {
        blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }
    if (!line) {
      flushParagraph();
      if (listItems.length) {
        const nextNonEmpty = lines.slice(lineIndex + 1).find((candidate) => String(candidate).trim());
        const nextLine = String(nextNonEmpty || "").trim();
        const continuesOrdered = listType === "ol" && /^\d+[.)]\s+/.test(nextLine);
        const continuesUnordered = listType === "ul" && /^[-*+]\s+/.test(nextLine);
        if (!continuesOrdered && !continuesUnordered) flushList();
      }
      continue;
    }
    const nextLine = String(lines[lineIndex + 1] || "").trim();
    const isTableSeparator = /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(nextLine);
    if (line.includes("|") && isTableSeparator) {
      flushTextBlocks();
      const headers = parseMarkdownTableRow(line);
      const bodyRows = [];
      lineIndex += 2;
      while (lineIndex < lines.length && String(lines[lineIndex]).trim().includes("|")) {
        bodyRows.push(parseMarkdownTableRow(String(lines[lineIndex]).trim()));
        lineIndex += 1;
      }
      lineIndex -= 1;
      const headHtml = headers.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join("");
      const bodyHtml = bodyRows
        .map((row) => `<tr>${headers.map((_header, index) => `<td>${renderInlineMarkdown(row[index] || "")}</td>`).join("")}</tr>`)
        .join("");
      blocks.push(`<div class="markdownTableWrap"><table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`);
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushTextBlocks();
      const level = Math.min(4, heading[1].length);
      blocks.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    const unordered = line.match(/^[-*+]\s+(.+)$/);
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const nextType = ordered ? "ol" : "ul";
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      listItems.push((unordered || ordered)[1]);
      continue;
    }
    if (line.startsWith(">")) {
      flushTextBlocks();
      blocks.push(`<blockquote>${renderInlineMarkdown(line.replace(/^>\s?/, ""))}</blockquote>`);
      continue;
    }
    if (/^([-*_])\1{2,}$/.test(line)) {
      flushTextBlocks();
      blocks.push("<hr>");
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  if (inCode && codeLines.length) blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  flushTextBlocks();
  return blocks.join("");
}

function parseMarkdownTableRow(value) {
  return String(value || "")
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderInlineMarkdown(value) {
  const links = [];
  const citationOnlyParentheses = /[（(]\s*((?:\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))(?:\s*[、,，;；]\s*(?:\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)))*)\s*[）)]/g;
  const normalized = String(value || "").replace(citationOnlyParentheses, "$1");
  const tokenized = normalized.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label, url) => {
    if (!isPublicEvidenceUrl(url)) return label;
    const index = links.push({ label, url }) - 1;
    return `\uE000AIME_LINK_${index}\uE001`;
  });
  return escapeHtml(tokenized)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\uE000AIME_LINK_(\d+)\uE001/g, (_match, rawIndex) => {
      const link = links[Number(rawIndex)];
      if (!link) return "";
      return `<a class="answer-citation-link" data-source-url="${escapeHtml(link.url)}" href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(link.label)}</a>`;
    });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function decodeHtml(value) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = String(value);
  return textarea.value;
}
