# mirrornode-core (scaffold)

This repository was empty; I added a small CI + container scaffold so you have a working baseline for builds, tests, and image publishing.

What I added

- `app/` — minimal Node.js app (index.js + test)
- `Dockerfile` — multi-stage build for a small Node app
- `.dockerignore` — typical ignores
- `docker-compose.yml` — dev compose to run the service locally
- `.github/workflows/build-test.yml` — run tests + build image (CI)
- `.github/workflows/build-and-push.yml` — build and push to a container registry on `main` (configurable)

Registry notes

- Example registry used in workflows is `ghcr.io`. To push to GHCR you will likely need a Personal Access Token with `write:packages` scope set in the repository secrets as `CR_PAT`. In some orgs `GITHUB_TOKEN` with correct permissions may be enough.
- You can change the target registry, image name, and secret names in `.github/workflows/build-and-push.yml`.

How to run locally

1. Build image locally (requires Docker installed):

```bash
cd /Users/morningstar/-mirrornode-core
docker build -t mirrornode-core:local .
```

2. Run via docker-compose:

```bash
docker compose up --build
```

3. Run tests locally (Node.js needed):

```bash
cd app
npm install
npm test
```

Next steps I can take for you

- Change the scaffold to a different language or framework (Go, Java, Python).
- Make the workflows push to Docker Hub or ECR instead of GHCR.
- Add multi-arch builds and caching for faster CI.

If you'd like me to open a PR or keep these changes on a branch, tell me the branch name to create and I will prepare a patch or a PR.
