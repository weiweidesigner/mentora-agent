"""Same-origin relay into the paired Mac's physical-device-only tunnel."""
from fastapi import APIRouter,Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
import requests
router=APIRouter(prefix='/api/device-navigation')
@router.post('/open')
async def open_device(request:Request):
 token=request.headers.get('X-Mentora-Device-Token','')
 if not 16<=len(token)<=200:return JSONResponse({'error':'此浏览器尚未配对这台 Mac，请从已配对的浏览器打开 Mentora。'},status_code=401)
 if request.headers.get('sec-fetch-site')=='cross-site':return JSONResponse({'error':'Invalid origin'},status_code=403)
 raw=await request.body()
 if len(raw)>8192:return JSONResponse({'error':'链接过长'},status_code=413)
 try:data=__import__('json').loads(raw)
 except ValueError:return JSONResponse({'error':'无效链接'},status_code=400)
 def send():
  try:
   with requests.Session() as session:
    session.trust_env=False
    response=session.post('http://127.0.0.1:18981/open',json=data,headers={'X-Mentora-Device-Token':token},timeout=(2,40))
   return JSONResponse(response.json(),status_code=response.status_code,headers={'Cache-Control':'no-store'})
  except (requests.RequestException,ValueError):return JSONResponse({'error':'此 Mac 的真机转发未连接，请确认 Mac 在线。'},status_code=503)
 return await run_in_threadpool(send)
