import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { sessionQueryKey, updateSessionImage } from "./queries.ts";
test("profile image acknowledgements preserve session fields and do not create signed-out users", () => {
  const client = new QueryClient();
  try {
    updateSessionImage(client, "image");
    assert.equal(client.getQueryData(sessionQueryKey), undefined);
    const session = { id: "session" };
    client.setQueryData(sessionQueryKey, {
      session,
      user: { id: "user", name: "Name", image: null },
      workspacePinned: true,
    });
    updateSessionImage(client, "image");
    assert.deepEqual(client.getQueryData(sessionQueryKey), {
      session,
      user: { id: "user", name: "Name", image: "image" },
      workspacePinned: true,
    });
    updateSessionImage(client, null);
    assert.equal(client.getQueryData(sessionQueryKey).user.image, null);
    client.setQueryData(sessionQueryKey, { user: null, session: null });
    updateSessionImage(client, "image");
    assert.deepEqual(client.getQueryData(sessionQueryKey), { user: null, session: null });
  } finally {
    client.clear();
  }
});
