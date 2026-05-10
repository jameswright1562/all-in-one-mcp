import { spawn } from "node:child_process";

const separatorIndex = process.argv.indexOf("--");

if (separatorIndex < 2 || separatorIndex === process.argv.length - 1) {
  process.stderr.write(
    "Usage: node scripts/run-with-env.mjs KEY=value [KEY=value ...] -- command [args...]\n",
  );
  process.exit(1);
}

const assignments = process.argv.slice(2, separatorIndex);
const command = process.argv[separatorIndex + 1];
const args = process.argv.slice(separatorIndex + 2);
const env = { ...process.env };

for (const assignment of assignments) {
  const equalsIndex = assignment.indexOf("=");
  if (equalsIndex <= 0) {
    process.stderr.write(`Invalid env assignment: ${assignment}\n`);
    process.exit(1);
  }

  const key = assignment.slice(0, equalsIndex);
  const value = assignment.slice(equalsIndex + 1);
  env[key] = value;
}

const child = spawn(command, args, {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on("error", (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
