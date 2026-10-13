"""Rebind receipts only from complete source-bound native and ingress evidence."""
import hashlib
import json
from pathlib import Path
import sys

folder=Path(__file__).resolve().parent.parent/'model_construction'
if folder.is_dir():sys.path.append(str(folder))
import construction_health as policy
import install_construction as previous
import activation_manifest as manifest
import activation_evidence as evidence

RECEIPTS=policy.CHAIN_RECEIPTS|{policy.RECEIPT,manifest.MODEL_RECEIPT}


def digest(raw):return hashlib.sha256(raw).hexdigest()
def encoded(value):return (json.dumps(value,sort_keys=True,indent=2)+'\n').encode()


def validate_original(root, originals):
    evidence.require({n:digest(originals[n]) for n in manifest.BEFORE}==manifest.BEFORE)
    core={n:manifest.BEFORE[n] for n in policy.SOURCES}
    raw=previous.base.read_regular(root/policy.RECEIPT,16384)
    construction=policy._json(raw)
    model=policy._json(previous.base.read_regular(root/manifest.MODEL_RECEIPT,16384))
    evidence.require(construction.get('sha256')==core
        and all(construction.get(k) is True for k in evidence.GATES)
        and policy.verified_health(root)=={'worldifactStandardConstructionPolicy':policy.REVISION}
        and model.get('revision')=='studio-execution-v1'
        and model.get('sha256')=={n:manifest.BEFORE[n] for n in ('server.py','codex_runner.py','studio_execution.py')}
        and model.get('construction_receipt_sha256')==digest(raw)
        and model.get('offline_model_pipeline') is True and model.get('models')==['astra','sol','luna']
        and model.get('modes')==['standard','fast']
        and evidence.hashes(model.get('evidence_sha256'),{m+'-'+mode for m,mode in evidence.MODEL_CASES}))


def rebound(originals, changed, native, allow_cancelled):
    witness=evidence.validate_native(native)
    after=manifest.final_manifest()
    evidence.require(type(allow_cancelled) is bool and {n:digest(raw) for n,raw in changed.items()}==after)
    values={policy.GENERIC_RECEIPT:native.generic_receipt}
    for name,(_revision,coverage) in policy.CHAIN_LAYOUT.items():
        proof=policy._json(originals[name])
        proof['sha256']={n:after[n] for n in coverage}
        if coverage in (policy.PRICING_SOURCES,policy.CORE_SOURCES):
            proof.update(maintenance_fence=policy.FENCE_REVISION,
                         cancelled_cleanup_interruption_approved=allow_cancelled,
                         offline_generic_pipeline=True)
            proof['offline_standard_pipeline' if coverage==policy.CORE_SOURCES else 'offline_cabinet_pipeline']=True
        values[name]=encoded(proof)
    # None of the guard-covered executable/price bytes changed in this release.
    values[policy.GUARD_RECEIPT]=originals[policy.GUARD_RECEIPT]
    construction=policy._json(originals[policy.RECEIPT])
    construction.update(sha256={n:after[n] for n in policy.SOURCES},
        receipt_sha256={n:digest(values[n]) for n in policy.CHAIN_RECEIPTS},
        maintenance_fence=policy.FENCE_REVISION,cancelled_cleanup_interruption_approved=allow_cancelled,
        **{gate:True for gate in evidence.GATES})
    construction['durable_admission_update']={'revision':manifest.REVISION,
        'previous_construction_receipt_sha256':digest(originals[policy.RECEIPT]),
        'native_evidence_sha256':witness}
    values[policy.RECEIPT]=encoded(construction)
    model=policy._json(originals[manifest.MODEL_RECEIPT])
    model.update(sha256={n:after[n] for n in ('server.py','codex_runner.py','studio_execution.py')},
        construction_receipt_sha256=digest(values[policy.RECEIPT]),
        offline_model_pipeline=True,live_provider_verified=False,
        evidence_sha256={m+'-'+mode:witness[m+'-'+mode] for m,mode in evidence.MODEL_CASES})
    values[manifest.MODEL_RECEIPT]=encoded(model)
    return values


def validate_ingress(raw):
    value=evidence.decode(raw)
    required={'revision','source_sha256','stage_survived_restart','start_idempotent','queue_row_preserved',
              'input_hash_verified','model_terms_verified','no_provider_calls','cleanup_verified'}
    evidence.require(set(value)==required and value['revision']==manifest.REVISION
        and value['source_sha256']==manifest.final_manifest())
    evidence.flags(value,required-{'revision','source_sha256'},())
    return value


def activation_receipt(changed, values, native, ingress):
    witness=evidence.validate_native(native)
    validate_ingress(ingress)
    after=manifest.final_manifest()
    evidence.require({n:digest(b) for n,b in changed.items()}==after and set(values)==RECEIPTS)
    return encoded({'revision':manifest.REVISION,'sha256':after,
        'receipt_sha256':{n:digest(b) for n,b in values.items()},'native_evidence_sha256':witness,
        'ingress_evidence_sha256':digest(ingress),'offline_ingress_verified':True,'live_provider_verified':False})


def validate_installed(root):
    raw=previous.base.read_regular(root/manifest.RECEIPT,65536)
    proof=policy._json(raw)
    after=manifest.final_manifest()
    evidence.require(set(proof)=={'revision','sha256','receipt_sha256','native_evidence_sha256',
                                 'ingress_evidence_sha256','offline_ingress_verified','live_provider_verified'}
        and proof['revision']==manifest.REVISION and proof['sha256']==after
        and proof['offline_ingress_verified'] is True and proof['live_provider_verified'] is False
        and proof['receipt_sha256']=={n:digest(previous.base.read_regular(root/n,16384)) for n in RECEIPTS}
        and evidence.hashes(proof['native_evidence_sha256'],{'generic','legacy','phased',*(m+'-'+mode for m,mode in evidence.MODEL_CASES)})
        and evidence.hashed(proof['ingress_evidence_sha256'])
        and {n:digest(previous.base.read_regular(root/n)) for n in after}==after
        and policy.verified_health(root)=={'worldifactStandardConstructionPolicy':policy.REVISION})
    model=policy._json(previous.base.read_regular(root/manifest.MODEL_RECEIPT,16384))
    evidence.require(model.get('sha256')=={n:after[n] for n in ('server.py','codex_runner.py','studio_execution.py')}
        and model.get('construction_receipt_sha256')==digest(previous.base.read_regular(root/policy.RECEIPT,16384))
        and model.get('offline_model_pipeline') is True and model.get('models')==['astra','sol','luna']
        and model.get('modes')==['standard','fast']
        and model.get('evidence_sha256')=={m+'-'+mode:proof['native_evidence_sha256'][m+'-'+mode] for m,mode in evidence.MODEL_CASES})
    construction=policy._json(previous.base.read_regular(root/policy.RECEIPT,16384))
    update=construction.get('durable_admission_update',{})
    evidence.require(update.get('revision')==manifest.REVISION
        and update.get('native_evidence_sha256')==proof['native_evidence_sha256']
        and evidence.hashed(update.get('previous_construction_receipt_sha256')))
    return proof
