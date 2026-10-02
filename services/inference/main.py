import os,io,json,hashlib,time
from pathlib import Path
from fastapi import FastAPI,UploadFile,File,Header,HTTPException
from PIL import Image
from matching import associate
app=FastAPI(title='SafeSight private inference',version='1.0.0')
MODE=os.getenv('INFERENCE_MODE','DEMO').upper()
KEY=os.getenv('INFERENCE_KEY','')
model=None;reason=None;label_map={}
try:
    if not KEY:raise ValueError('INFERENCE_KEY is required')
    if MODE not in ['DEMO','REAL']:raise ValueError('INFERENCE_MODE must be DEMO or REAL')
    if MODE=='REAL':
        path=os.getenv('MODEL_PATH','')
        if not path or not Path(path).is_file():raise ValueError('REAL mode requires a local PPE-trained MODEL_PATH')
        if not all(os.getenv(k) for k in ['MODEL_VERSION','MODEL_LICENSE','MODEL_PROVENANCE']):raise ValueError('Document MODEL_VERSION, MODEL_LICENSE and MODEL_PROVENANCE before using weights')
        from ultralytics import YOLO
        model=YOLO(path)
        aliases={'human':'person','person':'person','helmet':'helmet','hardhat':'helmet','vest':'vest','safety vest':'vest','no-helmet':'no_helmet','no-hardhat':'no_helmet','no-vest':'no_vest','no-safety vest':'no_vest'}
        label_map={int(k):aliases.get(v.lower(),v.lower()) for k,v in model.names.items()}
        if not {'person','helmet','vest'}.issubset(label_map.values()):raise ValueError('PPE label map must include person/human, helmet/hardhat, vest; generic COCO weights rejected')
except Exception as e:
    reason=str(e);model=None

def authorize(key):
    import secrets
    if not KEY or not key or not secrets.compare_digest(KEY,key):raise HTTPException(401,'Private service authentication required')

@app.get('/health')
def health(x_inference_key:str|None=Header(default=None)):
    authorize(x_inference_key)
    return {'mode':MODE,'ready':reason is None,'reason':reason,'modelVersion':os.getenv('MODEL_VERSION') if MODE=='REAL' else 'schematic-fixtures-v1'}

@app.post('/infer')
async def infer(image:UploadFile=File(...),x_inference_key:str|None=Header(default=None)):
    authorize(x_inference_key)
    if reason:raise HTTPException(503,reason)
    started=time.perf_counter();data=await image.read(8*1024*1024+1)
    if len(data)>8*1024*1024:raise HTTPException(413,'Image exceeds 8MB')
    try:
        im=Image.open(io.BytesIO(data))
        if im.width*im.height>20_000_000:raise ValueError('Too many pixels')
        im=im.convert('RGB')
    except Exception:raise HTTPException(422,'Invalid image')
    w,h=im.size
    if MODE=='DEMO':
        manifest=json.loads((Path(__file__).parent/'fixtures/manifest.json').read_text())
        fixture=manifest.get(hashlib.sha256(im.tobytes()).hexdigest())
        if not fixture:raise HTTPException(503,'DEMO accepts only bundled schematic sample images. Configure REAL PPE-trained weights for arbitrary uploads.')
        detections=fixture['detections'];findings=fixture['findings'];warnings=['Fixture annotations; not real AI inference or accuracy evidence.']
        version='schematic-fixtures-v1'
    else:
        # CPU-bound operation is serialized by the single backend worker, offloaded from ASGI loop.
        import asyncio
        result=await asyncio.to_thread(lambda:model.predict(im,device='cpu',conf=.25,verbose=False)[0])
        detections=[{'class':label_map[int(b.cls.item())],'confidence':float(b.conf.item()),'box':[float(v) for v in b.xyxy[0].tolist()],'personId':None} for b in result.boxes]
        findings=associate(detections,w,h);warnings=['Snapshot only. Unknown PPE is not compliance; potential missing PPE requires human review.']
        if not findings:warnings.append('No confidently detected person; no compliance conclusion.')
        version=os.environ['MODEL_VERSION']
    return {'mode':MODE,'modelVersion':version,'width':w,'height':h,'processingMs':round((time.perf_counter()-started)*1000),'coordinateSystem':'xyxy_pixels','detections':detections,'findings':findings,'warnings':warnings}
