"""In-memory delta from the exact installed prebuild revision. No installer."""
import hashlib

EXPECTED = {
    'server.py': '3cb77049eb3693ea2b2dd018815797aab5c9b6716d1ed7dd06848a91e82bdf1c',
    'codex_runner.py': 'bc8db1e2694cf3144bf19fa0b46fa93475624fa47f07b00daa886d15415d4412',
    'blender_mcp.py': '85c4fe62f76aaa33e87a40ec0db03965e1ffac0a28b1459a73e3676bf66b020b',
    'astra_spend_v2.py': 'd76c2e30fa696713cceaa6178a9ae91b44592c403ad38ab66c50029498be8adc',
    'completion_policy.py': '664e9f3b2326116fe9aeeb78e7a84aac254ca8a3054cdccdfb5224e112890110',
    'prebuild_policy.py': 'b157f93ab4c68402f921576b897ea05f2b68454092167731c74fd9ee45b87033',
}


def once(text, old, new):
    if text.count(old) != 1:
        raise ValueError('Reviewed context patch differs.')
    return text.replace(old, new, 1)


def changes(original, helper):
    if set(original) != set(EXPECTED):
        raise ValueError('Unexpected context source set.')
    for name, digest in EXPECTED.items():
        if hashlib.sha256(original[name]).hexdigest() != digest:
            raise ValueError('Unreviewed prebuild source: ' + name)
    runner = once(original['codex_runner.py'].decode(), 'import prebuild_policy\n',
                  'import prebuild_policy\nimport context_policy\n')
    runner = once(runner,
        "    task=(prebuild_policy.initial_task(folder,completion_request) if prebuild_policy.active(completion_request,fast_limits['fast']) else completion_policy.guidance(completion_request)+task if not fast_limits['fast'] else task)",
        "    task=(context_policy.initial_task(folder,completion_request) if context_policy.active(completion_request,fast_limits['fast']) else prebuild_policy.initial_task(folder,completion_request) if prebuild_policy.active(completion_request,fast_limits['fast']) else completion_policy.guidance(completion_request)+task if not fast_limits['fast'] else task)")
    runner = once(runner, '    def execution_guidance(self):\n',
        "    def execution_guidance(self):\n        if context_policy.active(self.completion_request,self.fast_limits['fast']):return context_policy.turn_guidance(self)\n")
    result = {**original, 'codex_runner.py': runner.encode(), 'context_policy.py': helper}
    for name, raw in result.items():
        compile(raw, name, 'exec')
    return result
