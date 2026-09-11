# Board durability acceptance

## Save

1. Create a Board with at least one drawing event.
2. Save it and reload the page.
3. Confirm it appears in saved Boards and reopens from server state.
4. Delete that server Board, reopen its browser recovery draft, and save again.
5. Confirm a new durable Board is created instead of repeatedly failing on the stale server ID.
6. Confirm a revoked editor draft does not fork into a new owner Board.

## Share

1. Share a saved Board with an existing active OXSIG account; confirm immediate viewer/editor access.
2. Share with an email that has no OXSIG account; confirm a pending invitation appears and the email is sent.
3. Open the invitation signed out; confirm sign-in and sign-up are offered.
4. Accept using the invited email; confirm the shared Board opens directly.
5. Attempt acceptance with another email; confirm access is denied.
6. Revoke a pending invitation; confirm it can no longer be accepted.
