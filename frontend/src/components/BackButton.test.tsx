import { expect, test, vi } from "vitest";

import { BackButton } from "./BackButton";

function clickBack() {
  const button = BackButton({ fallbackHref: "/teacher/classes" });
  (button.props as { onClick: () => void }).onClick();
}

test("goes back when browser history exists", () => {
  const back = vi.fn();
  const assign = vi.fn();
  vi.stubGlobal("history", { back, length: 2 });
  vi.stubGlobal("location", { assign });

  clickBack();

  expect(back).toHaveBeenCalledOnce();
  expect(assign).not.toHaveBeenCalled();
});

test("uses its fallback when there is no prior browser history", () => {
  const back = vi.fn();
  const assign = vi.fn();
  vi.stubGlobal("history", { back, length: 1 });
  vi.stubGlobal("location", { assign });

  clickBack();

  expect(back).not.toHaveBeenCalled();
  expect(assign).toHaveBeenCalledWith("/teacher/classes");
});
