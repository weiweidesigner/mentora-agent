"""Owner-scoped QQ personas, one-use pairing codes and user reaction images."""
import base64
import hashlib
import io
import json
from pathlib import Path
import re
import secrets
import time

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import FileResponse
from PIL import Image, ImageOps
from pydantic import BaseModel, Field, field_validator
from typing import Literal

from app.chat_sessions import identity
from app.character_prompt import normalize_character_prompt, prompt_fingerprint


class CharacterProfile(BaseModel):
    model_config = {"str_strip_whitespace":True}
    name: str = Field(default='Mentora', min_length=1, max_length=40)
    age: int = Field(default=24, ge=18, le=120)
    gender: Literal['female','male','neutral'] = 'female'
    relationship: Literal['none','daughter','wife','mother','sidekick'] = 'none'
    proactivity: int = Field(default=50, ge=0, le=100)
    proactivePrivate: bool = True
    proactiveGroups: list[str] = Field(default_factory=list,max_length=200)

    personality: str = Field(default='温柔知性', max_length=80)
    role: str = Field(default='可以轻松聊天，也能认真解答问题的陪伴助手', max_length=500)
    agentPrompt: str = Field(default='', max_length=6000)
    responseMode: Literal['auto','voice','text'] = 'auto'
    groupReplyMode: Literal['natural','mentions'] = 'natural'
    paragraph: Literal['minimal','normal','long'] = 'normal'
    stickerProbability: int = Field(default=50, ge=0, le=100)
    stickerIds: list[str] | None = Field(default=None, max_length=160)
    stickerPacks: list[str] = Field(default_factory=lambda:['dafeiyu-companion'], max_length=24)


    @field_validator('proactiveGroups')
    @classmethod
    def validate_proactive_groups(cls,value):
        if any(not re.fullmatch(r'[a-f0-9]{24}',v) for v in value):raise ValueError('群目标无效')
        return list(dict.fromkeys(value))

    @field_validator('responseMode', mode='before')
    @classmethod
    def migrate_random_mode(cls, value):
        return 'auto' if value == 'random' else value


class QQConnectionInput(BaseModel):
    model_config = {"str_strip_whitespace": True}
    appId: str = Field(pattern=r'^[0-9]{5,20}$')
    appSecret: str = Field(default='', max_length=256)
    profile: CharacterProfile | None = None


class QQConnectionStore:
    def __init__(self, tasks):
        self.tasks = tasks
        with tasks.db() as db:
            db.execute('CREATE TABLE IF NOT EXISTS character_qq_connections(id TEXT PRIMARY KEY,owner TEXT UNIQUE,app_id TEXT UNIQUE,secret TEXT,updated REAL)')
            db.execute('CREATE TABLE IF NOT EXISTS character_qq_profiles(connection TEXT PRIMARY KEY,name TEXT,avatar TEXT,fetched REAL)')

    def row(self, owner):
        with self.tasks.db() as db:
            row = db.execute('SELECT * FROM character_qq_connections WHERE owner=?', (owner,)).fetchone()
        return dict(row) if row else None

    def credentials(self, connection):
        from app.qq_channel import QQChannelError
        with self.tasks.db() as db:
            row = db.execute('SELECT * FROM character_qq_connections WHERE id=?', (connection,)).fetchone()
        if not row:
            raise QQChannelError('QQ 连接不存在')
        return row['app_id'], self.tasks.cipher.decrypt(row['secret'].encode()).decode()

    def bot_profile(self, owner):
        with self.tasks.db() as db:
            row=db.execute('SELECT p.* FROM character_qq_profiles p JOIN character_qq_connections c ON c.id=p.connection WHERE c.owner=?',(owner,)).fetchone()
        return dict(row) if row else None

    def refresh_profile(self, owner):
        from app.qq_channel import QQClient
        row=self.row(owner)
        if not row:return
        cached=self.bot_profile(owner)
        if cached and time.time()-cached['fetched']<300:return
        try:
            data=QQClient(credentials_provider=lambda:self.credentials(row['id'])).me()
        except Exception:
            data=cached or {'name':'','avatar':''}
        with self.tasks.db() as db:
            db.execute('INSERT OR REPLACE INTO character_qq_profiles VALUES(?,?,?,?)',(row['id'],data['name'],data['avatar'],time.time()))

    def public(self, owner):
        import os
        row = self.row(owner)
        base = os.getenv('VEYA_PUBLIC_URL', 'https://weiweidesigner.com/mentora/').rstrip('/')
        ready = False
        if row:
            app_id, secret = self.credentials(row['id'])
            ready = app_id == os.getenv('QQ_BOT_APP_ID', '').strip() and secrets.compare_digest(secret, os.getenv('QQ_BOT_APP_SECRET', '').strip())
            if not ready:
                with self.tasks.db() as db:
                    if db.execute("SELECT 1 FROM sqlite_master WHERE name='character_links'").fetchone():
                        for link in db.execute('SELECT scope FROM character_links WHERE owner=?', (owner,)):
                            try:
                                if json.loads(link['scope'])[0] == app_id:
                                    ready = True
                                    break
                            except (ValueError, TypeError, IndexError):
                                continue
        bot=self.bot_profile(owner) or {}
        return {'botName':bot.get('name',''),'avatarUrl':bot.get('avatar',''),'configured': bool(row), 'appId': row['app_id'] if row else '',
                'hasSecret': bool(row), 'ready': ready, 'requiresWebhookSetup': bool(row) and not ready,
                'webhookUrl': base+'/api/qq/webhook/'+row['id'] if row else ''}

    def save(self, owner, payload):
        from app.qq_channel import QQClient
        old = self.row(owner)
        secret = payload.appSecret
        if not secret and old and old['app_id'] == payload.appId:
            secret = self.credentials(old['id'])[1]
        if not secret:
            raise HTTPException(422, '请填写 AppSecret')
        client = QQClient(credentials_provider=lambda: (payload.appId, secret))
        try:
            client.token()
        except Exception:
            raise HTTPException(422, 'QQ 鉴权失败，请检查 AppID 和 AppSecret 后重试') from None
        try:
            bot=client.me()
        except Exception:
            bot=self.bot_profile(owner) if old and old['app_id']==payload.appId else None
        if payload.profile is not None:
            if bot and bot.get('name'):
                payload.profile=payload.profile.model_copy(update={'name':bot['name']})
            payload.profile=CharacterStore(self.tasks).prepare(owner,payload.profile)
        with self.tasks.db() as db:
            existing = db.execute('SELECT owner FROM character_qq_connections WHERE app_id=?', (payload.appId,)).fetchone()
            if existing and existing['owner'] != owner:
                raise HTTPException(409, '此机器人已连接其他角色设置，请使用原浏览器管理')
            connection = old['id'] if old else secrets.token_urlsafe(24)
            encrypted = self.tasks.cipher.encrypt(secret.encode()).decode()
            db.execute('INSERT INTO character_qq_connections VALUES(?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET app_id=excluded.app_id,secret=excluded.secret,updated=excluded.updated',
                       (connection, owner, payload.appId, encrypted, time.time()))
            if bot:
                db.execute('INSERT OR REPLACE INTO character_qq_profiles VALUES(?,?,?,?)',(connection,bot['name'],bot['avatar'],time.time()))
            elif old and old['app_id']!=payload.appId:
                db.execute('DELETE FROM character_qq_profiles WHERE connection=?',(connection,))
            if payload.profile is not None:
                db.execute('INSERT OR REPLACE INTO character_profiles VALUES(?,?,?)', (owner,payload.profile.model_dump_json(),time.time()))
                db.execute('INSERT OR REPLACE INTO character_prompt_versions VALUES(?,?)',(owner,prompt_fingerprint(payload.profile)))
                if db.execute("SELECT 1 FROM sqlite_master WHERE name='qq_voice_preferences'").fetchone():
                    db.execute('DELETE FROM qq_voice_preferences WHERE scope IN (SELECT scope FROM character_links WHERE owner=?)', (owner,))
        self.attach_history(owner)
        return self.public(owner)

    def attach_history(self, owner):
        """Recover authenticated private and per-speaker group history for this bot."""
        connection=self.row(owner)
        if not connection:return
        with self.tasks.db() as db:
            if not all(db.execute("SELECT 1 FROM sqlite_master WHERE name=?",(name,)).fetchone() for name in ("qq_chat_jobs","character_links")):return
            rows=list(db.execute("SELECT DISTINCT scope FROM qq_chat_jobs WHERE state='completed' AND delivered=1"))
            for row in rows:
                try:
                    parts=json.loads(row["scope"])
                    if (len(parts)!=4 or not all(isinstance(x,str) and x for x in parts) or parts[0]!=connection["app_id"]
                            or not (parts[1]=="groups" or parts[1]=="users" and parts[2]==parts[3])):continue
                except (ValueError,TypeError):continue
                db.execute("INSERT OR IGNORE INTO character_links VALUES(?,?)",(row["scope"],owner))

    def attach(self, scope, app_id, secret):
        with self.tasks.db() as db:
            row = db.execute('SELECT * FROM character_qq_connections WHERE app_id=?', (app_id,)).fetchone()
            if row and secrets.compare_digest(self.tasks.cipher.decrypt(row['secret'].encode()).decode(), secret):
                db.execute('INSERT INTO character_links VALUES(?,?) ON CONFLICT(scope) DO UPDATE SET owner=excluded.owner', (scope, row['owner']))


class StickerInput(BaseModel):
    model_config = {"str_strip_whitespace":True}
    label: str = Field(min_length=1,max_length=40)
    description: str = Field(min_length=1,max_length=200)
    data: str = Field(min_length=1,max_length=7_000_000)


class CharacterStore:
    def __init__(self,tasks):
        self.tasks=tasks
        self.qq = QQConnectionStore(tasks)
        self.images=tasks.directory/'character-stickers';self.images.mkdir(exist_ok=True,mode=0o700)
        with tasks.db() as db:
            db.executescript('''CREATE TABLE IF NOT EXISTS character_profiles(owner TEXT PRIMARY KEY,payload TEXT,updated REAL);
            CREATE TABLE IF NOT EXISTS character_prompt_versions(owner TEXT PRIMARY KEY,fingerprint TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS character_links(scope TEXT PRIMARY KEY,owner TEXT);
            CREATE TABLE IF NOT EXISTS character_codes(hash TEXT PRIMARY KEY,owner TEXT,expires REAL);
            CREATE TABLE IF NOT EXISTS character_stickers(id TEXT PRIMARY KEY,owner TEXT,label TEXT,description TEXT,created REAL);''')

    def get(self,owner):
        with self.tasks.db() as db:
            row=db.execute('SELECT payload FROM character_profiles WHERE owner=?',(owner,)).fetchone()
        profile=CharacterProfile.model_validate_json(row['payload']).model_dump() if row else CharacterProfile().model_dump()
        bot=self.qq.bot_profile(owner)
        if bot and bot.get('name'):profile['name']=bot['name']
        return profile

    def prepare(self,owner,profile):
        previous=self.get(owner)
        profile=profile.model_copy(update={key:previous[key] for key in ('proactivePrivate','proactiveGroups') if key not in profile.model_fields_set})
        with self.tasks.db() as db:
            normalized=db.execute('SELECT fingerprint FROM character_prompt_versions WHERE owner=?',(owner,)).fetchone()
        if not normalized or normalized['fingerprint'] != prompt_fingerprint(profile):
            profile=profile.model_copy(update={'agentPrompt':normalize_character_prompt(profile)})
        return profile

    def save(self,owner,profile):
        profile=self.prepare(owner,profile)
        with self.tasks.db() as db:
            db.execute('INSERT OR REPLACE INTO character_profiles VALUES(?,?,?)',(owner,profile.model_dump_json(),time.time()))
            db.execute('INSERT OR REPLACE INTO character_prompt_versions VALUES(?,?)',(owner,prompt_fingerprint(profile)))
            # A newly saved UI preference supersedes an old QQ quick toggle.
            db.execute('DELETE FROM qq_voice_preferences WHERE scope IN (SELECT scope FROM character_links WHERE owner=?)',(owner,)) if db.execute("SELECT 1 FROM sqlite_master WHERE name='qq_voice_preferences'").fetchone() else None
        saved=self.get(owner)
        from app.qq_destinations import enabled_for
        connection=self.qq.row(owner)
        if connection:
            with self.tasks.db() as db:
                exists=db.execute("SELECT 1 FROM sqlite_master WHERE name='qq_companion_outbox'").fetchone()
                planned=list(db.execute("SELECT id,scope FROM qq_companion_outbox WHERE state='planned'")) if exists else []
            for row in planned:
                try:app=json.loads(row['scope'])[0]
                except (ValueError,TypeError):continue
                if app==connection['app_id'] and not enabled_for(saved,row['scope'],self.tasks):
                    with self.tasks.db() as db:db.execute("UPDATE qq_companion_outbox SET state='cancelled',error='已取消此会话的主动联系' WHERE id=? AND state='planned'",(row['id'],))
        return saved

    def owner_for_scope(self,scope):
        with self.tasks.db() as db:row=db.execute('SELECT owner FROM character_links WHERE scope=?',(scope,)).fetchone()
        if row:return row['owner']
        # Synthetic room targets are authorized only through live speaker links
        # belonging to the currently connected bot; they are never stored links.
        try:
            app,kind,target,sender=json.loads(scope)
            if kind!='groups' or sender!='@group':return None
        except (ValueError,TypeError):return None
        with self.tasks.db() as db:
            links=list(db.execute('SELECT l.scope,l.owner FROM character_links l JOIN character_qq_connections c ON c.owner=l.owner WHERE c.app_id=?',(app,)))
        for link in links:
            try:parts=json.loads(link['scope'])
            except (ValueError,TypeError):continue
            if len(parts)==4 and parts[:3]==[app,kind,target] and parts[3]!='@group':return link['owner']
        from app.qq_destinations import GroupDirectory
        if any(r['target']==target and r['active'] for r in GroupDirectory(self.tasks).rows(app)):
            with self.tasks.db() as db:connection=db.execute('SELECT owner FROM character_qq_connections WHERE app_id=?',(app,)).fetchone()
            if connection:return connection['owner']
        return None

    def memory_context(self,scope):
        from app.qq_companion import CompanionMemory
        return CompanionMemory(self.tasks).context(scope)

    def for_scope(self,scope):
        owner=self.owner_for_scope(scope)
        return self.get(owner) if owner else CharacterProfile().model_dump()

    def code(self,owner):
        code=secrets.token_urlsafe(12)
        with self.tasks.db() as db:
            db.execute('DELETE FROM character_codes WHERE expires<? OR owner=?',(time.time(),owner))
            db.execute('INSERT INTO character_codes VALUES(?,?,?)',(hashlib.sha256(code.encode()).hexdigest(),owner,time.time()+600))
        return {'command':'绑定角色 '+code,'expiresIn':600}

    def bind(self,scope,code):
        with self.tasks.db() as db:
            db.execute('BEGIN IMMEDIATE')
            row=db.execute('SELECT * FROM character_codes WHERE hash=? AND expires>?',(hashlib.sha256(code.encode()).hexdigest(),time.time())).fetchone()
            if not row:return '绑定码无效或已过期，请在角色定制页重新生成。'
            db.execute('INSERT OR REPLACE INTO character_links VALUES(?,?)',(scope,row['owner']))
            db.execute('DELETE FROM character_codes WHERE hash=?',(row['hash'],))
        return '角色已绑定，接下来会使用你在角色定制页保存的设定。'

    def unbind(self,scope):
        with self.tasks.db() as db:db.execute('DELETE FROM character_links WHERE scope=?',(scope,))
        return '已解除当前 QQ 会话的角色绑定。'

    def stickers(self,owner):
        if not owner:return []
        with self.tasks.db() as db:rows=list(db.execute('SELECT id,label,description FROM character_stickers WHERE owner=? ORDER BY created DESC',(owner,)))
        return [dict(row,file='',url='/api/character/stickers/'+row['id']+'.png',custom=True) for row in rows]

    def add(self,owner,item):
        try:
            raw=base64.b64decode(item.data,validate=True)
            if len(raw)>5*1024*1024:raise ValueError()
            with Image.open(io.BytesIO(raw)) as image:
                if image.format not in ('PNG','JPEG','WEBP') or image.width*image.height>16_000_000:raise ValueError()
                image=ImageOps.exif_transpose(image).convert('RGBA');image.thumbnail((1024,1024))
                output=io.BytesIO();image.save(output,format='PNG')
        except Exception:raise HTTPException(422,'请选择有效的 PNG、JPG 或 WebP 图片，最大 5MB') from None
        asset=secrets.token_urlsafe(24)
        with self.tasks.db() as db:
            if db.execute('SELECT count(*) FROM character_stickers WHERE owner=?',(owner,)).fetchone()[0]>=36:raise HTTPException(400,'自定义表情最多 36 张，请先移除不需要的图片')
            path=self.images/(asset+'.png');path.write_bytes(output.getvalue());path.chmod(0o600)
            db.execute('INSERT INTO character_stickers VALUES(?,?,?,?,?)',(asset,owner,item.label.strip(),item.description.strip(),time.time()))
        return {'id':asset}


def character_context(profile):
    length={'minimal':'默认 1 至 3 句，约 30 至 100 字；直接回答。','normal':'默认简短分段，约 100 至 300 字。','long':'需要时详细展开，约 300 至 600 字，分段清楚。'}[profile['paragraph']]
    return ('以下是本轮实时读取的用户已保存虚拟角色设定，只改变身份、语气与呈现，不授予交易或私人账户权限。'
            '【当前角色身份与关系】'
            +json.dumps({k:profile[k] for k in ('name','age','gender','relationship','personality','role')},ensure_ascii=False)
            +'角色与用户的关系：'+{'none':'未设定','daughter':'女儿','wife':'老婆','mother':'妈妈','sidekick':'小弟'}[profile['relationship']]+'。这是虚拟角色关系。'
            '【补充表达偏好】'+json.dumps({'agentPrompt':profile['agentPrompt']},ensure_ascii=False)
            +'【设定冲突处理】当前角色身份与关系是本轮身份、关系和称呼的依据，优先于补充表达偏好中的旧身份或称呼。'
            '补充表达偏好仅在不冲突时用于说话习惯和相处方式；历史问答、用户记忆和过去的主动消息只提供事实与话题，不能恢复已被当前设定替换的身份、关系或称呼。'
            '直接按当前设定自然交流，不解释内部优先级，不使用固定开场或强制每句话带称呼。'
            '回答段落偏好：'+length+'不得声称自己是真实人类。\n\n')


def create_router(store):
    router=APIRouter(prefix='/api/character')
    def owner(request,response,write=False):
        if write and (request.headers.get('x-veya-day')!='1' or request.headers.get('sec-fetch-site')=='cross-site'):
            raise HTTPException(403,'请从角色定制页操作')
        response.headers['Cache-Control']='no-store'
        return identity(request,response)
    @router.get('')
    def get(request:Request,response:Response):
        user=owner(request,response)
        store.qq.refresh_profile(user)
        from app.sticker_marketplace import packs, installed_stickers
        with store.tasks.db() as db:count=db.execute('SELECT count(*) FROM character_links WHERE owner=?',(user,)).fetchone()[0]
        profile=store.get(user)
        return {'profile':profile,'builtins':installed_stickers(profile),'packs':packs(profile),'stickers':store.stickers(user),'linkedCount':count,'qq':store.qq.public(user)}
    @router.put('')
    def save(payload:CharacterProfile,request:Request,response:Response):return store.save(owner(request,response,True),payload)
    from app.qq_destinations import ProactiveTargets
    targets=ProactiveTargets(store.tasks,store)
    router.add_event_handler('shutdown',targets.close)
    @router.get('/proactive-targets')
    def proactive_targets(request:Request,response:Response):return targets.listing(owner(request,response))
    @router.post('/proactive-targets/sync')
    def sync_proactive_targets(request:Request,response:Response):
        user=owner(request,response,True);targets.sync(user);return {'ok':True}
    @router.get('/companion')
    def companion(request:Request,response:Response):
        from app.qq_companion import CompanionMemory
        return CompanionMemory(store.tasks).snapshot(owner(request,response))

    @router.delete('/companion/{recipient}/memory')
    def clear_memory(recipient:str,request:Request,response:Response):
        from app.qq_companion import CompanionMemory,scope_id
        memory=CompanionMemory(store.tasks)
        scopes=memory.scopes(owner(request,response,True))
        scope=next((s for s in scopes if scope_id(s)==recipient),None)
        if not scope:raise HTTPException(404,'QQ 会话不存在')
        memory.clear(scope)
        return {'ok':True}

    @router.get('/sticker-packs/{pack_id}')
    def pack_detail(pack_id:str,request:Request,response:Response):
        user=owner(request,response)
        from app.sticker_marketplace import catalog,packs
        pack=next((p for p in packs(store.get(user)) if p['id']==pack_id),None)
        if not pack:raise HTTPException(404,'表情包不存在')
        return {**pack,'items':[x for x in catalog() if x['packId']==pack_id]}

    def change_pack(pack_id,request,response,enabled):
        user=owner(request,response,True)
        from app.sticker_marketplace import catalog,packs
        profile=store.get(user)
        if pack_id not in {p['id'] for p in packs(profile)}:raise HTTPException(404,'表情包不存在')
        members=[x['id'] for x in catalog() if x['packId']==pack_id]
        if enabled:
            if pack_id not in profile['stickerPacks']:profile['stickerPacks'].append(pack_id)
            if profile['stickerIds'] is not None:profile['stickerIds']=list(dict.fromkeys(profile['stickerIds']+members))
        else:
            profile['stickerPacks']=[p for p in profile['stickerPacks'] if p!=pack_id]
            if profile['stickerIds'] is not None:profile['stickerIds']=[i for i in profile['stickerIds'] if i not in members]
        store.save(user,CharacterProfile(**profile))
        return {'ok':True}

    @router.post('/sticker-packs/{pack_id}')
    def install_pack(pack_id:str,request:Request,response:Response):return change_pack(pack_id,request,response,True)

    @router.delete('/sticker-packs/{pack_id}')
    def remove_pack(pack_id:str,request:Request,response:Response):return change_pack(pack_id,request,response,False)

    @router.get('/qq/secret')
    def saved_qq_secret(request:Request,response:Response):
        user=owner(request,response,True)
        row=store.qq.row(user)
        if not row:raise HTTPException(404,'尚未保存 QQ 连接')
        response.headers['Pragma']='no-cache'
        response.headers['Vary']='Cookie'
        return {'appSecret':store.qq.credentials(row['id'])[1]}

    @router.put('/qq')
    def save_qq(payload:QQConnectionInput,request:Request,response:Response):
        user=owner(request,response,True)
        return {**store.qq.save(user,payload),'profile':store.get(user)}
    @router.post('/link-code')
    def code(request:Request,response:Response):return store.code(owner(request,response,True))
    @router.post('/stickers')
    async def upload(request:Request,response:Response):
        user=owner(request,response,True)
        body=bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body)>7_100_000:raise HTTPException(413,'图片过大，最大 5MB')
        try:item=StickerInput.model_validate_json(body)
        except ValueError:raise HTTPException(422,'请填写表情名称、使用场景和有效图片') from None
        return store.add(user,item)
    @router.get('/stickers/{filename}')
    def image(filename:str):
        if not re.fullmatch(r'[A-Za-z0-9_-]{32}\.png',filename):raise HTTPException(404,'表情不存在')
        with store.tasks.db() as db:row=db.execute('SELECT id FROM character_stickers WHERE id=?',(filename[:-4],)).fetchone()
        path=store.images/filename
        if not row or not path.is_file():raise HTTPException(404,'表情不存在')
        return FileResponse(path,media_type='image/png',headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
    @router.delete('/stickers/{asset}')
    def delete(asset:str,request:Request,response:Response):
        user=owner(request,response,True)
        with store.tasks.db() as db:
            row=db.execute('SELECT id FROM character_stickers WHERE id=? AND owner=?',(asset,user)).fetchone()
            if not row:raise HTTPException(404,'表情不存在')
            db.execute('DELETE FROM character_stickers WHERE id=?',(asset,))
        (store.images/(asset+'.png')).unlink(missing_ok=True)
        return {'ok':True}
    return router
