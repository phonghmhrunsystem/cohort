import type { FieldErrors, Gender, User, UserUpdatePayload } from "../types";
import { Field } from "./Field";

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
  full_name: value.full_name,
  phone: value.phone,
  date_of_birth: value.date_of_birth || null,
  gender: value.gender || null,
  hometown: value.hometown,
  address: value.address,
});

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
  return <div className="form-grid">
    <Field id={`${prefix}-full-name`} label="Full name" value={value.full_name} onChange={(event) => set("full_name", event.target.value)} error={errors.full_name?.[0]} />
    <Field id={`${prefix}-phone`} label="Phone" type="tel" value={value.phone} onChange={(event) => set("phone", event.target.value)} error={errors.phone?.[0]} />
    <Field id={`${prefix}-date-of-birth`} label="Date of birth" type="date" value={value.date_of_birth} onChange={(event) => set("date_of_birth", event.target.value)} error={errors.date_of_birth?.[0]} />
    <label className="field" htmlFor={`${prefix}-gender`}><span>Gender</span>
      <select id={`${prefix}-gender`} value={value.gender} onChange={(event) => set("gender", event.target.value as Gender | "")}>
        <option value="">Not provided</option><option value="NAM">Male</option><option value="NU">Female</option><option value="KHAC">Other</option>
      </select>
      {errors.gender?.[0] && <span role="alert">{errors.gender[0]}</span>}
    </label>
    <Field id={`${prefix}-hometown`} label="Hometown" value={value.hometown} onChange={(event) => set("hometown", event.target.value)} error={errors.hometown?.[0]} />
    <Field id={`${prefix}-address`} label="Address" value={value.address} onChange={(event) => set("address", event.target.value)} error={errors.address?.[0]} />
  </div>;
}
