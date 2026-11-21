# api service layer
One function per contract operation, each taking every domain rule from `@goldsmith/shared` (no rule is reimplemented here).
`mark-lead-lost.ts` (EP-03-S12) is the reference: copy it for every new operation and register the function in `index.ts`. See docs/setup/api.md ("Adding an operation").
The remaining functions in `packages/web/src/store/transitions.ts` move here in the feature epics.
