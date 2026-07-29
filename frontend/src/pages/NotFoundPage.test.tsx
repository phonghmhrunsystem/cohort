import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { expect, it } from "vitest";

import { NotFoundPage } from "./NotFoundPage";

it("renders the recovery link as a 44px inline-flex target", () => {
  render(<BrowserRouter><NotFoundPage /></BrowserRouter>);

  const link = getComputedStyle(screen.getByRole("link", { name: "Go to dashboard" }));
  expect(link.display).toBe("inline-flex");
  expect(link.minHeight).toBe("44px");
});
