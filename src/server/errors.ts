import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof AppError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError)
    return Response.json(
      {
        error: "Please check the highlighted fields.",
        issues: error.flatten(),
      },
      { status: 422 },
    );
  if (error instanceof SyntaxError)
    return Response.json({ error: "Invalid request format." }, { status: 400 });
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002")
      return Response.json(
        { error: "This identifier is already in use." },
        { status: 409 },
      );
    if (error.code === "P2003")
      return Response.json(
        { error: "This content is still referenced." },
        { status: 409 },
      );
    if (error.code === "P2025")
      return Response.json(
        { error: "Content not found or changed by another editor." },
        { status: 409 },
      );
  }
  const requestId = randomUUID();
  console.error(
    JSON.stringify({
      requestId,
      event: "request_failed",
      type: error instanceof Error ? error.name : "unknown",
    }),
  );
  return Response.json(
    { error: "Unable to complete the request. Please try again.", requestId },
    { status: 500 },
  );
}
export function endpoint<A extends unknown[]>(
  fn: (...args: A) => Promise<Response>,
) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      return errorResponse(e);
    }
  };
}
