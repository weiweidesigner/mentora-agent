"""File handoffs and data-integrity checks for deterministic numeric renderers."""
from __future__ import annotations
from collections import Counter
from datetime import datetime
import hashlib
import json
import math
from pathlib import Path
import re

SCRIPTS = {'line_chart.py', 'group_line.py', 'bar_chart.py', 'grouped_bar.py', 'bar_line.py', 'pie.py'}
CONTRACT = {
    'purpose': 'Pass a verified local JSON file directly; the host maps fields and checks rendered values without model transcription.',
    'dataSource': {'path': 'outputs/data/source.json', 'recordsPath': ['series'],
                   'fields': {'date': 'macro_observation_period', 'rate': 'v'},
                   'dateFormats': {'date': '%Y%m%d'}, 'sortBy': 'date'},
    'payload': 'Keep normal renderer fields (xField, series/yField, axes, visualStyle). Omit data/rows when dataSource is used. No scaling or filling is performed.',
    'pieMapping': 'For pie.py map source fields to label/value; nonnegative finite values and positive total required. Missing values must be handled explicitly upstream, never silently zero-filled.',
    'lineOptions': 'xScale=time for irregular ISO dates/epoch ms; visualStyle.line.curve=step-after|step-before|straight|smooth; missingValuePolicy=gap preserves nulls.',
    'receipt': 'chartValidation reports source hash, rows, per-series valid/missing counts, min/max, first/last observations and axis coverage. Verified chart HTML can be passed to StreamViz chart_artifacts without copying data or drawing SVG coordinates.'}


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def local_path(root, value):
    path = Path(value).expanduser()
    path = (root / path if not path.is_absolute() else path).resolve()
    if not path.is_relative_to((root / 'outputs').resolve()):
        raise ValueError('Chart data and artifacts must be under outputs/')
    return path


def _read_option(args, flag):
    return args[args.index(flag) + 1] if flag in args else None


def _series(payload):
    fields = []
    for key in ('series', 'columnSeries', 'lineSeries'):
        for item in payload.get(key, []):
            field = item.get('field') if isinstance(item, dict) else item
            if field and field not in fields:
                fields.append(field)
    if not fields and payload.get('yField'):
        fields.append(payload['yField'])
    return fields


def prepare(script, arguments, root):
    """Return rewritten arguments plus expected records, or no-op for other tools."""
    if script.parent.parent.name != 'generic-chart' or script.name not in SCRIPTS:
        return arguments, None
    raw = _read_option(arguments, '--payload')
    inline = _read_option(arguments, '--data-json')
    if not raw and not inline:
        return arguments, None
    payload = json.loads(local_path(root, raw).read_text()) if raw else json.loads(inline)
    if not isinstance(payload, dict):
        return arguments, None
    # Nested legacy component payloads keep their own contracts.
    if 'component' in payload or 'props' in payload:
        return arguments, None
    source = payload.get('dataSource')
    provenance = {'kind': 'payload'}
    if source is not None:
        if not isinstance(source, dict) or payload.get('data') is not None or payload.get('rows') is not None:
            raise ValueError('Use either dataSource or inline data/rows, not both')
        path = local_path(root, source['path'])
        source_bytes = path.read_bytes()
        document = json.loads(source_bytes)
        value = document
        keys = source.get('recordsPath', [])
        if not isinstance(keys, list):
            raise ValueError('dataSource.recordsPath must be an array of keys')
        for key in keys:
            value = value[key]
        if not isinstance(value, list) or not value or not all(isinstance(row, dict) for row in value):
            raise ValueError('dataSource must select a nonempty array of records')
        mapping = source.get('fields')
        if not isinstance(mapping, dict) or not mapping:
            raise ValueError('dataSource.fields is required')
        rows = []
        for record in value:
            if any(field not in record for field in mapping.values()):
                raise ValueError('A mapped source field is missing; select the exact source fields')
            row = {target: record[field] for target, field in mapping.items()}
            for field, pattern in source.get('dateFormats', {}).items():
                parsed = datetime.strptime(str(row[field]), pattern)
                row[field] = parsed.isoformat(timespec='seconds') if any(token in pattern for token in ('%H', '%I', '%M', '%S', '%f')) else parsed.date().isoformat()
            rows.append(row)
        if source.get('sortBy'):
            rows.sort(key=lambda row: row[source['sortBy']])
        payload = {**payload, 'data': rows}
        payload.pop('dataSource')
        if script.name in {'line_chart.py', 'group_line.py'}:
            payload.setdefault('missingValuePolicy', 'gap')
        provenance = {'kind': 'source-file', 'path': str(path), 'sha256': hashlib.sha256(source_bytes).hexdigest(), 'recordsPath': keys,
                      'fields': mapping, 'source': document.get('source') if isinstance(document, dict) else None}
    rows = payload.get('data', payload.get('rows'))
    fields = ['value'] if script.name == 'pie.py' else _series(payload)
    x = 'label' if script.name == 'pie.py' else payload.get('xField')
    if not isinstance(rows, list) or not x or not fields:
        if source is not None:
            raise ValueError('Provide xField and explicit series or yField for the mapped data')
        return arguments, None
    for row in rows:
        if not isinstance(row, dict) or x not in row or row[x] is None or not isinstance(row[x], (str, int, float)):
            raise ValueError('Every chart row requires a non-null x field')
        for field in fields:
            value = row.get(field)
            if field not in row or (value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value))):
                raise ValueError(f'Numeric chart field {field} must contain finite numbers or null; do not fill or scale implicitly')
    output = local_path(root, _read_option(arguments, '--output'))
    expected = {'rows': rows, 'xField': x, 'fields': fields, 'source': provenance, 'output': output,
                'script': script.name, 'payload': payload}
    if source is not None:
        directory = root / 'outputs/tool-results'
        directory.mkdir(parents=True, exist_ok=True)
        name = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:20]
        normalized = directory / f'chart-input-{name}.json'
        normalized.write_text(json.dumps(payload, ensure_ascii=False, allow_nan=False))
        arguments = list(arguments)
        if raw:
            arguments[arguments.index('--payload') + 1] = str(normalized)
        else:
            # Inline mapping configs are also supported without a second data copy.
            index = arguments.index('--data-json')
            arguments[index:index + 2] = ['--payload', str(normalized)]
    return arguments, expected


def _config(document):
    match = re.search(r'\bconst config\s*=\s*', document)
    if not match:
        raise ValueError('Rendered chart has no deterministic config to verify')
    return json.JSONDecoder().raw_decode(document[match.end():])[0]


def validate(expected):
    path = expected['output']
    config = _config(path.read_text())
    actual = config.get('items') if expected['script'] == 'pie.py' else config.get('data')
    fields = [expected['xField'], *expected['fields']]
    def signature(rows):
        return [tuple(row.get(field) for field in fields) for row in rows]
    wanted = signature(expected['rows'])
    received = signature(actual or [])
    ordered = expected['script'] in {'line_chart.py', 'group_line.py'}
    if (received != wanted if ordered else Counter(received) != Counter(wanted)):
        raise ValueError('Chart validation failed: rendered rows/values differ from input (including missing observations); repair field mapping or missingValuePolicy')
    x = expected['xField']
    scale = config.get('xScale', 'category')
    if scale not in ('category', 'time', 'linear'):
        raise ValueError('xScale must be category, time or linear')
    if scale in ('time', 'linear'):
        try:
            times = [float(row[x]) if scale == 'linear' or isinstance(row[x], (int, float)) else datetime.fromisoformat(str(row[x]).replace('Z', '+00:00')).timestamp()*1000 for row in actual]
        except (ValueError, TypeError, OverflowError):
            raise ValueError('Continuous x-axis values must be valid dates or finite numbers') from None
        if any(not math.isfinite(value) for value in times):
            raise ValueError('Continuous x-axis values must be finite')
        if any(times[i] < times[i-1] for i in range(1, len(times))):
            raise ValueError('Continuous x-axis observations must be sorted; use explicit dataSource.sortBy')
    summary = {}
    definitions = {row['field']: row for key in ('series', 'columnSeries', 'lineSeries') for row in config.get(key, [])}
    for field in expected['fields']:
        valid = [(row[x], row[field]) for row in actual if row.get(field) is not None]
        if not valid:
            raise ValueError(f'Chart field {field} has no usable observations')
        axis_name = definitions.get(field, {}).get('axis', 'right') + 'Axis'
        axis = config.get(axis_name) or config.get('axis') or {}
        minimum, maximum = min(v for _, v in valid), max(v for _, v in valid)
        if expected['script'] == 'pie.py' and (minimum < 0 or sum(v for _, v in valid) <= 0):
            raise ValueError('Pie data must be nonnegative with a positive total')
        if any(isinstance(axis.get(bound), (int, float)) and (axis[bound] > minimum if bound == 'min' else axis[bound] < maximum) for bound in ('min', 'max')):
            raise ValueError(f'Chart axis clips source values for {field}; expand its range')
        summary[field] = {'validCount': len(valid), 'missingCount': len(actual)-len(valid), 'min': minimum,
                          'max': maximum, 'first': dict(x=valid[0][0], value=valid[0][1]), 'last': dict(x=valid[-1][0], value=valid[-1][1])}
    result = {'ok': True, 'renderer': expected['script'], 'checks': ['row-count', 'source-values', 'missingness', 'order' if ordered else 'membership', 'positive-total' if expected['script'] == 'pie.py' else 'axis-coverage'],
              'rowCount': len(actual), 'xField': x, 'xRange': [actual[0][x], actual[-1][x]], 'series': summary,
              'source': expected['source'], 'htmlSha256': digest(path)}
    proof = path.with_suffix('.chart.json')
    proof.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
    return result, proof
