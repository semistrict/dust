# Chat Renderer Regression Checklist

Scope: browser E2E coverage for the chat message-list replacement in
[ConversationViewer.tsx](/Users/ramon/src/dust/front/components/assistant/conversation/ConversationViewer.tsx)
and its list-state consumers.

## Core Conversation Shell

- [x] Loads an existing conversation page without any Virtuoso license warning.
- [x] Renders existing user and agent messages in the correct order.
- [x] Renders the sticky composer/footer on an existing conversation.
- [x] Shows the empty new-conversation shell on `conversation/new` before a conversation exists.

## Initial Positioning And Scrolling

- [x] Opens a normal conversation at the bottom, with the latest messages visible.
- [x] Opens a deep-linked conversation hash at the targeted message instead of the bottom.
- [x] Loads older messages when scrolling upward in a long conversation.
- [x] Preserves viewport position when older messages are prepended.
- [x] Keeps the composer visible while scrolling through a long conversation.

## Message Navigation Aids

- [x] Bottom-arrow affordance appears away from the latest messages and jumps back to the bottom.
- [x] The conversation stays pinned to the bottom when new messages arrive while already at bottom.
- [x] Date separators render correctly across messages from different days.
- [x] Consecutive user messages remain grouped/spaced correctly.

## Local In-Place Message Mutations

- [x] Sending a new plain user message appends it to the open conversation.
- [x] Editing a just-sent user message updates the rendered row in place.
- [x] Deleting a just-sent user message converts the row to the deleted state in place.

## Agent Message Lifecycle

- [x] Existing completed agent messages render content, status line, and actions.
- [x] Streaming/newly created agent messages transition to final content in the open UI.
- [x] Failed agent messages render an error state.
- [x] Retrying a failed agent message reuses the row and returns it to a success state.

## Tool / Branch / Review Flows

- [x] Blocked validation banner renders when manual approval is required.
- [x] Review button scrolls to the blocked agent message.
- [x] Branch approval sheet renders branch messages.
- [x] Branch approval details tab opens for a selected agent message.

## Side Panels And Sync

- [x] Opening message details keeps the selected message data in sync with the side panel.
- [x] Files/attachments under messages still render inside the conversation list.
