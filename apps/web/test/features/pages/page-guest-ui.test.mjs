import { readFile } from "node:fs/promises";

export function register({ readSource, assert, loadModule, test }) {
  test("invitation links require exactly one non-empty id", async () => {
    const { readSingleInvitationId } = await loadModule(
      "/packages/features/src/workspaces/model.ts",
    );

    assert.equal(readSingleInvitationId("?id=page-invite-1"), "page-invite-1");
    assert.equal(readSingleInvitationId("?id=%20"), null);
    assert.equal(readSingleInvitationId("?id=one&id=two"), null);
    assert.equal(readSingleInvitationId(""), null);
  });

  test("page guest UI keeps invitation, management, and shell concerns separate", async () => {
    const [acceptance, shareMenu, teamSettings, pageShell, sharedHeader] = await Promise.all([
      readSource("/src/components/pages/access/accept-page-invitation-screen.tsx"),
      Promise.all([
        readSource("/src/components/sharing/share-popover.tsx"),
        readSource("/src/components/sharing/use-sharing.ts"),
        readSource("/packages/features/src/pages/sharing-hooks.ts"),
      ]).then((parts) => parts.join("\n")),
      Promise.all([
        readSource("/src/components/workspaces/workspace-members.tsx"),
        readSource("/src/components/workspaces/guests/components/workspace-guests.tsx"),
      ]).then((parts) => parts.join("\n")),
      readSource("/src/components/pages/page-screen.tsx"),
      readSource("/src/components/pages/header/public-page-header.tsx"),
    ]);

    assert.match(acceptance, /useAcceptPageGuestInvitation/);
    assert.match(acceptance, /to="\/p\/\$pageId"/);
    assert.match(shareMenu, /Invite a page guest/);
    assert.match(shareMenu, /value="comment">Comment/);
    assert.match(shareMenu, /Pending owner approval/);
    assert.match(shareMenu, /useRevokePageGuest/);
    assert.match(teamSettings, /Page guests/);
    assert.match(teamSettings, /useRevokeWorkspaceGuest/);
    assert.match(teamSettings, /Require owner approval/);
    assert.match(teamSettings, /Convert to member/);
    assert.match(pageShell, /publishedShare === "guest"/);
    assert.match(sharedHeader, /<Badge variant="outline">Guest<\/Badge>/);
  });
}
