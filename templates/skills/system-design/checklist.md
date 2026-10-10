# system-design checklist

Reviewer-facing. Pull this into a PR description before the change ships.

- [ ] `codeloop check artifact {id} --kind system-design` passes
- [ ] Every actor/external system in `scope:` appears in the context table
- [ ] Every software-layer box in the layers diagram names a technology, not just the layer
- [ ] Every environment in `environments:` has a deployment-topology row
- [ ] The network view names ingress, the auth boundary, and every internal call's port
- [ ] The data-stores `erDiagram` matches the real entities, not a placeholder
- [ ] Every non-obvious tech choice has a row: choice, alternative considered, why, cost
- [ ] Every risk this design accepts is named, with its mitigation if any
- [ ] No colour literal outside the token blocks; both light and dark blocks present
- [ ] No tech choice duplicates something the repo's architecture doc already names as current
