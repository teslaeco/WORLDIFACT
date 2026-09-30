"""Synthetic event fixtures, not evidence of new live model generation."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import generation_report as report

CANARY = 'PRIVATE_CANARY_dont_echo_prompt_token_path_or_code'


class ToolEventsTest(unittest.TestCase):
    def test_started_and_completed_are_one_terminal_call_not_two_invocations(self):
        trace = {'calls': [
            {'tool': 'get_modeling_contract', 'status': 'started'},
            {'tool': 'get_modeling_contract', 'status': 'completed'},
        ], 'total_calls': 1, 'failures': 0, 'build_attempts': 0, 'revision': 0}
        result = report.tool_summary(trace)
        self.assertEqual(result['eventsByTool']['get_modeling_contract'],
                         {'started': 1, 'completed': 1, 'failed': 0, 'unknown': 0})
        self.assertEqual(result['workerRecordedTerminalCalls'], 1)
        self.assertEqual(result['workerRecordedBuildAttempts'], 0)

    def test_failed_argument_validation_does_not_become_a_started_blender_build(self):
        result = report.tool_summary({'calls': [
            {'tool': 'build_model', 'status': 'failed', 'attempt': None,
             'error': 'Nieprawidlowe argumenty MCP; wymagane pola: ' + CANARY}
        ], 'build_attempts': 0, 'revision': 0, 'failures': 1, 'total_calls': 1})
        self.assertEqual(result['eventsByTool']['build_model']['started'], 0)
        self.assertEqual(result['workerRecordedBuildAttempts'], 0)
        self.assertEqual(result['recentEvents'][0]['errorCategory'], 'MCP_ARGUMENT_SCHEMA_ERROR')
        self.assertIsNone(result['recentEvents'][0]['attempt'])
        self.assertNotIn(CANARY, json.dumps(result))

    def test_started_build_is_not_a_success_or_a_proven_failure(self):
        result = report.tool_summary({'calls': [{'tool': 'build_model', 'status': 'started'}]})
        self.assertEqual(result['eventsByTool']['build_model']['completed'], 0)
        self.assertEqual(result['eventsByTool']['build_model']['failed'], 0)
        self.assertIsNone(result['workerRecordedTerminalCalls'])
        self.assertIsNone(result['workerRecordedBuildAttempts'])

    def test_failed_dispatched_candidate_retains_numeric_stage_without_private_error(self):
        result = report.tool_summary({'calls': [
            {'tool': 'build_model', 'status': 'started', 'revision': 0, 'build_attempts': 0},
            {'tool': 'build_model', 'status': 'failed', 'revision': 0, 'attempt': 1,
             'build_attempts': 1, 'error': 'ANATOMY_VALIDATION: ' + CANARY},
        ], 'build_attempts': 1, 'revision': 0, 'failures': 1})
        self.assertEqual(result['recentEvents'][-1]['errorCategory'], 'ANATOMY_VALIDATION')
        self.assertEqual(result['recentEvents'][-1]['attempt'], 1)
        self.assertEqual(result['workerRecordedRevision'], 0)
        self.assertNotIn(CANARY, json.dumps(result))

    def test_original_render_tool_is_recognized(self):
        result = report.tool_summary({'calls': [{'tool': 'inspect_render', 'status': 'completed'}]})
        self.assertEqual(result['eventsByTool']['inspect_render']['completed'], 1)

    def test_arbitrary_or_malformed_fields_never_leak_or_coerce_into_numbers(self):
        result = report.tool_summary({'calls': [
            {'tool': [CANARY], 'status': {CANARY: True}, 'revision': True,
             'build_attempts': -1, 'attempt': '99', 'error': CANARY}, None,
            {'tool': 'finish_model', 'status': CANARY, 'error': {'message': CANARY}},
        ], 'total_calls': True, 'revision': CANARY, 'failures': -1, 'build_attempts': 1.2})
        self.assertNotIn(CANARY, json.dumps(result))
        self.assertEqual(result['invalidInspectedRows'], 1)
        self.assertIsNone(result['workerRecordedTerminalCalls'])
        self.assertIsNone(result['workerRecordedBuildAttempts'])
        self.assertEqual(result['recentEvents'][0]['state'], 'unknown')
        self.assertEqual(result['recentEvents'][0]['errorCategory'], 'UNCLASSIFIED_RECORDED_ERROR')

    def test_absent_trace_is_unknown_and_empty_window_does_not_invent_total(self):
        for value in [None, [], {'calls': None}, {'calls': {}}, 'bad']:
            self.assertEqual(report.tool_summary(value), {'status': 'UNAVAILABLE'})
        result = report.tool_summary({'calls': []})
        self.assertIsNone(result['workerRecordedTerminalCalls'])
        self.assertEqual(result['eventsByTool'], {})

    def test_output_is_bounded_and_original_order_is_retained(self):
        source = [{'tool': 'build_model', 'status': 'started', 'revision': i} for i in range(1000)]
        result = report.tool_summary({'calls': source, 'total_calls': 50})
        self.assertEqual(result['retainedEventRows'], 1000)
        self.assertEqual(result['inspectedEventRows'], 500)
        self.assertEqual(len(result['recentEvents']), 12)
        self.assertEqual([v['revision'] for v in result['recentEvents']], list(range(988, 1000)))
        self.assertEqual(result['workerRecordedTerminalCalls'], 50)

    def test_error_prefixes_are_allowlisted_not_echoed_or_searched_inside_private_text(self):
        for prefix, category in report.ERROR_PREFIXES.items():
            self.assertEqual(report.error_category(prefix + ' ' + CANARY), category)
        self.assertEqual(report.error_category(CANARY + ' ReferenceError:'), 'UNCLASSIFIED_RECORDED_ERROR')
        self.assertEqual(report.error_category(None), 'NOT_RECORDED')

    def test_local_integrated_report_never_writes_or_invokes_subprocess(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            job = root / 'state/jobs/11111111-2222-3333-4444-555555555555'
            job.mkdir(parents=True)
            path = job / 'agent-tools.json'
            path.write_text(json.dumps({'calls': [
                {'tool': 'get_modeling_contract', 'status': 'started'},
                {'tool': 'get_modeling_contract', 'status': 'completed'},
                {'tool': 'build_model', 'status': 'failed', 'error': 'TypeError: ' + CANARY},
            ], 'total_calls': 2, 'failures': 1, 'build_attempts': 0, 'revision': 0}))
            before = path.read_bytes()
            with patch.object(report.subprocess, 'run', side_effect=AssertionError('Not allowed')):
                value = report.inspect(root)
            self.assertEqual(path.read_bytes(), before)
            self.assertFalse(value['paidGenerationRequested'])
            item = value['jobs'][0]
            self.assertEqual(item['toolCalls'], {'get_modeling_contract': 2, 'build_model': 1})
            self.assertEqual(item['toolCallsMeaning'], 'LEGACY_EVENT_ROW_COUNTS_NOT_INVOCATIONS')
            self.assertEqual(item['toolTrace']['workerRecordedBuildAttempts'], 0)
            self.assertNotIn(CANARY, json.dumps(value))
            self.assertEqual(item['artifacts']['model.glb']['status'], 'MISSING')


if __name__ == '__main__':
    unittest.main()
