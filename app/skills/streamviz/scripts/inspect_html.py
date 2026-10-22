#!/usr/bin/env python3
"""Inspect a local HTML artifact across viewports/themes in one browser launch.

This reports runtime/layout evidence, not analytical or visual correctness.
It never edits the input or decides whether the agent should revise it.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import time
from pathlib import Path


MEASURE = r"""() => {
  const root = document.documentElement;
  const clipped = [];
  let clippedCount = 0;
  for (const el of document.body?.querySelectorAll('*') || []) {
    if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const css = getComputedStyle(el), box = el.getBoundingClientRect();
    if (!box.width || !box.height || css.visibility === 'hidden' || css.display === 'none') continue;
    // Screen-reader-only labels are intentionally clipped, not broken text.
    if (box.width <= 2 && box.height <= 2 && /absolute|fixed/.test(css.position) &&
        (css.clip !== 'auto' || css.clipPath !== 'none')) continue;
    // Explicit ellipsis and scroll containers are intentional layout choices.
    if (css.textOverflow === 'ellipsis' || /auto|scroll/.test(css.overflowX)) continue;
    if (el.scrollWidth > el.clientWidth + 2 && /hidden|clip/.test(css.overflowX)) {
      clippedCount++;
      if (clipped.length < 12) clipped.push({
        selector: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
          [...el.classList].slice(0, 3).map(c => '.' + c).join(''),
        text: el.textContent.trim().slice(0, 70),
        width: Math.round(box.width), contentWidth: el.scrollWidth
      });
    }
  }
  return {
    viewportWidth: innerWidth, pageWidth: Math.max(root.scrollWidth, document.body?.scrollWidth || 0),
    pageHeight: Math.max(root.scrollHeight, document.body?.scrollHeight || 0),
    theme: root.dataset.theme || '', styleSheetCount: document.styleSheets.length,
    visibleTextCharacters: (document.body?.innerText || '').trim().length,
    graphicsCount: document.querySelectorAll('svg,canvas,img,iframe,video').length,
    clippedTextCount: clippedCount, clippedText: clipped
  };
}"""


async def inspect_html(path: Path, *, widths=(320, 390, 1000), themes=('light', 'dark'),
                       screenshots_dir: Path | None = None, timeout_ms=10000,
                       case_timeout_seconds=18) -> dict:
    path = path.expanduser().resolve(strict=True)
    if not path.is_file() or not path.stat().st_size:
        raise ValueError('HTML input must be a nonempty local file')
    widths = tuple(dict.fromkeys(int(w) for w in widths))
    themes = tuple(dict.fromkeys(themes))
    if not widths or any(w < 240 or w > 4000 for w in widths):
        raise ValueError('Viewport widths must be between 240 and 4000')
    if not themes or any(theme not in {'light', 'dark'} for theme in themes):
        raise ValueError('Themes must be light or dark')
    if screenshots_dir:
        screenshots_dir = screenshots_dir.expanduser().resolve()
        screenshots_dir.mkdir(parents=True, exist_ok=True)
    from playwright.async_api import async_playwright

    started = time.monotonic()
    # Chromium can deadlock when several full-page captures share one headless
    # process on a small production host. Reusing one browser sequentially is
    # still much faster than launching one browser per viewport and stays bounded.
    semaphore = asyncio.Semaphore(1)
    async with async_playwright() as playwright:
        browser = await asyncio.wait_for(playwright.chromium.launch(headless=True), timeout=10)

        async def sample(width, theme):
            async with semaphore:
                case = {'width': width, 'theme': theme, 'errors': [], 'warnings': []}
                context = None

                async def inspect_case():
                    nonlocal context
                    context = await browser.new_context(viewport={'width': width, 'height': 900}, color_scheme=theme)
                    page = await context.new_page()
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)[:300]))
                    # Artifacts run in an iframe in the product. Opening one as the
                    # top-level page can make host-theme observers watch themselves
                    # and spin forever, which is both inaccurate and very slow.
                    artifact_url = path.as_uri() + '?theme=' + theme
                    host_url = path.as_uri() + '?inspect-host=' + theme
                    host_html = (
                        '<!doctype html><html><body style="margin:0">'
                        f'<iframe id="artifact" src="{artifact_url}" '
                        'style="display:block;width:100%;height:900px;border:0"></iframe>'
                        '</body></html>'
                    )
                    await page.route(
                        host_url,
                        lambda route: route.fulfill(status=200, content_type='text/html', body=host_html),
                    )
                    await page.goto(host_url, wait_until='load', timeout=timeout_ms)
                    frame_element = await page.wait_for_selector('#artifact', timeout=timeout_ms)
                    frame = await frame_element.content_frame()
                    if frame is None:
                        raise RuntimeError('Artifact iframe did not initialize')
                    await frame.wait_for_load_state('load', timeout=timeout_ms)
                    await page.evaluate("""theme => {
                      document.documentElement.dataset.theme = theme;
                      document.documentElement.style.colorScheme = theme;
                      document.body?.setAttribute('data-theme', theme);
                      for (const el of [document.documentElement, document.body].filter(Boolean)) {
                        el.classList.remove('theme-light', 'theme-dark'); el.classList.add('theme-' + theme);
                      }
                    }""", theme)
                    await frame.evaluate("""async theme => {
                      document.documentElement.dataset.theme = theme;
                      document.documentElement.style.colorScheme = theme;
                      document.body?.setAttribute('data-theme', theme);
                      for (const el of [document.documentElement, document.body].filter(Boolean)) {
                        el.classList.remove('theme-light', 'theme-dark'); el.classList.add('theme-' + theme);
                      }
                      await Promise.race([
                        document.fonts.ready,
                        new Promise(resolve => setTimeout(resolve, 1500))
                      ]);
                      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                    }""", theme)
                    measurements = await frame.evaluate(MEASURE)
                    case['measurements'] = measurements
                    if measurements['pageWidth'] > width + 2:
                        case['errors'].append({'code': 'page-overflow', 'pixels': measurements['pageWidth'] - width})
                    if not measurements['visibleTextCharacters'] and not measurements['graphicsCount']:
                        case['errors'].append({'code': 'empty-page'})
                    if measurements['clippedTextCount']:
                        case['warnings'].append({'code': 'clipped-text', 'count': measurements['clippedTextCount'],
                                                 'examples': measurements['clippedText']})
                    if screenshots_dir:
                        # Emulate the host's surface without modifying the artifact on disk.
                        await frame.add_style_tag(content='html{background:var(--sv-surface-primary,Canvas)!important}')
                        await page.eval_on_selector(
                            '#artifact', '(el, height) => el.style.height = `${height}px`',
                            measurements['pageHeight'],
                        )
                        image = screenshots_dir / f'{path.stem}-{theme}-{width}.png'
                        await page.screenshot(path=str(image), full_page=True, animations='disabled', timeout=timeout_ms)
                        case['screenshot'] = str(image)
                    case['errors'].extend({'code': 'javascript-error', 'message': error} for error in errors)

                try:
                    await asyncio.wait_for(inspect_case(), timeout=case_timeout_seconds)
                except asyncio.TimeoutError:
                    case['errors'].append({'code': 'inspection-timeout',
                                           'message': f'Viewport inspection exceeded {case_timeout_seconds}s'})
                except Exception as exc:
                    case['errors'].append({'code': 'inspection-error', 'message': str(exc)[:300]})
                finally:
                    if context is not None:
                        try:
                            await asyncio.wait_for(context.close(), timeout=2)
                        except (asyncio.TimeoutError, Exception):
                            pass
                return case

        try:
            cases = await asyncio.wait_for(
                asyncio.gather(*(sample(width, theme) for theme in themes for width in widths)),
                timeout=45,
            )
        except asyncio.TimeoutError:
            cases = [{'width': width, 'theme': theme,
                      'errors': [{'code': 'inspection-timeout', 'message': 'Batch inspection exceeded 45s'}],
                      'warnings': []}
                     for theme in themes for width in widths]
        finally:
            try:
                await asyncio.wait_for(browser.close(), timeout=3)
            except (asyncio.TimeoutError, Exception):
                pass
    return {'ok': all(not case['errors'] for case in cases), 'available': True,
            'scope': 'runtime-and-layout-only', 'input': str(path),
            'elapsedSeconds': round(time.monotonic() - started, 3), 'cases': cases}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--output', type=Path, help='Optional JSON evidence report')
    parser.add_argument('--screenshots-dir', type=Path, help='Optional screenshots for all sampled cases')
    parser.add_argument('--widths', type=int, nargs='+', default=[320, 390, 1000])
    parser.add_argument('--themes', choices=['light', 'dark'], nargs='+', default=['light', 'dark'])
    args = parser.parse_args()
    if args.output and args.output.expanduser().resolve() == args.input.expanduser().resolve():
        parser.error('--output must differ from --input')
    try:
        result = asyncio.run(inspect_html(args.input, widths=args.widths, themes=args.themes,
                                          screenshots_dir=args.screenshots_dir))
    except Exception as exc:
        result = {'ok': False, 'available': False, 'error': str(exc)[:400]}
    serialized = json.dumps(result, ensure_ascii=False)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(serialized, encoding='utf-8')
    print(serialized)
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
