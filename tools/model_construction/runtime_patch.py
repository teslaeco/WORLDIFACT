"""Finite prospective runtime transform. No filesystem or service mutation."""
import hashlib

import construction_spend_patch
import gateway_patch

EXPECTED = {
    'server.py': 'd401a99fc2b271b886fa8c629e802d107ec8f6f05eb3da99c27dab040abc4c97',
    'codex_runner.py': '71066e32e858e7e81a45e597d7472d00c77bb699355e833bf948c3e78c20eed5',
    'blender_mcp.py': '85c4fe62f76aaa33e87a40ec0db03965e1ffac0a28b1459a73e3676bf66b020b',
    'astra_spend_v2.py': 'eafbf9d261b471bb5e10b2e5bf7def25a75909c019a5ec658abb855b11483673',
    'completion_policy.py': '664e9f3b2326116fe9aeeb78e7a84aac254ca8a3054cdccdfb5224e112890110',
    'prebuild_policy.py': 'b157f93ab4c68402f921576b897ea05f2b68454092167731c74fd9ee45b87033',
    'studio_pricing.py': 'ad765f9193e973146a8fd9e0761d13006ba939db7926275f628ad21c83350584',
    'terminal_budget.py': '3e8a1654aede456eeeb673bb67f508a56996602239c56127123ba7e71a5a39f0',
    'context_policy.py': 'cb87fd0d342ef94a6c5f0f306ea3891669aaf70feed9830f7058de6087a4cd59',
}
HELPERS = frozenset(('construction_policy.py', 'phased_controller.py',
    'construction_payload.py', 'runtime_controller.py', 'construction_health.py'))
MODIFIED = frozenset(('codex_runner.py', 'astra_spend_v2.py', 'context_policy.py'))


def once(text, before, after):
    if text.count(before) != 1:
        raise ValueError('Exact reviewed runtime anchor required.')
    return text.replace(before, after, 1)


def changes(original, helpers):
    if ({name: hashlib.sha256(raw).hexdigest() for name, raw in original.items()} != EXPECTED
            or set(helpers) != HELPERS):
        raise ValueError('Exact installed context-v2 source and complete helper set required.')
    result = dict(original)
    runner = gateway_patch.changes(original['codex_runner.py']).decode()
    runner = once(runner, 'import context_policy\n', 'import context_policy\nimport runtime_controller\n')
    runner = once(runner,
        'def run(folder,prompt,instructions,key,cancelled,progress,binary=None):\n',
        'def run(folder,prompt,instructions,key,cancelled,progress,binary=None):\n'
        '    if runtime_controller.eligible(Path(folder),instructions):\n'
        '        return runtime_controller.run(folder,prompt,instructions,key,cancelled,progress,gateway_factory=Gateway)\n')
    result['codex_runner.py'] = runner.encode()
    result['astra_spend_v2.py'] = construction_spend_patch.changes(original['astra_spend_v2.py'])
    context = original['context_policy.py'].decode()
    context = once(context,
        "        return {'worldifactStandardContextPolicy': REVISION}\n",
        "        import construction_health\n"
        "        construction = construction_health.verified_health(root)\n"
        "        return {'worldifactStandardContextPolicy': REVISION, **construction} if construction else {}\n")
    context = once(context,
        '    except (OSError, ValueError, TypeError, KeyError, AttributeError):\n',
        '    except (OSError, ValueError, TypeError, KeyError, AttributeError, ImportError):\n')
    result['context_policy.py'] = context.encode()
    result.update(helpers)
    for name, raw in result.items():
        if not isinstance(raw, bytes) or not 0 < len(raw) <= 1048576:
            raise ValueError('Invalid bounded runtime helper.')
        compile(raw, name, 'exec')
    if any(result[name] != original[name] for name in EXPECTED.keys() - MODIFIED):
        raise ValueError('Unexpected legacy runtime modification.')
    return result
