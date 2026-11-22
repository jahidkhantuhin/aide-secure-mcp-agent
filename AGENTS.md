# Verification

- Keep the Husky pre-push hook and GitHub Actions on the shared `pnpm check` command.
- Every new test must run through its workspace package's `test` script. When adding a package, test runner, or test service, update the script or shared check in the same change and verify the new suite runs in both gates.
