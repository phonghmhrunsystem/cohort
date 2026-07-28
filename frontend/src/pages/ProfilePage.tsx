import { FormEvent, useEffect, useState } from "react";

import { ApiFailure } from "../api";
import { changePassword, getCurrentUser, updateProfile, User } from "../auth";
import { AppDialog } from "../components/AppDialog";

type Draft = { full_name: string; phone: string; date_of_birth: string; gender: User["gender"]; address: string };
const draftFor = (user: User): Draft => ({ full_name: user.full_name ?? "", phone: user.phone ?? "", date_of_birth: user.date_of_birth ?? "", gender: user.gender, address: user.address ?? "" });
const blankPassword = { current_password: "", new_password: "" };
const fieldError = (fields: Record<string, string[]>, field: string) => fields[field]?.join(" ");

export function ProfilePage() {
  const [user, setUser] = useState<User>();
  const [draft, setDraft] = useState<Draft>();
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState(blankPassword);
  const [passwordFields, setPasswordFields] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { void getCurrentUser().then((next) => { setUser(next); setDraft(draftFor(next)); }).catch((response: ApiFailure) => setError(response.detail || "Unable to load your profile.")); }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true); setError(""); setFields({});
    try {
      const next = await updateProfile({ ...draft, full_name: draft.full_name.trim(), phone: draft.phone.trim(), address: draft.address.trim() });
      setUser(next); setDraft(draftFor(next));
    } catch (response) {
      const failure = response as ApiFailure;
      setError(failure.detail === "Request failed." ? "" : failure.detail);
      setFields(failure.fields ?? {});
    } finally { setSaving(false); }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setPasswordFields({});
    try {
      await changePassword(password.current_password, password.new_password);
      setPassword(blankPassword); setPasswordOpen(false);
    } catch (response) {
      setPasswordFields((response as ApiFailure).fields ?? {});
    } finally { setSaving(false); }
  }

  if (error && !user) return <div className="alert alert-danger" role="alert">{error}</div>;
  if (!user || !draft) return <div className="alert alert-secondary">Loading profile…</div>;
  return <><header className="d-flex justify-content-between align-items-start gap-3 mb-4"><div><h1 className="h2 mb-1">Hồ sơ cá nhân</h1><p className="text-secondary mb-0">{user.email}</p></div><button className="btn btn-outline-primary" type="button" onClick={() => { setPasswordFields({}); setPasswordOpen(true); }}>Change password</button></header>
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    <form className="card border-0 shadow-sm" onSubmit={save}><div className="card-body account-form-grid">
      <label className="form-label">Full name<input className={`form-control${fieldError(fields, "full_name") ? " is-invalid" : ""}`} name="full_name" value={draft.full_name} onChange={(event) => setDraft({ ...draft, full_name: event.target.value })} minLength={2} maxLength={100} required />{fieldError(fields, "full_name") && <span className="invalid-feedback d-block">{fieldError(fields, "full_name")}</span>}</label>
      <label className="form-label">Phone<input className={`form-control${fieldError(fields, "phone") ? " is-invalid" : ""}`} name="phone" type="tel" value={draft.phone ?? ""} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} pattern="\\+?[0-9]{9,15}" />{fieldError(fields, "phone") && <span className="invalid-feedback d-block">{fieldError(fields, "phone")}</span>}</label>
      <label className="form-label">Date of birth<input className={`form-control${fieldError(fields, "date_of_birth") ? " is-invalid" : ""}`} name="date_of_birth" type="date" value={draft.date_of_birth} onChange={(event) => setDraft({ ...draft, date_of_birth: event.target.value })} max={new Date(Date.now() - 86400000).toISOString().slice(0, 10)} />{fieldError(fields, "date_of_birth") && <span className="invalid-feedback d-block">{fieldError(fields, "date_of_birth")}</span>}</label>
      <label className="form-label">Gender<select className={`form-select${fieldError(fields, "gender") ? " is-invalid" : ""}`} name="gender" value={draft.gender ?? ""} onChange={(event) => setDraft({ ...draft, gender: event.target.value as User["gender"] })}><option value="">Not specified</option><option value="NAM">Male</option><option value="NU">Female</option><option value="KHAC">Other</option></select>{fieldError(fields, "gender") && <span className="invalid-feedback d-block">{fieldError(fields, "gender")}</span>}</label>
      <label className="form-label account-address">Address<textarea className={`form-control${fieldError(fields, "address") ? " is-invalid" : ""}`} name="address" value={draft.address ?? ""} onChange={(event) => setDraft({ ...draft, address: event.target.value })} maxLength={255} rows={2} />{fieldError(fields, "address") && <span className="invalid-feedback d-block">{fieldError(fields, "address")}</span>}</label>
    </div><div className="card-body pt-0"><button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button></div></form>
    <AppDialog open={passwordOpen} title="Change password" pending={saving} onClose={() => setPasswordOpen(false)}><form onSubmit={savePassword}><label className="form-label w-100">Current password<input className={`form-control${fieldError(passwordFields, "current_password") ? " is-invalid" : ""}`} name="current_password" type="password" autoComplete="current-password" value={password.current_password} onChange={(event) => setPassword({ ...password, current_password: event.target.value })} required />{fieldError(passwordFields, "current_password") && <span className="invalid-feedback d-block">{fieldError(passwordFields, "current_password")}</span>}</label><label className="form-label w-100">New password<input className={`form-control${fieldError(passwordFields, "new_password") ? " is-invalid" : ""}`} name="new_password" type="password" autoComplete="new-password" value={password.new_password} onChange={(event) => setPassword({ ...password, new_password: event.target.value })} minLength={8} maxLength={128} required />{fieldError(passwordFields, "new_password") && <span className="invalid-feedback d-block">{fieldError(passwordFields, "new_password")}</span>}</label><button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Change password"}</button></form></AppDialog>
  </>;
}
