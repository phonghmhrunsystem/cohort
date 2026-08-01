import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Same reason as testTimeout in vite.config.ts: waitFor's 1s default is a machine-speed
// bet, and it loses whenever the suite's parallel files contend for the CPU.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  // Unmount first: wiping the body out from under a mounted tree makes React's own
  // cleanup throw NotFoundError, which then leaks into the next test in the file.
  cleanup();
  document.body.style.overflow = "";
  document.body.replaceChildren();
});
