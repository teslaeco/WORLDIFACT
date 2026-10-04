# Detailed Studio lifecycle diagnostics

The detailed Shop and character workflows send a signed Studio request to
Oracle/Blender. The separate Blueprint endpoint produces a procedural draft;
its success does not establish completion of a detailed mesh.

`worldifact.studio.generation` events have fixed fields: request UUID, stage,
admission status, allowlisted reason, dispatch observation and HTTP status.
They contain no prompt, image, account identifier, receipt, credential or raw
provider error. A logging failure cannot change the request outcome.

The main generation stages are:

- `RECEIVED`: the submission's authenticated receipt and canonical input match.
- `ADMITTED`: the existing account and operator reservations succeeded.
- `SENT_TO_PROVIDER`: the dispatch fence allowed the Oracle POST attempt. This
  does not prove that Oracle accepted it or that its AI provider ran.
- `PROVIDER_RESPONSE`: that POST returned an HTTP response. Its numeric status
  is recorded separately; HTTP success is not model completion.
- `COMPLETED`: the account job has a durable completed result. A newly completed
  job first passes the existing GLB validation and settlement. Recovery of a
  previously completed job observes its saved outcome without a new dispatch.
- `FAILED`: `admission=REFUSED` describes a rejected request; it does not imply
  Oracle generated a failed model. `admission=RECOVERY_ONLY` observes the saved
  failed account job and its allowlisted failure reason.

Preparation and recovery retain their additional observations. A lost Oracle
response records `ORACLE_NO_RESPONSE` and stays uncertain/pending. It never
becomes `FAILED` merely because a response was lost. Terminal recovery records
`oracleDispatch=UNKNOWN`; it does not invent earlier dispatch evidence.

These events do not reserve funds, reconcile balances, retry a provider request
or change completion/download policy. Repeated recovery may observe the same
terminal result more than once. Log retention is an operator configuration;
emission does not establish retained production logs.

Inert tests cover an MCC request with exactly 175 cents available, the existing
174-cent refusal with no Oracle POST, unavailable model bytes, same-receipt
recovery, provider response loss, explicit rejection and a failed log sink.
Synthetic success is fixture evidence only, not a paid model or visual result.
