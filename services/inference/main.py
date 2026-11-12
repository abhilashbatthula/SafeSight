"""Private vision inference service. No trained PPE detector or fixture fallback."""
import asyncio
import io
import json
import os
import secrets
import time
from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException
from PIL import Image, ImageOps
from vision import analyze, configuration

app = FastAPI(title='SafeSight private vision inference', version='3.0.0')
KEY = os.getenv('INFERENCE_KEY', '')
lock = asyncio.Lock()


def authorize(key):
    if not KEY or not key or not secrets.compare_digest(KEY, key):
        raise HTTPException(401, 'Private service authentication required')


@app.get('/health')
def health(x_inference_key: str | None = Header(default=None)):
    authorize(x_inference_key)
    reason = None
    try:
        configuration()
    except ValueError as error:
        reason = str(error)
    return {'mode': 'REAL', 'provider': 'Google Gemini', 'analysisType': 'vision',
            'ready': reason is None, 'reason': reason,
            'modelVersion': os.getenv('GEMINI_MODEL', 'gemini-3.1-flash-lite'),
            'equipment': 'Visible PPE, workwear, carried equipment and machinery safety guidance',
            'readinessScope': 'Configuration only; provider authentication is verified on analysis.'}


@app.post('/infer')
async def infer(image: UploadFile = File(...), required_equipment: str = Form(default='[]'),
                operation_context: str = Form(default=''),
                x_inference_key: str | None = Header(default=None)):
    authorize(x_inference_key)
    try:
        configuration()
    except ValueError as error:
        raise HTTPException(503, str(error)) from None
    try:
        required = json.loads(required_equipment)
        if not isinstance(required, list) or len(required) > 20 or any(not isinstance(item, str) or not 1 <= len(item) <= 100 or not item.strip() for item in required) or len(set(required)) != len(required):
            raise ValueError()
    except (ValueError, TypeError):
        raise HTTPException(422, 'Invalid required equipment checklist') from None
    if len(operation_context) > 1000:
        raise HTTPException(422, 'Activity/context exceeds 1000 characters')
    started = time.perf_counter()
    data = await image.read(64 * 1024 * 1024 + 1)
    if len(data) > 64 * 1024 * 1024:
        raise HTTPException(413, 'Normalized image exceeds 64MB')
    try:
        with Image.open(io.BytesIO(data)) as source:
            if source.width * source.height > 20_000_000 or min(source.size) < 32 or getattr(source, 'n_frames', 1) != 1:
                raise ValueError()
            im = ImageOps.exif_transpose(source).convert('RGB')
    except Exception:
        raise HTTPException(422, 'Invalid image') from None
    async with lock:
        try:
            analysis, version = await asyncio.to_thread(analyze, im, required, operation_context.strip())
        except ValueError as error:
            raise HTTPException(502, str(error)) from None
    return {'mode': 'REAL', 'analysisType': 'vision', 'provider': 'Google Gemini',
            'modelVersion': version, 'promptVersion': 'safety-v2',
            'width': im.width, 'height': im.height,
            'processingMs': round((time.perf_counter() - started) * 1000),
            'coordinateSystem': 'xyxy_pixels', 'detections': [],
            **analysis, 'warnings': analysis['warnings'] + ['Visual observations require human review. Hidden equipment and safety certification cannot be verified from a photograph.']}
