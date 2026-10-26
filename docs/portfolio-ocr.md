# Screenshot-to-watchlist import

The optional `/api/portfolio/favorites/ocr` endpoint runs local Tesseract OCR.
It does not call chat, vision-language models, or external image services. It
does not add favorites or place orders: the browser requires explicit selection
and confirmation, then uses the existing owner-scoped favorites endpoint.

On Ubuntu, install `tesseract-ocr` and `tesseract-ocr-eng` through apt. Pillow is
already a Python dependency. Tesseract uses its own small trained OCR network;
"no model calls" here means no LLM/VLM inference, not model-free character OCR.

PNG, JPEG, and WebP files are limited to 8 MiB and 12 megapixels. Images are
processed in memory, not persisted. Two concurrent OCR processes are allowed,
with a 15-second timeout and a single OCR thread each. Missing OCR returns 503;
it never falls back to a generative model. OCR text and candidate codes are
unverified: prices, names, and labels can be misread. Candidates are unchecked
by default. Supported code patterns include US tickers/exchange-qualified
symbols, six-digit A-share codes, and explicit/zero-padded Hong Kong codes.
