#!/usr/bin/env python3
"""Run-level analysis. Keeps every valid repetition; does not pool runs into one percentile."""
import argparse,csv,json,math,statistics
from pathlib import Path
from collections import defaultdict

def dist(values):
 values=sorted(v for v in values if isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v))
 def q(p):return values[max(0,math.ceil(len(values)*p)-1)] if values else None
 return {'samples':len(values),'p50':q(.5),'p95':q(.95),'p99':q(.99),'over50':sum(v>50 for v in values),'over100':sum(v>100 for v in values)}

def analyze(root):
 runs=[json.loads(line) for line in (root/'runs.jsonl').read_text().splitlines()];rows=[]
 for run in runs:
  if not run['valid']:continue
  capture=json.loads((root/run['file']).read_text());events=capture['events'];extra=capture['snapshot']['extra']
  row={k:run[k] for k in ['id','variant','budget','width','height','repetition','file']}
  row.update({'restSettleMs':extra['run']['restSettleMs'],'drawn':extra['run']['drawn'],'orderingCapacity':extra['run']['orderingCapacity'],'orderingCpuBytes':extra['run']['orderingCpuBytes']})
  for phase,start,end in [('full',0,math.inf),('motion',0,30000),('rest',30000,math.inf)]:
   samples=[dt for event in events if event['label']=='capture-frame-samples' and event['kind']=='submitted' for at,dt in zip(event['elapsedMs'],event['intervalsMs']) if start<=at<end]
   for name,value in dist(samples).items():row[f'{phase}Frame{name.title()}']=value
  states=[e for e in events if e['label']=='capture-state-samples']
  for key in ['selectionRequestAgeMs','orderingRequestAgeMs']:
   values=[v for e in states for v in e[key]]
   d=dist(values);row[f'{key}KnownFraction']=d['samples']/len(values) if values else 0
   row[f'{key}P50']=d['p50'];row[f'{key}P95']=d['p95']
  for label,key in [('lod-traverse-complete','workerTraverseMs'),('sort-complete','depth'),('sort-complete','worker'),('sort-complete','orderingUpload')]:
   values=[e.get(key) if label=='lod-traverse-complete' else e.get('timingsMs',{}).get(key) for e in events if e['label']==label]
   d=dist(values);row[f'{key}P50']=d['p50'];row[f'{key}P95']=d['p95'];row[f'{key}Samples']=d['samples']
  rows.append(row)
 groups=defaultdict(list)
 for row in rows:groups[(row['variant'],row['budget'],row['width'],row['height'])].append(row)
 summary=[]
 for key,values in groups.items():
  group={'variant':key[0],'budget':key[1],'width':key[2],'height':key[3],'runs':len(values),'metrics':{}}
  for metric in rows[0]:
   if metric in ('id','variant','budget','width','height','repetition','file'):continue
   numbers=[v[metric] for v in values if isinstance(v[metric],(float,int))]
   group['metrics'][metric]={'medianAcrossRuns':statistics.median(numbers),'minRun':min(numbers),'maxRun':max(numbers)} if numbers else None
  summary.append(group)
 result={'aggregation':'Median of each metric across whole runs; min/max show run variability. No run is discarded for unfavorable results. Frame phases use interval endpoint time.','invalidRuns':[r for r in runs if not r['valid']],'runs':rows,'groups':summary}
 (root/'analysis.json').write_text(json.dumps(result,indent=2)+'\n')
 if rows:
  with (root/'runs.csv').open('w') as f:w=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator="\n");w.writeheader();w.writerows(rows)
 return result

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('root',type=Path);a=parser.parse_args();result=analyze(a.root)
 for group in result['groups']:print(group['variant'],group['budget'],group['width'],group['height'],group['runs'],group['metrics']['fullFrameP95'])
