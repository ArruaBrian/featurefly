# React Hooks Memory Leaks — Fix Spec

## Context

The `useFeatureFlag` and `useAllFlags` hooks in `packages/featurefly/src/react/index.ts` have memory leak issues:

1. Two separate `useEffect` hooks both depend on the `evaluate` callback
2. The `evaluate` callback is recreated when `contextKey` changes, causing re-subscription loops
3. No protection against `setState` after component unmounts
4. `loading` starts in `true` even when `bootstrapFlags` provides instant cached values

---

## Scenarios

### Scenario 1: Bootstrap Loading State
**Given** a component mounts with `bootstrapFlags: { 'slug': true }`  
**When** `useFeatureFlag('slug', false)` is called  
**Then** `loading` is `false` from the first render (value comes from bootstrap cache)

### Scenario 2: Context Change Race Condition
**Given** the evaluation context changes 5 times in rapid succession  
**When** each context change triggers a new evaluation  
**Then** only the final evaluation result applies (no race conditions)

### Scenario 3: Unmount During Evaluation
**Given** a component unmounts while an async evaluation is pending  
**When** the evaluation completes  
**Then** no `setState` is called after unmount (no memory leak)

---

## Implementation

### Changes to `useFeatureFlag`

1. **Add `useRef` for mounted tracking**  
   - `mountedRef = useRef(true)`  
   - Set to `false` in cleanup function  
   - Check before calling `setState`

2. **Sync cache check before effect**  
   - On mount, synchronously check if value exists in cache (via client)  
   - If cached, initialize state with cached value and `loading: false`  
   - Only set `loading: true` when starting async evaluation

3. **Unify effects into one**  
   - Single `useEffect` that:
     - Runs initial evaluation (only once on mount)
     - Sets up event listeners
     - Returns cleanup that unsubscribes and sets `mountedRef = false`

4. **Use `AbortController` pattern for race conditions**  
   - Create a ref to track current evaluation `requestId`
   - Increment on each evaluation trigger
   - Only process result if `requestId` matches current

### Changes to `useAllFlags`

Apply the same pattern as `useFeatureFlag`.

---

## Files

- `packages/featurefly/src/react/index.ts` — Refactored hooks
- `packages/featurefly/src/react/__tests__/hooks.spec.ts` — New test file

---

## Acceptance Criteria

- [ ] `useFeatureFlag` with `bootstrapFlags` returns `loading: false` on first render
- [ ] Rapid context changes don't cause race conditions
- [ ] Unmounting during evaluation doesn't call `setState`
- [ ] `useAllFlags` follows the same pattern
- [ ] All existing tests pass
- [ ] New tests cover the three scenarios
