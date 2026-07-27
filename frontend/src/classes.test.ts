import { expect, test, vi } from "vitest";

vi.mock("./api", () => ({ api: vi.fn() }));

import { api } from "./api";
import { listClasses } from "./classes";

test("listClasses passes its search query to the Class API", async () => {
  vi.mocked(api).mockResolvedValue([]);

  await expect(listClasses("python")).resolves.toEqual([]);
  expect(api).toHaveBeenCalledWith("/classes?q=python");
});
