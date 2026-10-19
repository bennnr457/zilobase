import { Hono } from "hono";
import {
  claimMeetingRecorderOperation,
  createMeetingOperation,
  deleteMeetingOperation,
  getMeetingOperation,
  listMeetingsOperation,
  prepareMeetingCollaborationOperation,
  recordMeetingConsentOperation,
  releaseMeetingRecorderOperation,
  transitionMeetingOperation,
  updateMeetingOperation,
} from "../../services/meetings/operations";
import { serverOperationContext } from "../http/operation-context";
import { attachServiceErrorHandler } from "../http/route-error";

import {
  getMeetingAudioWebSocketUrl,
  getMeetingCollaborationWebSocketUrl,
} from "@zilobase/runtime-adapter/capabilities";
import { meetingLifecycleActions } from "../../services/meetings/contracts/meeting-types";
import type { AppBindings } from "../../shared/contracts/http";

export const meetingRoutes = attachServiceErrorHandler(new Hono<AppBindings>());

meetingRoutes.use("*", async (c, next) => {
  if (c.env.MEETING_BLOCK_ENABLED !== "true") {
    return c.json({ error: "Meeting blocks are not enabled" }, 404);
  }

  await next();
});

meetingRoutes.get("/", async (c) =>
  c.json(
    await listMeetingsOperation(serverOperationContext(c), {
      workspaceId: c.req.query("workspaceId"),
    }),
    200,
  ),
);

meetingRoutes.post("/", async (c) =>
  c.json(await createMeetingOperation(serverOperationContext(c), {}, () => c.req.json()), 201),
);

meetingRoutes.get("/:id", async (c) =>
  c.json(await getMeetingOperation(serverOperationContext(c), { id: c.req.param("id")! }), 200),
);

meetingRoutes.post("/:id/collaboration-ticket", async (c) =>
  c.json(
    await prepareMeetingCollaborationOperation(serverOperationContext(c), {
      id: c.req.param("id")!,
      collaborationWebsocketUrl: getMeetingCollaborationWebSocketUrl(c.req.raw),
    }),
    200,
  ),
);

meetingRoutes.post("/:id/recorder/claim", async (c) =>
  c.json(
    await claimMeetingRecorderOperation(serverOperationContext(c), {
      id: c.req.param("id")!,
      audioWebsocketUrl: getMeetingAudioWebSocketUrl(c.req.raw),
    }),
    200,
  ),
);

meetingRoutes.post("/:id/consent", async (c) =>
  c.json(
    await recordMeetingConsentOperation(serverOperationContext(c), { id: c.req.param("id")! }, () =>
      c.req.json(),
    ),
    201,
  ),
);

meetingRoutes.post("/:id/recorder/release", async (c) =>
  c.json(
    await releaseMeetingRecorderOperation(
      serverOperationContext(c),
      { id: c.req.param("id")! },
      () => c.req.json(),
    ),
    200,
  ),
);

meetingRoutes.patch("/:id", async (c) =>
  c.json(
    await updateMeetingOperation(serverOperationContext(c), { id: c.req.param("id")! }, () =>
      c.req.json(),
    ),
    200,
  ),
);

for (const action of meetingLifecycleActions) {
  meetingRoutes.post(`/:id/${action}`, async (c) =>
    c.json(
      await transitionMeetingOperation(
        serverOperationContext(c),
        { action: action, id: c.req.param("id")! },
        () => c.req.json(),
      ),
      200,
    ),
  );
}

meetingRoutes.delete("/:id", async (c) =>
  c.json(await deleteMeetingOperation(serverOperationContext(c), { id: c.req.param("id")! }), 200),
);
