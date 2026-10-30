# Lumen integration handbook

## Before you start

Create a sandbox account from the Lumen dashboard. Sandbox and live are entirely
separate environments with separate credentials, separate data and separate
webhook endpoints. A sandbox key used against live fails with `unauthenticated`,
and the reverse is true as well, which is deliberate: it makes it impossible to
charge a real card from a test run.

Sandbox accepts a set of test card numbers that produce predictable outcomes.
The card ending `4242` always succeeds, the card ending `0002` is always
declined, and the card ending `9995` always reports insufficient funds. Use them
to exercise your failure handling before going near a real payment.

Nothing in sandbox expires or is cleaned up, so test data accumulates. That is
usually convenient and occasionally confusing: if a query returns more than you
expect, check whether you are reading months of old test runs.

## Authenticating your integration

Exchange your client id and client secret for a bearer token by calling
`POST /auth/token`. The token is valid for one hour.

Cache the token and refresh it shortly before expiry. Requesting a fresh token
for every API call works, but it doubles your request count against the rate
limit and adds a round trip to every operation. A common mistake is to refresh
only after receiving a `401`, which means every integration experiences a failed
request every hour.

Store the client secret the way you would store a database password. It grants
full access to the account, and Lumen cannot tell a stolen secret from a
legitimate one. If a secret is exposed, rotate it immediately: create a
replacement, deploy it, then revoke the old one.

## Creating and billing a customer

A customer record holds the billing details that invoices are issued against.
Create one with `POST /customers`, giving at least an email address. Adding a
name and an address at the same time saves a round trip and improves the invoice
document the customer eventually receives.

Attach a payment method with `POST /customers/{id}/payment_methods`. The first
method attached becomes the default automatically; later ones do not, and must
be promoted explicitly if you want them used.

A customer with no payment method can still be invoiced. The invoice is created
and finalised normally and simply cannot be paid automatically, which is the
right behaviour for an account that pays by bank transfer.

## Issuing an invoice

Create a draft invoice with `POST /invoices`, naming the customer, the currency
and the line items. Drafts are editable and invisible to the customer, so build
the invoice up over as many calls as you need.

Finalise it with `POST /invoices/{id}/finalize`. Finalising assigns the
sequential invoice number and makes the document available to the customer. It
is irreversible, because the number has been issued and the invoice may already
be a tax record in your jurisdiction.

To correct a finalised invoice that has not been paid, void it and issue a new
one. To correct one that has been paid, issue a credit note. The distinction
matters to auditors and the API enforces it.

## Receiving webhooks

Subscribe to the events your system needs rather than polling for changes.
Polling a collection every few seconds burns your rate limit and still learns
about a payment later than a webhook would.

Verify every delivery. Compute an HMAC-SHA256 over the timestamp and the raw
request body using your webhook secret, and compare it to the signature header
in constant time. Reject anything older than five minutes so a captured request
cannot be replayed at leisure.

Answer within ten seconds. Acknowledge the delivery first and do your processing
afterwards: a handler that writes to three systems before replying will
eventually exceed the timeout, and Lumen will retry a delivery you have already
handled.

Assume duplicates. Deliveries can arrive more than once and out of order, so key
your handler on the event id and compare the event's `created` timestamp rather
than trusting arrival order.

## Handling failures

Treat `429` as normal rather than exceptional. Read `Retry-After`, wait that
long, and add jitter so that a fleet of workers does not retry in lockstep and
recreate the burst that caused the limit.

Retry `5xx` responses. Do not retry a `4xx` other than `429`: it will fail
identically until the request itself changes, and retrying only delays the error
reaching whoever can fix it.

Send an `Idempotency-Key` on every `POST` that creates or charges something.
Lumen replays the stored response for 24 hours, which turns a network timeout
from a possible double charge into a repeated answer.

## Going live

Swap the sandbox credentials for live ones and point your webhook endpoint at
the live signing secret. The secrets differ per environment, and a live delivery
verified against the sandbox secret will fail every signature check.

Confirm your retry handling against the live rate limit, which is the same 120
requests per minute. Run a real payment for a small amount, confirm the
`invoice.paid` webhook arrives and is verified, then refund it.

## Getting support

Quote the `request_id` from the error response. It appears on every log line for
that request, and without it a failing call cannot be located among the millions
that succeeded the same minute.

Include the full request body with secrets removed, the response, and the time
in UTC. "The API is returning errors" cannot be investigated; a request id can
be answered in minutes.
