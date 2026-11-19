import { describe, expect, it, vi } from "vitest";
import { logError, logLine, redactSecrets } from "@/lib/log";

describe("redactSecrets", () => {
  it("replaces secret fields with [redacted]", () => {
    const out = redactSecrets({
      email: "a@b.com",
      password: "hunter2",
      token: "abc123",
      nested: { api_key: "key", name: "ok" },
    });
    expect(out).toEqual({
      email: "a@b.com",
      password: "[redacted]",
      token: "[redacted]",
      nested: { api_key: "[redacted]", name: "ok" },
    });
  });

  it("redacts service_role and authorization headers", () => {
    const out = redactSecrets({
      service_role_key: "secret",
      Authorization: "Bearer x",
    });
    expect(out).toEqual({
      service_role_key: "[redacted]",
      Authorization: "[redacted]",
    });
  });

  it("passes non-secret values through", () => {
    expect(redactSecrets({ count: 3, ok: true })).toEqual({
      count: 3,
      ok: true,
    });
    expect(redactSecrets([1, "a"])).toEqual([1, "a"]);
    expect(redactSecrets("plain")).toBe("plain");
    expect(redactSecrets(null)).toBeNull();
  });

  it("does not throw on a circular reference", () => {
    const obj: Record<string, unknown> = { name: "x" };
    obj.self = obj;
    expect(() => redactSecrets(obj)).not.toThrow();
    const out = redactSecrets(obj) as Record<string, unknown>;
    expect(out.self).toBe("[circular]");
  });
});

describe("logLine", () => {
  it("writes one JSON line with time, level, scope and message", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logLine("error", "upload", "Upload failed", { documentId: "d1" });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line.level).toBe("error");
    expect(line.scope).toBe("upload");
    expect(line.message).toBe("Upload failed");
    expect(line.context).toEqual({ documentId: "d1" });
    expect(typeof line.time).toBe("string");
    spy.mockRestore();
  });

  it("redacts secrets in the context", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logLine("error", "auth", "Sign-in failed", { password: "hunter2" });
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line.context.password).toBe("[redacted]");
    spy.mockRestore();
  });
});

describe("logError", () => {
  it("logs an Error's message", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logError("ocr", new Error("Worker crashed"));
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line.scope).toBe("ocr");
    expect(line.message).toBe("Worker crashed");
    spy.mockRestore();
  });

  it("logs a plain string error", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logError("ocr", "something broke");
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line.message).toBe("something broke");
    spy.mockRestore();
  });
});
