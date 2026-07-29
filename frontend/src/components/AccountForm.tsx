import type { FieldErrors, Gender, User, UserUpdatePayload } from "../types";
import { Field, Select } from "./Field";

export type AccountFormValue = {
  full_name: string;
  phone: string;
  date_of_birth: string;
  gender: Gender | "";
  hometown: string;
  address: string;
};

export const accountFormValue = (user?: User): AccountFormValue => ({
  full_name: user?.full_name ?? "",
  phone: user?.phone ?? "",
  date_of_birth: user?.date_of_birth ?? "",
  gender: user?.gender ?? "",
  hometown: user?.hometown ?? "",
  address: user?.address ?? "",
});

export const accountFormPayload = (value: AccountFormValue): UserUpdatePayload => ({
  full_name: value.full_name.trim(),
  phone: value.phone.trim(),
  date_of_birth: value.date_of_birth || null,
  gender: value.gender || null,
  hometown: value.hometown.trim(),
  address: value.address.trim(),
});

export const genderLabel = (gender?: Gender | null) =>
  gender ? { NAM: "Male", NU: "Female", KHAC: "Other" }[gender] : "";

export const PHONE_HINT = "9 to 15 digits, optional leading +.";
const today = () => new Date().toISOString().slice(0, 10);

/** Mirrors the backend serializer rules so obvious mistakes never cost a round trip. */
export function accountFormErrors(value: AccountFormValue): FieldErrors {
  const errors: FieldErrors = {};
  const fullName = value.full_name.trim();
  if (!fullName) errors.full_name = ["Full name is required."];
  else if (fullName.length < 2 || fullName.length > 100) errors.full_name = ["Use 2 to 100 characters."];
  const phone = value.phone.trim();
  if (phone && !/^\+?\d{9,15}$/.test(phone)) errors.phone = ["Use 9 to 15 digits with an optional leading +."];
  if (value.date_of_birth && value.date_of_birth >= today()) errors.date_of_birth = ["Date of birth must be in the past."];
  if (value.hometown.trim().length > 100) errors.hometown = ["Use at most 100 characters."];
  if (value.address.trim().length > 255) errors.address = ["Use at most 255 characters."];
  return errors;
}

export function AccountForm({
  value,
  onChange,
  errors = {},
  prefix = "account",
}: {
  value: AccountFormValue;
  onChange: (value: AccountFormValue) => void;
  errors?: FieldErrors;
  prefix?: string;
}) {
  const set = <K extends keyof AccountFormValue>(field: K, next: AccountFormValue[K]) =>
    onChange({ ...value, [field]: next });
  return <>
    <fieldset className="form-section">
      <legend className="section-title">Personal information</legend>
      <div className="form-grid">
        <Field id={`${prefix}-full-name`} label="Full name" required autoComplete="name" maxLength={100} value={value.full_name} onChange={(event) => set("full_name", event.target.value)} error={errors.full_name?.[0]} />
        <Field id={`${prefix}-phone`} label="Phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={16} hint={PHONE_HINT} value={value.phone} onChange={(event) => set("phone", event.target.value)} error={errors.phone?.[0]} />
        <Field id={`${prefix}-date-of-birth`} label="Date of birth" type="date" max={today()} value={value.date_of_birth} onChange={(event) => set("date_of_birth", event.target.value)} error={errors.date_of_birth?.[0]} />
        <Select id={`${prefix}-gender`} label="Gender" value={value.gender} onChange={(event) => set("gender", event.target.value as Gender | "")} error={errors.gender?.[0]}>
          <option value="">Not provided</option><option value="NAM">Male</option><option value="NU">Female</option><option value="KHAC">Other</option>
        </Select>
      </div>
    </fieldset>
    <fieldset className="form-section">
      <legend className="section-title">Location</legend>
      <div className="form-grid">
        <Field id={`${prefix}-hometown`} label="Hometown" maxLength={100} value={value.hometown} onChange={(event) => set("hometown", event.target.value)} error={errors.hometown?.[0]} />
        <Field id={`${prefix}-address`} label="Address" wide autoComplete="street-address" maxLength={255} value={value.address} onChange={(event) => set("address", event.target.value)} error={errors.address?.[0]} />
      </div>
    </fieldset>
  </>;
}
