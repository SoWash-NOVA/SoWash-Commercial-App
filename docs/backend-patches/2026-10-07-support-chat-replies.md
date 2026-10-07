# Backend patch — reply-to-message in the client ↔ SoWash support chat

**What it enables:** in the client app's Support chat a client can swipe a message to the right
(or long-press → Reply) and answer that specific message, WhatsApp-style — the same feature the
staff Team chat already has (`staff_messages.reply_to_id`). The app side is done in both apps:
both the client chat and the staff Support thread can reply (swipe right / long-press → Reply), send
`reply_to_id`, and draw the quoted message from `reply_to` on each message.

**Until this patch is live:** the app still works — the server ignores `reply_to_id`, the message
is sent normally, and the quote disappears once the server's copy of the message replaces the
optimistic bubble (the server doesn't know about replies yet).

**Apply to the LIVE files** (download from the VPS first). The checkout on this PC
(`Desktop/sowash-backend`) is from late September and missing the October chat work — don't upload
files edited from it. The steps below only ADD lines, so they slot into the live files as they are.

## 1. Migration (run BEFORE uploading the route files)

```sql
-- docs/migrations/2026-10-07-commercial-chat-replies.sql
ALTER TABLE commercial_chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_id integer
  REFERENCES commercial_chat_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_commercial_chat_messages_reply_to
  ON commercial_chat_messages(reply_to_id)
  WHERE reply_to_id IS NOT NULL;
```

The route changes below SELECT `m.reply_to_id`, so uploading them before the column exists would
break support chat for both apps.

## 2. The quoted message on every message — BOTH route files

Same addition in two places:

- `routes/customerJobHistoryRoutes.js` → the `CCHAT_MESSAGE_SELECT` template (client app)
- `routes/commercialChatRoutes.js` → the `CHAT_MESSAGE_SELECT` template (staff app + web console)

In each, right after the line `m.schedule_id,` add:

```sql
         m.reply_to_id,
         (SELECT json_build_object(
                   'id', r.id,
                   'sender_name', COALESCE(
                     NULLIF(TRIM(CONCAT(COALESCE(ru."Firstname", ''), ' ', COALESCE(ru."Lastname", ''))), ''),
                     CASE WHEN r.sender_kind = 'agent' THEN 'SoWash' ELSE 'Customer' END),
                   'body', r.body,
                   'has_photo', r.attachment_url IS NOT NULL)
            FROM commercial_chat_messages r
            LEFT JOIN users ru ON ru.id = r.sender_user_id
           WHERE r.id = m.reply_to_id) AS reply_to,
```

Then in the matching shape function (`shapeChatMessage` in customerJobHistoryRoutes.js,
`shapeMessage` in commercialChatRoutes.js) add two properties:

```js
  reply_to_id: row.reply_to_id || null,
  reply_to: row.reply_to || null,
```

(`json_build_object` comes back from node-postgres already parsed — no `JSON.parse`.)

## 3. Accept `reply_to_id` when the client sends — `routes/customerJobHistoryRoutes.js`

In `router.post('/chat/messages', …)`, after `const thread = await ensureChatThread(client_id);`:

```js
    // Reply-to: only a real, visible message in THIS client's thread — never an id from another
    // thread (that would leak its text through the quote) and never an internal system note.
    let replyToId = null;
    const replyRaw = Number(req.body?.reply_to_id);
    if (Number.isInteger(replyRaw) && replyRaw > 0) {
      const ok = await client.query(
        `SELECT 1 FROM commercial_chat_messages
          WHERE id = $1 AND thread_id = $2 AND sender_kind <> 'system'`,
        [replyRaw, thread.id],
      );
      if (ok.rowCount > 0) replyToId = replyRaw;
    }
```

and in the `INSERT INTO commercial_chat_messages (…)` of that same route, add `reply_to_id` to the
column list, one more `$n` placeholder to `VALUES`, and `replyToId` at the end of the params array.
(The live INSERT may already carry `site_id` from the 2026-10-02 work — just append after it.)

## 3b. Accept `reply_to_id` when STAFF send — `routes/commercialChatRoutes.js`

The staff app's Support thread has the same reply UI (swipe / long-press → Reply) and sends
`reply_to_id` too. In the send handler (`POST /threads/:id/messages` — the function that ends with
the `INSERT INTO commercial_chat_messages (thread_id, sender_kind, sender_user_id, body, schedule_id,
attachment_url, attachment_name, mentioned_user_id) VALUES ($1, 'agent', …)`), once `thread` is
known and before that INSERT, add the same check:

```js
  // Reply-to: only a real, visible message in THIS thread (never another client's, never a system note).
  let replyToId = null;
  const replyRaw = Number(req.body?.reply_to_id);
  if (Number.isInteger(replyRaw) && replyRaw > 0) {
    const ok = await client.query(
      `SELECT 1 FROM commercial_chat_messages
        WHERE id = $1 AND thread_id = $2 AND sender_kind <> 'system'`,
      [replyRaw, thread.id],
    );
    if (ok.rowCount > 0) replyToId = replyRaw;
  }
```

and change the INSERT to carry it:

```js
    `INSERT INTO commercial_chat_messages
       (thread_id, sender_kind, sender_user_id, body, schedule_id, attachment_url, attachment_name, mentioned_user_id, reply_to_id)
     VALUES ($1, 'agent', $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [thread.id, agent.id, body, scheduleId, attachmentUrl, attachmentName, mentionedUserId, replyToId],
```

(If the live INSERT has more columns than this, keep them and just append `reply_to_id` / `replyToId`
at the end.)

## 4. Deploy & check

1. Run the migration, upload both route files, `pm2 restart`, watch `pm2 logs` for SQL errors.
2. Client app → Support → General: swipe a SoWash message to the right → "Replying to …" bar →
   send. The bubble shows the quote; tapping the quote scrolls to the original.
3. Staff app → Chats → that client: the client's message shows the same quote; swipe a client message
   right → reply → the client sees the quote on SoWash's answer.
4. Reload both apps: the quote is still there (it now comes from the server).
