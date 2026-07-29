import { afterEach } from "vitest";

afterEach(() => {
  document.body.style.overflow = "";
  document.body.replaceChildren();
});
