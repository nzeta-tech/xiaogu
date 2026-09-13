import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const child = spawn("npm", ["run", "dev:shared"], {
  cwd: path.join(root, "vendor", "openchatcut"),
  stdio: "inherit",
  env: { ...process.env, VITE_XIAOGU_EMBEDDED: "1" },
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
