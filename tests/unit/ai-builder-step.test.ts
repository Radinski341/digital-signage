import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/errors";

vi.mock("@/server/access", () => ({ requireAccess: vi.fn() }));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/ai/workspaces", () => ({
  ownedWorkspace: vi.fn(), queueRun: vi.fn(), cancelRun: vi.fn(),
  resumeBuilderRun: vi.fn(), stageOperation: vi.fn(),
}));
vi.mock("@/server/ai/workspace-publish", () => ({ applyWorkspace: vi.fn() }));
vi.mock("@/server/ai/workspace-data", () => ({
  lockWorkspace: vi.fn(), getRecord: vi.fn(), recordPayload: vi.fn(),
  fingerprint: vi.fn(), json: vi.fn(), assertWorkspaceActor: vi.fn(),
}));
vi.mock("@/server/ai/worker", () => ({
  claimBuilderRun: vi.fn(), processBuilderRun: vi.fn(),
}));
import { requireAccess } from "@/server/access";
import { ownedWorkspace } from "@/server/ai/workspaces";
import { claimBuilderRun, processBuilderRun } from "@/server/ai/worker";
import { POST } from "@/app/api/ai/workspaces/[id]/[action]/route";

const request = () => new Request("https://example.test/api/ai/workspaces/owned/step", {
  method: "POST", headers: { origin: "https://example.test" },
});
const context = () => ({ params: Promise.resolve({ id: "owned", action: "step" }) });
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireAccess).mockResolvedValue({ siteId: "site" } as any);
  vi.mocked(ownedWorkspace).mockResolvedValue({ id: "owned" } as any);
});
describe("Vercel builder steps", () => {
  it("checks ownership before claiming and awaits exactly one scoped step", async () => {
    const run = { id: "run", workspaceId: "owned" };
    vi.mocked(claimBuilderRun).mockResolvedValue(run as any);
    const response = await POST(request(), context());
    expect(response.status).toBe(200);
    expect(requireAccess).toHaveBeenCalledWith("content", expect.any(Request));
    expect(claimBuilderRun).toHaveBeenCalledExactlyOnceWith("owned");
    expect(processBuilderRun).toHaveBeenCalledExactlyOnceWith(run);
    expect(vi.mocked(ownedWorkspace).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(claimBuilderRun).mock.invocationCallOrder[0],
    );
    expect(await response.json()).toEqual({ processed: true });
  });
  it("cannot advance a foreign proposal", async () => {
    vi.mocked(ownedWorkspace).mockRejectedValue(new AppError(404, "Not found"));
    expect((await POST(request(), context())).status).toBe(404);
    expect(claimBuilderRun).not.toHaveBeenCalled();
    expect(processBuilderRun).not.toHaveBeenCalled();
  });
  it("returns without processing when another request holds the lease", async () => {
    vi.mocked(claimBuilderRun).mockResolvedValue(null);
    const response = await POST(request(), context());
    expect(await response.json()).toEqual({ processed: false });
    expect(processBuilderRun).not.toHaveBeenCalled();
  });
});
