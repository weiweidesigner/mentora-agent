"""Owner-bound QQ proactive destinations, with names and permission from QQ only."""
from concurrent.futures import ThreadPoolExecutor
import json
import threading
import time

from app.qq_channel import IDENTIFIER,QQChannelError


def room_scope(app,target):return json.dumps([app,'groups',target,'@group'])
def destination_id(scope):
    from app.qq_companion import scope_id
    return scope_id(scope)


class GroupDirectory:
    def __init__(self,tasks,clock=None):
        self.tasks=tasks;self.clock=clock or time.time
        with tasks.db() as db:
            db.executescript('''CREATE TABLE IF NOT EXISTS qq_group_directory(
             app TEXT,target TEXT,name TEXT DEFAULT '',active INTEGER DEFAULT 1,allowed INTEGER,
             info_checked REAL DEFAULT 0,state_checked REAL DEFAULT 0,error TEXT DEFAULT '',
             PRIMARY KEY(app,target));
             CREATE TABLE IF NOT EXISTS qq_group_sync_calls(app TEXT,created REAL);''')

    def note(self,app,target,**fields):
        if not isinstance(app,str) or not isinstance(target,str) or not IDENTIFIER.fullmatch(app) or not IDENTIFIER.fullmatch(target):return
        with self.tasks.db() as db:
            db.execute('INSERT OR IGNORE INTO qq_group_directory(app,target) VALUES(?,?)',(app,target))
            if fields:db.execute('UPDATE qq_group_directory SET '+','.join(k+'=?' for k in fields)+' WHERE app=? AND target=?',(*fields.values(),app,target))

    def observe(self,app,event,data):
        if not isinstance(data,dict):return
        target=data.get('group_openid')
        if not isinstance(target,str) or not IDENTIFIER.fullmatch(target):return
        if event not in ('GROUP_ADD_ROBOT','GROUP_DEL_ROBOT','GROUP_MSG_RECEIVE','GROUP_MSG_REJECT','GROUP_AT_MESSAGE_CREATE','GROUP_MESSAGE_CREATE'):return
        fields={}
        if event=='GROUP_DEL_ROBOT':fields.update(active=0,allowed=0,state_checked=self.clock())
        elif event=='GROUP_ADD_ROBOT':fields.update(active=1,allowed=None,state_checked=self.clock())
        elif event in ('GROUP_MSG_RECEIVE','GROUP_MSG_REJECT'):fields.update(active=1,allowed=int(event=='GROUP_MSG_RECEIVE'),state_checked=self.clock())
        name=data.get('group_name')
        if isinstance(name,str) and name.strip():fields.update(name=name.strip()[:120])
        self.note(app,target,**fields)

    def seed(self,owner,app):
        with self.tasks.db() as db:
            rows=list(db.execute('SELECT scope FROM character_links WHERE owner=?',(owner,)))
        for row in rows:
            try:a,kind,target,_=json.loads(row['scope'])
            except (ValueError,TypeError):continue
            if a==app and kind=='groups':self.note(app,target)

    def rows(self,app):
        with self.tasks.db() as db:return [dict(r) for r in db.execute('SELECT * FROM qq_group_directory WHERE app=? ORDER BY target',(app,))]

    def allowed(self,app,target):
        row=next((r for r in self.rows(app) if r['target']==target),None)
        return not row or bool(row['active']) and row['allowed']!=0

    def reserve_call(self,app):
        with self.tasks.db() as db:
            db.execute('BEGIN IMMEDIATE');db.execute('DELETE FROM qq_group_sync_calls WHERE created<?',(self.clock()-60,))
            if db.execute('SELECT count(*) FROM qq_group_sync_calls WHERE app=?',(app,)).fetchone()[0]>=28:return False
            db.execute('INSERT INTO qq_group_sync_calls VALUES(?,?)',(app,self.clock()));return True


def enabled_for(profile,scope,tasks=None):
    try:app,kind,target,sender=json.loads(scope)
    except (ValueError,TypeError):return False
    if kind=='users':return target==sender and profile.get('proactivePrivate',True)
    if kind!='groups' or sender!='@group' or destination_id(scope) not in profile.get('proactiveGroups',[]):return False
    if tasks is None:return True
    with tasks.db() as db:
        if not db.execute("SELECT 1 FROM sqlite_master WHERE name='qq_group_directory'").fetchone():return True
        row=db.execute('SELECT active,allowed FROM qq_group_directory WHERE app=? AND target=?',(app,target)).fetchone()
    return not row or bool(row['active']) and row['allowed']!=0


class ProactiveTargets:
    def __init__(self,tasks,characters,client_factory=None):
        self.tasks=tasks;self.characters=characters;self.directory=GroupDirectory(tasks)
        self.client_factory=client_factory;self.pool=ThreadPoolExecutor(max_workers=1,thread_name_prefix='qq-group-info');self.lock=threading.Lock();self.pending=set();self.stop=threading.Event()

    def listing(self,owner):
        connection=self.characters.qq.row(owner);groups=[];needs_sync=False
        if connection:
            app=connection['app_id'];self.directory.seed(owner,app)
            for i,row in enumerate(self.directory.rows(app),1):
                if row['active'] and (time.time()-row['info_checked']>600 or time.time()-row['state_checked']>600):needs_sync=True
                groups.append({'id':destination_id(room_scope(app,row['target'])),'name':row['name'] or '群聊 '+str(i)+'（名称待同步）',
                               'nameSynced':bool(row['name']),'available':bool(row['active']) and row['allowed']!=0,
                               'permission':'allowed' if row['active'] and row['allowed']==1 else 'denied' if not row['active'] or row['allowed']==0 else 'unknown',
                               'error':row['error']})
        with self.lock:syncing=owner in self.pending
        return {'groups':groups,'syncing':syncing,'needsSync':needs_sync,'connected':bool(connection),
                'notice':'同步机器人已关联群的名称与权限；新群在机器人入群或收到群消息后加入列表。'}

    def sync(self,owner):
        with self.lock:
            if owner in self.pending:return
            self.pending.add(owner)
        self.pool.submit(self.refresh,owner)

    def refresh(self,owner):
        try:
            connection=self.characters.qq.row(owner)
            if not connection:return
            self.directory.seed(owner,connection['app_id'])
            from app.qq_channel import QQClient
            client=(self.client_factory or QQClient)(credentials_provider=lambda:self.characters.qq.credentials(connection['id']))
            for row in self.directory.rows(connection['app_id']):
                if not row['active']:continue
                errors=[]
                for part in ('info','bot_state'):
                    while not self.directory.reserve_call(connection['app_id']):
                        if self.stop.wait(2.2):return
                    if self.stop.is_set():return
                    # A disconnected/replaced bot must never refresh another owner's rooms.
                    current=self.characters.qq.row(owner)
                    if not current or current['id']!=connection['id'] or current['app_id']!=connection['app_id']:return
                    stamp=time.time()
                    try:
                        data=client.group_details(row['target'],part)
                        if part=='info':
                            name=data.get('group_name')
                            if not isinstance(name,str) or not name.strip():raise QQChannelError('群名称未返回')
                            self.directory.note(connection['app_id'],row['target'],name=name.strip()[:120],info_checked=stamp)
                        else:
                            allowed=data.get('allow_proactive_msg')
                            if not isinstance(allowed,bool):raise QQChannelError('群主动权限未返回')
                            with self.tasks.db() as db:db.execute('UPDATE qq_group_directory SET allowed=?,state_checked=? WHERE app=? AND target=? AND state_checked<=?',(int(allowed),stamp,connection['app_id'],row['target'],stamp))
                    except Exception:
                        errors.append('QQ 未返回群名称' if part=='info' else 'QQ 未返回主动发言权限')
                    if self.stop.wait(2.2):return # Both metadata endpoints share a 30 QPM ceiling.
                self.directory.note(connection['app_id'],row['target'],error='；'.join(errors))
        finally:
            with self.lock:self.pending.discard(owner)

    def close(self):
        self.stop.set();self.pool.shutdown(wait=False,cancel_futures=True)
