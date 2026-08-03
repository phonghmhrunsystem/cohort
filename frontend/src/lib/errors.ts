import type { FieldErrors } from "../types";

export class ApiFailure extends Error {
  constructor(
    public readonly status: number,
    public readonly fields?: FieldErrors,
    detail = "Request failed.",
  ) {
    super(detail);
    this.name = "ApiFailure";
  }
}
