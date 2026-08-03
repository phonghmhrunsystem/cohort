import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatCard } from "../../components/StatCard";

describe("StatCard", () => {
  it("shows the value and its label", () => {
    render(<StatCard label="Bài chờ chấm" value={11} />);

    expect(screen.getByText("11")).toBeTruthy();
    expect(screen.getByText("Bài chờ chấm")).toBeTruthy();
  });

  it("renders an em dash when there is no value yet", () => {
    render(<StatCard label="Điểm trung bình" value={null} />);

    expect(screen.getByText("—")).toBeTruthy();
  });

  it("marks a warning tone so a backlog reads differently from a total", () => {
    const { container } = render(<StatCard label="Bài chưa nộp" value={3} tone="warn" />);

    expect(container.querySelector(".stat-card--warn")).toBeTruthy();
  });
});
