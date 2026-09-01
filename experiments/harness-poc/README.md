# DeepSeek Harness isolated POC

This directory is a G6a-approved experiment and is not a Workbench production dependency.

Safety boundary:

- exact package versions and a separate lockfile;
- lifecycle scripts disabled for the first install;
- total local cache plus isolated installation must remain below 1 GiB;
- synthetic fixtures and an explicit experiment-local home/workspace only;
- no API key, paid model request, Workbench database, Vault, real project, LAN listener, or public listener;
- Harness remains `poc_not_connected` until the full G6a acceptance report gives a Go decision.

The committed scripts and reports must not contain raw model output, credentials, private paths, or real user data.
