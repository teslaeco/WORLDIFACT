"""Pure exact-source model routing transform. Does not install or attest a runtime.

Only the observed 12 October server/runner pair is accepted. Original Astra
source and all legacy gates remain required by the eventual maintenance install.
"""
import hashlib

EXPECTED = {'server.py': 'd401a99fc2b271b886fa8c629e802d107ec8f6f05eb3da99c27dab040abc4c97', 'codex_runner.py': '7a5ba3b7a1c5fbd631ab826945b7d50369000964fc600d52c28f7f47e5f25b37'}

def replace(source, before, after):
    if source.count(before) != 1: raise ValueError("Exact model routing anchor required.")
    return source.replace(before, after, 1)

def transform(original):
    if {n: hashlib.sha256(raw).hexdigest() for n,raw in original.items()} != EXPECTED:
        raise ValueError("Unknown or already modified Oracle runtime.")
    result = {}
    s=original['server.py'].decode()
    s=replace(s,'import terminal_budget','import terminal_budget\nimport studio_execution')
    s=replace(s,'    state = _text_health()','    state = _text_health()\n    state.update(studio_execution.verified_health())')
    s=replace(s,'                pricing = studio_pricing.admission(data, profile)','                pricing = studio_pricing.admission(data, profile)\n                execution = studio_execution.admission(data, profile)\n                if execution is not None and not studio_execution.verified_health(ROOT):\n                    return self.send_json({"code":"STUDIO_EXECUTION_UNAVAILABLE"},503)')
    s=replace(s,'                        if not studio_pricing.same_terms(JOBS/job_id, pricing):','                        if not studio_execution.same_terms(JOBS/job_id, execution):\n                            return self.send_json({"code":"STUDIO_EXECUTION_CONFLICT"},409)\n                        if not studio_pricing.same_terms(JOBS/job_id, pricing):')
    s=replace(s,"if source_id is None and profile == 'standard' else None", "if source_id is None and profile == 'standard' and execution is None else None")
    s=replace(s,'                    studio_pricing.bind(destination, pricing)','                    studio_pricing.bind(destination, pricing)\n                    studio_execution.bind(destination, execution)')
    s=replace(s,"write_json(folder/'provider.json',{'provider':'openai','model':openai_provider.MODEL,'executor':'codex-mcp'})", "write_json(folder/'provider.json',{'provider':'openai','model':studio_execution.model_for(folder),'executor':'codex-mcp','studioExecution':studio_execution.job_terms(folder)})")
    s=replace(s,"detail=('Model wykonany przez Codex + Astra + Blender MCP w %.1f s. '%elapsed)", "detail=('Model wykonany przez Codex + %s + Blender MCP w %.1f s. '%(studio_execution.model_for(folder),elapsed))")
    s=replace(s,'return self.send_json(terminal_budget.seal_terminal(JOBS/job_id,job_id))',"return self.send_json(studio_execution.seal_terminal(JOBS/job_id,job_id) if studio_execution.job_terms(JOBS/job_id) else terminal_budget.seal_terminal(JOBS/job_id,job_id))")
    result['server.py']=s.encode()
    s=original['codex_runner.py'].decode()
    s=replace(s,'import astra_spend_v2','import astra_spend_v2\nimport studio_execution')
    s=replace(s,'        self.key=key;self.folder=folder;self.cancelled=cancelled','        self.key=key;self.folder=folder;self.cancelled=cancelled\n        self.execution=studio_execution.job_terms(folder)\n        self.model=studio_execution.model_for(folder)\n        self.spend=studio_execution if self.execution else astra_spend_v2\n        if self.execution and construction: raise ValueError("Selected model uses the supervised MCP executor.")')
    s=replace(s,"payload.get('model')!=MODEL:return self.reject(400,'Only the configured Astra model is available')", "payload.get('model')!=outer.model:return self.reject(400,'Only the immutable job model is available')")
    s=replace(s,"astra_reservation = (astra_spend_v2.protect(outer.folder, payload, headers, minimum_output=completion_policy.minimum_output(outer.completion_request,current_candidate(outer.folder))) if completion_policy.profile(outer.completion_request) and not outer.fast_limits['fast'] else astra_spend_v2.protect(outer.folder, payload, headers))", "astra_reservation = (outer.spend.protect(outer.folder, payload, headers, minimum_output=completion_policy.minimum_output(outer.completion_request,current_candidate(outer.folder))) if completion_policy.profile(outer.completion_request) and not outer.fast_limits['fast'] else outer.spend.protect(outer.folder, payload, headers))")
    s=replace(s,'settled=astra_spend_v2.settle_completed(outer.folder, astra_reservation, value)','settled=outer.spend.settle_completed(outer.folder, astra_reservation, value)')
    s=replace(s,'                                            if outer.construction:\n                                                if settled is True:', '                                            if outer.execution and settled is not True:\n                                                outer.unknown_usage=True\n                                                outer.stop("WORLDIFACT_MODEL_UNSETTLED","Provider usage did not match the immutable model and mode; no automatic retry.")\n                                            if outer.construction:\n                                                if settled is True:')
    s=replace(s,"                    headers={'Authorization':'Bearer '+outer.key,'Content-Type':'application/json'}", "                    if outer.execution:\n                        payload['service_tier']='fast' if outer.execution['mode']=='fast' else 'default'\n                    headers={'Authorization':'Bearer '+outer.key,'Content-Type':'application/json'}")
    s=replace(s,"'model':MODEL,'requests':self.requests", "'model':self.model,'requests':self.requests")
    s=replace(s,'You are GPT-6 Astra, the model designer.','You are the selected OpenAI model, the model designer.')
    s=replace(s,"'--sandbox','read-only','--skip-git-repo-check','--model',MODEL,'--cd',str(folder)", "'--sandbox','read-only','--skip-git-repo-check','--model',studio_execution.model_for(folder),'--cd',str(folder)")
    s=replace(s,'    if runtime_controller.eligible(Path(folder),instructions):','    if studio_execution.job_terms(Path(folder)) is None and runtime_controller.eligible(Path(folder),instructions):')
    result['codex_runner.py']=s.encode()
    for name, raw in result.items(): compile(raw, name, "exec")
    return result
