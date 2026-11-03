# Verified browser identity recovery

Anonymous workspaces use a random HttpOnly cookie; its hash owns chats, runs, saved cases, character settings, workflows and portfolio settings. Losing or replacing the cookie does not delete stored data, but a fresh browser sees an empty workspace. The browser's localStorage history is an additional cache, not an ownership credential.

After independently verifying the user's prior ownership, an operator can restore a specific browser through the private `VEYA_BROWSER_OWNER_ALIASES` environment setting. It is a JSON map from the new cookie's SHA-256 hash to the verified original owner hash. Restart the service after changing the private setting. Keep a private configuration backup before repair. No cookie tokens, actual recovery mappings or personal histories belong in the repository.

All workspace routes resolve the same mapping, so history replay and associated settings retain their original owner. Existing data is neither copied nor reassigned, and the original browser continues working. Unlisted or invalid cookies receive no recovery access. Mappings are explicit and one-hop only, with no default owner, newest-user lookup or public recovery endpoint. Remove the specific mapping to revoke a repaired browser's access. Invalid configuration fails closed to the browser's own fresh workspace.
