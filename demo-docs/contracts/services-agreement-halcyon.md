_Sample document. Lumen Payments Inc. and Halcyon Retail Ltd are invented for
this demo, and nothing below is legal advice or fit for use._

# Master Services Agreement

This Master Services Agreement (the "Agreement") is entered into on 1 March 2026
(the "Effective Date") between **Lumen Payments Inc.**, a Delaware corporation
with offices at 1100 Market Street, Wilmington, Delaware ("Lumen"), and
**Halcyon Retail Ltd**, a company registered in England and Wales with offices
at 14 Candlewick Row, London ("Customer"). Lumen and Customer are each a "Party"
and together the "Parties".

## 1. Definitions

**1.1** "Platform" means the Lumen payments platform, its application
programming interface, and the dashboard made available at the addresses Lumen
publishes.

**1.2** "Customer Data" means all data submitted to the Platform by or on behalf
of Customer, including transaction records, payment instrument tokens, and
end-customer contact details.

**1.3** "Processed Volume" means the gross value of payments successfully
captured through the Platform in a calendar month, net of refunds settled in
that same month.

**1.4** "Business Hours" means 09:00 to 18:00 UK time on any day that is not a
Saturday, Sunday, or public holiday in England.

## 2. The Services

**2.1 Scope.** Lumen will make the Platform available to Customer for the
purpose of accepting, settling, and reconciling payments, on the terms of this
Agreement and the documentation Lumen publishes.

**2.2 API access and rate limits.** Customer may call the Platform's API using
credentials issued to it. Lumen enforces a limit of **120 requests per minute**
per set of credentials. Requests beyond that limit are rejected with status
`429`, and a rejection on that basis is not a failure of the Platform for the
purposes of Clause 6.

**2.3 Changes to the Platform.** Lumen may change the Platform at any time,
provided that no change removes a documented capability Customer is using
without **60 days** written notice. Security patches are excepted and may be
applied immediately.

**2.4 Sandbox.** Lumen will make a non-production environment available at no
charge for the Term. No service level applies to it.

## 3. Fees and payment

**3.1 Fees.** Customer will pay a platform fee of **USD 7,500 per month** and a
transaction fee of **0.4% of Processed Volume**. There is no minimum volume
commitment.

**3.2 Invoicing.** Lumen invoices monthly in arrears, within five Business Days
of the end of each calendar month.

**3.3 Payment terms.** Invoices are payable **within 30 days** of the invoice
date. Amounts outstanding after that date accrue interest at **1.5% per month**,
compounding monthly, from the due date until paid.

**3.4 Suspension for non-payment.** If an invoice remains unpaid 45 days after
its due date, Lumen may suspend the Platform on ten Business Days written
notice. Suspension does not relieve Customer of the obligation to pay.

**3.5 Taxes.** Fees are exclusive of value added tax and any similar tax, which
Customer pays in addition.

**3.6 Price changes.** Lumen may increase the fees in Clause 3.1 on each
renewal, by no more than **5%** over the fees then in force, on at least 60 days
written notice before the renewal date.

## 4. Term and termination

**4.1 Initial term.** This Agreement runs for **24 months** from the Effective
Date (the "Initial Term").

**4.2 Renewal.** At the end of the Initial Term, and at the end of each renewal
period, the Agreement renews automatically for a further **12 months** unless a
Party gives notice under Clause 4.3.

**4.3 Termination for convenience.** Either Party may terminate this Agreement
at the end of the Initial Term, or of any renewal period, by giving the other at
least **90 days** written notice before that date.

**4.4 Termination for cause.** Either Party may terminate immediately on written
notice if the other commits a material breach that is not remedied within 30
days of being asked in writing to remedy it, or becomes subject to an insolvency
proceeding that is not dismissed within 60 days.

**4.5 Effect of termination.** On termination, Customer's right to use the
Platform ends, and Lumen will invoice any fees accrued and unpaid. Clauses 7, 8,
10, 11, 12, and 13 survive.

## 5. Customer obligations

**5.1** Customer will keep its API credentials secret, rotate them at least once
every 12 months, and notify Lumen within 24 hours of learning that a credential
may have been disclosed.

**5.2** Customer will not use the Platform to process payments for any business
on the list of prohibited categories Lumen publishes, and will tell Lumen before
entering a new line of business that may fall on it.

**5.3** Customer is responsible for the accuracy of settlement details it
provides. Lumen is not liable for a payment correctly sent to an account
Customer specified incorrectly.

## 6. Service levels

**6.1 Uptime commitment.** Lumen will make the Platform's payment capture and
authorisation endpoints available **99.9%** of the time in each calendar month,
measured as the proportion of one-minute intervals in which a well-formed
request received a response other than `5xx`.

**6.2 Service credits.** If availability in a month falls below the commitment
in Clause 6.1, Customer may claim a credit of **10% of that month's platform fee
for each full 0.1% below the commitment**, up to a maximum of **30% of that
month's platform fee**. A claim must be made within 30 days of the end of the
month it relates to. Service credits are Customer's sole remedy for a failure to
meet Clause 6.1.

**6.3 Support response.** Lumen will acknowledge a support request within:

- **1 hour** for a P1 incident, meaning payment capture is unavailable to all of
  Customer's users;
- **4 Business Hours** for a P2 incident, meaning a documented capability is
  degraded and no workaround exists;
- **2 Business Days** for a P3 request, meaning anything else.

Acknowledgement is not resolution, and this Agreement sets no resolution time.

**6.4 Exclusions.** Clause 6.1 does not apply to unavailability caused by
Customer's own systems, by a rate limit under Clause 2.2, by maintenance
notified at least 48 hours in advance, or by an event outside Lumen's reasonable
control.

**6.5 Maintenance window.** Lumen may carry out planned maintenance between
01:00 and 04:00 UK time on any Sunday. Time in a notified maintenance window is
excluded from the measurement in Clause 6.1.

## 7. Data protection and security

**7.1 Roles.** For Customer Data, Customer is the controller and Lumen is the
processor. Lumen processes Customer Data only on Customer's documented
instructions, of which this Agreement is one.

**7.2 Security.** Lumen will maintain an information security programme
certified annually under SOC 2 Type II, and will provide the most recent report
on request, no more than once a year.

**7.3 Breach notification.** Lumen will notify Customer **within 72 hours** of
becoming aware of a personal data breach affecting Customer Data, and will
include what it knows at the time rather than waiting to complete its
investigation.

**7.4 Export and deletion.** For **30 days** after termination, Customer may
export Customer Data through the Platform. Lumen will delete Customer Data
**within 30 days** of the end of that export period, except where it must retain
records to comply with law, in which case it retains only those records and only
for as long as required.

**7.5 Sub-processors.** Lumen may engage sub-processors, and will publish the
list. Customer may object to a new sub-processor within 14 days of it being
published, in which case the Parties will discuss in good faith, and Customer
may terminate under Clause 4.4 if no accommodation is reached.

## 8. Confidentiality

**8.1** Each Party will keep the other's confidential information in confidence,
use it only for this Agreement, and disclose it only to those of its people and
advisers who need it and are under a duty of confidence.

**8.2** The obligation does not apply to information that is public through no
fault of the receiving Party, was already known to it without a duty of
confidence, or is independently developed without reference to the disclosing
Party's information.

**8.3** A Party required by law or a regulator to disclose may do so, having
first given the other Party as much notice as the law permits.

## 9. Warranties

**9.1** Each Party warrants that it has the authority to enter this Agreement.

**9.2** Lumen warrants that the Platform will perform materially as its
published documentation describes.

**9.3** Except as stated in this Agreement, the Platform is provided as is, and
Lumen gives no other warranty, express or implied.

## 10. Limitation of liability

**10.1** Neither Party excludes liability for death or personal injury caused by
its negligence, for fraud, or for anything else that cannot lawfully be
excluded.

**10.2** Neither Party is liable for loss of profit, loss of business, or
indirect or consequential loss.

**10.3** Subject to 10.1, each Party's total liability under this Agreement is
limited to **the fees paid or payable by Customer in the 12 months before the
event giving rise to the claim**.

**10.4** The limit in 10.3 does not apply to Customer's obligation to pay fees,
or to either Party's breach of Clause 8.

## 11. Indemnification

**11.1** Lumen will defend Customer against a claim that the Platform infringes
a third party's intellectual property rights, and will pay the damages finally
awarded, provided Customer notifies Lumen promptly and gives it control of the
defence.

**11.2** Customer will defend Lumen against a claim arising from Customer Data
or from Customer's use of the Platform in breach of Clause 5, on the same terms.

## 12. Non-solicitation

For the Term and for **12 months** after it, neither Party will solicit for
employment any employee of the other who was involved in the performance of this
Agreement. A general advertisement not directed at that person is not
solicitation.

## 13. General

**13.1 Assignment.** Neither Party may assign this Agreement without the other's
written consent, except to a successor to all or substantially all of its
business.

**13.2 Notices.** Notices must be in writing and sent to the addresses above, or
to an address a Party later nominates in writing. Notice by email is effective
only if the recipient acknowledges it.

**13.3 Entire agreement.** This Agreement, with its Schedules, is the whole
agreement between the Parties on its subject, and replaces anything said or
written before it.

**13.4 Amendment.** An amendment is effective only if it is in writing and
signed by both Parties.

**13.5 Governing law.** This Agreement is governed by the laws of the State of
Delaware.

**13.6 Dispute resolution.** A dispute that the Parties cannot settle within 30
days of one notifying the other will be referred to binding arbitration seated
in Wilmington, Delaware, before a single arbitrator.

## Schedule A: Fees

Platform fee: USD 7,500 per month, invoiced monthly in arrears.

Transaction fee: 0.4% of Processed Volume, invoiced with the platform fee.

Chargeback handling: USD 15 per chargeback received, regardless of outcome.

Additional sandbox environments beyond the first: USD 400 per month each.

## Schedule B: Support contacts

P1 incidents are raised by telephone to the number Lumen publishes in the
dashboard, and are acknowledged by a named engineer.

P2 and P3 requests are raised through the support portal. Customer may nominate
up to five people who are entitled to raise them.

Lumen reviews the support record with Customer each quarter, and that review is
the point at which either Party raises a concern about Clause 6 rather than
waiting for a renewal date.
