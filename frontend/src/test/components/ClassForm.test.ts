import { describe, expect, it } from "vitest";
import { classFormErrors, classFormPayload, classFormValue } from "../../components/ClassForm";

describe("classFormValue", () => {
  it("defaults to empty fields", () => {
    expect(classFormValue()).toEqual({ name: "", description: "", starts_at: "", ends_at: "", teacher_id: "" });
  });
});

describe("classFormErrors", () => {
  it("requires a name between 2 and 100 characters", () => {
    expect(classFormErrors({ name: "A", description: "", starts_at: "2026-01-01", ends_at: "2026-02-01", teacher_id: "1" }).name).toBeDefined();
  });
  it("requires starts_at before ends_at", () => {
    expect(classFormErrors({ name: "Cohort 5", description: "", starts_at: "2026-02-01", ends_at: "2026-01-01", teacher_id: "1" }).ends_at).toBeDefined();
  });
  it("requires a teacher", () => {
    expect(classFormErrors({ name: "Cohort 5", description: "", starts_at: "2026-01-01", ends_at: "2026-02-01", teacher_id: "" }).teacher_id).toBeDefined();
  });
});

describe("classFormPayload", () => {
  it("trims text and coerces teacher_id to a number", () => {
    expect(classFormPayload({ name: " Cohort 5 ", description: " desc ", starts_at: "2026-01-01", ends_at: "2026-02-01", teacher_id: "3" }))
      .toEqual({ name: "Cohort 5", description: "desc", starts_at: "2026-01-01", ends_at: "2026-02-01", teacher_id: 3 });
  });
});
