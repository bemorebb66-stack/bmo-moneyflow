import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./share-menu";

const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");

function restoreGlobal(name: "navigator" | "document", descriptor?: PropertyDescriptor) {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
  } else {
    Reflect.deleteProperty(globalThis, name);
  }
}

afterEach(() => {
  restoreGlobal("navigator", navigatorDescriptor);
  restoreGlobal("document", documentDescriptor);
  vi.restoreAllMocks();
});

function installClipboardEnvironment({
  writeText,
  execCommand,
}: {
  writeText: (value: string) => Promise<void>;
  execCommand: (command: string) => boolean;
}) {
  const textarea = {
    value: "",
    style: {} as CSSStyleDeclaration,
    setAttribute: vi.fn(),
    select: vi.fn(),
    remove: vi.fn(),
  };
  const appendChild = vi.fn();

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { clipboard: { writeText } },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      body: { appendChild },
      createElement: vi.fn(() => textarea),
      execCommand,
    },
  });

  return { appendChild, textarea };
}

describe("copyText", () => {
  it("uses the native clipboard when it succeeds", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const execCommand = vi.fn(() => true);
    const { appendChild } = installClipboardEnvironment({ writeText, execCommand });

    await copyText("https://example.com/briefing");

    expect(writeText).toHaveBeenCalledWith("https://example.com/briefing");
    expect(appendChild).not.toHaveBeenCalled();
  });

  it("falls back to the selection API when clipboard permission is denied", async () => {
    const writeText = vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
    const execCommand = vi.fn(() => true);
    const { appendChild, textarea } = installClipboardEnvironment({ writeText, execCommand });

    await copyText("https://example.com/briefing");

    expect(appendChild).toHaveBeenCalledOnce();
    expect(textarea.value).toBe("https://example.com/briefing");
    expect(textarea.select).toHaveBeenCalledOnce();
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(textarea.remove).toHaveBeenCalledOnce();
  });

  it("reports failure and removes the temporary element when both methods fail", async () => {
    const denied = new Error("Denied");
    const writeText = vi.fn().mockRejectedValue(denied);
    const execCommand = vi.fn(() => false);
    const { textarea } = installClipboardEnvironment({ writeText, execCommand });

    await expect(copyText("https://example.com/briefing")).rejects.toBe(denied);
    expect(textarea.remove).toHaveBeenCalledOnce();
  });
});
