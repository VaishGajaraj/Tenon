import { draftAllPending } from "../src/ai/runner";

async function main() {
  const { ok, failed } = await draftAllPending();
  if (ok === 0 && failed === 0) console.log("no draftable items");
  else
    console.log(
      `drafted ${ok} item(s)${failed ? `, ${failed} failed (see last_error)` : ""} — review at http://localhost:3000/work`,
    );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
