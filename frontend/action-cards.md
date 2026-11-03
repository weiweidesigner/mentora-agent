# Action cards

Two reusable components share `app/static/action-cards.css` and retain the existing 420px maximum width, 60px height, 12px radius, colors and hover/focus actions.

- `FilePreviewCard({name, type, download})` returns escaped card HTML. Its preview button is separate from its download link. The host binds preview opening and authenticated downloading; rendering never opens or downloads anything.
- `NavigationCard({label, href, target, onNavigate, feature}, document)` returns an anchor for a web destination or a button for an application action. It has a hover/focus arrow and no download action.

Source: `frontend/action-card-components.mjs`. The classic browser API is `window.MentoraActionCards`, built to `app/static/vendor/action-cards.js` and loaded before `app.js`.

For sandboxed or saved HTML, mark a link/button with `data-action-card="navigation"`; StreamViz's `action-card-policy.mjs` supplies the same style and arrow. Existing AInvest `.entry` cards remain compatible. Ordinary source/article links are not converted.

Run `npm run build:streamviz` after component, policy or shared CSS changes. It builds the small classic component bundle and the StreamViz runtime together; commit both generated JS files. Tests: `node --test tests/action-card-components.test.mjs tests/action-cards.test.mjs tests/file-cards.test.mjs`.
