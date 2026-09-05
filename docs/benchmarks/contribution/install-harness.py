#!/usr/bin/env python3
"""Copy only the shared benchmark page into an explicitly chosen checkout."""
from pathlib import Path
import argparse,hashlib,json,subprocess
p=argparse.ArgumentParser();p.add_argument('checkout',type=Path);args=p.parse_args();root=args.checkout.resolve();base=Path(__file__).resolve().parent
source=(root/'src/SparkRenderer.ts').read_text()
if 'getDebugReport(' not in source:raise SystemExit('Checkout lacks the unchanged Spark capture mechanism. Apply the observation-only patch first.')
target=root/'examples/contribution-benchmark';target.mkdir(parents=True,exist_ok=True)
files=['index.html','harness.js','capture-controller.js','capture-metrics.js','protocol.js','synthetic-scene.js','public-scene.js','assets/houseplant.json','assets/houseplant.splat']
for name in files:
 (target/name).parent.mkdir(parents=True,exist_ok=True)
 (target/name).write_bytes((base/name).read_bytes())
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None
revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
identity={'revision':revision,'sourceSha256':hashlib.sha256(b''.join(p.relative_to(root).as_posix().encode()+p.read_bytes() for p in sorted((root/'src').rglob('*')) if p.is_file())).hexdigest(),'wasmSha256':sha(root/'rust/spark-rs/pkg/spark_rs_bg.wasm'),'dependencyLockSha256':sha(root/'package-lock.json'),'harnessSha256':hashlib.sha256(b''.join((base/n).read_bytes() for n in files)).hexdigest(),'workingTreeDirty':bool(subprocess.check_output(['git','status','--porcelain','--','src','rust'],cwd=root,text=True).strip()),'node':subprocess.check_output(['node','--version'],text=True).strip()}
(target/'identity.json').write_text(json.dumps(identity,indent=2)+'\n');print(target)
