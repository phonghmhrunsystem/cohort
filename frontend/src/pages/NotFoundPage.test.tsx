import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { expect, it } from "vitest";

import { NotFoundPage } from "./NotFoundPage";

it("gives the recovery link a 44px target", () => {
  render(<BrowserRouter><NotFoundPage /></BrowserRouter>);

  expect(getComputedStyle(screen.getByRole("link", { name: "Go to dashboard" })).minHeight).toBe("44px");
});
