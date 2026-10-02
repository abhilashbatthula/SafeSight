"""SafeSight original CC0 schematic illustrations. These are fixtures, not photos."""
from pathlib import Path
from PIL import Image, ImageDraw
import json,hashlib
root=Path(__file__).parent/'fixtures'
root.mkdir(exist_ok=True)
manifest={}
for name,helmet2 in [('equipped',True),('review',False)]:
    im=Image.new('RGB',(800,500),'#e8eef1');d=ImageDraw.Draw(im)
    d.rectangle((0,370,800,500),fill='#cbd5df');d.line((0,370,800,370),fill='#64748b',width=3)
    d.text((25,20),'SAFESIGHT - SCHEMATIC DEMONSTRATION FIXTURE (NO AI)',fill='#0f172a')
    detections=[];findings=[]
    for i,x in enumerate([230,550]):
        pid=f'Person {i+1}';box=[x-60,90,x+60,430]
        d.rectangle((x-40,210,x+40,335),fill='#fbba24')
        d.rectangle((x-43,210,x-33,335),fill='#edfafa');d.rectangle((x+33,210,x+43,335),fill='#edfafa')
        d.ellipse((x-27,120,x+27,181),fill='#9a765d')
        d.line((x-22,333,x-30,423),fill='#334155',width=20);d.line((x+22,333,x+30,423),fill='#334155',width=20)
        equipped=i==0 or helmet2
        if equipped:d.arc((x-34,103,x+34,157),180,360,fill='#f59e0b',width=17);d.line((x-37,133,x+37,133),fill='#f59e0b',width=7)
        d.text((x-40,448),pid,fill='#334155')
        detections.extend([{'class':'person','confidence':1.0,'box':box,'personId':pid},{'class':'helmet' if equipped else 'no_helmet','confidence':1.0,'box':[x-36,103,x+36,160],'personId':pid},{'class':'vest','confidence':1.0,'box':[x-40,210,x+40,335],'personId':pid}])
        findings.append({'personId':pid,'helmet':'detected' if equipped else 'potential_missing','vest':'detected'})
    im.save(root/f'{name}.png')
    manifest[hashlib.sha256(im.tobytes()).hexdigest()]={'name':name,'width':800,'height':500,'detections':detections,'findings':findings}
(root/'manifest.json').write_text(json.dumps(manifest,indent=2))
print('Original schematic fixtures generated')
