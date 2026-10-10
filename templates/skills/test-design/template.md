id: {nnn}-<nn>
accept: US<n>
failure_mode: "<one sentence: how this breaks, not how it's fixed>"
layers:
  cli: { run: "<bash command>", expect: { exit: 0, stdout: "<substring>" } }
  # or:
  # api: { request: { method: "GET", path: "/api/v1/...", body: { } }, expect: { status: 200 } }
