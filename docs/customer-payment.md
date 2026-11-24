# Customer invoice payment

`pay.html` is a public page at the site root. Customers do not sign in. The page asks for an invoice number and a USD amount, then opens PayTrace. It does not collect a card number, and it does not call Supabase.

The PayTrace hosted link stored as `BASE` in `pay.html` is the source of the payment URL. The page keeps that link as issued and adds `amount` and `invoice`. Replace `BASE` only when PayTrace issues a new hosted link.

## Prefill link

Staff can send a link with the invoice and amount already filled in:

`https://richolson7.github.io/driven-L10/pay.html?invoice=20539&amount=1964.80`

- `invoice` is the invoice number. The page trims spaces.
- `amount` is USD. The page strips `$` and commas, requires a value greater than zero, and sends it with two decimals (for example `12.5` becomes `12.50`).

The page has a small **Copy customer link** control. It copies a prefill link for the invoice and amount currently in the form. The customer still finishes payment on PayTrace.

Questions go to 612-802-3187 or orders@drivensol.com.
