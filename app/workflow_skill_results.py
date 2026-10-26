"""Verify Skill execution identities and hand structured CLI data to graph nodes."""
import json
from pathlib import Path
import re
import shlex
import time


def _commands(value):
    if isinstance(value, dict):
        for key in ('command', 'cmd', 'params', 'args', 'shellCommand', 'input'):
            if key in value: yield from _commands(value[key])
    elif isinstance(value, list):
        if value and all(isinstance(v, str) for v in value): yield ' '.join(shlex.quote(v) for v in value)
        for item in value: yield from _commands(item)
    elif isinstance(value, str):
        try: parsed=json.loads(value)
        except (ValueError, TypeError): yield value
        else:
            if isinstance(parsed,(dict,list)):yield from _commands(parsed)


def _segments(command):
    try:
        lexer=shlex.shlex(command,posix=True,punctuation_chars=';&|');lexer.whitespace_split=True
        tokens=list(lexer)
    except ValueError:return
    if tokens and Path(tokens[0]).name in ('bash','sh','zsh'):
        for index,token in enumerate(tokens[:-1]):
            if token in ('-c','-lc'):yield from _segments(tokens[index+1]);return
    segment=[]
    for token in [*tokens,';']:
        if token and all(c in ';&|' for c in token):
            if segment:yield segment;segment=[]
        else:segment.append(token)


class SkillResults:
    def __init__(self, tool, root):
        self.tool,self.root,self.started=tool,Path(root),time.time()
        self.events=[];self.commands=[]
        self.scripts=set(tool.get('receiptScripts') or [])
        if str(tool['script']).endswith('.py'):self.scripts.add(Path(tool['script']).name)

    def script_matches(self, path):
        value=str(path)
        return Path(value).name in self.scripts or (
            str(self.tool['script']).endswith('/') and str(self.tool['script'])+'scripts/' in value and value.endswith('.py'))

    def capture(self, event):
        phase=event.get('phase') or event.get('status')
        if phase not in ('completed','success') or event.get('error') or event.get('exitCode',0)!=0 or event.get('status') in ('failed','error'):return
        observation=event.get('observation')
        if isinstance(observation,str):
            # A failed CLI receipt can precede a truncated, large observation.
            if re.search(r'^\s*\{\s*"ok"\s*:\s*false\b',observation):return
        receipt=observation if isinstance(observation,dict) else None
        if isinstance(observation,str):
            try:receipt=json.loads(observation)
            except ValueError:pass
        if isinstance(receipt,dict) and (receipt.get('ok') is False or receipt.get('exitCode',0)!=0):return
        matched=event.get('skillId')==self.tool['id'] or self.script_matches(event.get('script',''))
        for command in _commands(event):
            for tokens in _segments(command):
                for index,token in enumerate(tokens[:-1]):
                    if not re.fullmatch(r'python(?:\d+(?:\.\d+)*)?',Path(token).name):continue
                    tail=tokens[index+1:];script=next((t for t in tail if not t.startswith('-')),'')
                    direct=self.script_matches(script)
                    wrapped=False
                    if Path(script).name=='skill_runner.py' and 'execute' in tail:
                        wrapped=any(t=='--script' and i+1<len(tail) and self.script_matches(tail[i+1]) for i,t in enumerate(tail))
                    if direct or wrapped:
                        matched=True;self.commands.append(tokens)
        if matched:self.events.append(event)

    def result(self, value, *, structured=False):
        if not self.events:
            raise RuntimeError('未收到 '+self.tool['label']+' 的真实工具调用回执，请检查节点指令')
        if not structured:return value
        paths=[]
        for tokens in self.commands:
            for flag in ('--payload-output','--output'):
                for index,token in enumerate(tokens):
                    if token==flag and index+1<len(tokens):paths.append(tokens[index+1])
                    elif token.startswith(flag+'='):paths.append(token.split('=',1)[1])
        for event in self.events:
            try:
                receipt=event.get('observation');receipt=json.loads(receipt) if isinstance(receipt,str) else receipt
                if isinstance(receipt,dict) and receipt.get('ok') is True:
                    paths.extend(item['path'] for item in receipt.get('dataHandoffs',[]) if isinstance(item,dict) and item.get('path'))
                    paths.extend(item['path'] for item in receipt.get('artifacts',[]) if isinstance(item,dict) and item.get('path') and item.get('verified') is True)
            except (ValueError,TypeError):pass
        output_root=(self.root/'outputs').resolve()
        for raw in reversed(paths):
            if not isinstance(raw,str):continue
            path=Path(raw);path=(path if path.is_absolute() else self.root/path).resolve()
            if not path.is_relative_to(output_root) or path.suffix.lower()!='.json':continue
            try:
                stat=path.stat()
                if stat.st_mtime+1<self.started or stat.st_size>2_000_000:continue
                payload=json.loads(path.read_text(encoding='utf-8'))
            except (OSError,ValueError,UnicodeError):continue
            if not isinstance(payload,list) or any(not isinstance(item,dict) for item in payload):continue
            return {**value,'items':payload,'count':len(payload),'text':json.dumps(payload,ensure_ascii=False),
                    'outputSource':'verified-skill-json','dataHandoffs':[dict(path=str(path),bytes=stat.st_size)]}
        raise RuntimeError('资讯工具未返回本次执行的有效 JSON 条目文件；请按 Skill 契约使用 --output，不得用模型摘要代替原文')
