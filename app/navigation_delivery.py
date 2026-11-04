"""Verify navigation delivery without selecting a destination for the model."""
import json
import re

SCRIPTS = {'ainvest_web_entry.py', 'ainvest_ios_entry.py', 'ainvest_android_entry.py'}


def card_value(value):
    if not isinstance(value, dict) or set(value) != {'title', 'icon', 'url'}:
        return None
    if not all(isinstance(value[k], str) and value[k].strip() for k in value):
        return None
    return value


def navigation_receipt(value):
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            return None
    if not isinstance(value, dict) or value.get('ok') is not True:
        return None
    if value.get('script') not in SCRIPTS or value.get('exitCode') != 0:
        return None
    return card_value(value.get('observation'))


def _selected_navigation(answer, candidates):
    if not isinstance(answer, str):
        return None
    # Keep legacy bare-object replies, and accept renderable JSON fences
    # surrounded by the model's explanation. Never choose a tool candidate here.
    stripped = answer.strip()
    try:
        raw = card_value(json.loads(stripped))
    except ValueError:
        raw = None
    start = answer.find(stripped)
    blocks = [(raw, start, start + len(stripped), False)] if raw else []
    if not blocks:
        for fence in re.finditer(r'^```(?:json)?[ \t]*\r?\n([\s\S]*?)^```[ \t]*(?=\r?$)', answer, re.MULTILINE | re.IGNORECASE):
            try:
                card = card_value(json.loads(fence[1]))
            except ValueError:
                continue
            if card is not None:
                blocks.append((card, fence.start(), fence.end(), True))
    if not blocks:
        return None
    selections = []
    for card, start, end, fenced in blocks:
        matches = [item for item in candidates if item['url'] == card['url']]
        if not matches or not all(item == matches[0] for item in matches):
            return None
        selections.append((matches[0], start, end, fenced, card))
    return selections


def canonical_navigation(answer, candidates):
    selection = _selected_navigation(answer, candidates)
    return selection[0][0] if selection else None


def canonical_navigation_answer(answer, candidates):
    selection = _selected_navigation(answer, candidates)
    if selection is None:
        return None
    for card, start, end, fenced, original in reversed(selection):
        if card == original:
            continue  # Preserve formatting and the already displayed snapshot.
        text = json.dumps(card, ensure_ascii=False)
        if fenced:
            text = '```json\n' + text + '\n```'
        answer = answer[:start] + text + answer[end:]
    return answer


def settle_navigation_answer(stream, answer, candidates):
    """Canonicalize selected cards in their existing public answer blocks."""
    clean = stream.clean_answer(answer)
    canonical = canonical_navigation_answer(clean, candidates)
    if canonical is None:
        return answer, []
    events = []
    for key, text in list(stream.public_blocks.items()):
        if key in stream.progress_keys:
            continue
        updated = canonical_navigation_answer(text, candidates)
        if updated is None or updated == text:
            continue
        stream.public_blocks[key] = updated
        if key in stream.emitted_texts:
            stream.emitted_texts[key] = updated
            events.append(('answer_text', dict(blockId=key, text=updated,
                                              replace=True, live=True, final=False)))
    return canonical, events


def delivered_navigation(answer, candidates):
    return canonical_navigation(answer, candidates) is not None
