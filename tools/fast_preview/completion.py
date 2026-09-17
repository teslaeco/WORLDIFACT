"""Finish the reviewed FAST runner patch without changing STANDARD behavior.

Applied during source assembly only; no runtime monkey-patching or deployment.
"""


def once(source, old, new):
    if source.count(old) != 1:
        raise ValueError('FAST completion patch context changed; assembly stopped.')
    return source.replace(old, new, 1)


def finish_patch(name, source):
    if name != 'codex_runner.py':
        return source
    # The per-turn developer message must agree with the opted-in FAST task.
    # Previously it still quoted 32 turns and directed the model toward renders
    # and finish_model, even though those operations were deferred by FAST.
    source = once(source, '    def execution_guidance(self):\n        candidate={}', '''    def execution_guidance(self):
        if self.fast_limits['fast']:
            remaining=max(0,self.fast_limits['requests']-self.requests)
            text=('FAST DRAFT execution state: model requests remaining=%d; one build only. '
                  'Use registered Blender MCP tools inside Code Mode exec. Each exec has fresh variables; '
                  'use store/load or define the complete scene in the same call that builds it. '
                  'After get_modeling_contract, promptly call build_model with a compact valid scene. '
                  'Always await the call and print its result. If exec returns a running cell, await '
                  'that same cell; do not start another build. The trusted host delivers the first '
                  'structurally checked current GLB as UNREVIEWED. Visual assessment and optional '
                  'formats are deferred: do not call inspect_render, edit_model or finish_model. '
                  'Do not announce visual acceptance or ask for another model turn after the draft exists. '
                  'Do not substitute a stock model or silently switch to STANDARD. ')%remaining
            if self.execution_calls and self.execution_calls[-1]['errors']:
                text+='Correct this exact failed call without repeating paid work: '+self.execution_calls[-1]['errors'][0]
            return text
        candidate={}''')
    # Keep the CLI and trusted gateway in agreement. This is reasoning effort,
    # not a paid service-tier change. STANDARD continues to use high.
    source = once(source, "'model_reasoning_effort':'high','web_search':'disabled',",
                  "'model_reasoning_effort':'low' if fast_preview.read_profile(folder)==fast_preview.PROFILE else 'high','web_search':'disabled',")
    # An early successful return used to skip the ordinary event-reader join.
    # Drain the terminated child's stdout while its log file is still open.
    source = once(source, '''                    finally:
                        terminate()
                    return fast_result''', '''                    finally:
                        terminate()
                        reader.join(timeout=3)
                        if not reader.is_alive():
                            process.stdout.close()
                    return fast_result''')
    compile(source, name, 'exec')
    return source
