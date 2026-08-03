import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { useState } from "react";

import { Dialog } from "../../components/Dialog";

const originalShowModal = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

afterAll(() => {
  HTMLDialogElement.prototype.showModal = originalShowModal;
  HTMLDialogElement.prototype.close = originalClose;
});

describe("Dialog", () => {
  it("uses a unique accessible title for each instance", () => {
    render(<>
      <Dialog open onClose={() => undefined} title="First dialog">First content</Dialog>
      <Dialog open onClose={() => undefined} title="Second dialog">Second content</Dialog>
    </>);

    const dialogs = screen.getAllByRole("dialog");
    const firstTitle = dialogs[0].getAttribute("aria-labelledby");
    const secondTitle = dialogs[1].getAttribute("aria-labelledby");
    expect(firstTitle).not.toBe(secondTitle);
    expect(document.getElementById(firstTitle ?? "")?.textContent).toBe("First dialog");
    expect(document.getElementById(secondTitle ?? "")?.textContent).toBe("Second dialog");
  });

  it("restores focus to its opener after close", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return <>
        <button onClick={() => setOpen(true)}>Open dialog</button>
        <Dialog open={open} onClose={() => setOpen(false)} title="Example dialog">Content</Dialog>
      </>;
    }
    const user = userEvent.setup();
    render(<Harness />);

    const opener = screen.getByRole("button", { name: "Open dialog" });
    await user.click(opener);
    await user.click(screen.getByRole("button", { name: "Close dialog" }));

    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});
