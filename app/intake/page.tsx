import { redirect } from "next/navigation";
import { allSkus } from "@/core/sku";
import { createWorkItem } from "../actions";

export const dynamic = "force-dynamic";

export default function IntakePage() {
  const def = allSkus()[0]; // v1: single SKU; selector arrives with tenant #2
  async function action(formData: FormData) {
    "use server";
    await createWorkItem(formData);
    redirect("/work");
  }
  return (
    <main>
      <h1>New intake — {def.displayName}</h1>
      <p className="muted">{def.description}</p>
      <form action={action} className="card">
        <input type="hidden" name="tenant" value={def.tenant} />
        <input type="hidden" name="sku" value={def.sku} />
        {def.intakeFields.map((f) => (
          <div key={f.key}>
            <label htmlFor={f.key}>{f.label}</label>
            {f.kind === "text" ? (
              <input id={f.key} name={f.key} type="text" required />
            ) : (
              <textarea id={f.key} name={f.key} />
            )}
          </div>
        ))}
        <div style={{ marginTop: 16 }}>
          <button className="primary" type="submit">
            Create work item
          </button>
        </div>
      </form>
    </main>
  );
}
