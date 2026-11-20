# Release

The GitHub repository for this package is `DRMAPLEE/sea-of-fox-rts-mcp`. Ensure that the game client and server support the protocol before making the npm release available to players.

1. Run CI, the real game integration test, and a clean install of the `npm pack` tarball. Update the changelog and package version together.
2. For the initial publication, sign into the intended npm maintainer account, verify the package name, and publish the tested tarball or use [npm staged publishing](https://docs.npmjs.com/staged-publishing/) and approve it. Create the matching GitHub release for this initial version.
3. Configure [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) for the public package. Select GitHub Actions, `DRMAPLEE`, `sea-of-fox-rts-mcp`, `publish.yml`, and allow `npm publish`. Push a matching version tag for subsequent releases. The workflow tests and packs the checkout, publishes the tarball with OIDC, and attaches it to the GitHub release.
4. Add the public repository on [DeepWiki](https://deepwiki.com/) and set the GitHub homepage to `https://deepwiki.com/DRMAPLEE/sea-of-fox-rts-mcp`. Verify that the indexed entry shows the setup, tools, and play guide.

Keep pairing tokens in private environment configuration. The publication tarball includes the CLI, runtime source, license, changelog and docs.
