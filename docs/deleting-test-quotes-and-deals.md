# Deleting test quotes and deals

Use this when a quote or deal was only a test. Real orders that have shipped, been invoiced, or been paid stay in the CRM.

## Delete a deal

Open the deal. **Delete deal** is in the footer, on every stage, next to Mark lost or Reopen deal.

On the Pipeline, turn on **Show lost**. Each lost row has **Delete**. That button does not open the deal. Clicking the rest of the row still does.

The confirm says: "Delete this deal and its quote permanently? This also removes its tasks, activity, quote and lines. This can't be undone."

Cancel leaves the deal. Delete removes the deal. The database also removes its follow-ups, history on that deal, quote, product lines, and messages. The company keeps a note that survives the delete: `Deleted deal: <description> (<value>) by <name>`.

## Delete a quote and keep the deal

Quotes are stored as their own rows, always tied to a deal. In the quote editor, **Delete quote** removes that quote and its product lines. The deal stays.

The confirm says the deal stays, and that the quote and its lines cannot be undone.

## What cannot be deleted

The CRM checks the live row first and refuses, with a toast that says why, when any of these are true:

- The deal is linked to QuickBooks (`qbo_doc_id`, `qbo_doc_type`, `qbo_customer_id`, or `qbo_synced_at`), or a product line has a QuickBooks invoice id.
- A row in `crm_qb_invoices` points at the deal.
- A row in `crm_order_payments` points at the deal.
- A row in `crm_uninvoiced_flags` points at the deal. That link does not remove itself, so the delete would fail.
- The stage is Shipped, Delivered, Invoice Sent, or Paid, or any later stage.

Working on quote, Quote sent, lost, Customer PO, and Driven PO can be deleted when none of those apply.

The same checks apply to Delete quote. A shipped or invoiced deal does not lose its quote from this button.

## Who can confirm the check

Signed-in CRM teammates can delete a deal row. QuickBooks invoices and uninvoiced flags are visible only to a full commission user. If the signed-in person is not that user, the CRM does not delete, because it cannot confirm those rows are absent. Rich is a full commission user, so his sign-in can complete the check.
