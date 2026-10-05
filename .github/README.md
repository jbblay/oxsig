# CI provider

OXSIG uses **AWS CodeBuild** with the root `buildspec.yml`.

GitHub hosts source and pull requests. Do not add GitHub Actions CI workflows. The CodeBuild project reports the `AWS CodeBuild / oxsig-ci` status context back to GitHub.

See `docs/ci-release-security.md`.
