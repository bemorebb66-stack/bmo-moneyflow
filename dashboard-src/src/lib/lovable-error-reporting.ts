import { reportPrivacySafeError } from "./telemetry";

export function reportLovableError(
  error: unknown,
  context: Record<string, unknown> = {},
) {
  const boundary =
    context.boundary === "tanstack_root_error_component"
      ? "tanstack_root"
      : "global";
  reportPrivacySafeError(error, boundary);
}
