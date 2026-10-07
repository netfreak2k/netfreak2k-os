# Netfreak2k Source License Decision

Status: **DECIDED — AGPL-3.0-only for Netfreak2k-owned source code**

This document is an engineering decision aid, not legal advice. The actual license only changes when an explicit `LICENSE` file is committed.

## Option A — Apache License 2.0

Best fit when the goal is broad adoption, commercial use and easy integration.

Characteristics:

- permissive redistribution and modification
- commercial use allowed
- explicit patent grant
- modified forks do not have to publish their source code
- requires preservation of license/notices

Choose this when adoption and low friction matter more than requiring improvements to remain open.

## Option B — GNU GPL v3

Best fit when redistributed modified versions should remain open source.

Characteristics:

- strong copyleft for distributed derivative works
- source availability obligations apply when covered binaries are distributed
- includes patent and anti-tivoization provisions
- does not generally require source publication merely because someone runs a modified version as a network service

Choose this when reciprocal source sharing for distributed forks is important.

## Option C — GNU AGPL v3

Strongest reciprocal option for a browser-managed/server product.

Characteristics:

- GPL-style strong copyleft
- additionally addresses modified software offered to users over a network
- modified hosted deployments can trigger source-offer obligations to network users
- can discourage some commercial/proprietary integrations

Choose this when publicly hosted modified Netfreak2k services should also remain open.

## Option D — Proprietary / source-available terms

Appropriate only when redistribution and commercial rights are intentionally controlled.

This requires custom terms and should receive professional legal review before a public release. Do not improvise a custom license by combining clauses from existing licenses.

## Practical recommendation framework

For Netfreak2k:

- **Apache-2.0** → easiest community/commercial adoption.
- **GPL-3.0** → forks that are distributed should stay open.
- **AGPL-3.0** → strongest fit if hosted/server-side modifications should also be shared.

Third-party applications and runtime dependencies keep their own upstream licenses regardless of the Netfreak2k project license.

## Release action

After the project owner explicitly chooses a license:

1. add the canonical license text as `LICENSE`;
2. update README and THIRD_PARTY_NOTICES;
3. record the choice in this document;
4. rerun the full Validate workflow;
5. only then clear the license gate for `1.0.0`.


## Final decision

For Netfreak2k Server-OS 1.0.0, the project owner selected **GNU Affero General Public License v3.0 only (AGPL-3.0-only)**.

The canonical license text is stored in the repository root as `LICENSE`. Third-party software remains under its respective upstream license.
