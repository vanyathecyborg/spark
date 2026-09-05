#!/usr/bin/env python3
"""Plot every run; this diagnostic figure must not be used as a speedup claim."""
import json,hashlib
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
root=Path(__file__).resolve().parent
fig,axes=plt.subplots(1,2,figsize=(11.5,5),sharey=True,gridspec_kw={'width_ratios':[1.6,1]})
colors={'upstream':'#1769aa','ordering':'#db6b1c'}
files=[]
for ax,folder,title in zip(axes,['ordering-primary','ordering-cleanup-control'],['Initial cohort · five repetitions','Cleanup control · two repetitions']):
 path=root/'results'/folder/'analysis.json';data=json.loads(path.read_text());files.append({'file':str(path.relative_to(root)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
 for variant in ['upstream','ordering']:
  rows=[r for r in data['runs'] if r['variant']==variant]
  xs=[r['repetition'] for r in rows];ys=[r['fullFrameP95'] for r in rows]
  ax.plot(xs,ys,marker='o',linewidth=1.7,color=colors[variant],label='Upstream WebGL' if variant=='upstream' else 'Ordering pool')
  for x,y in zip(xs,ys):ax.annotate(f'{y:.1f}',(x,y),xytext=(0,8 if variant=='upstream' else -14),textcoords='offset points',ha='center',fontsize=8,color=colors[variant])
 ax.set_title(title,fontsize=11,loc='left');ax.set_xlabel('Repetition');ax.set_xticks(sorted({r['repetition'] for r in data['runs']}));ax.set_ylim(0,145);ax.grid(axis='y',alpha=.2);ax.spines[['top','right']].set_visible(False)
axes[0].set_ylabel('Submitted-frame interval p95 (ms)');axes[0].legend(loc='upper right',frameon=False,fontsize=9)
fig.suptitle('Timing is not yet qualified: large variation across runs',fontsize=15,x=.07,ha='left')
fig.text(.07,.9,'Apple M4 Max · Chrome 152 · 3M synthetic source / 2.5M selected · 1920 × 1080',fontsize=9,color='#555')
fig.text(.07,.025,'Other GPU activity was present. Every valid run is shown; these data do not establish a renderer speedup.',fontsize=9,color='#8c3b11')
fig.tight_layout(rect=[.025,.06,1,.88]);out=root/'results'/'plots';out.mkdir(exist_ok=True)
fig.savefig(out/'unqualified-run-variance.png',dpi=180);fig.savefig(out/'unqualified-run-variance.svg')
svg=out/'unqualified-run-variance.svg';svg.write_text('\n'.join(line.rstrip() for line in svg.read_text().splitlines())+'\n')
(out/'unqualified-run-variance.json').write_text(json.dumps({'performanceClaimQualified':False,'inputs':files,'metric':'p95 submitted-frame intervals for each complete 40-second capture','aggregation':'none: every run shown','qualification':'Other GPU activity and high variance'},indent=2)+'\n')
