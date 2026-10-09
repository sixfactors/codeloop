# workflow checklist

Reviewer-facing. Pull this into a PR description before the change ships.

- [ ] `codeloop check artifact {id} --kind workflow` passes
- [ ] Every flow in `flows:` has its own sequence diagram
- [ ] Every actor in `actors:` appears in at least one diagram
- [ ] Every diagram arrow labels the data passed, not just the action name
- [ ] The swimlane table names a failure path per step, stating what the caller sees
- [ ] The entity state diagram covers every state named across the workflow's steps
- [ ] No colour literal outside the token blocks; both light and dark blocks present
- [ ] No actor is listed who never actually takes part in the flow
