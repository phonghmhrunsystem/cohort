import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { roleHome, useAuth } from "../../auth/AuthProvider";
import { Card } from "../../components/Card";
import { PasswordField } from "../../components/PasswordField";
import { request } from "../../lib/api";
import { ApiFailure } from "../../lib/errors";
import { Button } from "../../components/Button";

export function ChangePasswordPage() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const forced = user?.must_change_password ?? false;
  const [current, setCurrent] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = {
      ...(current
        ? {}
        : { current_password: ["Current password is required."] }),
      ...(nextPassword ? {} : { new_password: ["New password is required."] }),
      ...(confirm
        ? {}
        : { confirm_new_password: ["Confirm new password is required."] }),
      ...(nextPassword && confirm && nextPassword !== confirm
        ? { confirm_new_password: ["Passwords do not match."] }
        : {}),
    };
    if (Object.keys(next).length) return setErrors(next);
    setErrors({});
    try {
      await request("/auth/change-password", {
        method: "POST",
        token: sessionStorage.getItem("access_token") ?? undefined,
        body: {
          current_password: current,
          new_password: nextPassword,
          confirm_new_password: confirm,
        },
      });
      await refresh();
      navigate(forced ? roleHome() : "/profile", { replace: true });
    } catch (error) {
      if (error instanceof ApiFailure && error.fields) setErrors(error.fields);
    }
  }

  return (
    <section className="page-stack">
      <div className="page-header">
        <h1>Change password</h1>
        {!forced && (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => navigate(-1)}
          >
            Back
          </button>
        )}
      </div>
      <Card>
        {forced && <p>Set a new password to continue.</p>}
        <form noValidate onSubmit={submit}>
          <PasswordField
            id="current-password"
            label="Current password"
            required
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            error={errors.current_password?.[0]}
          />
          <PasswordField
            id="new-password"
            label="New password"
            required
            autoComplete="new-password"
            hint="At least 8 characters."
            value={nextPassword}
            onChange={(event) => setNextPassword(event.target.value)}
            error={errors.new_password?.[0]}
          />
          <PasswordField
            id="confirm-new-password"
            label="Confirm new password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            error={errors.confirm_new_password?.[0]}
          />
          <Button type="submit">Continue</Button>
        </form>
      </Card>
    </section>
  );
}
