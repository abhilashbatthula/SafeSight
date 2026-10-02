"""Conservative geometric association in normalized-orientation pixel coordinates."""
def associate(detections,width,height):
    persons=[d for d in detections if d['class']=='person' and d['confidence']>=.5]
    findings=[]
    for i,p in enumerate(persons):
        p['personId']=f'Person {i+1}'
        findings.append({'personId':p['personId'],'helmet':'unknown','vest':'unknown'})
    assigned={p['personId']:[] for p in persons}
    for d in detections:
        if d['class']=='person':continue
        d['personId']=None
        if d['confidence']<.5:continue
        x1,y1,x2,y2=d['box'];cx=(x1+x2)/2;cy=(y1+y2)/2
        candidates=[]
        for p in persons:
            px1,py1,px2,py2=p['box'];ph=py2-py1
            low,high=(0,.4) if d['class'] in ['helmet','no_helmet'] else (.2,.8)
            if px1<=cx<=px2 and py1+low*ph<=cy<=py1+high*ph:candidates.append(p)
        if len(candidates)==1:
            p=candidates[0];d['personId']=p['personId'];assigned[p['personId']].append(d['class'])
    for p,f in zip(persons,findings):
        labels=assigned[p['personId']];x1,y1,x2,y2=p['box']
        cropped=x1<=2 or y1<=2 or x2>=width-2 or y2>=height-2
        for field in ['helmet','vest']:
            positive=field in labels;negative=f'no_{field}' in labels
            if positive and not negative:f[field]='detected'
            elif negative and not positive and not cropped:f[field]='potential_missing'
            # No observation, contradictory labels, ambiguous association, crop: unknown.
    return findings
