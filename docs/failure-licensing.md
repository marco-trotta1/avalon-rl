# Prepare a failure package

Keep captured files private until an authorized person reviews the complete package.
The local package workflow makes no network requests and processes no payments.

## Required evidence

1. Declare the data owner and permitted uses in the case.
2. Confirm that the recorded failure fails its checks and the reference passes.
3. Review all snapshots, checks, metadata, and rights for privacy and correctness.
4. Record the case hash, reviewer, review time, and both approvals.
5. Select the requested use: `evaluation`, `training`, or `redistribution`.
6. Prepare the package and review its complete content before sharing.

Use `prepareFailurePackage({ case, requestedUse, review })` in the SDK.
The review contains `caseHash`, `reviewer`, `reviewedAt`, `privacyApproved: true`, and `checksApproved: true`.
The review time uses an ISO 8601 timestamp with a timezone.
Changes to the case invalidate the review hash.

Private cases, missing permissions, incomplete reviews, stale reviews, and unresolved failures block package creation.
Selected secret patterns also block creation.
Blocked results contain reason codes without the captured content.
Ready results contain the complete case, replay evidence, review, and package hash.
The package hash covers the payload, including its declared use.

The scanner covers selected private key, GitHub, Slack, API key, AWS access key, and bearer token patterns.
It cannot establish that the data is safe to share.
It does not remove personal data or establish ownership.
Review fields are attestations, not authenticated signatures.
Reset review approval after each content change.

## A paid delivery workflow

Ask the buyer to define the needed failure family, permitted uses, acceptance checks, and payment terms.
Agree on contributor payment before collecting private material.
Keep the buyer's acceptance decision separate from package readiness.
Record reconstruction time, review time, compute cost, contributor payment, and buyer payment for each accepted package.
Use actual receipts and measured work to assess the margin.

This module creates no sale, contract, payout, or marketplace listing.
It does not establish buyer demand, model improvement, or training value.
Recorded replay evaluates supplied snapshots. It does not recreate the original tool execution.
Evaluate improvements on separate task families before making generalization claims.
