# Release Gate Flow Test

This file exists only to validate the protected `main` pull-request workflow and Release Gate V2.

Expected result:

- Pull request is required before merging into `main`.
- `Verify release candidate` runs automatically.
- The PR can only be merged after the required status check passes.
- The branch must be up to date with `main` before merging.

This change does not modify application behavior.
