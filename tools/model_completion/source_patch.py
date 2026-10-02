"""Exact-source assembly for the reviewed v33 + all existing guard patches.

Only runner, MCP and server health are changed. No renderer, payment, ledger,
secret, system settings or generic Froge behavior is replaced.
"""
import hashlib

EXPECTED = {
    'astra_spend_v2.py': '80cb48b2717c238986b7f1ac085fc8ac387be82aa54fa509582b71752e7136e7',
    'server.py': '1f09db9835e9ee22361e468d051da7e847dbff36fe7e52a2f2c9c6f6337402b9',
    'codex_runner.py': '8abc8d84104961c1016ecb08adeb224b22cc84c292c4f3f7b59849d49b7e6aee',
    'blender_mcp.py': 'ad9765dd412e2179a68a5a04e604257db4f98b0e80f8d8a8a724d0f11ca60c0e',
}


def once(text, old, new):
    if text.count(old) != 1: raise ValueError('Reviewed completion patch context differs.')
    return text.replace(old, new, 1)


def patch_runner(text):
    text = once(text, 'import fast_preview\n', 'import fast_preview\nimport completion_policy\n')
    text = once(text, 'self.execution_calls=[];self.execution_ids=set();self.completed=False',
        'self.execution_calls=[];self.execution_ids=set();self.completed=False\n        self.completion_request=completion_policy.read(folder/\'agent-request.json\') if (folder/\'agent-request.json\').exists() else {}\n        self.completion_started=self.completion_request.get(\'completion_started\',time.monotonic())')
    # A global deadline applies before *every* provider request, not only the
    # supervisor's once-per-second loop. The original budget is never renewed.
    text = once(text, '                        if outer.active:return self.reject(409,\'A model request is already running\')',
        '''                        if completion_policy.profile(outer.completion_request) and time.monotonic()-outer.completion_started>=outer.fast_limits['seconds']:
                            outer.stop('WORLDIFACT_COMPLETION_TIMEOUT','The original job deadline expired; no further provider request.')
                            return self.reject(422,outer.error,outer.error_code)
                        if outer.active:return self.reject(409,'A model request is already running')''')
    text = once(text, "                                            terminal=True\n", """                                            terminal=True
                                            if event.get('type')=='response.incomplete' and completion_policy.profile(outer.completion_request):
                                                outer.stop('WORLDIFACT_RESPONSE_INCOMPLETE','Provider output was incomplete; the current job is stopped without an automatic paid retry.')
""")
    text = once(text, 'astra_spend_v2.protect(outer.folder, payload, headers)',
        "(astra_spend_v2.protect(outer.folder, payload, headers, minimum_output=completion_policy.minimum_output(outer.completion_request,current_candidate(outer.folder))) if completion_policy.profile(outer.completion_request) and not outer.fast_limits['fast'] else astra_spend_v2.protect(outer.folder, payload, headers))")
    text = once(text, '        return text\n    def stop(',
        '        return completion_policy.guidance(self.completion_request)+text\n    def stop(')
    text = once(text, "    write(folder/'agent-request.json',{'prompt':prompt,'instructions':instructions,'execution_id':execution_id})", """    completion_started=time.monotonic()
    completion_request={'prompt':prompt,'instructions':instructions,'execution_id':execution_id,'completion_started':completion_started}
    write(folder/'agent-request.json',completion_request)""")
    text = once(text, '    started=time.monotonic();failure=None\n    with Gateway',
        '    task=completion_policy.guidance(completion_request)+task if not fast_limits[\'fast\'] else task\n    started=completion_started;failure=None\n    with Gateway')
    start = text.index('            process=subprocess.Popen(command(')
    end = text.index("    if fast_limits['fast']:\n        if cancelled.is_set()", start)
    block = text[start:end]
    # Keep the exact original supervisory implementation, merely enclosing both
    # CLI executions within one Gateway, one deadline and the same folder/id.
    block = '            for completion_pass in range(1+completion_policy.MAX_CONTINUATIONS):\n                terminal_ack.clear()\n' + ''.join('    '+line if line.strip() else line for line in block.splitlines(True))
    block += '''                if gateway.completed or completed_outcome(folder) is not None:break
                if not completion_policy.can_continue(completion_request,gateway,process.returncode,reader.is_alive(),failure,completion_pass,started,fast_limits['seconds']):break
                if not completion_policy.drain_group(process.pid):
                    failure='Previous Codex/MCP process group did not stop; continuation refused.'
                    break
                state=completion_policy.read(folder/completion_policy.STATE)
                if state.get('execution_id')!=execution_id or (state.get('calls') and state['calls'][-1].get('status')=='started'):
                    failure='Prior MCP call is incomplete; continuation refused.'
                    break
                task=(completion_policy.guidance(completion_request)+
                    'Continue THIS SAME job after the previous CLI ended before finish_model. '
                    'The original spend, request, output, build and time limits still apply. '
                    'Use get_current_model to recover the current candidate, scene and edit history; '
                    'then inspect actual current images and correct specific defects before finish_model. '
                    'Do not rebuild from scratch or create another job. Original brief and instructions:\\n'+prompt+'\\n'+instructions)
                progress('Continuing the same unfinished model within its original limits; no new job or budget.')
'''
    text = text[:start]+block+text[end:]
    text = once(text, "    if outcome is not None:return outcome\n    candidate=", """    if outcome is not None:return outcome
    if completion_policy.profile(completion_request):
        gateway.stop(gateway.error_code or 'WORLDIFACT_MODEL_INCOMPLETE',gateway.error or failure or 'The current model was not finished and reviewed. Candidate retained for diagnosis; no automatic replacement job.')
        raise RuntimeError(gateway.error)
    candidate=""")
    return text


def patch_mcp(text):
    text = once(text, 'from runtime.model_checkpoint import model_digest\n', 'from runtime.model_checkpoint import model_digest\nimport completion_policy\n')
    text = once(text, '        self.calls = []; self.tool_failures = 0; self.final_report = None\n',
        '        self.calls = []; self.tool_failures = 0; self.final_report = None\n        completion_policy.restore_state(self,current_candidate)\n')
    text = once(text, '        self.calls.append(entry)\n', '        self.calls.append(entry)\n        completion_policy.save_state(self,write)\n')
    text = once(text, '        self.attempts += 1\n', '        self.attempts += 1\n        completion_policy.save_state(self,write)\n')
    text = once(text, '        return self.snapshot()\n\n    def call(',
        '        completion_policy.save_state(self,write)\n        return self.snapshot()\n\n    def call(')
    text = once(text, "        result = {'revision':self.revision,'has_model':True,'finished':self.finished,", "        result = {'completion_contract':completion_policy.assessment(self.request,self.current),\n                  'revision':self.revision,'has_model':True,'finished':self.finished,")
    text = once(text, "'coordinate_and_geometry_guide':PROMPT,", "'coordinate_and_geometry_guide':completion_policy.guidance(self.request)+PROMPT,")
    text = once(text, "            reviewed=required<=self.seen\n", """            if completion_policy.profile(self.request):
                required=completion_policy.required_views(self.request,scene)
                if not required<=self.seen:
                    raise ValueError('WORLDIFACT finish requires current rendered images: '+', '.join(sorted(required-self.seen)))
                current=current_candidate(self.folder,self.execution_id)
                if current is None or current['path']!=self.current or current['info']['revision']!=self.revision:
                    raise ValueError('WORLDIFACT finish requires the verified CURRENT GLB revision.')
                assessment=completion_policy.assessment(self.request,self.current)
                if arguments['accepted'] and not assessment['structural_passed']:
                    raise ValueError('WORLDIFACT structural gate: '+json.dumps(assessment['deficits'])+'. Correct real geometry or finish with accepted=false and specific issues.')
                if not arguments['accepted'] and not arguments['issues']:
                    raise ValueError('WORLDIFACT rejected draft must report specific unresolved issues.')
            reviewed=required<=self.seen
""")
    return text


def changes(originals, helper):
    if set(originals) != set(EXPECTED): raise ValueError('Unexpected completion source selection.')
    if {name: hashlib.sha256(raw).hexdigest() for name,raw in originals.items()} != EXPECTED:
        raise ValueError('Unreviewed installed completion ancestor; no service stopped.')
    server = once(originals['server.py'].decode(), '    state = _text_health()\n',
        "    state = _text_health()\n    from completion_policy import verified_health as completion_health\n    state.update(completion_health())\n")
    server = once(server, "            return self.send_json({**dict(row),**model_status(JOBS/job_id,row['state'])})",
        "            from completion_policy import public_failure_code\n            return self.send_json({**dict(row),**model_status(JOBS/job_id,row['state']),**public_failure_code(JOBS/job_id,row['state'])})")
    result = {'server.py': server.encode(), 'codex_runner.py': patch_runner(originals['codex_runner.py'].decode()).encode(),
              'blender_mcp.py': patch_mcp(originals['blender_mcp.py'].decode()).encode(), 'completion_policy.py': helper,
              'astra_spend_v2.py': patch_spend(originals['astra_spend_v2.py'].decode()).encode()}
    for name, raw in result.items(): compile(raw, name, 'exec')
    return result


def patch_spend(text):
    text = once(text, 'def reserve(folder, counted_input, requested_output, now=None, ledger_root=None):',
        'def reserve(folder, counted_input, requested_output, now=None, ledger_root=None, minimum_output=256):')
    text = once(text, '    with ledger(folder, ledger_root) as (path, state):\n        count = counted_input + 2048',
        "    if not integer(minimum_output, 256, MAX_OUTPUT):\n        raise SpendError('Invalid minimum useful output allocation.')\n    with ledger(folder, ledger_root) as (path, state):\n        count = counted_input + 2048")
    text = once(text, "        if output < 256 or state['requests'] >= 32:",
        "        if output < minimum_output or state['requests'] >= 32:")
    text = once(text, 'def protect(folder, payload, headers, counter=None):',
        'def protect(folder, payload, headers, counter=None, minimum_output=256):')
    text = once(text, 'token, output = reserve(folder, counted, requested)',
        'token, output = reserve(folder, counted, requested, minimum_output=minimum_output)')
    return text
