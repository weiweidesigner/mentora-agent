import { buildRuntimeDocument as buildBaseRuntimeDocument } from '../node_modules/streamviz-react/src/react/runtimeDocument.ts';
import { applyStreamTitlePolicy } from './streamviz-title-policy.mjs';

// Keep the pinned package's sanitizer, metadata, exports and reconciliation.
// Only replace its unconditional automatic-heading insertion policy.
export const buildRuntimeDocument = id => applyStreamTitlePolicy(buildBaseRuntimeDocument(id));
