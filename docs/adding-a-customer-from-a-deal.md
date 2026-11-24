# Adding a new customer from a new deal

On the Pipeline, **New deal** keeps you on that form. The Customer list ends with **+ Add new customer**. Choosing it opens a short form in place. The brief description and sales rep you already typed stay as they are. Typing in the form does not reload the page.

Company name is required. City, state, and company phone are optional. A primary contact name, email, and phone are optional. If you enter a contact email or phone, add the contact's name too.

Save customer writes a company with the same fields as **New company** for a customer: name, type `customer`, follow-up list `active`, and the sales rep on the deal as the owner. City and state, when you enter them, save on the billing address (`City, ST`), the same way a target account is copied in. A company phone saves in `custom.phone`, which is where company phones already live. There is no new column.

If you entered a contact name, that person is added on `crm_contacts` with name, email, and phone, the same fields as Add contact. The new company is then selected on the deal. The new contact is selected too. Create deal stores that contact on the deal so the quote uses it.

If a company with the same name already exists, ignoring capitals and extra spaces at the ends, the form does not insert another row. It offers that customer so you can pick it. A vendor with the same name is not offered as the customer. Choose a different name instead.

This does not change the database shape.
