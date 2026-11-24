# Loading every CRM row

PostgREST returns at most 1,000 rows on one request. `CRMDB.selectAll` in `js/crm-db.js` pages by `id` in ranges of 1,000 and stitches those pages together. The CRM loads every row past 1,000.

Startup uses `selectAll` for stages, team, companies, contacts, ship-tos, deals, tasks, activity, custom fields, and sequence steps. `crm_contacts` has 1,015 rows. Without paging, contact ids 1071–1085 never loaded, and `crm_activity` was cut off the same way. Those rows now load.

Paging stops at 50,000 rows and reports an error if a table is still full.
