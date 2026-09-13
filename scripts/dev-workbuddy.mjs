import { spawn } from "node:child_process";

const children = [
  spawn("npm", ["run", "dev"], { stdio: "inherit", env: process.env }),
  spawn("npm", ["run", "openchatcut:dev"], { stdio: "inherit", env: process.env }),
];

let closing = false;
function shutdown(signal = "SIGTERM") {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill(signal);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(signal));
}

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (!closing) {
      shutdown();
      process.exitCode = code ?? (signal ? 1 : 0);
    }
  });
}
