const form = document.querySelector("#chatForm");
const input = document.querySelector("#question");
const button = document.querySelector("#submitButton");
const attachButton = document.querySelector("#attachButton");
const imageInput = document.querySelector("#imageInput");
const attachmentPreview = document.querySelector("#attachmentPreview");
const composerBox = document.querySelector(".composerBox");
const messages = document.querySelector("#messages");
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
let autoFollow = true;
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
const THEME_STORAGE_KEY = "aime-chart-theme-v1";
const SUPPORTED_FRAMEWORKS = new Set(["deepseek", "codex"]);
const DEFAULT_REASONING_FRAMEWORK = SUPPORTED_FRAMEWORKS.has(window.AIME_CHAT_CONFIG?.reasoningFramework)
  ? window.AIME_CHAT_CONFIG.reasoningFramework : "deepseek";
const DEFAULT_INFERENCE_MODEL = "deepseek-v4-flash";
const storedThemeMode = localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";

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

["wheel", "touchstart"].forEach((eventName) => {
  messages.addEventListener(
    eventName,
    () => {
      autoFollow = isNearBottom();
    },
    { passive: true },
  );
});

activityBody?.addEventListener(
  "scroll",
  () => {
    activityAutoFollow = isActivityNearBottom();
  },
  { passive: true },
);

renderHistory();
restoreSharedSessionFromUrl();
const mobileShellQuery = window.matchMedia("(max-width: 760px)");

function isMobileLayout() {
  return mobileShellQuery.matches;
}

function setSidebarCollapsed(collapsed) {
  shell.classList.toggle("sidebar-collapsed", collapsed);
  shell.classList.toggle("sidebar-open", !collapsed);
  sidebarToggle?.setAttribute("aria-label", collapsed ? "Open sidebar" : "Collapse sidebar");
}

function syncResponsiveShell() {
  setSidebarCollapsed(isMobileLayout());
}

syncResponsiveShell();
mobileShellQuery.addEventListener?.("change", syncResponsiveShell);

sidebarToggle?.addEventListener("click", () => {
  const isCollapsed = shell.classList.toggle("sidebar-collapsed");
  shell.classList.toggle("sidebar-open", !isCollapsed);
  sidebarToggle.setAttribute("aria-label", isCollapsed ? "Open sidebar" : "Collapse sidebar");
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

input.addEventListener("input", updateComposerState);
attachButton?.addEventListener("click", () => imageInput?.click());
imageInput?.addEventListener("change", async (event) => {
  await addImageFiles(event.target.files);
  event.target.value = "";
});
document.addEventListener("paste", async (event) => {
  const files = Array.from(event.clipboardData?.files || []).filter((file) => file.type.startsWith("image/"));
  if (!files.length) return;
  event.preventDefault();
  await addImageFiles(files);
});
updateComposerState();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = input.value.trim();
  const images = pendingImages.slice();
  if ((!question && !images.length) || button.disabled) return;

  input.value = "";
  clearPendingImages();
  updateComposerState();
  await submitQuestion(question || "请识别图片并整理信息", { images });
});

async function submitQuestion(question, options = {}) {
  const images = Array.isArray(options.images) ? options.images : [];
  lastQuestion = question;
  ensureCurrentSession(question);
  currentSession.themeMode = currentThemeMode();
  if (!String(currentSession.question || "").trim()) currentSession.question = question;
  const framework = DEFAULT_REASONING_FRAMEWORK;
  const model = DEFAULT_INFERENCE_MODEL;
  if (options.replaceSessionQuestion) {
    currentSession.question = question;
    currentSession.messages = [];
  }
  currentSession.messages.push({ role: "user", text: question, images: imageSessionPayload(images) });
  const userArticle = options.userArticle || addUserMessage(question, { forceScroll: true, images });
  if (options.userArticle) {
    renderUserMessage(userArticle, question);
    removeMessagesAfter(userArticle);
    keepScrollPosition(true);
  }
  autoFollow = true;
  button.disabled = true;

  const assistant = createAssistantMessage(question);
  activeController = new AbortController();

  try {
    const response = await fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        images: images.map(imageRequestPayload),
        sessionId: currentSession.id,
        studioSessionId: currentSession.studioSessionId || null,
        engineSessionId: currentSession.frameworkSessionIds?.[`${framework}:${model}`] || "",
        reasoningFramework: framework,
        inferenceModel: model,
        resolvedInferenceModel: "",
        history: currentSession.messages.slice(0, -1).slice(-8),
        sessionTitle: currentSession.title === "New Chat" ? question : currentSession.title,
        themeMode: currentThemeMode(),
      }),
      signal: activeController.signal,
    });
    if (!response.ok || !response.body) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || "请求失败");
    }
    await readEventStream(response.body, (eventName, data) => {
      handleStreamEvent(assistant, eventName, data);
    });
  } catch (error) {
    if (error.name !== "AbortError") {
      showError(assistant, error.message);
    }
  } finally {
    activeController = null;
    button.disabled = false;
    updateComposerState();
    input.focus();
  }
}

activityClose?.addEventListener("click", closeActivityDrawer);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
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
messages?.addEventListener("click", (event) => {
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
});

function createAssistantMessage(question) {
  const lang = normalizeLang(detectLanguage(question));
  const article = document.createElement("article");
  article.className = "message assistant";
  article.dataset.startedAt = String(Date.now());
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
      <button class="thinkingTrigger is-thinking" type="button" aria-label="View activity">
        <span class="thinkingSummaryText">${escapeHtml(copyFor(lang, "thinking"))}</span>
        <span class="thinkingChevron" aria-hidden="true"></span>
      </button>
      <ol class="thinkingSteps" hidden></ol>
      <div class="routeChips" hidden></div>
      <div class="finalAnswer"></div>
    </div>
  `;
  article.querySelector(".thinkingTrigger").addEventListener("click", () => toggleActivityDrawer(article));
  appendMessage(article, true);
  return article;
}

function handleStreamEvent(article, eventName, data) {
  const lang = setArticleLanguage(article, data?.lang || article.dataset.lang || "en");
  if (eventName === "status") {
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
  if (eventName === "module") {
    appendStreamVisualizationModule(article, data);
    return;
  }
  if (eventName === "visualization" || eventName === "visualize_widget") {
    upsertStreamVisualization(article, data);
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
    renderFinalAnswer(article, data);
    return;
  }
  if (eventName === "error") {
    showError(article, data.detail || "生成失败");
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

function mountStreamVisualization(host, payload) {
  const render = () => {
    if (!window.AimeStreamViz?.mount || !host.isConnected) return false;
    try {
      window.AimeStreamViz.mount(host, payload);
      host.dataset.streamvizMounted = "true";
    } catch {
      host.dataset.streamvizFailed = "true";
    }
    return true;
  };
  if (render()) return;
  window.addEventListener("aime:streamviz-ready", render, { once: true });
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

function createArtifactFallbackFrame(item, index) {
  const frame = document.createElement("iframe");
  frame.className = "reportDocumentFrame";
  frame.dataset.artifactUrl = String(item.url || "");
  frame.title = `Analysis chart ${index + 1}`;
  frame.scrolling = "no";
  const source = new URL(item.url, window.location.origin);
  // Use the server-side document shell for generated HTML. It preserves the
  // artifact's scripts while applying the same width and surface tokens as the
  // surrounding conversation and share page.
  if (source.pathname.startsWith("/generated/") && source.pathname.endsWith(".html")) {
    const artifactSource = new URL(`/share-artifact/${encodeURIComponent(source.pathname.split("/").pop() || "")}`, window.location.origin);
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
    resizeReportDocumentFrame(frame);
  });
  return frame;
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
  const host = document.createElement("div");
  host.className = `streamvizArtifactHost${options.live ? " is-live" : ""}`;
  host.dataset.artifactUrl = String(item.url || "");
  mountStreamVisualization(host, {
    title: item.title || item.label || "",
    code: "",
    exportCode: "",
    final: false,
    showActions: false,
    loadingMessage: options.loadingMessage || "正在准备可视化",
    loadingDwellMs: 0,
  });
  artifactCode(item.url).then((rawCode) => {
    if (!host.isConnected) return;
    if (!streamVisualizationCompatible(rawCode)) {
      window.AimeStreamViz?.unmount?.(host);
      host.replaceWith(createArtifactFallbackFrame(item, index));
      return;
    }
    const code = prepareStreamVisualizationCode(rawCode);
    mountStreamVisualization(host, {
      title: item.title || item.label || "",
      code,
      exportCode: code,
      final: true,
      showActions: options.showActions === true,
      loadingMessage: options.loadingMessage || "正在生成可视化",
      loadingDwellMs: 0,
    });
    guardStreamVisualization(host, item, index);
  }).catch(() => {
    if (!host.isConnected) return;
    window.AimeStreamViz?.unmount?.(host);
    host.replaceWith(createArtifactFallbackFrame(item, index));
  });
  return host;
}

function streamVisualizationLane(article) {
  const target = article.querySelector(".finalAnswer");
  if (!target) return null;
  let lane = target.querySelector(".streamvizLiveLane");
  if (!lane) {
    lane = document.createElement("section");
    lane.className = "streamvizLiveLane";
    lane.setAttribute("aria-label", "正在生成的可视化");
    target.appendChild(lane);
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
      url,
      title: data.label || data.title || "",
    });
  }
  if (data.streamvizCompatible === true) {
    const host = article.querySelector(`[data-visualization-id="${CSS.escape(data.streamvizId || "")}"]`);
    if (host) host.dataset.artifactUrl = url;
    return;
  }
  const lane = streamVisualizationLane(article);
  if (!lane || lane.querySelector(`[data-artifact-url="${CSS.escape(url)}"]`)) return;
  if (data.streamvizCompatible === false) {
    lane.appendChild(createArtifactFallbackFrame({ url }, Number(data.index || lane.children.length + 1) - 1));
    keepScrollPosition(isNearBottom());
    return;
  }
  const host = createStreamVisualizationArtifact({
    url,
    title: data.label || data.title || "",
    label: data.label,
  }, Number(data.index || lane.children.length + 1) - 1, {
    live: true,
    loadingMessage: `正在呈现${data.label || "图表"}`,
  });
  lane.appendChild(host);
  keepScrollPosition(isNearBottom());
}

function upsertStreamVisualization(article, data = {}) {
  const lane = streamVisualizationLane(article);
  if (!lane) return;
  const key = String(data.id || data.callId || data.toolCallId || "visualization");
  if (data.discard) {
    const provisional = Array.from(lane.querySelectorAll(".streamvizArtifactHost"))
      .find((item) => item.dataset.visualizationId === key);
    if (provisional) {
      clearTimeout(provisional.streamvizFallbackTimer);
      window.AimeStreamViz?.unmount?.(provisional);
      provisional.remove();
    }
    return;
  }
  let host = Array.from(lane.querySelectorAll(".streamvizArtifactHost"))
    .find((item) => item.dataset.visualizationId === key);
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
  if (prompt && !button.disabled) void submitQuestion(prompt);
});

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

function renderUserMessage(article, text, images = []) {
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
      <div class="userActions" aria-label="Message actions">
        <button class="userActionButton copyUserMessage" type="button" data-tooltip="复制消息" aria-label="复制消息">
          <span class="actionIcon copyIcon" aria-hidden="true">${COPY_MESSAGE_ICON}</span>
          <span class="actionIcon checkIcon" aria-hidden="true">${CHECK_ICON}</span>
        </button>
        <button class="userActionButton editUserMessage" type="button" data-tooltip="编辑消息" aria-label="编辑消息">
          <span class="actionIcon" aria-hidden="true">${EDIT_MESSAGE_ICON}</span>
        </button>
      </div>
    </div>
  `;
  const copyButton = article.querySelector(".copyUserMessage");
  copyButton?.addEventListener("mouseenter", () => setUserBubbleSelection(article, true));
  copyButton?.addEventListener("mouseleave", () => setUserBubbleSelection(article, false));
  copyButton?.addEventListener("click", () => copyUserMessage(article));
  article.querySelector(".editUserMessage")?.addEventListener("click", () => beginEditUserMessage(article));
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

function beginEditUserMessage(article) {
  if (article.classList.contains("is-editing")) return;
  const original = article.dataset.rawText || "";
  article.classList.add("is-editing");
  article.innerHTML = `
    <div class="userEditBox">
      <textarea class="userEditInput" rows="1">${escapeHtml(original)}</textarea>
      <div class="userEditActions">
        <button class="userEditCancel" type="button">Cancel</button>
        <button class="userEditSend" type="button">Send</button>
      </div>
    </div>
  `;
  const textarea = article.querySelector(".userEditInput");
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  autoResizeUserEdit(textarea);
  textarea.addEventListener("input", () => autoResizeUserEdit(textarea));
  article.querySelector(".userEditCancel")?.addEventListener("click", () => renderUserMessage(article, original));
  article.querySelector(".userEditSend")?.addEventListener("click", () => submitEditedUserMessage(article));
  textarea.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      submitEditedUserMessage(article);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      renderUserMessage(article, original);
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
  sendButton.textContent = "Sending";
  try {
    await submitQuestion(next, { userArticle: article, replaceSessionQuestion: true });
  } finally {
    sendButton.disabled = false;
    sendButton.textContent = "Send";
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
  const shouldStick = forceScroll || isNearBottom();
  conversation.classList.remove("is-empty");
  messages.appendChild(article);
  keepScrollPosition(shouldStick);
}

function appendStep(article, text, detail = "", state = "loading", stepKey = "") {
  if (!text) return;
  const list = article.querySelector(".thinkingSteps");
  const normalizedKey = stepKey || `${text}::${detail}::${state}`;
  if (!article.activityStepKeys) article.activityStepKeys = new Set();
  if (article.activityStepKeys.has(normalizedKey)) {
    return;
  }
  article.activityStepKeys.add(normalizedKey);
  const isFirstStep = list.children.length === 0;
  const shouldStick = isNearBottom();
  list.querySelectorAll("li.is-loading").forEach((item) => {
    item.classList.remove("is-loading");
    item.classList.add("is-done");
  });
  const item = document.createElement("li");
  item.className = state === "error" ? "is-error" : "is-loading";
  item.innerHTML = `
    <div class="activityStepTitle">${escapeHtml(text)}</div>
    ${detail ? `<div class="activityStepDetail">${escapeHtml(detail)}</div>` : ""}
  `;
  list.appendChild(item);
  if (state !== "error" && !isFirstStep) {
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
  const isFirstStep = list.children.length === 0;
  const shouldStick = isNearBottom();
  list.querySelectorAll("li.is-loading").forEach((item) => {
    item.classList.remove("is-loading");
    item.classList.add("is-done");
  });
  const item = document.createElement("li");
  item.className = `${state === "error" ? "is-error" : "is-loading"} ${className}`.trim();
  item.innerHTML = `
    <div class="activityStepTitle">${titleHtml}</div>
    ${detailHtml ? `<div class="activityStepDetail">${detailHtml}</div>` : ""}
    ${drawerDetailHtml ? `<div class="activityDrawerOnly">${drawerDetailHtml}</div>` : ""}
  `;
  list.appendChild(item);
  if (state !== "error" && !isFirstStep) {
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
  const lang = normalizeLang(article.dataset.lang || data?.lang || "en");
  const tool = String(data?.tool || data?.script || "Tool").trim();
  const script = String(data?.script || "").trim();
  const code = String(data?.code || "").trim();
  const params = Array.isArray(data?.params) ? data.params.map((item) => String(item)) : [];
  const shellCommand = Array.isArray(data?.shellCommand) ? data.shellCommand.map((item) => String(item)) : [];
  const output = String(data?.observation || "").trim();
  const preObservation = String(data?.preObservation || "").trim();
  const observation = [preObservation, output].filter(Boolean).join("\n");
  const phase = String(data?.phase || "").trim().toLowerCase();
  const callId = String(data?.callId || "").trim();
  if (script === "multimodal_vision" && mergeVisionToolStep(article, { script, code, params, shellCommand, lang })) {
    return;
  }
  const dynamicTitle = toolActivityTitle(data, script, tool, code, params, shellCommand, lang);
  const stepDescription = toolStepDescription(script, tool, code, params, lang);
  const detail = stepDescription && stepDescription !== dynamicTitle ? stepDescription : "";
  const shellBlock = shellCommand.length
    ? toolBlockHtml("Shell", formatShellCommand(shellCommand))
    : "";
  const fullDetailParts = script === "code_interpreter.py"
    ? codeInterpreterInputBlocks(observation, params, lang)
    : [];
  if (shellBlock) {
    fullDetailParts.unshift(shellBlock);
  } else if (script !== "code_interpreter.py") {
    fullDetailParts.push(`
      <div class="toolStepBlock">
        <div class="toolStepBlockLabel">${escapeHtml(skillInputLabel(lang))}</div>
        <pre><code>${escapeHtml(formatSkillInput(script, code, params, lang))}</code></pre>
      </div>
    `);
  }
  if (observation) {
    fullDetailParts.push(
      `<div class="toolStepOutputBlock">${toolBlockHtml(skillOutputLabel(lang), observation)}</div>`,
    );
  }
  if (phase === "completed" && callId) {
    const existingItem = Array.from(article.querySelectorAll(".thinkingSteps li.is-tool-step"))
      .find((item) => item.dataset.toolCallId === callId);
    if (existingItem) {
      const titleElement = existingItem.querySelector(".activityStepTitle");
      if (titleElement) titleElement.textContent = dynamicTitle;
      const detailElement = existingItem.querySelector(":scope > .activityStepDetail");
      if (detailElement && detail) detailElement.textContent = detail;
      if (observation && !existingItem.querySelector(".toolStepOutputBlock")) {
        let drawer = existingItem.querySelector(":scope > .activityDrawerOnly");
        if (!drawer) {
          drawer = document.createElement("div");
          drawer.className = "activityDrawerOnly";
          existingItem.appendChild(drawer);
        }
        let drawerDetail = drawer.querySelector(":scope > .toolStepDetail");
        if (!drawerDetail) {
          drawerDetail = document.createElement("div");
          drawerDetail.className = "toolStepDetail";
          drawer.appendChild(drawerDetail);
        }
        drawerDetail.insertAdjacentHTML(
          "beforeend",
          `<div class="toolStepOutputBlock">${toolBlockHtml(skillOutputLabel(lang), observation)}</div>`,
        );
      }
      existingItem.classList.remove("is-loading");
      existingItem.classList.add("is-done");
      article.dataset.currentThinking = compactReasoningTitle(data?.nextThought || data?.thoughtSummary, lang) || dynamicTitle;
      updateThinkingSummary(article, copyFor(lang, "thinking"), { live: true });
      syncActivityDrawer(article);
      return;
    }
  }
  const item = appendRichStep(article, {
    titleHtml: `<span>${escapeHtml(dynamicTitle)}</span>`,
    detailHtml: detail ? `<div class="toolStepDetail"><p class="toolStepThought">${escapeHtml(detail)}</p></div>` : "",
    drawerDetailHtml: fullDetailParts.length ? `<div class="toolStepDetail">${fullDetailParts.join("")}</div>` : "",
    state: "loading",
    stepKey: `tool-step:${callId || data?.index || ""}:${phase || "step"}:${script}:${code}:${params.join("|")}`,
    currentThinking: dynamicTitle,
    className: "is-tool-step",
  });
  if (item && callId) item.dataset.toolCallId = callId;
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
    text = text
      .replace(/^(?:这一步|這一步|本步|当前步骤|當前步驟)\s*(?:需要|将|將|会|會|先要|先)?\s*/, "")
      .replace(/^(?:首先|先|需要|将|將|会|會)\s*/, "");
    if (text && !/^(?:正在|准备|準備|继续|繼續|等待|检查|檢查|读取|讀取|搜索|搜尋|检索|檢索|获取|取得|整理|计算|計算|生成|分析|验证|驗證|比较|比較|识别|識別|定位|调用|調用|执行|執行|汇总|彙總|综合|綜合)/.test(text)) {
      text = `正在${text}`;
    } else if (text && !/^(?:正在|准备|準備|继续|繼續|等待)/.test(text)) {
      text = `正在${text}`;
    }
    return text.length > 34 ? `${text.slice(0, 33).trim()}…` : text;
  }
  return text.length > 72 ? `${text.slice(0, 71).trim()}…` : text;
}

function toolCommandText(params, shellCommand) {
  const commands = [...shellCommand];
  params.forEach((raw) => {
    const text = String(raw || "").trim();
    if (!text) return;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") {
        const command = parsed.command ?? parsed.cmd ?? parsed.input?.command ?? parsed.input?.cmd;
        if (Array.isArray(command)) commands.push(command.map((item) => String(item)).join(" "));
        else if (command) commands.push(String(command));
        else commands.push(text);
        return;
      }
    } catch {
      // Non-JSON CLI arguments are already useful semantic input.
    }
    commands.push(text);
  });
  return commands.join(" ").trim();
}

function toolActivityTitle(data, script, fallback, code, params, shellCommand, lang) {
  lang = normalizeLang(lang);
  const reasoning = data?.thoughtSummary || data?.thought || data?.action || data?.nextThought || data?.expectedObservation || "";
  const reasoningTitle = compactReasoningTitle(reasoning, lang);
  if (reasoningTitle) return reasoningTitle;

  const command = toolCommandText(params, shellCommand);
  const lowerCommand = command.toLowerCase();
  const isHans = lang === "zh-Hans";
  const isHant = lang === "zh-Hant";
  const localized = (hans, hant, english) => isHans ? hans : isHant ? hant : english;
  if (/skill\.md\b/i.test(command)) {
    return localized("正在读取相关 Skill 规范", "正在讀取相關 Skill 規範", "Reading the relevant Skill instructions");
  }
  if (/schemas?\/|\.schema\.json\b/i.test(command)) {
    return localized("正在核对图表数据契约", "正在核對圖表資料契約", "Checking the chart data contract");
  }
  if (/(?:^|\s)(?:rg|grep|find)(?:\s|$)/.test(lowerCommand)) {
    return localized("正在定位所需文件与能力", "正在定位所需檔案與能力", "Locating the required files and capabilities");
  }
  if (/(?:^|\s)(?:ls|pwd)(?:\s|$)/.test(lowerCommand)) {
    return localized("正在检查项目与运行环境", "正在檢查專案與執行環境", "Checking the project and runtime environment");
  }
  if (/(?:curl|wget|http)/.test(lowerCommand)) {
    return localized("正在获取外部数据与证据", "正在取得外部資料與證據", "Retrieving external data and evidence");
  }
  const scriptMatch = command.match(/(?:^|[\s/])([A-Za-z0-9_-]+\.(?:py|sh))\b/);
  const effectiveScript = scriptMatch?.[1] || script;
  const displayName = toolDisplayName(effectiveScript, fallback, lang);
  if (effectiveScript === "code_interpreter.py") {
    return localized("正在整理并计算数据", "正在整理並計算資料", "Organizing and calculating the data");
  }
  if (effectiveScript === "external_info_search.py" || effectiveScript === "ainvest_news_search.py") {
    return localized("正在检索相关事实与市场信息", "正在檢索相關事實與市場資訊", "Searching for relevant facts and market context");
  }
  if (effectiveScript === "yahoo_data.py") {
    const symbol = cliValue(params, "--symbols") || code;
    return localized(
      symbol && symbol !== "CODEX" ? `正在获取 ${symbol} 的行情数据` : "正在获取行情数据",
      symbol && symbol !== "CODEX" ? `正在取得 ${symbol} 的行情資料` : "正在取得行情資料",
      symbol && symbol !== "CODEX" ? `Retrieving market data for ${symbol}` : "Retrieving market data",
    );
  }
  if (/\.py$|\.sh$/.test(effectiveScript)) {
    return localized(`正在执行${displayName}`, `正在執行${displayName}`, `Running ${displayName}`);
  }
  return localized("正在推进当前分析步骤", "正在推進目前分析步驟", "Advancing the current analysis step");
}

function refreshSavedToolStepTitles(root, lang) {
  root?.querySelectorAll?.("li.is-tool-step").forEach((item) => {
    const detail = item.querySelector(":scope > .activityStepDetail");
    if (detail && /^(?:[^·\n]+\s*·\s*)?(?:DSH|CODEX)$/i.test(detail.textContent.trim())) {
      detail.remove();
    }
    const title = item.querySelector(".activityStepTitle");
    if (!title || !/^(?:执行工具：|執行工具：|Running tool:\s*)bash$/i.test(title.textContent.trim())) return;
    const input = item.querySelector(".activityDrawerOnly pre code")?.textContent || "";
    title.textContent = toolActivityTitle(
      { tool: "bash", script: "bash" },
      "bash",
      "bash",
      "",
      input ? [input] : [],
      [],
      lang,
    );
  });
}

function appendAgentChatEvent(article, data) {
  const lang = normalizeLang(article.dataset.lang || data?.lang || "en");
  const phase = String(data?.phase || "run");
  const status = String(data?.status || "");
  const agent = String(data?.agent || "aime_chart_agent");
  const message = String(data?.message || "AutoGen AgentChat");
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
  const blocks = [];
  if (trace.length) {
    blocks.push(toolBlockHtml(isChinese ? "AgentChat 工具轨迹" : "AgentChat tool trace", trace.join("\n")));
  }
  if (contracts.length) {
    blocks.push(toolBlockHtml(isChinese ? "已读取组件契约" : "Component contracts read", contracts.join("\n")));
  }
  const eventRecord = {
    engine: String(data?.engine || "AutoGen AgentChat"),
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
  appendRichStep(article, {
    titleHtml: `<span>${escapeHtml(`AutoGen AgentChat · ${phaseLabel} · ${agent}`)}</span>`,
    detailHtml: `<div class="toolStepDetail"><p class="toolStepThought">${escapeHtml(message)}</p></div>`,
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
  if (lang === "zh-Hans") return "SKILL输出（完整结果）";
  if (lang === "zh-Hant") return "SKILL 輸出（完整結果）";
  return "SKILL output (full result)";
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
  const target = article.querySelector(".finalAnswer");
  completeThinking(article);
  updateThinkingSummary(article, copyFor(article.dataset.lang || "en", "thoughtFor"));
  article.dataset.thinkingState = "done";
  article.activityEnded = true;
  const streamedArtifacts = Array.isArray(article.streamVisualizationArtifacts)
    ? article.streamVisualizationArtifacts
    : [];
  if ((!Array.isArray(data.reportArtifacts) || !data.reportArtifacts.some((item) => item?.url)) && streamedArtifacts.length) {
    data.reportArtifacts = streamedArtifacts;
  }
  if (!data.reportUrl && data.reportArtifacts?.[0]?.url) data.reportUrl = data.reportArtifacts[0].url;
  data.sources = mergeSourcesByUrl(
    Array.isArray(data.sources) ? data.sources : [],
    sourcesFromInsightMarkdown(data.interpretation || ""),
  );
  article.activitySources = data.sources;
  article.activitySourceCount = article.activitySources.length;
  article.videos = Array.isArray(data.videos) ? data.videos : [];
  article.actionLinks = Array.isArray(data.actionLinks) ? data.actionLinks : [];
  article.shareSession = buildShareSessionForArticle(article, data);
  const actionsHtml = buildResultActions(article, article.dataset.lang || "en");
  const capabilityBarHtml = buildCapabilityBar(article.actionLinks, article.dataset.lang || "en");
  // Keep the live hosts connected until the final layout atomically moves them.
  // Their React roots and sandbox documents survive the result handoff.
  article.completedStreamVisualizationHosts = new Map();
  target.querySelectorAll(".streamvizArtifactHost[data-artifact-url], .reportDocumentFrame[data-artifact-url]").forEach((host) => {
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
  recordAssistantResult(data);
  syncActivityDrawer(article);
  scrollToMessageStart(article);
}

function buildShareSessionForArticle(article, data = {}) {
  const session = currentSession || ensureCurrentSession(lastQuestion || "");
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
  const title = currentSession?.title && currentSession.title !== "New Chat"
    ? currentSession.title
    : (question || document.title || "Veya");
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
    thinkingElapsed: Math.max(0, Date.now() - Number(article?.dataset?.startedAt || Date.now())),
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
      <div class="aimeVideoDialog" role="dialog" aria-modal="true" aria-label="Video player">
        <button class="aimeVideoClose" type="button" aria-label="Close">×</button>
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
    media.poster = String(video?.coverUrl || "");
  } else {
    media.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    media.allowFullscreen = true;
  }
  player.replaceChildren(media);
  sourceLink.href = String(video?.url || url);
  sourceLink.textContent = String(video?.title || "在来源页面打开");
  overlay.classList.add("is-open");
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
          ${video.coverUrl ? `<img src="${escapeHtml(video.coverUrl)}" alt="" loading="lazy">` : `<span class="relatedVideoPosterFallback"></span>`}
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
    button.addEventListener("click", () => openVideoPlayer(videos[index]));
  });
  return section;
}

async function renderMixedReportFlow(article, data, container, onDone) {
  if (!container) {
    onDone?.();
    return;
  }
  const replaceNodes = (nodes) => {
    container.replaceChildren(...nodes);
    container.querySelectorAll(".streamvizFinalSlot").forEach((slot) => {
      const host = slot.streamvizHost;
      // Atomic moves keep the iframe browsing context alive in modern Chrome.
      if (slot.parentElement.moveBefore) slot.parentElement.moveBefore(host, slot);
      else slot.parentElement.insertBefore(host, slot);
      slot.remove();
    });
  };
  const reportArtifacts = Array.isArray(data.reportArtifacts)
    ? data.reportArtifacts.filter((item) => item && item.url)
    : [];
  const sources = Array.isArray(data.sources) ? data.sources.filter((item) => item?.url) : [];
  const videos = Array.isArray(data.videos) ? data.videos.filter((item) => item && (item.videoUrl || item.url)) : [];
  const sourcePrepared = stripSourceInventoryFromInsight(sanitizeUserFacingInsight(data.interpretation || ""), sources);
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
      slot.streamvizHost = streamedHost;
      return slot;
    }
    if (item.renderMode === "iframe") return createArtifactFallbackFrame(item, index);
    const artifactUrl = new URL(item.url, window.location.origin);
    const imageUrl = String(item.imageUrl || "");
    if (imageUrl.startsWith("/generated/") || /^\/generated\/flux-[^/]+\.html$/i.test(artifactUrl.pathname)) {
      const image = document.createElement("img");
      image.className = "reportGeneratedImage";
      image.alt = "本地生成图片";
      image.loading = "lazy";
      image.decoding = "async";
      image.addEventListener("load", () => {
        if (image.naturalWidth % 16 === 8 && image.naturalHeight % 16 === 8) {
          image.classList.add("reportGeneratedImageLegacyFrame");
        }
      });
      artifactUrl.pathname = artifactUrl.pathname.replace(/\.html$/i, ".png");
      image.src = new URL(imageUrl || artifactUrl.pathname, window.location.origin).href;
      const previewButton = document.createElement("button");
      previewButton.type = "button";
      previewButton.className = "reportGeneratedImageButton";
      previewButton.setAttribute("aria-label", "查看图片详情");
      previewButton.append(image);
      previewButton.addEventListener("click", () => openGeneratedImagePreview(image.src, previewButton));
      return previewButton;
    }
    return createStreamVisualizationArtifact(item, index, { showActions: false });
  };
  // A single FLUX result is visual-only, including previously saved conversations
  // whose interpretation still contains the old completion message.
  if (reportArtifacts.length === 1 && !videos.length && !sources.length) {
    const item = reportArtifacts[0];
    const artifactPath = new URL(item.url, window.location.origin).pathname;
    if (String(item.imageUrl || "").startsWith("/generated/") || /^\/generated\/flux-[^/]+\.html$/i.test(artifactPath)) {
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
    reportArtifacts.forEach((item, index) => {
      const rawPath = String(item.path || "").trim();
      if (!rawPath) return;
      const marker = `\n\n@@AIME_CHART_${index}@@\n\n`;
      const escapedPath = rawPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      tokenized = tokenized
        .replace(new RegExp(`^.*${escapedPath}.*$`, "gm"), marker)
        .split(`[[AIME_CHART:${rawPath}]]`).join(marker)
        .split(`\`${rawPath}\``).join(marker)
        .split(rawPath).join(marker);
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
    reportArtifacts.forEach((item, index) => {
      if (!rendered.has(index)) nodes.push(makeFrame(item, index));
    });
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
  const firstArtifact = reportArtifacts[0] || { url: data.reportUrl };
  const frame = makeFrame(firstArtifact, 0);
  if (interpretation) {
    const parts = splitInsightAroundChart(interpretation);
    const nodes = [];
    if (parts.before) {
      const lead = document.createElement("div");
      lead.className = "streamingAnswer reportInterpretation reportInterpretationLead";
      lead.innerHTML = formatInsight(parts.before);
      nodes.push(lead);
    }
    nodes.push(frame);
    if (parts.after) {
      const detail = document.createElement("div");
      detail.className = "streamingAnswer reportInterpretation reportInterpretationDetail";
      detail.innerHTML = formatInsight(parts.after);
      nodes.push(detail);
    }
    replaceNodes(nodes);
  } else {
    const nodes = [frame];
    const lane = makeVideoLane();
    if (lane) nodes.push(lane);
    replaceNodes(nodes);
  }
  if (frame.tagName === "IFRAME") {
    resizeReportDocumentFrame(frame);
    window.setTimeout(() => resizeReportDocumentFrame(frame), 300);
    window.setTimeout(() => resizeReportDocumentFrame(frame), 1000);
  }
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
  const target = article.querySelector(".finalAnswer") || article.querySelector(".bubble");
  const shouldStick = isNearBottom();
  article.querySelectorAll(".thinkingSteps li.is-loading").forEach((item) => {
    item.classList.remove("is-loading");
    item.classList.add("is-error");
  });
  updateThinkingSummary(article, copyFor(article.dataset.lang || "en", "stoppedAfter"));
  article.dataset.thinkingState = "error";
  article.activityEnded = true;
  target.innerHTML = `<p class="error">${escapeHtml(message)}</p>`;
  if (!options.skipSessionRecord) recordAssistantError(article, message);
  syncActivityDrawer(article);
  keepScrollPosition(shouldStick);
}

function completeThinking(article) {
  article.querySelectorAll(".thinkingSteps li").forEach((item) => {
    item.classList.remove("is-loading", "is-error");
    item.classList.add("is-done");
  });
}

function updateThinkingSummary(article, prefix, options = {}) {
  const target = article.querySelector(".thinkingSummaryText");
  if (!target) return;
  const startedAt = Number(article.dataset.startedAt || Date.now());
  const elapsed = Math.max(0, Date.now() - startedAt);
  target.textContent = options.live ? article.dataset.currentThinking || prefix : `${prefix} ${formatDuration(elapsed)}`;
  const trigger = article.querySelector(".thinkingTrigger");
  if (trigger) {
    trigger.classList.toggle("is-thinking", Boolean(options.live));
    trigger.classList.toggle("is-complete", !options.live && article.dataset.thinkingState !== "error");
    trigger.classList.toggle("is-error", article.dataset.thinkingState === "error");
  }
  if (activeActivityArticle === article && activityElapsed) {
    activityElapsed.textContent = formatDuration(elapsed);
  }
}

function toggleActivityDrawer(article) {
  if (activeActivityArticle === article && activityDrawer?.classList.contains("is-open")) {
    closeActivityDrawer();
    return;
  }
  openActivityDrawer(article);
}

function openActivityDrawer(article) {
  activeActivityArticle = article;
  activityAutoFollow = true;
  shell?.classList.add("activity-open");
  activityDrawer?.classList.add("is-open");
  activityDrawer?.setAttribute("aria-hidden", "false");
  syncActivityDrawer(article);
}

function closeActivityDrawer() {
  shell?.classList.remove("activity-open");
  activityDrawer?.classList.remove("is-open");
  activityDrawer?.setAttribute("aria-hidden", "true");
  activeActivityArticle = null;
}

function syncActivityDrawer(article) {
  if (!activityDrawer || !activityBody || activeActivityArticle !== article) return;
  const shouldStick = activityAutoFollow || isActivityNearBottom();
  const previousScrollTop = activityBody.scrollTop;
  const startedAt = Number(article.dataset.startedAt || Date.now());
  const elapsed = Math.max(0, Date.now() - startedAt);
  const state = article.dataset.thinkingState || "active";
  const lang = normalizeLang(article.dataset.lang || "en");
  if (activityLabel) activityLabel.textContent = copyFor(lang, "activity");
  activityElapsed.textContent = formatDuration(elapsed);

  const steps = Array.from(article.querySelectorAll(".thinkingSteps li"))
    .map((item) => `<li class="${item.className}">${item.innerHTML}</li>`)
    .join("");
  const terminal = buildActivityTerminal(article, lang, elapsed, state);
  const sources = buildActivitySources(article, lang);
  activityBody.innerHTML = `
    <section class="activitySection">
      <div class="activitySectionTitle">${escapeHtml(copyFor(lang, "thinkingSection"))}</div>
    </section>
    <ol class="activityTimeline">${steps}${terminal}</ol>
    ${sources}
  `;
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
  const title = state === "error" ? `${copyFor(lang, "stoppedAfter")} ${formatDuration(elapsed)}` : `${copyFor(lang, "thoughtFor")} ${formatDuration(elapsed)}`;
  const detail = state === "error" ? copyFor(lang, "stoppedLabel") : copyFor(lang, "completedLabel");
  return `
    <li class="is-terminal ${state === "error" ? "is-error" : "is-done"}">
      <div class="activityTerminalTitle">${escapeHtml(title)}</div>
      <div class="activityTerminalDetail">${escapeHtml(detail)}</div>
    </li>
  `;
}

function buildActivitySources(article, lang) {
  const sources = Array.isArray(article.activitySources) ? article.activitySources : [];
  if (!sources.length) return "";
  const title = `${copyFor(lang, "sources")} · ${sources.length}`;
  const cards = sources
    .map((item) => `
      <a class="activitySourceCard" href="${escapeHtml(item.url || "#")}" target="_blank" rel="noreferrer noopener">
        <div class="activitySourceBrand">
          <img class="activitySourceLogo" src="${escapeHtml(item.iconUrl || sourceLogoSrc(item.siteName, item.url))}" data-source-site="${escapeHtml(item.siteName || "")}" onerror="${escapeHtml(sourceImageFallbackAttribute(item.siteName || ""))}" alt="" />
          <span>${escapeHtml(item.siteName || "AInvest")}</span>
        </div>
        <div class="activitySourceTitle">${escapeHtml(item.title || item.moduleLabel || item.code || "")}</div>
        <div class="activitySourceSummary">${escapeHtml(item.summary || "")}</div>
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

function buildResultActions(article, lang) {
  const shareButton = `<button class="resultActionButton shareResultButton" type="button" aria-label="Share" data-tip="Share">
        <span class="resultActionIcon">${SHARE_ICON}</span>
      </button>`;
  return `
    <div class="resultActionsRow">
      ${shareButton}
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
  return `<nav class="capabilityBar" aria-label="AInvest actions">${linkHtml}</nav>`;
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
	    thinkingSection: "Thinking",
	    sources: "Source",
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
	    thinkingSection: "Thinking",
	    sources: "Source",
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
  const hidden = new Set(["received", "execute", "screenshot", "multimodal"]);
  return !hidden.has(statusEventKey(data));
}

function stripStagePrefix(message) {
  return String(message || "").replace(/^(Thought|Action|Observation(?: expected)?):\s*/i, "");
}

function statusTitle(data, lang) {
  lang = normalizeLang(lang);
  const key = statusEventKey(data);
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
  return copyFor(lang, "fallbackDetail");
}

function statusDetail(data, lang) {
  lang = normalizeLang(lang);
  const key = statusEventKey(data);
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
  return copyFor(lang, "fallbackDetail");
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

function startNewChat(createSession = false, focusInput = true) {
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
  autoFollow = true;
  if (focusInput) input.focus();
  if (createSession) ensureCurrentSession("");
}

function updateComposerState() {
  resizeComposerInput();
  const hasText = input.value.trim().length > 0;
  const hasImages = pendingImages.length > 0;
  button.classList.toggle("is-ready", hasText || hasImages);
}

function resizeComposerInput() {
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
    title: "New Chat",
    question,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    reasoningFramework: DEFAULT_REASONING_FRAMEWORK,
    inferenceModel: DEFAULT_INFERENCE_MODEL,
    engineSessionId: "",
    frameworkSessionIds: {},
    resolvedInferenceModel: "",
    themeMode: currentThemeMode(),
  };
  return currentSession;
}

async function recordAssistantResult(data) {
  if (!currentSession) return;
  const assistantArticle = Array.from(messages.querySelectorAll(".message.assistant")).at(-1);
  currentSession.updatedAt = Date.now();
  currentSession.themeMode = currentSession.themeMode || currentThemeMode();
  currentSession.error = "";
  currentSession.reportUrl = data.reportUrl;
  currentSession.reportArtifacts = Array.isArray(data.reportArtifacts) ? data.reportArtifacts : [];
  currentSession.code = data.code;
  currentSession.interpretation = data.interpretation || "";
  currentSession.sources = Array.isArray(data.sources) ? data.sources : [];
  currentSession.videos = Array.isArray(data.videos) ? data.videos : [];
  currentSession.actionLinks = Array.isArray(data.actionLinks) ? data.actionLinks : [];
  currentSession.agentRunId = data.agentRunId || assistantArticle?.dataset?.agentRunId || "";
  currentSession.reasoningFramework = data.reasoningFramework || DEFAULT_REASONING_FRAMEWORK;
  currentSession.inferenceModel = data.inferenceModel || DEFAULT_INFERENCE_MODEL;
  currentSession.resolvedInferenceModel = data.resolvedInferenceModel || currentSession.resolvedInferenceModel || "";
  currentSession.engineSessionId = String(data.engineSessionId || currentSession.engineSessionId || "");
  currentSession.frameworkSessionIds = currentSession.frameworkSessionIds || {};
  if (data.engineSessionId) {
    const engineKey = `${currentSession.reasoningFramework}:${currentSession.inferenceModel}`;
    currentSession.frameworkSessionIds[engineKey] = String(data.engineSessionId);
  }
  currentSession.studioSessionId = Number(data.studioSessionId || currentSession.studioSessionId) || null;
  currentSession.agentEvents = Array.isArray(assistantArticle?.agentEvents) ? assistantArticle.agentEvents : [];
  currentSession.thinkingStepsHtml = assistantArticle?.querySelector(".thinkingSteps")?.innerHTML || "";
  currentSession.thinkingStartedAt = Number(assistantArticle?.dataset?.startedAt || Date.now());
  currentSession.thinkingElapsed = Math.max(0, Date.now() - currentSession.thinkingStartedAt);
  currentSession.messages.push({
    role: "assistant",
    reportUrl: data.reportUrl,
    reportArtifacts: currentSession.reportArtifacts,
    code: data.code,
    label: data.selectedSkill?.label || "",
    interpretation: data.interpretation || "",
    videos: currentSession.videos,
    actionLinks: currentSession.actionLinks,
    reasoningFramework: currentSession.reasoningFramework,
  });
  currentSession.title = await summarizeSessionTitle(currentSession.question, currentSession.interpretation);

  if (assistantArticle) assistantArticle.shareSession = currentSession;
  saveCurrentSession();
}

function recordAssistantError(article, message) {
  if (!currentSession) return;
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
  });
  currentSession.title = String(currentSession.question || "New Chat").trim().slice(0, 28) || "New Chat";
  saveCurrentSession();
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
  return String(question || "New Chat").trim().slice(0, 18);
}

function loadSessions() {
  try {
    const parsed = volatileSessions ?? JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((session) => isRestorableSession(session));
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
  return hasUserQuestion && hasRestorableResult;
}

function saveCurrentSession() {
  if (!currentSession) return;
  const sessions = loadSessions().filter((item) => item.id !== currentSession.id);
  sessions.unshift(currentSession);
  storeSessions(sessions.slice(0, 20));
  renderHistory();
}

function renderHistory() {
  if (!historyList) return;
  const sessions = loadSessions();
  storeSessions(sessions.slice(0, 20));
  if (!sessions.length) {
    historyList.innerHTML = `<div class="historyEmpty">No history</div>`;
    return;
  }
  historyList.innerHTML = sessions
    .map((session) => `
      <div class="historyItem ${currentSession?.id === session.id ? "is-selected" : ""}" data-session-id="${escapeHtml(session.id)}">
        <button class="historyOpen" type="button" data-session-id="${escapeHtml(session.id)}">
          <span class="historyName">${escapeHtml(session.title || session.question || "Untitled chat")}</span>
        </button>
        <button class="historyMore" type="button" aria-label="More" data-session-id="${escapeHtml(session.id)}">
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

function restoreSession(sessionId) {
  window.dispatchEvent(new Event("veya:chat-navigate"));
  const session = loadSessions().find((item) => item.id === sessionId);
  if (!session) return;
  const recoveredArtifacts = recoverLegacySessionArtifacts(session);
  const previousModel = session.inferenceModel || DEFAULT_INFERENCE_MODEL;
  const previousFramework = session.reasoningFramework || DEFAULT_REASONING_FRAMEWORK;
  currentSession = session;
  currentSession.reasoningFramework = DEFAULT_REASONING_FRAMEWORK;
  currentSession.inferenceModel = DEFAULT_INFERENCE_MODEL;
  currentSession.frameworkSessionIds = currentSession.frameworkSessionIds || {};
  const restoredEngineKey = `${previousFramework}:${previousModel}`;
  if (currentSession.engineSessionId && !currentSession.frameworkSessionIds[restoredEngineKey]) {
    currentSession.frameworkSessionIds[restoredEngineKey] = currentSession.engineSessionId;
  }
  messages.innerHTML = "";
  conversation.classList.remove("is-empty");
  const userMessage = Array.isArray(session.messages) ? session.messages.find((item) => item.role === "user") : null;
  addUserMessage(session.question || userMessage?.text || session.title || "", {
    forceScroll: true,
    images: Array.isArray(userMessage?.images) ? userMessage.images : [],
  });
  if (session.reportUrl || session.interpretation
    || (Array.isArray(session.reportArtifacts) && session.reportArtifacts.some((item) => item?.url))
    || (Array.isArray(session.actionLinks) && session.actionLinks.length)) {
    const lang = detectLanguage(session.question || session.title || "");
    const article = document.createElement("article");
    article.className = "message assistant";
    article.dataset.startedAt = String(session.updatedAt || Date.now());
    article.dataset.thinkingState = "done";
    article.dataset.lang = lang;
    article.activityEnded = true;
    article.activitySources = mergeSourcesByUrl(
      Array.isArray(session.sources) ? session.sources : [],
      sourcesFromInsightMarkdown(session.interpretation || ""),
    );
    session.sources = article.activitySources;
    article.videos = Array.isArray(session.videos) ? session.videos : [];
    article.agentEvents = Array.isArray(session.agentEvents) ? session.agentEvents : [];
    article.dataset.agentRunId = session.agentRunId || "";
    article.activitySourceCount = article.activitySources.length;
    article.actionLinks = Array.isArray(session.actionLinks) ? session.actionLinks : [];
    article.activityStepKeys = new Set();
    article.shareSession = session;
    article.innerHTML = `
      <div class="bubble assistantBubble">
        <button class="thinkingTrigger is-complete" type="button" aria-label="View activity">
          <span class="thinkingSummaryText">${escapeHtml(copyFor(lang, "thoughtFor"))} ${escapeHtml(formatDuration(session.thinkingElapsed || 0))}</span>
          <span class="thinkingChevron" aria-hidden="true"></span>
        </button>
        <ol class="thinkingSteps" hidden>${session.thinkingStepsHtml || ""}</ol>
        <div class="finalAnswer">
          <section class="mixedReport" aria-live="polite"></section>
          ${buildCapabilityBar(article.actionLinks, lang)}
          <div class="deferredActions" hidden></div>
        </div>
      </div>
    `;
    refreshSavedToolStepTitles(article.querySelector(".thinkingSteps"), lang);
    const deferredActions = article.querySelector(".deferredActions");
    if (deferredActions) deferredActions.innerHTML = buildResultActions(article, lang);
    appendMessage(article, true);
    article.querySelector(".thinkingTrigger")?.addEventListener("click", () => toggleActivityDrawer(article));
    renderMixedReportFlow(article, { reportUrl: session.reportUrl, reportArtifacts: session.reportArtifacts || [], interpretation: session.interpretation || "", sources: article.activitySources, videos: article.videos, actionLinks: article.actionLinks }, article.querySelector(".mixedReport"), () => {
      const actions = article.querySelector(".deferredActions");
      if (actions) actions.hidden = false;
      attachResultActionHandlers(article);
    });
  } else if (session.error) {
    const article = createAssistantMessage(session.question || session.title || "");
    article.dataset.startedAt = String(Date.now() - Number(session.thinkingElapsed || 0));
    article.agentEvents = Array.isArray(session.agentEvents) ? session.agentEvents : [];
    article.dataset.agentRunId = session.agentRunId || "";
    const savedSteps = article.querySelector(".thinkingSteps");
    if (savedSteps) {
      savedSteps.innerHTML = session.thinkingStepsHtml || "";
      refreshSavedToolStepTitles(savedSteps, lang);
      session.thinkingStepsHtml = savedSteps.innerHTML;
    }
    showError(article, session.error, { skipSessionRecord: true });
  }
  closeActivityDrawer();
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
  if (mixedReport?.innerHTML) session.answerHtml = mixedReport.innerHTML;
  activeShareSession = session;
  if (currentSession?.id === session.id) saveCurrentSession();
  const title = session.question || session.title || "Veya";
  const shareTitle = document.querySelector("#shareTitle");
  if (shareTitle) shareTitle.textContent = title;
  if (sharePreviewTitle) sharePreviewTitle.textContent = "";
  if (sharePreviewIframe) {
    sharePreviewIframe.removeAttribute("src");
    sharePreviewIframe.srcdoc = buildShareAnswerDocument(session);
    sharePreviewIframe.onload = () => prepareSharePreviewFrame(sharePreviewIframe);
  }
  if (copyShareLinkText) copyShareLinkText.textContent = "Copy link";
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
  container.querySelectorAll(".streamvizArtifactHost, .visualize-widget-block").forEach((host) => {
    if (!container.contains(host)) return;
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
    if (url.pathname.startsWith("/generated/")) url.pathname = url.pathname.replace("/generated/", "/share-artifact/");
    if (url.pathname.startsWith("/share-artifact/")) {
      url.searchParams.set("theme", theme);
      frame.setAttribute("src", `${url.pathname}${url.search}`);
    }
    frame.removeAttribute("style");
    frame.removeAttribute("data-resize-observed");
  });
  return container.innerHTML;
}

function buildShareAnswerDocument(session) {
  const title = escapeHtml(session?.question || session?.title || "Veya");
  const theme = session?.themeMode === "dark" ? "dark" : "light";
  const answer = shareAnswerMarkup(session);
  const pageBackground = theme === "dark" ? "#10131a" : "#f7f8fa";
  const pageText = theme === "dark" ? "#eef2f7" : "#151922";
  return `<!doctype html>
<html lang="zh-CN" data-theme="${theme}" style="color-scheme:${theme}">
<head>
  <meta charset="utf-8" />
  <base href="${window.location.origin}/" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <link rel="stylesheet" href="/static/styles.css" />
  <style>
    html,body{margin:0;background:${pageBackground};color:${pageText};overflow:visible}
    body{padding:24px 28px 30px;box-sizing:border-box}
    .shareAnswerDocument{box-sizing:border-box;width:100%;max-width:none;margin:0}
    .shareAnswerTitle{display:block;margin:0 0 18px;font-size:20px;font-weight:750;line-height:1.4;white-space:normal!important;overflow:visible!important;text-overflow:clip!important;overflow-wrap:anywhere;word-break:break-word}
    .reportDocumentFrame{margin:18px 0}
    .streamingAnswer{font-size:16px;line-height:1.65}
    .deferredActions,.capabilityBar{display:none!important}
  </style>
</head>
<body>
  <main class="shareAnswerDocument">
    <h1 class="shareAnswerTitle">${title}</h1>
    <section class="mixedReport">${answer}</section>
  </main>
</body>
</html>`;
}

function shareUrlForSession(session) {
  return new URL(`/share/${encodeURIComponent(session.id)}`, window.location.origin).toString();
}

function resizeSharePreviewFrame(frame) {
  try {
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
      const style = doc.createElement("style");
      const isDark = doc.documentElement.dataset.theme === "dark";
      style.textContent = `
        html, body { background: ${isDark ? "#10131a" : "#f7f8fa"} !important; }
        body { margin: 0 !important; }
        .report-canvas {
          box-sizing: border-box !important;
          padding: 22px 24px 30px !important;
        }
        .report-title {
          display: none !important;
        }
      `;
      doc.head.appendChild(style);
      frame.shareResizeObserver?.disconnect();
      if ("ResizeObserver" in window) {
        frame.shareResizeObserver = new ResizeObserver(() => resizeSharePreviewFrame(frame));
        frame.shareResizeObserver.observe(doc.querySelector(".shareAnswerDocument") || doc.body);
      }
      doc.querySelectorAll(".reportDocumentFrame").forEach((chartFrame) => {
        const resizeChart = () => {
          resizeReportDocumentFrame(chartFrame);
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
  await persistShareSession(activeShareSession);
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
    copyShareLinkText.textContent = copied ? "Copied" : "Copy failed";
    setTimeout(() => {
      if (copyShareLinkText) copyShareLinkText.textContent = "Copy link";
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
  const title = activeShareSession.title || activeShareSession.question || "Veya";
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
      if (saveShareImageText) saveShareImageText.textContent = "Save image";
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
    const next = name.textContent.trim() || original || "Untitled chat";
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
  target.updatedAt = Date.now();
  storeSessions(sessions);
  if (currentSession?.id === sessionId) currentSession = target;

  renderHistory();
}

function openDeleteDialog(sessionId) {
  pendingDeleteSessionId = sessionId;
  const session = loadSessions().find((item) => item.id === sessionId);
  const title = session?.title || session?.question || "this chat";
  deleteMessage.innerHTML = `This will delete <strong>${escapeHtml(title)}</strong>.`;
  closeSessionMenu();
  deleteDialog.hidden = false;
}

function closeDeleteDialog() {
  pendingDeleteSessionId = null;
  if (deleteDialog) deleteDialog.hidden = true;
}

function confirmDeleteSession() {
  if (!pendingDeleteSessionId) return;
  const target = loadSessions().find((item) => item.id === pendingDeleteSessionId);
  const deletingCurrent = currentSession?.id === pendingDeleteSessionId;
  const sessions = loadSessions().filter((item) => item.id !== pendingDeleteSessionId);

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
  if (chipName) chipName.textContent = `${item.siteName || domainFromUrl(item.url || "") || "Source"}${total > 1 ? ` +${total - 1}` : ""}`;
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
    const canvas = doc.querySelector?.(".report-canvas");
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      if (rect.height > 80) return Math.ceil(rect.bottom);
    }
    const intrinsicContainer = doc.querySelector?.('.multi-kline, .kline-component, [data-timeline-container="true"], #wrap, .component-root, .chart-container, main');
    if (intrinsicContainer) {
      const rect = intrinsicContainer.getBoundingClientRect();
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
      frame.style.height = `${contentHeight(doc)}px`;
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
  const height = Number(data.height);
  if (!Number.isFinite(height) || height <= 80) return;
  frame.style.minHeight = "0";
  frame.style.height = `${Math.ceil(height)}px`;
});

function scrollToMessageStart(article) {
  requestAnimationFrame(() => {
    messages.scrollTo({
      top: Math.max(0, article.offsetTop - 14),
      behavior: "auto",
    });
  });
}

function isNearBottom() {
  return messages.scrollHeight - messages.scrollTop - messages.clientHeight < 140;
}

function keepScrollPosition(shouldStick) {
  if (!shouldStick && !autoFollow) return;
  requestAnimationFrame(() => {
    messages.scrollTo({ top: messages.scrollHeight, behavior: "auto" });
  });
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
      flushTextBlocks();
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
