"""Validate current-source native witnesses; never accept a marker alone.

The native gate executables remain the original pinned implementations. These
validators bind their complete evidence to the new server plus unchanged model,
price and renderer modules. A synthetic unit fixture is not production evidence.
"""
import hashlib
import json
import re
from dataclasses import dataclass

import activation_manifest as manifest

HASH = re.compile('[a-f0-9]{64}')
HEX32 = re.compile('[a-f0-9]{32}')
UUID = re.compile(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}')
ORIGINAL_GATE = '380063680197b1b175f03da6c6698c84dfb3bd9ff839de61bae69e76aa1d5f4d'
MODEL_CASES = tuple((model, mode) for model in ('astra','sol','luna') for mode in ('standard','fast'))
GATES = frozenset(('offline_generic_pipeline','offline_cabinet_pipeline','offline_phased_standard_pipeline','offline_standard_pipeline'))


class EvidenceError(ValueError):
    pass


def require(value):
    if not value:
        raise EvidenceError('Complete current-source native evidence is required.')


def decode(raw):
    require(type(raw) is bytes and 0 < len(raw) <= 65536)
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result)
            result[key] = value
        return result
    value = json.loads(raw, object_pairs_hook=unique)
    require(isinstance(value, dict))
    return value


def hashed(value):
    return isinstance(value,str) and HASH.fullmatch(value) is not None


def hashes(value, names):
    return isinstance(value,dict) and set(value)==set(names) and all(hashed(v) for v in value.values())


def core_sources():
    return {n:h for n,h in manifest.final_manifest().items() if n not in manifest.HELPERS and n!='studio_execution.py'}


def model_sources():
    return {n:h for n,h in manifest.final_manifest().items() if n not in manifest.HELPERS}


def flags(value, positives, negatives):
    require(all(value.get(k) is True for k in positives) and all(value.get(k) is False for k in negatives))


def validate_legacy(raw):
    v=decode(raw)
    positive={'schema_verified','actual_images_verified','provider_fixture','original_cli_standard_verified','cleanup_verified'}
    negative={'production_budget_changed','runtime_route_override','installed_receipt_written','native_fallback','live_provider_verified','visual_quality_verified'}
    fields={'execution_id','terms','immutable_terms_sha256','ledger_cap_micro_usd','ledger_policy_revision','requests','counts','scripted_exec_phases','wait_responses','original_gate_sha256','source_sha256'}|positive|negative
    require(set(v)==fields and v['source_sha256']==core_sources())
    flags(v,positive,negative)
    require(isinstance(v['execution_id'],str) and HEX32.fullmatch(v['execution_id'])
            and v['terms']=={'revision':'studio-pricing-v1','tier':'standard','points':250,'maxProviderCents':200}
            and hashed(v['immutable_terms_sha256']) and type(v['ledger_cap_micro_usd']) is int
            and v['ledger_cap_micro_usd']==2000000 and v['ledger_policy_revision']=='astra-low-tiered-v1'
            and type(v['scripted_exec_phases']) is int and v['scripted_exec_phases']==4
            and type(v['wait_responses']) is int and 0<=v['wait_responses']<=24
            and type(v['requests']) is int and type(v['counts']) is int
            and v['requests']==v['counts']==4+v['wait_responses'] and v['original_gate_sha256']==ORIGINAL_GATE)
    return v


def validate_model(raw, model, mode):
    v=decode(raw)
    require((model,mode) in MODEL_CASES)
    api,cap,cost={'astra':('gpt-6-astra',1750000,6875),'sol':('gpt-6.1-sol',350000,1375),'luna':('gpt-6-luna',100000,69)}[model]
    positive={'actual_cli_mcp_blender','actual_images_verified','provider_fixture','cleanup_verified'}
    negative={'live_provider_verified','visual_quality_verified','installed_receipt_written','native_fallback'}
    fields={'selection','model','service_tier','cap_micro_usd','requests','counts','phases','waits','fixture_liability_micro_usd','seal','execution_id','terms_sha256','model_sha256','render_sha256','source_sha256','original_gate_sha256'}|positive|negative
    require(set(v)==fields and v['source_sha256']==model_sources()
            and v['selection']=={'revision':'studio-execution-v1','model':model,'mode':mode}
            and v['model']==api and v['service_tier']==('fast' if mode=='fast' else 'default'))
    flags(v,positive,negative)
    for key in ('cap_micro_usd','requests','counts','phases','waits','fixture_liability_micro_usd'):
        require(type(v[key]) is int)
    require(v['cap_micro_usd']==cap and v['phases']==4 and 0<=v['waits']<=24
            and v['requests']==v['counts']==4+v['waits']
            and v['fixture_liability_micro_usd']==v['requests']*cost*(2 if mode=='fast' else 1)<=cap
            and isinstance(v['execution_id'],str) and HEX32.fullmatch(v['execution_id'])
            and hashed(v['terms_sha256']) and hashed(v['model_sha256'])
            and hashes(v['render_sha256'],('front','side','back')) and v['original_gate_sha256']==ORIGINAL_GATE)
    seal=v['seal']
    require(isinstance(seal,dict) and set(seal)=={'revision','jobId','model','policyRevision','capMicroUsd','maximumLiabilityMicroUsd','sealed','sealId'}
            and seal['revision']=='worldifact-terminal-budget-v1' and seal['model']==api
            and seal['policyRevision']=='studio-model-budget-v1:'+mode and type(seal['capMicroUsd']) is int and seal['capMicroUsd']==cap
            and type(seal['maximumLiabilityMicroUsd']) is int and seal['maximumLiabilityMicroUsd']==v['fixture_liability_micro_usd']
            and seal['sealed'] is True and hashed(seal['sealId']) and isinstance(seal['jobId'],str) and UUID.fullmatch(seal['jobId']))
    return v


def validate_phased(raw):
    v=decode(raw)
    positive={'isolated_podman_execution_verified','provider_fixture','activation_receipt_fixture','cleanup_verified'}
    negative={'native_fallback','installed_runtime_receipt_written','live_provider_verified','visual_quality_verified'}
    require(set(v)=={'revision','source_sha256','cases','container_calls'}|positive|negative
            and v['revision']=='worldifact-standard-construction-v1' and v['source_sha256']==core_sources())
    flags(v,positive,negative)
    require(type(v['cases']) is list and len(v['cases'])==3)
    fields={'accepted','revision','correction','server_success_returned','model_sha256','render_sha256','provider_requests','before_correction_model_sha256','before_correction_render_sha256','fixture_settled_micro_usd','invoice_amount','initial_edit','first_inspected_revision','inspected_revisions','before_initial_edit_model_sha256','completed_pipeline_tools'}
    for index,case in enumerate(v['cases']):
        accepted,correction,edit=index!=1,index==0,index==2
        phases=['construction','inspection','reassessment'] if correction else ['construction','inspection']
        tools=['build_model']+(['edit_model'] if edit else [])+['inspect_render']*3
        if correction:tools+=['edit_model']+['inspect_render']*3
        tools+=['finish_model']
        require(isinstance(case,dict) and set(case)==fields and case['accepted'] is accepted
                and case['correction'] is correction and case['initial_edit'] is edit
                and case['server_success_returned'] is accepted and type(case['revision']) is int and case['revision']==(2 if accepted else 1)
                and type(case['first_inspected_revision']) is int and case['first_inspected_revision']==(2 if edit else 1)
                and case['inspected_revisions']==([1,2] if correction else [2] if edit else [1])
                and all(type(n) is int for n in case['inspected_revisions']) and case['completed_pipeline_tools']==tools
                and hashed(case['model_sha256']) and hashes(case['render_sha256'],('front','side','back'))
                and type(case['fixture_settled_micro_usd']) is int and case['fixture_settled_micro_usd']==73844*len(phases)
                and case['invoice_amount'] is False)
        requests=case['provider_requests']
        require(type(requests) is list and len(requests)==len(phases))
        for request,phase in zip(requests,phases):
            require(isinstance(request,dict) and set(request)=={'phase','payload_sha256'} and request['phase']==phase and hashed(request['payload_sha256']))
        require(hashed(case['before_initial_edit_model_sha256']) and case['before_initial_edit_model_sha256']!=case['model_sha256'] if edit else case['before_initial_edit_model_sha256'] is None)
        if correction:
            require(hashed(case['before_correction_model_sha256']) and case['before_correction_model_sha256']!=case['model_sha256']
                    and hashes(case['before_correction_render_sha256'],('front','side','back'))
                    and case['before_correction_render_sha256']!=case['render_sha256'])
        else:
            require(case['before_correction_model_sha256'] is None and case['before_correction_render_sha256'] is None)
    calls=v['container_calls']
    require(type(calls) is list and len(calls)==8)
    for call,phase in zip(calls,('build','build','finalize','build','finalize','build','build','finalize')):
        require(isinstance(call,dict) and set(call)=={'job_id','phase','command_sha256'} and call['phase']==phase
                and isinstance(call['job_id'],str) and UUID.fullmatch(call['job_id']) and hashed(call['command_sha256']))
    require(len({c['job_id'] for c in calls[:3]})==1 and len({c['job_id'] for c in calls[3:5]})==1
            and len({c['job_id'] for c in calls[5:]})==1 and len({calls[i]['job_id'] for i in (0,3,5)})==3)
    return v


@dataclass(frozen=True)
class NativeEvidence:
    generic_receipt: bytes
    gates: frozenset
    legacy: bytes
    phased: bytes
    models: tuple


def validate_native(evidence):
    require(isinstance(evidence,NativeEvidence) and evidence.gates==GATES
            and type(evidence.models) is tuple and len(evidence.models)==len(MODEL_CASES))
    generic=decode(evidence.generic_receipt)
    require(generic.get('sources')=={n:manifest.final_manifest()[n] for n in ('codex_runner.py','blender_mcp.py')})
    flags(generic,('cli_mcp_roundtrip','code_mode_roundtrip','blender_build_roundtrip'),())
    validate_legacy(evidence.legacy)
    validate_phased(evidence.phased)
    for (model,mode),raw in zip(MODEL_CASES,evidence.models):validate_model(raw,model,mode)
    return {name:hashlib.sha256(raw).hexdigest() for name,raw in (
        ('generic',evidence.generic_receipt),('legacy',evidence.legacy),('phased',evidence.phased),
        *((m+'-'+mode,raw) for (m,mode),raw in zip(MODEL_CASES,evidence.models)))}
