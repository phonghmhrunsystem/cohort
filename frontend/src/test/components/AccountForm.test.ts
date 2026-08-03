import { describe, expect, it } from "vitest";

import { accountFormErrors, accountFormValue } from "../../components/AccountForm";

const value = (overrides: Partial<ReturnType<typeof accountFormValue>> = {}) => ({ ...accountFormValue(), full_name: "Ada Lovelace", ...overrides });

describe("accountFormErrors", () => {
  it("accepts a valid draft", () => {
    expect(accountFormErrors(value({ phone: "+84901234567", date_of_birth: "1990-01-02" }))).toEqual({});
  });

  it("requires a full name of 2 to 100 characters", () => {
    expect(accountFormErrors(value({ full_name: "  " })).full_name).toEqual(["Full name is required."]);
    expect(accountFormErrors(value({ full_name: "X" })).full_name).toEqual(["Use 2 to 100 characters."]);
    expect(accountFormErrors(value({ full_name: "a".repeat(101) })).full_name).toEqual(["Use 2 to 100 characters."]);
  });

  it("keeps phone optional but digit-shaped", () => {
    expect(accountFormErrors(value({ phone: "" })).phone).toBeUndefined();
    expect(accountFormErrors(value({ phone: "090-123" })).phone).toEqual(["Use 9 to 15 digits with an optional leading +."]);
  });

  it("rejects a date of birth that is today or later", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(accountFormErrors(value({ date_of_birth: today })).date_of_birth).toEqual(["Date of birth must be in the past."]);
    expect(accountFormErrors(value({ date_of_birth: "1990-01-02" })).date_of_birth).toBeUndefined();
  });
});
