"""Exact immutable upgrade from the reviewed direct-export completion receipt."""
import hashlib

EXPECTED = {
    'server.py':'c6f9432b8dd1e756c65fad18e5bd8346e51590b8feade09c7b1324b616a74cb2',
    'codex_runner.py':'69245182579d3f9f2077030eb62cc358bc8770713d07d93397e987917e9498f7',
    'blender_mcp.py':'85c4fe62f76aaa33e87a40ec0db03965e1ffac0a28b1459a73e3676bf66b020b',
    'astra_spend_v2.py':'7f7cf87aa00652c6f057416886fba89a878cca683b5e7d5d310b49158f29ec22',
    'completion_policy.py':'664e9f3b2326116fe9aeeb78e7a84aac254ca8a3054cdccdfb5224e112890110',
}


def once(text, old, new):
    if text.count(old) != 1: raise ValueError('Reviewed prebuild patch context differs.')
    return text.replace(old,new,1)


def review(original):
    if set(original) != set(EXPECTED): raise ValueError('Unexpected prebuild source set.')
    for name,digest in EXPECTED.items():
        if hashlib.sha256(original[name]).hexdigest() != digest:
            raise ValueError('Unreviewed completion source: '+name+'; no service stopped.')


def patch_runner(text):
    text = once(text,'import completion_policy\n','import completion_policy\nimport prebuild_policy\n')
    text = once(text,"    task=completion_policy.guidance(completion_request)+task if not fast_limits['fast'] else task",
        "    task=(prebuild_policy.initial_task(folder,completion_request) if prebuild_policy.active(completion_request,fast_limits['fast']) else completion_policy.guidance(completion_request)+task if not fast_limits['fast'] else task)")
    text = once(text,'    def execution_guidance(self):\n',
        "    def execution_guidance(self):\n        if prebuild_policy.active(self.completion_request,self.fast_limits['fast']):return prebuild_policy.turn_guidance(self)\n")
    text = once(text,"except astra_spend_v2.SpendError:\n", "except astra_spend_v2.SpendError as error:\n                        outer.cost_guard=astra_spend_v2.safe_diagnostic(error)\n")
    text = once(text,"'error_source':self.error_source,'upstream_status':self.upstream_status,'retry_after':self.retry_after}",
        "'error_source':self.error_source,'upstream_status':self.upstream_status,'retry_after':self.retry_after,\n                  **({'cost_guard':self.cost_guard} if getattr(self,'cost_guard',None) else {})}")
    return text



ERRORS = '''REASONS = {'PRICING_EXPIRED','PAYLOAD_POLICY_REJECTED','TOKEN_COUNT_UNAVAILABLE','TOKEN_COUNT_INVALID',
    'INPUT_LIMIT','OUTPUT_ALLOWANCE_BELOW_MINIMUM','REQUEST_LIMIT','INSUFFICIENT_RESERVATION',
    'LEDGER_INVALID','LEDGER_IO','RESERVATION_COLLISION','PREFLIGHT_UNKNOWN'}
STAGES = {'pricing','payload','count','ledger','admission','persistence','preflight'}
NUMBERS = {'counted_input':65536,'input_ceiling':67584,'requested_output':96000,'minimum_output':16000,
    'affordable_output':96000,'remaining_micro_usd':1750000,'required_minimum_micro_usd':1826176,'requests':32}


class SpendError(legacy.SpendError):
    def __init__(self, reason, stage, **evidence):
        self.reason = reason if reason in REASONS else 'PREFLIGHT_UNKNOWN'
        self.stage = stage if stage in STAGES else 'preflight'
        self.evidence = {k:v for k,v in evidence.items() if k in NUMBERS and type(v) is int and 0 <= v <= NUMBERS[k]}
        super().__init__('Astra admission refused: '+self.reason)


def safe_diagnostic(error):
    if not isinstance(error,SpendError): return {'reason':'PREFLIGHT_UNKNOWN','stage':'preflight'}
    return {'reason':error.reason if error.reason in REASONS else 'PREFLIGHT_UNKNOWN',
            'stage':error.stage if error.stage in STAGES else 'preflight',
            **{k:v for k,v in error.evidence.items() if k in NUMBERS and type(v) is int and 0 <= v <= NUMBERS[k]}}
'''

RESERVE = '''def reserve(folder, counted_input, requested_output, now=None, ledger_root=None, minimum_output=256):
    if (time.time() if now is None else now) >= VALID_UNTIL:
        raise SpendError('PRICING_EXPIRED','pricing')
    if not integer(counted_input, 0, MAX_INPUT):
        raise SpendError('INPUT_LIMIT','count')
    if not integer(requested_output, 1, 96000) or not integer(minimum_output,256,MAX_OUTPUT):
        raise SpendError('OUTPUT_ALLOWANCE_BELOW_MINIMUM','admission')
    try:
        with ledger(folder, ledger_root) as (path, state):
            count = counted_input + 2048
            remaining = CEILING_MICRO_USD - used(state)
            affordable = (remaining-count*INPUT_RATE)//OUTPUT_RATE
            evidence = {'counted_input':counted_input,'input_ceiling':count,'requested_output':requested_output,
                'minimum_output':minimum_output,'affordable_output':max(0,affordable),
                'remaining_micro_usd':remaining,'required_minimum_micro_usd':count*INPUT_RATE+minimum_output*OUTPUT_RATE,
                'requests':state['requests']}
            output = min(MAX_OUTPUT, requested_output, affordable)
            if state['requests'] >= 32: raise SpendError('REQUEST_LIMIT','admission',**evidence)
            if requested_output < minimum_output: raise SpendError('OUTPUT_ALLOWANCE_BELOW_MINIMUM','admission',**evidence)
            if output < minimum_output: raise SpendError('INSUFFICIENT_RESERVATION','admission',**evidence)
            token = secrets.token_hex(16)
            if token in state['holds']: raise SpendError('RESERVATION_COLLISION','admission',**evidence)
            state['requests'] += 1
            state['holds'][token] = {'input':count,'output':output,'held':count*INPUT_RATE+output*OUTPUT_RATE}
            try: legacy.atomic(path,state)
            except Exception: raise SpendError('LEDGER_IO','persistence') from None
            return token,output
    except SpendError: raise
    except legacy.SpendError: raise SpendError('LEDGER_INVALID','ledger') from None
    except OSError: raise SpendError('LEDGER_IO','ledger') from None
    except Exception: raise SpendError('LEDGER_INVALID','ledger') from None


def protect(folder, payload, headers, counter=None, minimum_output=256):
    try:
        if time.time() >= VALID_UNTIL: raise SpendError('PRICING_EXPIRED','pricing')
        payload['reasoning'] = {**payload.get('reasoning', {}), 'effort':'low'}
        try: legacy.count_payload(payload)
        except Exception: raise SpendError('PAYLOAD_POLICY_REJECTED','payload') from None
        payload['store'] = False
        payload['service_tier'] = 'default'
        requested = payload.get('max_output_tokens')
        if not integer(requested,1,96000): raise SpendError('OUTPUT_ALLOWANCE_BELOW_MINIMUM','admission')
        try: counted = (counter or legacy.count_tokens)(payload,headers)
        except Exception: raise SpendError('TOKEN_COUNT_UNAVAILABLE','count') from None
        if type(counted) is not int or counted < 0: raise SpendError('TOKEN_COUNT_INVALID','count')
        token,output = reserve(folder,counted,requested,minimum_output=minimum_output)
        payload['max_output_tokens'] = output
        return token
    except SpendError: raise
    except Exception: raise SpendError('PREFLIGHT_UNKNOWN','preflight') from None


'''


def patch_spend(text):
    # Preserve the exact validation, locking and authenticated-only settlement.
    # Existing validation errors retain their legacy type and are mapped by the
    # surrounding ledger phase, never parsed from arbitrary exception strings.
    text = once(text,'SpendError = legacy.SpendError\n',ERRORS)
    start,end = text.index('def validate_state('),text.index('\ndef used(')
    text = text[:start]+text[start:end].replace('raise SpendError(', 'raise legacy.SpendError(')+text[end:]
    start,end = text.index('def reserve('),text.index('def completed_upper_cost(')
    return text[:start]+RESERVE+text[end:]


def changes(original, helper):
    review(original)
    server = once(original['server.py'].decode(),'    state.update(completion_health())\n',
        '    state.update(completion_health())\n    from prebuild_policy import verified_health as prebuild_health\n    state.update(prebuild_health())\n')
    result = {**original,'server.py':server.encode(),'codex_runner.py':patch_runner(original['codex_runner.py'].decode()).encode(),
        'blender_mcp.py':original['blender_mcp.py'],
        'astra_spend_v2.py':patch_spend(original['astra_spend_v2.py'].decode()).encode(),'prebuild_policy.py':helper}
    for name,raw in result.items(): compile(raw,name,'exec')
    return result
