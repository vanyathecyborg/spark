#!/usr/bin/env python3
"""Analyze the historical and additive capture schemas without copying asset metadata."""
import argparse,hashlib,json,math,statistics
from pathlib import Path

def numbers(values):return [x for x in values if isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x)]
def distribution(values):
 values=sorted(numbers(values));n=len(values)
 def q(p):
  if not n:return None
  return values[max(0,min(n-1,math.ceil(n*p)-1))]
 return {'samples':n,'p50':q(.5),'p95':q(.95),'p99':q(.99),'over50':sum(x>50 for x in values),'over100':sum(x>100 for x in values),'max':max(values) if n else None,'percentileMethod':'nearest rank ceil(n*p)-1'}

def analyze(path):
 raw=path.read_bytes();data=json.loads(raw);events=data['events'];extra=data['snapshot'].get('extra',{});comparison=extra.get('comparison',{});quality=extra.get('quality',{})
 traversals=[e for e in events if e['label']=='lod-traverse-complete'];sorts=[e for e in events if e['label']=='sort-complete'];frames={}
 for kind in ['raf','submitted']:
  chunks=[e for e in events if e['label']=='capture-frame-samples' and e.get('kind')==kind]
  inputs=[v for e in chunks for v in e.get('intervalsMs',[]) if isinstance(e.get('intervalsMs'),list)]
  frames[kind]=distribution(inputs) if chunks else None
 invariant=[e for e in traversals if all(isinstance(e.get(k),(int,float)) for k in ['heapEmitted','frontierDrained','selectedSplats'])]
 by_rows={}
 for rows in sorted(set(e['rows'] for e in sorts if isinstance(e.get('rows'),int))):by_rows[rows]=distribution([e.get('timingsMs',{}).get('orderingUpload') for e in sorts if e.get('rows')==rows])
 return {'file':path.name,'sha256':hashlib.sha256(raw).hexdigest(),'events':len(events),'sequenceContinuous':all(b['seq']==a['seq']+1 for a,b in zip(events,events[1:])),'completeMarkers':bool(events and events[0]['label']=='capture-start' and events[-1]['label']=='capture-stop'),'effectiveBudget':quality.get('effectiveBudget',comparison.get('effectiveBudget',data['snapshot'].get('lodState',{}).get('lastLodTraversal',{}).get('maxSplats'))),'traversalMs':distribution([e.get('workerTraverseMs') for e in traversals]),'traversalCompletions':len(traversals),'countInvariant':{'checked':len(invariant),'failures':sum(e['heapEmitted']+e['frontierDrained']!=e['selectedSplats'] for e in invariant),'selectionEquivalence':'not established by counts'},'sorts':len(sorts),'sortMs':{key:distribution([e.get('timingsMs',{}).get(key) for e in sorts]) for key in ['total','depth','worker','orderingUpload']},'uploadMsByRows':by_rows,'fullCaptureFrames':frames,'recordedStallsOver50':sum(e['label']=='example-frame-stall' and e.get('rawFrameMs',0)>50 for e in events),'failureIndicators':extra.get('captureMetrics',{}).get('failures',[]),'claimLimit':'Manual historical camera routes and opacity settings differ; worker/CPU latency is not an equal-quality FPS comparison.'}

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('captures',nargs='+',type=Path);p.add_argument('--output',type=Path,required=True);a=p.parse_args();reports=[analyze(f) for f in a.captures];a.output.write_text(json.dumps({'runs':reports},indent=2)+'\n')
 for r in reports:print(r['file'],r['traversalCompletions'],r['traversalMs']['p50'],r['traversalMs']['p95'])
