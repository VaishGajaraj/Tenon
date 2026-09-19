"use client";

import { useFormStatus } from "react-dom";

export function PendingSubmit({
  children,
  pendingLabel,
  className,
}: {
  children: string;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className ?? "primary"} type="submit" disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
