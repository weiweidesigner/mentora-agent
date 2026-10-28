# Export font fallback

Noto Sans SC variable font (weights 100–900), distributed under the SIL Open Font License in `NotoSansSC-OFL.txt`.
Source: https://github.com/google/fonts/tree/main/ofl/notosanssc

`NotoSansSC-VF.woff2` is the upstream `NotoSansSC[wght].ttf` converted losslessly to WOFF2 with fontTools (no glyph subsetting). Native fonts remain first in the UI font stack; the bundled font supplies Chinese glyphs when the screenshot server lacks those fonts. It is served locally, so exporting does not require a third-party font service.
