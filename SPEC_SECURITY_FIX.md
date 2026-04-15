# SPEC: SSE Client Security Fix — API Key in Headers

## Context

Security vulnerability in `streaming.ts:44` where API key is passed in URL query parameter:
```typescript
const urlWithAuth = this.apiKey ? `${url}?apiKey=${this.apiKey}` : url;
```

**Problem**: API key appears in:
- Proxy server logs
- Browser history
- Server access logs
- Cached URLs

**Solution**: Use `fetch()` with `ReadableStream` to send API key via `Authorization: Bearer` header when apiKey is present. Fall back to native `EventSource` when no apiKey (for performance).

---

## Happy Path — Given/When/Then

### Scenario 1: Connection WITH apiKey uses fetch-based SSE

**Given** an initialized `FlagStreamClient` with `apiKey="test-key-123"`
**When** `connect()` is called
**Then** the system uses a fetch-based SSE wrapper instead of native EventSource
**And** the API key is sent via `Authorization: Bearer test-key-123` header
**And** NO apiKey appears in the URL

### Scenario 2: Connection WITHOUT apiKey uses native EventSource

**Given** an initialized `FlagStreamClient` with `apiKey=undefined`
**When** `connect()` is called
**Then** the system uses native `EventSource`
**And** connects to the URL without any auth query parameter

### Scenario 3: Successful SSE message triggers flagsUpdated event

**Given** a connected SSE client (with or without apiKey)
**When** a valid SSE message with `data: {"slug":"test-flag","value":true}` is received
**Then** `events.emit('flagsUpdated', { source: 'stream', count: 1 })` is called

---

## Edge Cases

### Edge Case 1: EventSource not available in environment

**Given** `typeof EventSource === 'undefined'`
**When** `connect()` is called with no apiKey
**Then** log warning "EventSource is not available in this environment, streaming disabled."
**And** `isConnected()` returns `false`
**And** no connection attempt is made

### Edge Case 2: apiKey is empty string

**Given** `apiKey=""` (empty string, falsy)
**When** `connect()` is called
**Then** treat as NO apiKey
**And** use native EventSource

### Edge Case 3: 401 Unauthorized Response

**Given** a fetch-based SSE connection
**When** server returns HTTP 401
**Then** log error "Stream authentication failed"
**And** emit `streamDisconnected` event with error
**And** do NOT attempt reconnection (terminal failure)

### Edge Case 4: SSE message with Last-Event-ID for anti-replay

**Given** a fetch-based SSE connection that was previously connected
**When** reconnecting after a temporary disconnect
**Then** send `Last-Event-ID` header if client supports it
**Note**: Native EventSource handles this automatically via `lastEventId` property

### Edge Case 5: Invalid SSE message format

**Given** a connected SSE client
**When** a message with unparseable JSON `data: "not-json"` is received
**Then** log error "Failed to parse SSE message"
**And** do NOT emit `flagsUpdated`
**And** continue listening for valid messages

### Edge Case 6: Connection error during fetch

**Given** a fetch-based SSE connection
**When** fetch throws an error (network failure)
**Then** fall back to scheduleReconnect with exponential backoff
**And** NOT emit streamConnected

### Edge Case 7: Stream disposal while fetch in progress

**Given** a fetch-based SSE connection in progress
**When** `dispose()` is called
**Then** abort the fetch request
**And** clean up all timers
**And** set disposed flag to prevent reconnect

---

## Test Cases

### TC1: With apiKey — apiKey NOT in URL
```typescript
const stream = new FlagStreamClient('http://api.com', 'secret-key', {}, logger, events);
stream.connect();
// Assert: fetch was called with URL containing NO apiKey query param
// Assert: fetch was called with Authorization: Bearer secret-key header
```

### TC2: Without apiKey — uses native EventSource
```typescript
const stream = new FlagStreamClient('http://api.com', undefined, {}, logger, events);
stream.connect();
// Assert: EventSource constructor was called (not fetch)
// Assert: URL does not contain apiKey
```

### TC3: Empty apiKey treated as no apiKey
```typescript
const stream = new FlagStreamClient('http://api.com', '', {}, logger, events);
stream.connect();
// Assert: EventSource is used (not fetch)
```

### TC4: 401 triggers terminal error (no reconnect)
```typescript
// Mock fetch returning 401
stream.connect();
// Advance timers — should NOT reconnect
expect(reconnectAttempts).toBe(0);
```

### TC5: Valid SSE parse triggers flagsUpdated
```typescript
// Mock fetch with ReadableStream yielding valid SSE data
const handler = jest.fn();
events.on('flagsUpdated', handler);
// ... feed SSE data
expect(handler).toHaveBeenCalledWith({ source: 'stream', count: 1 });
```

### TC6: Invalid SSE data logs error, no flagsUpdated
```typescript
// Mock fetch with ReadableStream yielding invalid JSON
expect(logger.error).toHaveBeenCalledWith('Failed to parse SSE message', expect.any(String));
expect(handler).not.toHaveBeenCalled();
```

### TC7: dispose() aborts fetch in progress
```typescript
// Start connection, immediately dispose
stream.connect();
stream.dispose();
// Assert: fetch was aborted
```

---

## Design Decisions

### D1: Fallback Strategy
- **With apiKey**: Use fetch-based SSE wrapper (secure)
- **Without apiKey**: Use native EventSource (better performance, native reconnection)

### D2: SSE Parsing
- Implement minimal SSE parser using TextDecoder for `data:`, `event:`, `id:` fields
- Handle SSE message framing (multi-line data fields)

### D3: Authorization Header Format
- Use `Authorization: Bearer <apiKey>` as specified by standard Bearer token convention

### D4: 401 Handling
- Treat 401 as terminal — do NOT retry infinitely
- Emit `streamDisconnected` with error to allow UI notification

### D5: Backward Compatibility
- Public API of `FlagStreamClient` unchanged
- No changes to `FeatureFlagsClient` public interface
- Existing tests must still pass (or be updated to reflect new behavior)

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/shared/sse-client.ts` | **CREATE** | Fetch-based SSE wrapper with header auth |
| `src/shared/streaming.ts` | MODIFY | Use sse-client when apiKey present |
| `src/shared/types.ts` | MODIFY | Add types for SSE client if needed |
| `src/shared/__tests__/streaming.spec.ts` | MODIFY | Update tests for new behavior |

---

## Verification Criteria

1. `npm test -- --testPathPattern=streaming` passes with 0 failures
2. `tsc --noEmit` passes with 0 errors
3. `eslint src --ext .ts` passes with 0 warnings
4. API key NEVER appears in URL (verified by test assertions)
5. Without apiKey, native EventSource is used (verified by test assertions)
