"""Produce a transport repair for the exact inspected Oracle runtime.

This module only transforms source bytes. It does not install, change receipts,
restart services, access credentials, or call a model provider.
"""
import ast
import hashlib

EXPECTED = {
    'blender_mcp.py': '85c4fe62f76aaa33e87a40ec0db03965e1ffac0a28b1459a73e3676bf66b020b',
    'codex_runner.py': 'ebcc149256ef3f54ad5b082b16f54719a30a66e6e2b94dfc2fe5f994f2f9f8fa',
}

ERROR_READER = '''def code_errors(value, depth=0):
    """Read actual execution failures, including MCP isError envelopes."""
    if depth > 10:return []
    if isinstance(value, str):
        if len(value)>200000:return []
        try:return code_errors(json.loads(value),depth+1)
        except (ValueError,TypeError):
            if 'tool call error: tool call failed for' in value and 'Transport closed' in value:
                return ['MCP_TRANSPORT_CLOSED: tool process exited; no further provider request.']
            return [match.group(0)[:1200] for line in value.splitlines()
                    for match in [re.search(r'\\b(?:ReferenceError|TypeError|SyntaxError|RangeError|Error):.*',line)] if match][:3]
    if isinstance(value,list):
        return [error for item in value[:30] for error in code_errors(item,depth+1)][:3]
    if isinstance(value,dict):
        if value.get('type') in ('image','input_image','reasoning'):return []
        errors=[]
        if isinstance(value.get('error'),str):errors.append(value['error'][:1200])
        elif isinstance(value.get('error'),dict):
            message=value['error'].get('message')
            if isinstance(message,str):errors.append(message[:1200])
        for name in ('output','content','text','result'):
            if name in value:errors.extend(code_errors(value[name],depth+1))
        if value.get('isError') is True and not errors:
            content=value.get('content')
            if isinstance(content,list):
                messages=[block['text'][:1200] for block in content[:30]
                          if isinstance(block,dict) and block.get('type')=='text'
                          and isinstance(block.get('text'),str) and block['text']]
                errors=messages or ['MCP_TOOL_ERROR: tool returned isError=true.']
            else:errors=['MCP_TOOL_ERROR: tool returned isError=true.']
        return errors[:3]
    return []
'''

OLD_READER = '''    for raw in incoming:
        if len(raw)>600000:break
'''
NEW_READER = '''    # A 256,000-character scene can exceed 600,000 wire characters after
    # JSON escaping. Keep the existing scene/argument limits, but accept its
    # bounded transport envelope so validation can return a repairable error.
    # readline is bounded before allocation; pathological frames still close.
    while True:
        raw = incoming.readline(2 * 1024 * 1024 + 1)
        if not raw:break
        if len(raw)>2 * 1024 * 1024:break
'''
OLD_OBSERVE = '                        outer.observe_execution(payload)\n'
NEW_OBSERVE = OLD_OBSERVE + '''                        if any(error.startswith('MCP_TRANSPORT_CLOSED:')
                               for call in outer.execution_calls for error in call.get('errors',[])):
                            outer.stop('FORGE_MCP_TRANSPORT_CLOSED',
                                       'Blender MCP process exited. No further provider request; preserve this job for diagnosis.')
                            return self.reject(422,outer.error,outer.error_code)
'''


def once(text, old, new):
    if text.count(old) != 1:
        raise ValueError('Exact source anchor missing or duplicated')
    return text.replace(old, new, 1)


def patch_sources(originals):
    if set(originals) != set(EXPECTED):
        raise ValueError('Both inspected source files are required')
    if any(hashlib.sha256(originals[name]).hexdigest() != digest
           for name, digest in EXPECTED.items()):
        raise ValueError('Runtime differs from inspected source; do not overwrite')
    mcp = once(originals['blender_mcp.py'].decode(), OLD_READER, NEW_READER)
    runner = originals['codex_runner.py'].decode()
    tree = ast.parse(runner)
    node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'code_errors')
    runner = once(runner, ast.get_source_segment(runner, node), ERROR_READER.rstrip())
    runner = once(runner, OLD_OBSERVE, NEW_OBSERVE)
    output = {'blender_mcp.py': mcp.encode(), 'codex_runner.py': runner.encode()}
    for name, raw in output.items():
        compile(raw, name, 'exec')
    return output
