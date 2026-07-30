import { useState, type ComponentProps } from "react";

import { Field } from "./Field";
import { PasswordToggleIcon } from "./PasswordToggleIcon";

export function PasswordField(props: Omit<ComponentProps<typeof Field>, "type" | "adornment">) {
  const [shown, setShown] = useState(false);
  return <Field
    {...props}
    type={shown ? "text" : "password"}
    adornment={<button type="button" className="password-toggle" aria-label={shown ? "Hide password" : "Show password"} onClick={() => setShown(!shown)}><PasswordToggleIcon shown={shown} /></button>}
  />;
}
