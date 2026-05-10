import { execFileSync } from "node:child_process";

const output = execFileSync(
  "git",
  ["status", "--porcelain", "--untracked-files=all"],
  {
    encoding: "utf8",
  },
).trim();

if (output.length > 0) {
  process.stderr.write("Working tree must be clean before publishing.\n");
  process.stderr.write(`${output}\n`);
  process.exit(1);
}
