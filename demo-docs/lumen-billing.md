# Lumen billing

How invoices, credit notes and webhooks work.

## Invoices

### Creating an invoice

`POST /invoices` takes a customer id, a currency and a list of line items. Each
line item needs a description, a quantity and a `unit_amount` in the currency's
smallest unit — **cents for USD and EUR**, and whole units for currencies with
no minor unit, such as JPY.

```json
{
  "customer_id": "cus_4d1b",
  "currency": "usd",
  "line_items": [
    { "description": "Seat licence", "quantity": 3, "unit_amount": 1200 }
  ]
}
```

A new invoice is created in the `draft` state. Drafts can be edited freely and
are not visible to the customer.

### Finalising and paying

`POST /invoices/{id}/finalize` moves a draft to `open` and assigns it a
sequential invoice number. A finalised invoice can no longer be edited, because
the number has been issued and the document may already be a tax record.

`POST /invoices/{id}/pay` attempts payment with the customer's default method. A
successful payment moves the invoice to `paid`.

### Voiding

`POST /invoices/{id}/void` cancels an invoice that has not been paid. A paid
invoice **cannot** be voided; issue a credit note instead. Attempting to void a
paid invoice returns `409` with the code `invoice_already_paid`.

## Credit notes

A credit note reverses part or all of a paid invoice. Create one with
`POST /credit_notes`, naming the invoice and the amount.

The amount may not exceed what remains uncredited on the invoice. A credit note
for the full remaining amount moves the invoice to `refunded`; a smaller one
leaves it `paid` and reduces its outstanding balance.

Credit notes cannot be deleted. Issuing one in error is corrected by issuing a
new invoice, because a credit note that vanished would break the audit trail.

## Webhooks

Lumen sends an HTTP `POST` to your endpoint for events you subscribe to.

### Verifying a webhook

Every delivery carries a `Lumen-Signature` header:

```
Lumen-Signature: t=1793390000,v1=5257a8...
```

Verify it by computing `HMAC-SHA256` over `"{t}.{raw body}"` with your webhook
secret and comparing it to `v1` in constant time. Reject a delivery whose
timestamp is more than **five minutes** old, which stops a captured request
being replayed later.

Use the raw request body, exactly as received. Parsing the JSON and
re-serialising it changes the bytes and the signature will not match.

### Retries

A delivery is considered failed unless your endpoint answers `2xx` within **10
seconds**. Failed deliveries are retried with exponential backoff for up to 24
hours. Answer quickly and do the work afterwards: acknowledge first, then
process.

Deliveries can arrive more than once and out of order. Make your handler
idempotent by keying on the event id, and compare the event's `created` field
rather than assuming arrival order.

### Events

| Event                    | When                               |
| ------------------------ | ---------------------------------- |
| `invoice.finalized`      | A draft became open                |
| `invoice.paid`           | Payment succeeded                  |
| `invoice.payment_failed` | Payment was attempted and declined |
| `credit_note.created`    | A credit note was issued           |
