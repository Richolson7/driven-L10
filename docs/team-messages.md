# Team messages

The Pipeline home screen has a Messages panel. A signed-in teammate can leave a short note for one person, or for everyone. The note stays in the CRM. It does not send email or a text.

## Unread

Unread notes sit at the top of the panel. Each one shows the sender's name and the time in Central time. Click a note to mark it read. The Pipeline tab shows the unread count.

A note is unread when it is addressed to you or to everyone, it has no read time, and you did not send it.

A note to everyone has one read time on the row. The first teammate who opens it marks that row read for the team.

## Sending

Pick a teammate or Everyone. Active names are listed A to Z, with numbers in numeric order (A2 before A10). Write the note and send.

The compose box is not redrawn while you type, and a refresh does not replace it. New notes are checked about every 20 seconds. The CRM page does not subscribe to Supabase realtime. The L10 hub does, for other tables.

You can read notes sent to you, notes sent to everyone, and notes you sent. A note addressed only to someone else is not returned to you.

## Table

Team notes are stored in `public.crm_team_messages`.

`public.crm_messages` is a different table. It records email and SMS provider status. This feature does not change that table.

`from_user` is the sender's email. Sign-in is matched to `crm_team.email` with the JWT email, the same check as `private.is_crm_team()`. `crm_team` does not store an auth user id, and the policy does not use `user_metadata`.

`to_team_id` references `crm_team(id)`. Null means everyone.

`deal_id` and `company_id` are optional links. The home-screen compose box leaves them empty.

`read_at` is the only column a recipient can update.

Apply `supabase/migrations/20261124180000_crm_team_messages.sql` in the Supabase SQL editor. The CRM does not apply it. Until that table exists, the panel says team messages are off and sends nothing.

## Access

Row level security is on for `authenticated` team members.

- Insert only when `from_user` is your own JWT email.
- Read a row sent to you, sent to everyone, or sent by you.
- Update `read_at` only, and only on a note to you, or on a note to everyone that you did not send.
- The anon key has no access. The page does not delete these rows.
