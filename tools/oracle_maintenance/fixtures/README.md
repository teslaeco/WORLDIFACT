# Immutable maintenance test inputs

The `.source` files are byte-for-byte Git blobs from WORLDIFACT commit
`5e375f0f7d6f42d8c4d8944fa024bfb474143c04`, under
`tools/model_construction/`. They reproduce the package authorized by the
existing `dispatcher.py` and `status.py`, without a network request or a full
Git history in CI. `reviewed_fixture.py` checks every SHA-256 before use.

These are historical test data, not an installer or a current Oracle runtime.
Never update the production grant hashes to match newer development files.
The maintenance tests must continue rejecting altered package bytes, unsafe
paths, unknown grants, incomplete receipts and ambiguous installation results.
