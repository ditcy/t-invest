const { spawn } = require("node:child_process");

const env = { ...process.env };
if (!env.NODE_EXTRA_CA_CERTS) {
  env.NODE_EXTRA_CA_CERTS = "./certs/ca.pem";
}

const child = spawn("npm", ["run", "dev"], {
  stdio: "inherit",
  shell: true,
  env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
