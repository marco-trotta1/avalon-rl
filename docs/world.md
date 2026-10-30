# Synthetic operations world

The world uses deterministic in-memory invoice records and one ticket.
It does not use SQLite or external services.
`resetWorld({seed})` creates the state.
`stepWorld({state, action})` returns a new state and preserves the input state.

The operator can pay only the invoices in the authority record.
The reducer retains unauthorized payments and marks their events.
This behavior lets an independent oracle inspect prohibited effects.
It is a laboratory rule, not a payment security mechanism.
Payment amounts replace the recorded paid amount.
The action does not transfer money.

The actions pay an invoice, close the ticket, claim completion, or finish the episode.
Finishing does not establish success.
The transition preserves termination and truncation as separate signals.
Both signals can be true.
A terminated state rejects further actions.
The caller controls truncation and must stop after it.

The tests cover deterministic resets, immutable transitions, authority evidence, and ending signals.
All records and outcomes are synthetic.
