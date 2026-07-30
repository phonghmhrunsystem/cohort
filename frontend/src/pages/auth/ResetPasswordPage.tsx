import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { Card } from "../../components/Card";
import { PasswordField } from "../../components/PasswordField";
import { request } from "../../lib/api";
import { ApiFailure } from "../../lib/errors";
import { Button } from "../../components/Button";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(!token);
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!token) return;
    void request(`/auth/reset-password/${encodeURIComponent(token)}`)
      .then(() => setReady(true))
      .catch(() => setInvalid(true));
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = {
      ...(newPassword ? {} : { new_password: ["New password is required."] }),
      ...(confirm
        ? {}
        : { confirm_new_password: ["Confirm new password is required."] }),
      ...(newPassword && confirm && newPassword !== confirm
        ? { confirm_new_password: ["Passwords do not match."] }
        : {}),
    };
    if (Object.keys(next).length) return setErrors(next);
    setErrors({});
    try {
      await request("/auth/reset-password", {
        method: "POST",
        body: {
          token,
          new_password: newPassword,
          confirm_new_password: confirm,
        },
      });
      navigate("/login?reset=success", { replace: true });
    } catch (error) {
      if (error instanceof ApiFailure && error.status !== 422) setInvalid(true);
      else if (error instanceof ApiFailure && error.fields)
        setErrors(error.fields);
    }
  }

  if (invalid)
    return (
      <main className="public-page">
        <Card>
          <h1>Reset password</h1>
          <p role="alert" className="alert">
            This reset link is invalid or has expired.
          </p>
          <Link to="/forgot-password">Request a new reset link</Link>
        </Card>
      </main>
    );
  if (!ready)
    return (
      <main className="public-page">
        <Card>
          <h1>Reset password</h1>
          <p>Checking reset link…</p>
        </Card>
      </main>
    );
  return (
    <main className="public-page">
      <Card>
        <h1>Reset password</h1>
        <form noValidate onSubmit={submit}>
          <PasswordField
            id="new-password"
            label="New password"
            required
            autoComplete="new-password"
            hint="At least 8 characters."
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
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
          <Button type="submit">Reset password</Button>
        </form>
      </Card>
    </main>
  );
}
