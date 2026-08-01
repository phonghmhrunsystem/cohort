import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Same reason as testTimeout in vite.config.ts: waitFor's 1s default is a machine-speed
// bet, and it loses whenever the suite's parallel files contend for the CPU.
configure({ asyncUtilTimeout: 5000 });

// jsdom ships <dialog> without showModal/close, so any component built on Dialog explodes on
// mount. Every test file gets a fresh module registry, so setting this here is per-file.
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute("open");
  this.dispatchEvent(new Event("close"));
};

afterEach(() => {
  // Unmount first: wiping the body out from under a mounted tree makes React's own
  // cleanup throw NotFoundError, which then leaks into the next test in the file.
  cleanup();
  document.body.style.overflow = "";
  document.body.replaceChildren();
});
