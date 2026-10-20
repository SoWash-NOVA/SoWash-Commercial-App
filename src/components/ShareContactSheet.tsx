// Send one or more phone-book contacts into a Team chat. The picking UI is ChatTargetSheet (shared with the
// file library). Staff only — reached from app/phonebook.tsx, which client accounts can never open.

import React from 'react';
import { errorMessage } from '../api/client';
import { PhonebookContact, shareContactToConversation } from '../phonebook';
import ChatTargetSheet from './ChatTargetSheet';

export default function ShareContactSheet({
  contacts,
  accent,
  onClose,
  onSent,
}: {
  /** Empty = closed. */
  contacts: PhonebookContact[];
  accent: string;
  onClose: () => void;
  /** Called after everything was delivered (the screen clears its selection). */
  onSent?: () => void;
}) {
  return (
    <ChatTargetSheet
      visible={contacts.length > 0}
      title="Send to chat"
      subtitle={contacts.length === 1 ? contacts[0].display_name : `${contacts.length} contacts`}
      accent={accent}
      onClose={onClose}
      onPick={async (conversationId, conversationTitle) => {
        let done = 0;
        try {
          // one message per contact, in the order they were picked
          for (const c of contacts) {
            await shareContactToConversation(conversationId, c);
            done += 1;
          }
        } catch (err) {
          throw new Error(`${done > 0 ? `${done} of ${contacts.length} were sent. ` : ''}${errorMessage(err)}`);
        }
        onSent?.();
        return `${done === 1 ? contacts[0].display_name : `${done} contacts`} sent to ${conversationTitle}.`;
      }}
    />
  );
}
