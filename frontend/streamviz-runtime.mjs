import { buildRuntimeDocument as buildBaseRuntimeDocument } from '../node_modules/streamviz-react/src/react/runtimeDocument.ts';
import { applyStreamTitlePolicy } from './streamviz-title-policy.mjs';
import { applyActionCardPolicy } from './action-card-policy.mjs';
import actionCardCss from '../app/static/action-cards.css?raw';

// Keep the pinned package's sanitizer, metadata, exports and reconciliation.
// Only replace its unconditional automatic-heading insertion policy.
export const buildRuntimeDocument = id => applyActionCardPolicy(applyStreamTitlePolicy(buildBaseRuntimeDocument(id)), actionCardCss);
