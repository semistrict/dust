import { execFileSync } from "child_process";
import { resolve } from "path";

async function globalSetup() {
  const repoRoot = resolve(__dirname, "../../../../");
  const frontHealthz = await fetch("http://localhost:3000/api/healthz/startup")
    .then((res) => res.ok)
    .catch(() => false);
  if (!frontHealthz) {
    throw new Error(
      "Dust front is not reachable at http://localhost:3000/api/healthz/startup. Start the local dev stack before running extension E2E tests."
    );
  }

  const fakeWorkosReady = await fetch(
    "http://localhost:7600/user_management/authorize"
  )
    .then((res) => res.ok)
    .catch(() => false);
  if (!fakeWorkosReady) {
    throw new Error(
      "fake-workos is not reachable at http://localhost:7600/user_management/authorize. Start the local auth service before running extension E2E tests."
    );
  }

  execFileSync("npm", ["--prefix", "extension", "run", "build:chrome:dev"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

export default globalSetup;
