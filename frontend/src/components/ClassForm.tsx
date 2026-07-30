import type { ClassFormPayload, ClassRow, FieldErrors } from "../types";
import { Field, Select } from "./Field";

export type ClassFormValue = {
  name: string;
  description: string;
  starts_at: string;
  ends_at: string;
  teacher_id: string;
};

export const classFormValue = (class_?: ClassRow): ClassFormValue => ({
  name: class_?.name ?? "",
  description: class_?.description ?? "",
  starts_at: class_?.starts_at?.slice(0, 10) ?? "",
  ends_at: class_?.ends_at?.slice(0, 10) ?? "",
  teacher_id: class_ ? String(class_.teacher.id) : "",
});

export const classFormPayload = (value: ClassFormValue): ClassFormPayload => ({
  name: value.name.trim(),
  description: value.description.trim(),
  starts_at: value.starts_at,
  ends_at: value.ends_at,
  teacher_id: Number(value.teacher_id),
});

export function classFormErrors(value: ClassFormValue): FieldErrors {
  const errors: FieldErrors = {};
  const name = value.name.trim();
  if (!name) errors.name = ["Name is required."];
  else if (name.length < 2 || name.length > 100) errors.name = ["Use 2 to 100 characters."];
  if (!value.starts_at) errors.starts_at = ["Start date is required."];
  if (!value.ends_at) errors.ends_at = ["End date is required."];
  if (value.starts_at && value.ends_at && value.starts_at >= value.ends_at) errors.ends_at = ["End time must be after start time."];
  if (!value.teacher_id) errors.teacher_id = ["Teacher is required."];
  return errors;
}

export function ClassForm({
  value, onChange, errors = {}, prefix = "class", teachers,
}: {
  value: ClassFormValue;
  onChange: (value: ClassFormValue) => void;
  errors?: FieldErrors;
  prefix?: string;
  teachers: { id: number; full_name: string }[];
}) {
  const set = <K extends keyof ClassFormValue>(field: K, next: ClassFormValue[K]) => onChange({ ...value, [field]: next });
  return <fieldset className="form-section">
    <legend className="section-title">Class details</legend>
    <div className="form-grid">
      <Field id={`${prefix}-name`} label="Name" required wide maxLength={100} value={value.name} onChange={(event) => set("name", event.target.value)} error={errors.name?.[0]} />
      <Field id={`${prefix}-description`} label="Description" wide value={value.description} onChange={(event) => set("description", event.target.value)} error={errors.description?.[0]} />
      <Field id={`${prefix}-starts-at`} label="Starts" type="date" required value={value.starts_at} onChange={(event) => set("starts_at", event.target.value)} error={errors.starts_at?.[0]} />
      <Field id={`${prefix}-ends-at`} label="Ends" type="date" required value={value.ends_at} onChange={(event) => set("ends_at", event.target.value)} error={errors.ends_at?.[0]} />
      <Select id={`${prefix}-teacher`} label="Teacher" required wide value={value.teacher_id} onChange={(event) => set("teacher_id", event.target.value)} error={errors.teacher_id?.[0]}>
        <option value="">Select a teacher</option>
        {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>)}
      </Select>
    </div>
  </fieldset>;
}
