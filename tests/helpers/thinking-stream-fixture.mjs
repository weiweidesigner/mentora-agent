import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../../app/static/app.js', import.meta.url), 'utf8');
const names = ['appendStep', 'appendRichStep', 'appendToolStep', 'activityToolKind', 'activityToolVerb', 'activitySummaryKey', 'rememberActivityDisclosure', 'activityToolMarkup', 'buildActivityFlow', 'syncInlineActivity', 'activityActionIcon',
  'publicToolObservation', 'compactReasoningTitle', 'modelActivitySummary', 'toolActivityTitle', 'refreshSavedToolStepTitles', 'toolBlockHtml',
  'formatShellCommand', 'shellQuote', 'skillOutputLabel', 'showError', 'showStopped', 'completeThinking',
  'updateThinkingSummary', 'setInlineActivityExpanded', 'toggleActivityDrawer', 'openActivityDrawer', 'closeActivityDrawer',
  'syncActivityDrawer', 'formatDuration', 'escapeHtml'];
const functions = names.map(name => {
  const start = source.indexOf(`function ${name}(`);
  const next = source.slice(start + 1).search(/\n(?:async )?function /);
  return source.slice(start, next < 0 ? undefined : start + 1 + next);
}).join('\n');

export const markup = `<main class="shell sidebar-collapsed"><div class="appSidebar"></div><section class="conversation"><div class="messages"><article class="message user"><div class="userBubble">分析现有数据，并生成一份报告</div></article><article class="message assistant" data-lang="zh-Hans" data-thinking-state="active"><div class="bubble assistantBubble"><button class="thinkingTrigger is-thinking"><span class="thinkingSummaryText"></span><span class="thinkingChevron"></span></button><ol class="thinkingSteps"></ol><div class="finalAnswer"></div></div></article></div></section><aside id="activityDrawer" class="activityDrawer" aria-hidden="true"><header class="activityHeader"><span id="activityLabel"></span><span id="activityElapsed"></span><button id="activityClose" class="activityClose" aria-label="关闭"></button></header><div id="activityBody" class="activityBody"></div></aside></main>`;

export const bootstrap = `
const shell = document.querySelector('.shell');
const activityDrawer = document.querySelector('#activityDrawer');
const activityBody = document.querySelector('#activityBody');
const activityLabel = document.querySelector('#activityLabel');
const activityElapsed = document.querySelector('#activityElapsed');
const activityClose = document.querySelector('#activityClose');
let activeActivityArticle = null, activityAutoFollow = false;
window.normalizeLang = value => value === 'zh-CN' ? 'zh-Hans' : value;
window.stripStagePrefix = value => value;
window.isNearBottom = () => false;
window.keepScrollPosition = () => {};
window.copyFor = (lang, key) => key;
window.toolStepDescription = () => '';
window.isActivityNearBottom = () => false;
window.scrollActivityToLatest = () => {};
window.buildActivityTerminal = () => '';
window.buildActivitySources = () => '';
window.recordAssistantError = () => {};
window.recordAssistantStopped = () => {};
window.isMobileLayout = () => window.innerWidth <= 760;
${functions}
window.article = document.querySelector('.message.assistant');
article.dataset.startedAt = String(Date.now() - 269000);
article.activityEnded = false;
article.querySelector('.thinkingTrigger').addEventListener('click', () => toggleActivityDrawer(article));
activityClose.addEventListener('click', closeActivityDrawer);
document.addEventListener('toggle', rememberActivityDisclosure, true);
updateThinkingSummary(article, '', {live:true});
window.finish = () => {
  article.dataset.cachedElapsedMs = '269000';
  completeThinking(article);
  article.activityEnded = true;
  article.dataset.thinkingState = 'done';
  updateThinkingSummary(article, '');
  article.querySelector('.finalAnswer').textContent = '分析已完成，报告已生成。';
};
`;
