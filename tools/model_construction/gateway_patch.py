"""Unwired exact-source Gateway transform for the reviewed construction host.

This does not install code, run a model, reserve money, or change run()/the CLI.
The host uses the original loopback token plus a one-use payload-bound permit.
The sole original spend.protect/settle_completed path remains spending authority.
Permit expiry uses time.monotonic(), as does the original completion deadline.
"""
import hashlib
import textwrap


EXPECTED = '71066e32e858e7e81a45e597d7472d00c77bb699355e833bf948c3e78c20eed5'


def once(text, old, new):
    if text.count(old) != 1:
        raise ValueError('Reviewed Gateway source anchor changed.')
    return text.replace(old, new, 1)


METHODS = '''
    @staticmethod
    def _construction_json(raw):
        def unique(pairs):
            result = {}
            for key, value in pairs:
                if key in result: raise ValueError('Duplicate construction JSON key.')
                result[key] = value
            return result
        value = json.loads(raw,object_pairs_hook=unique)
        json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False)
        return value

    @staticmethod
    def _construction_payload(raw):
        if type(raw) is not bytes or not 0 < len(raw) <= 32 * 1024**2:
            raise ValueError('Invalid construction payload bytes.')
        payload = Gateway._construction_json(raw.decode('utf-8'))
        allowed = {'model','input','instructions','tools','tool_choice','text','reasoning',
                   'parallel_tool_calls','truncation','max_output_tokens','store','stream',
                   'service_tier','background','previous_response_id','conversation','prompt'}
        if (not isinstance(payload,dict) or set(payload)-allowed
                or payload.get('model') != MODEL or payload.get('tools') != []
                or type(payload.get('tools')) is not list
                or payload.get('store') is not False or payload.get('stream') is not True
                or payload.get('service_tier') != 'default'
                or not isinstance(payload.get('reasoning'),dict)
                or payload['reasoning'].get('effort') != 'low'
                or type(payload.get('max_output_tokens')) is not int
                or not 256 <= payload['max_output_tokens'] <= 16000
                or payload.get('truncation','disabled') != 'disabled'
                or payload.get('tool_choice','none') != 'none'
                or payload.get('background',False) is not False
                or any(payload.get(key) is not None for key in ('previous_response_id','conversation','prompt'))
                or not isinstance(payload.get('input'),(str,list))):
            raise ValueError('Construction requires an exact direct bounded payload.')
        if isinstance(payload['input'],list) and any(
                not isinstance(item,dict) or item.get('type') == 'additional_tools'
                for item in payload['input']):
            raise ValueError('Construction does not accept a hidden tool catalogue.')
        if list(request_tools(payload)):
            raise ValueError('Construction does not expose provider tools.')
        return payload

    @staticmethod
    def _construction_digest(value):
        return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,
            separators=(',',':'),allow_nan=False).encode('utf-8')).hexdigest()

    def _construction_ready(self):
        # Caller holds the SAME lock that owns original request/active counters.
        if (not self.construction or self.fast_limits['fast'] or self.active
                or self.error or self.error_code or self.upstream_status is not None
                or self.unknown_usage or self.completed or self.cancelled.is_set()
                or (self.folder/'agent-cancelled').exists()
                or self.requests >= self.fast_limits['requests']
                or self.output >= self.fast_limits['output']
                or time.monotonic()-self.completion_started >= self.fast_limits['seconds']):
            raise ValueError('Construction Gateway is not ready for another request.')

    def prepare_construction(self,payload_bytes,execution_id,phase,context_sha256,
                             admission_sha256,max_input_tokens,
                             protected_remaining_micro_usd,protected_remaining_requests,expires_at):
        payload = self._construction_payload(payload_bytes)
        integer = astra_spend_v2.integer
        if (not isinstance(execution_id,str) or not execution_id
                or execution_id != self.completion_request.get('execution_id')
                or phase not in ('construction','inspection','reassessment')
                or any(not isinstance(value,str) or re.fullmatch('[0-9a-f]{64}',value) is None
                       for value in (context_sha256,admission_sha256))
                or not integer(max_input_tokens,0,65536)
                or not integer(protected_remaining_micro_usd,0,1750000)
                or not integer(protected_remaining_requests,0,31)
                or type(expires_at) not in (int,float)
                or not time.monotonic() < expires_at <= self.completion_started+self.fast_limits['seconds']):
            raise ValueError('Invalid construction permit binding or capacity.')
        with self.lock:
            self._construction_ready()
            if self._construction_pending is not None:
                raise ValueError('A construction permit is already pending.')
            if (self.requests+1+protected_remaining_requests > self.fast_limits['requests']
                    or self.output+payload['max_output_tokens'] > self.fast_limits['output']):
                raise ValueError('Construction exceeds the original request/output limits.')
            permit_id = secrets.token_urlsafe(32)
            if permit_id in self._construction_permits:
                raise ValueError('Construction permit identity collision.')
            permit = {'permit_id':permit_id,'execution_id':execution_id,'phase':phase,
                'context_sha256':context_sha256,'admission_sha256':admission_sha256,
                'payload_sha256':hashlib.sha256(payload_bytes).hexdigest(),
                'canonical_sha256':self._construction_digest(payload),
                'max_input_tokens':max_input_tokens,'max_output_tokens':payload['max_output_tokens'],
                'protected_remaining_micro_usd':protected_remaining_micro_usd,
                'protected_remaining_requests':protected_remaining_requests,
                'expires_at':expires_at,'sequence':self.requests+1,'consumed':False}
            self._construction_permits[permit_id] = permit
            self._construction_pending = permit_id
            return {'permit_id':permit_id,'payload_sha256':permit['payload_sha256']}

    def _consume_construction(self,permit_id,payload_bytes):
        # Invoked only within the original admission lock, before either counter.
        self._construction_ready()
        permit = self._construction_permits.get(permit_id)
        if (not permit or permit['consumed'] or self._construction_pending != permit_id
                or not time.monotonic() < permit['expires_at']
                or permit['sequence'] != self.requests+1
                or permit['execution_id'] != self.completion_request.get('execution_id')
                or not hmac.compare_digest(permit['payload_sha256'],hashlib.sha256(payload_bytes).hexdigest())
                or self.requests+1+permit['protected_remaining_requests'] > self.fast_limits['requests']
                or self.output+permit['max_output_tokens'] > self.fast_limits['output']):
            raise ValueError('Missing, changed, expired, or already consumed construction permit.')
        permit['consumed'] = True
        self._construction_pending = None
        return dict(permit)

    def _protect_construction(self,payload,headers,permit):
        def bounded_count(value,count_headers):
            count = astra_spend_v2.legacy.count_tokens(value,count_headers)
            if (not astra_spend_v2.integer(count,0,permit['max_input_tokens'])
                    or self.cancelled.is_set() or (self.folder/'agent-cancelled').exists()
                    or not time.monotonic() < permit['expires_at']
                    or time.monotonic()-self.completion_started >= self.fast_limits['seconds']):
                raise ValueError('Counted context exceeds its reviewed bound or job stopped.')
            return count
        token = astra_spend_v2.protect(self.folder,payload,headers,counter=bounded_count,
            minimum_output=permit['max_output_tokens'],
            protected_remaining_micro_usd=permit['protected_remaining_micro_usd'],
            protected_remaining_requests=permit['protected_remaining_requests'])
        if (self._construction_digest(payload) != permit['canonical_sha256']
                or self.cancelled.is_set() or (self.folder/'agent-cancelled').exists()
                or not time.monotonic() < permit['expires_at']):
            # Preserve any existing hold if a preflight dependency changed data.
            raise astra_spend_v2.SpendError('PAYLOAD_POLICY_REJECTED','payload')
        return token

    def _record_construction(self,permit,response):
        # Called ONLY after original settle_completed returned exactly True on
        # the original authenticated HTTPS response, never from loopback input.
        receipt = {key:permit[key] for key in ('permit_id','execution_id','phase',
            'sequence','payload_sha256','context_sha256','admission_sha256')}
        receipt.update({'response_id':response['id'],'response_sha256':self._construction_digest(response),
            'model':response['model'],'status':response['status'],'usage_known':True,
            'usage':json.loads(json.dumps(response['usage'],allow_nan=False))})
        with self.lock:
            self._construction_receipts[permit['permit_id']] = receipt

    def construction_receipt(self,permit_id):
        if not isinstance(permit_id,str): return None
        with self.lock:
            value = self._construction_receipts.get(permit_id)
            return json.loads(json.dumps(value)) if value is not None else None
'''


def changes(raw):
    if not isinstance(raw, bytes) or hashlib.sha256(raw).hexdigest() != EXPECTED:
        raise ValueError('Exact installed STANDARD-v2 Gateway source required.')
    text = raw.decode('utf-8')
    text = once(text, 'def __init__(self,key,folder,cancelled):',
                'def __init__(self,key,folder,cancelled,construction=False):')
    text = once(text, '        outer=self\n', '''        if type(construction) is not bool:
            raise ValueError('Construction mode must be explicit.')
        self.construction=construction
        self._construction_pending=None;self._construction_permits={};self._construction_receipts={}
        if construction and (self.fast_limits['fast']
                or self.completion_request.get('construction_mode') != 'worldifact-standard-construction-v1'
                or not isinstance(self.completion_request.get('instructions'),str)
                or 'WORLDIFACT STANDARD BUILD AND COMPLETION CONTRACT:' not in self.completion_request['instructions']
                or not isinstance(self.completion_request.get('execution_id'),str)
                or not self.completion_request['execution_id']):
            raise ValueError('Explicit fresh STANDARD construction scope required.')
        outer=self
''')
    text = once(text, '                acquired=False\n', '                acquired=False;construction_permit=None\n')
    text = once(text, '                    payload=json.loads(self.rfile.read(size))\n',
                '                    payload_bytes=self.rfile.read(size)\n'
                '                    payload=outer._construction_payload(payload_bytes) if outer.construction else json.loads(payload_bytes)\n')
    start = text.index('                    entries=list(request_tools(payload))\n')
    end = text.index('                    with outer.lock:\n', start)
    original = text[start:end]
    text = once(text, original, '                    if not outer.construction:\n'+textwrap.indent(original,'    '))
    text = once(text, '                        if outer.cancelled.is_set() or outer.unknown_usage:',
                "                        if outer.cancelled.is_set() or outer.unknown_usage or (outer.construction and (outer.folder/'agent-cancelled').exists()):")
    text = once(text, '                        outer.requests+=1\n', '''                        if outer.construction:
                            try:
                                construction_permit=outer._consume_construction(self.headers.get('X-Worldifact-Construction-Permit',''),payload_bytes)
                            except ValueError as error:
                                return self.reject(422,str(error),'WORLDIFACT_CONSTRUCTION_PERMIT')
                        outer.requests+=1
''')
    start = text.index("                    payload['max_output_tokens']=allowance\n")
    end = text.index("                    headers={'Authorization'", start)
    original = text[start:end]
    text = once(text, original, '                    if not outer.construction:\n'+textwrap.indent(original,'    '))
    text = once(text, "                    if self.headers.get(LITE_HEADER)=='true':headers[LITE_HEADER]='true'",
                "                    if not outer.construction and self.headers.get(LITE_HEADER)=='true':headers[LITE_HEADER]='true'")
    line = next(line for line in text.splitlines(True) if 'astra_reservation = (astra_spend_v2.protect' in line)
    text = once(text, line, '                        if outer.construction:\n'
                '                            astra_reservation=outer._protect_construction(payload,headers,construction_permit)\n'
                '                        else:\n'+textwrap.indent(line,'    '))
    text = once(text, "data=json.dumps(payload).encode(),headers=headers)",
                "data=payload_bytes if outer.construction else json.dumps(payload).encode(),headers=headers)")
    text = once(text, '                    with opener.open(request,timeout=900) as response:',
                '''                    timeout=900
                    if outer.construction:
                        timeout=min(timeout,construction_permit['expires_at']-time.monotonic())
                        if timeout <= 0:
                            outer.stop('WORLDIFACT_CONSTRUCTION_EXPIRED','Construction request expired before its provider stream; no automatic paid retry.')
                            return self.reject(422,outer.error,outer.error_code)
                    with opener.open(request,timeout=timeout) as response:''')
    text = once(text, '                                if outer.cancelled.is_set():break',
                "                                if outer.cancelled.is_set() or (outer.construction and (outer.folder/'agent-cancelled').exists()):break\n"
                "                                if outer.construction and time.monotonic() >= construction_permit['expires_at']:\n"
                "                                    outer.stop('WORLDIFACT_CONSTRUCTION_EXPIRED','Construction provider stream exceeded its permit deadline; no automatic paid retry.')\n"
                "                                    break")
    text = once(text, "                                        event=json.loads(line[5:]);value=event.get('response') or {}",
                "                                        event=outer._construction_json(line[5:]) if outer.construction else json.loads(line[5:])\n"
                "                                        if outer.construction and (not isinstance(event,dict) or ('response' in event and not isinstance(event['response'],dict))):\n"
                "                                            raise ValueError('Invalid construction stream event.')\n"
                "                                        value=event.get('response') or {}")
    text = once(text, '                                    except (ValueError,TypeError):pass',
                "                                    except (ValueError,TypeError):\n"
                "                                        if outer.construction:\n"
                "                                            outer.unknown_usage=True\n"
                "                                            outer.stop('WORLDIFACT_CONSTRUCTION_INVALID_STREAM','Provider stream contained ambiguous or invalid JSON; no automatic paid retry.')\n"
                "                                            break")
    text = once(text, '                                            astra_spend_v2.settle_completed(outer.folder, astra_reservation, value)',
                '''                                            settled=astra_spend_v2.settle_completed(outer.folder, astra_reservation, value)
                                            if outer.construction:
                                                if settled is True:
                                                    outer._record_construction(construction_permit,value)
                                                else:
                                                    outer.unknown_usage=True
                                                    outer.stop('WORLDIFACT_CONSTRUCTION_UNSETTLED','Completed provider usage could not be authenticated and settled; no automatic paid retry.')''')
    text = once(text, "if event.get('type')=='response.incomplete' and completion_policy.profile(outer.completion_request):",
                "if event.get('type')=='response.incomplete' and (outer.construction or completion_policy.profile(outer.completion_request)):")
    text = once(text, '    def save(self):\n', METHODS+'\n    def save(self):\n')
    compile(text, 'construction-codex-runner.py', 'exec')
    return text.encode('utf-8')
