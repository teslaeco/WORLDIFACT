"""Synthetic source/presentation/runtime regression checks. No provider calls."""
import ast
from copy import deepcopy
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(os.environ.get('MODEL_CONTEXT_ANCESTOR', os.environ.get(
    'MODEL_COMPLETION_SOURCE', ROOT / '.model-completion-source/oracle_connector')))
sys.path[:0] = [str(ROOT / 'tools/model_prebuild'), str(ROOT / 'tools/model_completion'), str(SOURCE)]
import completion_policy
import prebuild_patch
import prebuild_policy
import context_patch
import context_policy
from scene_repair import photo_schema
from runtime.scene_contract import PROMPT, parse_scene


def before_sources():
    if os.environ.get('MODEL_CONTEXT_ANCESTOR'):
        original = {name: (SOURCE / name).read_bytes() for name in prebuild_patch.EXPECTED}
    else:
        import source_fixture, source_patch, reviewed_direct_export
        original = source_fixture.installed_sources(SOURCE)
        original['server.py'] = reviewed_direct_export.patch_server(original['server.py'].decode()).encode()
        original.update(source_patch.changes({name: original[name] for name in source_patch.EXPECTED},
                                            Path(completion_policy.__file__).read_bytes()))
        original = {name: original[name] for name in prebuild_patch.EXPECTED}
    return prebuild_patch.changes(original, (ROOT / 'tools/model_prebuild/prebuild_policy.py').read_bytes())


def expanded(schema):
    defs = schema['$defs']
    def walk(value):
        if isinstance(value, dict):
            if '$ref' in value:
                return walk(defs[value['$ref'].split('/')[-1]])
            return {key: walk(child) for key, child in value.items() if key != '$defs'}
        if isinstance(value, list):
            return [walk(child) for child in value]
        return value
    return walk(schema)


def run_node(source):
    return next(node for node in ast.parse(source).body if isinstance(node, ast.FunctionDef) and node.name == 'run')


def task_assignments(source):
    return [node for node in run_node(source).body if isinstance(node, ast.Assign)
            and any(isinstance(target, ast.Name) and target.id == 'task' for target in node.targets)]


def initial(source, folder, request, fast=False):
    env = {**request, 'folder': folder, 'completion_request': request,
           'fast_limits': {'fast': fast}, 'completion_policy': completion_policy,
           'prebuild_policy': prebuild_policy, 'context_policy': context_policy}
    assignments = task_assignments(source)
    exec(compile(ast.Module(body=assignments, type_ignores=[]), 'synthetic_task', 'exec'), env)
    return env['task']


def guidance(source, gateway):
    node = next(node for node in ast.walk(ast.parse(source))
                if isinstance(node, ast.FunctionDef) and node.name == 'execution_guidance')
    env = {'json': json, 'MAX_REQUESTS': 32, 'completion_policy': completion_policy,
           'prebuild_policy': prebuild_policy, 'context_policy': context_policy}
    exec(compile(ast.Module(body=[node], type_ignores=[]), 'synthetic_guidance', 'exec'), env)
    return env['execution_guidance'](gateway)


class ContextTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.before = before_sources()
        cls.after = context_patch.changes(cls.before, Path(context_policy.__file__).read_bytes())

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.request = {'prompt': 'Synthetic dragon with wings, tail and horns.',
                        'instructions': completion_policy.STANDARD + '\nPreserve its asymmetry and all requested detail.'}

    def gateway(self, request=None):
        return types.SimpleNamespace(folder=self.folder, completion_request=request or self.request,
                                     fast_limits={'fast': False, 'requests': 32}, requests=12, execution_calls=[])

    def test_exact_deployed_prebuild_ancestor_required(self):
        self.assertEqual(set(self.after), set(self.before) | {'context_policy.py'})
        for name in self.before:
            if name not in ('codex_runner.py', 'server.py'):
                self.assertEqual(self.before[name], self.after[name])
            with self.assertRaises(ValueError):
                context_patch.changes({**self.before, name: self.before[name] + b'\n'}, b'')
        with self.assertRaises(ValueError):
            context_patch.changes({**self.before, 'unknown.py': b''}, b'')

    def test_all_subjects_primitives_and_photo_constraints_survive_display_factoring(self):
        for count in (0, 1, 3, 4):
            refs = [{'name': 'Reference ' + str(i), 'view': ['front', 'left', 'right', 'back'][i],
                     'subject': 'Same subject'} for i in range(count)]
            with patch('photo_input.read_photos', return_value=refs):
                task = context_policy.initial_task(self.folder, self.request)
            schema_text = task.split('\nCOMPLETE SCENE SCHEMA:\n', 1)[1].split('\nCOMPLETE GEOMETRY GUIDE:\n', 1)[0]
            raw = photo_schema(count)
            self.assertEqual(expanded(json.loads(schema_text)), raw)
            self.assertEqual(raw['properties']['subject_type']['enum'], ['object', 'animal', 'person', 'portrait'])
            self.assertEqual(len(raw['properties']['parts']['items']['anyOf']), 18)
            self.assertIn('\nCOMPLETE GEOMETRY GUIDE:\n' + PROMPT + '\nORDERED REFERENCE MAPPING:\n', task)
            mapping = task.split('\nORDERED REFERENCE MAPPING:\n', 1)[1].split('\nUSER BRIEF:\n', 1)[0]
            self.assertEqual(json.loads(mapping), [{**ref, 'index': i} for i, ref in enumerate(refs)])

    def test_original_unicode_brief_and_instructions_are_never_clipped(self):
        request = {'prompt': 'Preserve exact text 🐉 ' + 'ą' * 4000,
                   'instructions': completion_policy.STANDARD + '\n' + 'Keep the user’s full instruction. ' * 1000}
        task = context_policy.initial_task(self.folder, request)
        self.assertTrue(task.endswith('\nUSER BRIEF:\n' + request['prompt'] + '\nEXECUTION INSTRUCTIONS:\n' + request['instructions']))
        self.assertEqual(task.count(request['prompt']), 1)
        self.assertEqual(task.count(request['instructions']), 1)

    def test_only_explicit_standard_profile_uses_new_task_and_guidance(self):
        cases = [(completion_policy.STANDARD, False, True), (completion_policy.REFERENCE, False, True),
                 (completion_policy.STANDARD, True, False), (completion_policy.CABINET, False, False),
                 (completion_policy.CHARACTER, False, False), ('ordinary Froge request', False, False)]
        for marker, fast, selected in cases:
            request = {**self.request, 'instructions': marker}
            self.assertEqual(context_policy.active(request, fast), selected)
            before = initial(self.before['codex_runner.py'], self.folder, request, fast)
            after = initial(self.after['codex_runner.py'], self.folder, request, fast)
            g = self.gateway(request); g.fast_limits['fast'] = fast
            if selected:
                self.assertEqual(after, context_policy.initial_task(self.folder, request))
                self.assertEqual(guidance(self.after['codex_runner.py'], g), context_policy.turn_guidance(g))
            else:
                self.assertEqual(after, before)
                self.assertEqual(guidance(self.after['codex_runner.py'], g), guidance(self.before['codex_runner.py'], g))
        self.assertFalse(context_policy.active({'prompt': completion_policy.STANDARD, 'instructions': ''}))

    def test_runner_security_spend_completion_and_continuation_are_unchanged(self):
        before = ast.parse(self.before['codex_runner.py'])
        after = ast.parse(self.after['codex_runner.py'])
        after.body = [node for node in after.body if not (isinstance(node, ast.Import)
                      and any(alias.name == 'context_policy' for alias in node.names))]
        old_run = next(node for node in before.body if isinstance(node, ast.FunctionDef) and node.name == 'run')
        new_run = next(node for node in after.body if isinstance(node, ast.FunctionDef) and node.name == 'run')
        old_task = task_assignments(self.before['codex_runner.py'])[-1]
        new_task = task_assignments(self.after['codex_runner.py'])[-1]
        new_run.body = [deepcopy(old_task) if ast.dump(node) == ast.dump(new_task) else node for node in new_run.body]
        self.assertEqual(ast.dump(old_run), ast.dump(new_run))
        for node in ast.walk(after):
            if isinstance(node, ast.FunctionDef) and node.name == 'execution_guidance':
                node.body.pop(0)  # Only the new STANDARD routing branch.
        self.assertEqual(ast.dump(before), ast.dump(after))

    def test_current_revision_guidance_keeps_errors_and_never_claims_review(self):
        g = self.gateway()
        self.assertIn('revision=0', guidance(self.after['codex_runner.py'], g))
        (self.folder / 'agent-candidate.json').write_text('{"revision":2}')
        g.execution_calls = [{'errors': ['Specific synthetic schema failure.']}]
        value = guidance(self.after['codex_runner.py'], g)
        self.assertIn('revision=2; model requests remaining=20', value)
        self.assertIn('Assess returned pixels on the next turn', value)
        self.assertTrue(value.endswith('Specific synthetic schema failure.'))
        self.assertNotIn(completion_policy.guidance(self.request), value)
        self.assertLess(len(value), 500)

    def test_real_adapter_standard_text_and_contract_context_are_reduced(self):
        js = """import {oracleStudioPayload} from './src/lib/studioProtocol.ts';
console.log(JSON.stringify(oracleStudioPayload('synthetic',{worldId:'enchanted-ai-shop',
prompt:'Create a detailed dragon with wings, tail, horns and scales.',purpose:'object',textureMaxSize:4096,photos:[]})));"""
        adapter = json.loads(subprocess.run(['node', '--input-type=module', '-'], input=js, text=True,
                                           capture_output=True, check=True, cwd=ROOT).stdout)
        request = {'prompt': adapter['prompt'], 'instructions': adapter['agentInstructions']}
        mcp = ast.parse(self.before['blender_mcp.py'])
        branch = next(node for node in ast.walk(mcp) if isinstance(node, ast.If)
                      and isinstance(node.test, ast.Compare) and isinstance(node.test.left, ast.Name)
                      and node.test.left.id == 'name' and any(isinstance(v, ast.Constant)
                      and v.value == 'get_modeling_contract' for v in node.test.comparators))
        owner = types.SimpleNamespace(folder=Path('/synthetic'), request=request, photos=[], revision=0)
        contract = eval(compile(ast.Expression(branch.body[0].value), 'synthetic_contract', 'eval'),
                        {'self': owner, 'photo_schema': photo_schema, 'completion_policy': completion_policy, 'PROMPT': PROMPT})
        g = self.gateway(request); g.requests = 1
        old = len(initial(self.before['codex_runner.py'], self.folder, request)) + len(prebuild_policy.compact_json(contract)) + len(guidance(self.before['codex_runner.py'], g))
        new = len(initial(self.after['codex_runner.py'], self.folder, request)) + len(guidance(self.after['codex_runner.py'], g))
        self.assertLess(new, old * .76)
        print('STANDARD_SYNTHETIC_CHARACTERS before=%d after=%d; NOT token/cost evidence' % (old, new))

    def test_first_exec_preserves_full_contract_and_builds_actual_scene_data(self):
        # Exercise the described Code Mode calls with inert tool doubles and
        # validate the captured build data using the unchanged real parser.
        scene = {'version': 2, 'name': 'Synthetic animal shape', 'subject_type': 'animal',
                 'materials': [{'name': 'skin', 'rgb': [.2, .4, .2], 'pattern': 'plain', 'roughness': .7, 'metallic': 0, 'emission': 0}],
                 'parts': [{'kind': 'ellipsoid', 'name': 'body', 'material': 'skin', 'center': [0, 0, 1], 'radii': [.8, .4, .6]}],
                 'reference_views': []}
        # Read dimensions/fields from the canonical primitive schema, rather
        # than introducing an alternate validator in the test harness.
        variant = next(p for p in photo_schema(0)['properties']['parts']['items']['anyOf'] if p['properties']['kind']['enum'] == ['ellipsoid'])
        self.assertEqual(set(scene['parts'][0]), set(variant['required']))
        parsed = parse_scene(json.dumps(scene), self.request['prompt'])
        contract = {'scene_schema': photo_schema(0), 'coordinate_and_geometry_guide': PROMPT,
                    'prompt': self.request['prompt'], 'instructions': self.request['instructions'],
                    'edit_helpers': 'unchanged synthetic helper field', 'references': [], 'revision': 0}
        program = 'const contract=' + json.dumps(contract) + ', scene=' + json.dumps(parsed) + ''';
const values=new Map(), calls=[], printed=[];
const store=(k,v)=>values.set(k,v);const text=v=>printed.push(v);
const tools={mcp__blender__get_modeling_contract:async a=>{calls.push('contract');return {content:[{type:'text',text:JSON.stringify(contract)}]};},
mcp__blender__build_model:async a=>{calls.push('build');return {revision:1,args:a};}};
const r=await tools.mcp__blender__get_modeling_contract({});
store("contract",JSON.parse(r.content.find(b=>b.type==="text").text));
text(await tools.mcp__blender__build_model({scene_json:JSON.stringify(scene),expected_revision:0}));
console.log(JSON.stringify({calls,printed,stored:values.get('contract')}));'''
        result = json.loads(subprocess.run(['node', '--input-type=module', '-'], input=program, text=True,
                                          capture_output=True, check=True).stdout)
        self.assertEqual(result['calls'], ['contract', 'build'])
        self.assertEqual(result['stored'], contract)
        self.assertEqual(len(result['printed']), 1)
        self.assertEqual(result['printed'][0]['args']['expected_revision'], 0)
        self.assertEqual(parse_scene(result['printed'][0]['args']['scene_json'], self.request['prompt']), parsed)


if __name__ == '__main__':
    unittest.main()
