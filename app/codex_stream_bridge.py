"""Adapt Codex app-server public deltas to the existing runner event contract.

Stdout is JSON event transport only. Private reasoning notifications are ignored.
The wrapper shares its parent's process group so cancellation kills descendants.
"""
import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading
import time


def launch_options(argv):
    binary,*args=argv;options=[];model=None;resume=None;images=[];cwd=os.getcwd()
    index=0;resuming=False
    while index<len(args):
        arg=args[index];index+=1
        if arg in {'--config','-c','--enable','--disable'}:
            options.extend([arg,args[index]]);index+=1
        elif arg in {'--model','-m'}:model=args[index];index+=1
        elif arg in {'--image','-i'}:images.append(args[index]);index+=1
        elif arg in {'-C','--cd'}:cwd=args[index];index+=1
        elif arg in {'--sandbox','-s'}:
            if args[index]!='workspace-write':raise ValueError('Unsupported sandbox policy')
            index+=1
        elif arg=='resume':resuming=True
        elif arg in {'exec','--json','--skip-git-repo-check','--ignore-user-config','-'}:continue
        elif resuming and not arg.startswith('-'):resume=arg;resuming=False
        else:raise ValueError('Unsupported Codex runner option: '+arg)
    return [binary,'app-server',*options,'--listen','stdio://'],dict(model=model,resume=resume,images=images,cwd=cwd)


def normalized_item(item):
    kind=item.get('type')
    names={'agentMessage':'agent_message','commandExecution':'command_execution','fileChange':'file_change','mcpToolCall':'mcp_tool_call','webSearch':'web_search','dynamicToolCall':'dynamic_tool_call'}
    if kind not in names:return None
    result=dict(item,type=names[kind])
    if kind=='agentMessage':result['channel']=item.get('phase') or 'final'
    for source,target in [('aggregatedOutput','aggregated_output'),('exitCode','exit_code')]:
        if source in item:result[target]=item[source]
    if kind=='commandExecution' and item.get('exitCode') not in {None,0}:result['status']='failed'
    return result


def run(argv,prompt,emit):
    command,settings=launch_options(argv)
    process=subprocess.Popen(command,cwd=settings['cwd'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=sys.stderr,text=True,encoding='utf-8',bufsize=1)
    inbox=queue.Queue()
    def read():
        try:
            for line in process.stdout:
                try:inbox.put(json.loads(line))
                except json.JSONDecodeError:continue
        finally:inbox.put(None)
    threading.Thread(target=read,daemon=True).start()
    deadline=time.monotonic()+max(1,float(os.getenv('AICHART_CODEX_RUN_TIMEOUT_SECONDS','1200')))
    def send(value):
        process.stdin.write(json.dumps(value,ensure_ascii=False)+'\n');process.stdin.flush()
    def request(number,method,params):send(dict(id=number,method=method,params=params))
    thread_id=None
    try:
        request(1,'initialize',dict(clientInfo=dict(name='mentora',title='Mentora',version='1'),capabilities=dict(experimentalApi=True)))
        while True:
            remaining=deadline-time.monotonic()
            if remaining<=0:raise TimeoutError('Codex 执行超时')
            try:event=inbox.get(timeout=min(remaining,1))
            except queue.Empty:continue
            if event is None:raise RuntimeError('Codex 流连接提前结束')
            method=event.get('method');params=event.get('params') or {}
            if 'id' in event and not method:
                if event.get('error'):raise RuntimeError(str(event['error'].get('message') or 'Codex RPC failed'))
                if event['id']==1:
                    send(dict(method='initialized',params={}))
                    config=dict(cwd=settings['cwd'],approvalPolicy='never',sandbox='workspace-write')
                    if settings['model']:config['model']=settings['model']
                    if settings['resume']:config['threadId']=settings['resume']
                    request(2,'thread/resume' if settings['resume'] else 'thread/start',config)
                elif event['id']==2:
                    thread_id=event['result']['thread']['id']
                    emit(dict(type='thread.started',thread_id=thread_id))
                    inputs=[dict(type='text',text=prompt)]+[dict(type='localImage',path=str(Path(path).resolve())) for path in settings['images']]
                    request(3,'turn/start',dict(threadId=thread_id,input=inputs,cwd=settings['cwd'],approvalPolicy='never',sandboxPolicy=dict(type='workspaceWrite',writableRoots=[settings['cwd']],networkAccess=os.getenv('AICHART_CODEX_NETWORK_ACCESS','true').lower() not in {'false','0','no'})))
                continue
            if 'id' in event:
                # Permission or human-input requests must never be auto-approved.
                send(dict(id=event['id'],error=dict(code=-32000,message='Interactive requests are not available in this runner')))
                continue
            if params.get('threadId') not in {None,thread_id}:continue
            if method=='item/agentMessage/delta':
                emit(dict(type='agent_message.delta',item=dict(id=params['itemId'],delta=params.get('delta',''))))
            elif method in {'item/started','item/completed'}:
                source=params.get('item') or {}
                if source.get('type')=='reasoning':
                    emit(dict(type='model_activity',phase='started' if method=='item/started' else 'completed'))
                    continue
                item=normalized_item(source)
                if item:emit(dict(type=method.replace('/','.'),item=item))
            elif method=='turn/started':emit(dict(type='model_activity',phase='started'))
            elif method=='turn/completed':
                turn=params.get('turn') or {}
                emit(dict(type='model_activity',phase='completed'))
                if turn.get('status')!='completed':raise RuntimeError((turn.get('error') or {}).get('message') or 'Codex 未完成本轮任务')
                return
    finally:
        if process.poll() is None:
            process.terminate()
            try:process.wait(timeout=5)
            except subprocess.TimeoutExpired:process.kill();process.wait(timeout=5)
        process.stdin.close();process.stdout.close()


def main():
    def emit(event):print(json.dumps(event,ensure_ascii=False),flush=True)
    try:run(sys.argv[1:],sys.stdin.read(),emit)
    except Exception as error:
        emit(dict(type='turn.failed',error=dict(message=str(error))))
        return 1
    return 0


if __name__=='__main__':sys.exit(main())
