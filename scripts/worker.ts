import { draftAllPending } from "../src/ai/runner";

async function main() {
  const n = await draftAllPending();
  console.log(n === 0 ? "no intake items" : `drafted ${n} item(s) — now in review at http://localhost:3000/work`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
