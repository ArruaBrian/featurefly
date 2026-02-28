// ═══════════════════════════════════════════════════════════════════════════════
// CORE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Supported flag value types for multi-variant flags
 */
export type FlagValue = boolean | string | number | Record<string, unknown>;

/**
 * Feature flag definition
 */
export interface FeatureFlag {
  id: string;
  slug: string;
  name: string;
  description?: string;
  category: 'frontend' | 'backend' | 'both';
  defaultValue: FlagValue;
  valueType: FlagValueType;
  targetServices?: string[];
  tags?: string[];
  version: number;
  createdAt: string;
  updatedAt: string;

  // Targeting & experiments
  targetingRules?: TargetingRule[];
  rollout?: RolloutConfig;
  experiment?: Experiment;
}

/**
 * Allowed value types for a flag
 */
export type FlagValueType = 'boolean' | 'string' | 'number' | 'json';

/**
 * Workspace-level override for a flag
 */
export interface WorkspaceFeatureFlag {
  id: string;
  workspaceId: string;
  flagId: string;
  value: FlagValue;
  version: number;
  createdAt: string;
  updatedAt: string;
  flag?: FeatureFlag;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TARGETING, ROLLOUT, EXPERIMENTS & EDGE
// ═══════════════════════════════════════════════════════════════════════════════

export type TargetingOperator = 
  | 'equals' | 'not_equals' 
  | 'contains' | 'not_contains' 
  | 'starts_with' | 'ends_with' 
  | 'in' | 'not_in'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'regex' 
  | 'semver_gt' | 'semver_lt' | 'semver_eq';

export interface TargetingCondition {
  attribute: string;
  operator: TargetingOperator;
  value: string | number | boolean | string[];
}

export interface TargetingRule {
  id: string;
  priority: number; // Lower priority number evaluated first
  conditions: TargetingCondition[];
  value: FlagValue;
  rolloutPercentage?: number; // Optional rollout just for this matching segment
}

export interface RolloutConfig {
  percentage: number;      // 0 to 100
  stickinessKey?: string;  // e.g. 'userId', 'workspaceId', defaults to 'userId'
  salt?: string;           // Optional salt for the hash
  buckets?: number;        // Default 100, can be 1000 for 0.1% precision
}

export interface Variation {
  id: string;
  value: FlagValue;
  weight: number; // 0 to 100 (sum of all variation weights must equal 100)
}

export interface Experiment {
  id: string;
  name?: string;
  variations: Variation[];
  stickinessKey?: string;
  salt?: string;
}

export interface ExperimentAssignment {
  experimentId: string;
  variationId: string;
  value: FlagValue;
  context: EvaluationContext;
}

export type TrackingCallback = (assignment: ExperimentAssignment) => void;

export interface StreamingConfig {
  url?: string; // If omitted, builds from baseUrl + /feature-flags/stream
  reconnectDelayMs?: number; // Base delay for exponential backoff, default 1000
  maxReconnectDelayMs?: number; // Default 30000
}

export interface FlagDocument {
  flags: FeatureFlag[];
  version: number;
  fetchedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRUD DATA
// ═══════════════════════════════════════════════════════════════════════════════

export interface CreateFlagData {
  slug: string;
  name: string;
  description?: string;
  category: 'frontend' | 'backend' | 'both';
  valueType?: FlagValueType;
  defaultValue?: FlagValue;
  targetServices?: string[];
  tags?: string[];
}

export interface UpdateFlagData {
  name?: string;
  description?: string;
  category?: 'frontend' | 'backend' | 'both';
  defaultValue?: FlagValue;
  targetServices?: string[];
  tags?: string[];
}

export interface SetWorkspaceFlagData {
  value: FlagValue;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVALUATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Context passed during flag evaluation for targeting/segmentation
 */
export interface EvaluationContext {
  workspaceId?: string;
  userId?: string;
  attributes?: Record<string, string | number | boolean>;
}

export interface FeatureFlagEvaluation {
  slug: string;
  value: FlagValue;
  reason: EvaluationReason;
  context?: EvaluationContext;
  evaluatedAt: string;
}

export type EvaluationReason =
  | 'DEFAULT'
  | 'WORKSPACE_OVERRIDE'
  | 'TARGETING_MATCH'
  | 'PERCENTAGE_ROLLOUT'
  | 'EXPERIMENT_ASSIGNMENT'
  | 'FALLBACK'
  | 'ERROR'
  | 'LOCAL_OVERRIDE'
  | 'CACHE_HIT';

export interface BatchEvaluation {
  flags: Record<string, FlagValue>;
  context?: EvaluationContext;
  evaluatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════════════════════════

export interface FeatureFlagStats {
  total: number;
  byCategory: Record<string, number>;
  byTargetService: Record<string, number>;
  byValueType: Record<string, number>;
  activeWorkspaces: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

/**
 * Injectable logger interface. Users can provide their own logger (e.g. pino, winston).
 * Defaults to console-based logging.
 */
export interface ILogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit (default: 5) */
  failureThreshold: number;
  /** Time in ms to wait before attempting a request after circuit opens (default: 30000) */
  resetTimeoutMs: number;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Max number of retry attempts (default: 3) */
  maxAttempts: number;
  /** Base delay in ms between retries, doubles each attempt (default: 1000) */
  baseDelayMs: number;
  /** Max delay cap in ms (default: 10000) */
  maxDelayMs: number;
}

/**
 * Callback invoked before every HTTP request.
 * Return a headers object to merge into the request.
 * Useful for dynamic auth (JWT, session tokens) that change over time.
 *
 * @example
 * ```ts
 * requestInterceptor: () => ({
 *   Authorization: `Bearer ${getToken()}`,
 *   'x-workspace-id': getWorkspaceId(),
 * })
 * ```
 */
export type RequestInterceptor = () => Record<string, string> | Promise<Record<string, string>>;

/**
 * Main SDK configuration
 */
export interface FeatureFlagsConfig {
  /** Base URL of the feature flags API */
  baseUrl: string;
  /** Optional API key for authentication (sent as `Authorization: Bearer <apiKey>`) */
  apiKey?: string;
  /** HTTP request timeout in ms (default: 10000) */
  timeout?: number;
  /** Enable/disable in-memory cache (default: true) */
  cacheEnabled?: boolean;
  /** Cache TTL in ms (default: 60000) */
  cacheTtlMs?: number;
  /** Retry configuration */
  retry?: Partial<RetryConfig>;
  /** Circuit breaker configuration */
  circuitBreaker?: Partial<CircuitBreakerConfig>;
  /** Log level (default: 'warn') */
  logLevel?: LogLevel;
  /** Custom logger implementation */
  logger?: ILogger;
  /** Local flag overrides — useful for development/testing. These skip HTTP entirely. */
  localOverrides?: Record<string, FlagValue>;
  /** Default values when the server is unreachable and no cache exists */
  fallbackDefaults?: Record<string, FlagValue>;

  /**
   * Custom HTTP headers merged into every request.
   * Useful for static auth tokens, workspace IDs, or custom metadata.
   *
   * @example
   * ```ts
   * headers: { 'x-workspace-id': 'ws-123', 'x-custom': 'value' }
   * ```
   */
  headers?: Record<string, string>;

  /**
   * Dynamic request interceptor invoked before every HTTP request.
   * Returns headers to merge into the request. Supports async for token refresh flows.
   * Takes precedence over static `headers` for overlapping keys.
   *
   * @example
   * ```ts
   * requestInterceptor: () => ({
   *   Authorization: `Bearer ${Cookies.get('accessToken')}`,
   * })
   * ```
   */
  requestInterceptor?: RequestInterceptor;

  /** Send cookies with cross-origin requests (default: false) */
  withCredentials?: boolean;
  
  /** Configure SSE streaming for real-time updates */
  streaming?: boolean | StreamingConfig;
  /** Pass a flag document to enable Edge mode (offline local evaluation) */
  edgeDocument?: FlagDocument;
  /** Pre-evaluated flags to instantly hydrate the client cache (useful for SSR to avoid initial loading states) */
  bootstrapFlags?: Record<string, FlagValue>;
  /** Hook for A/B testing variable assignments */
  trackingCallback?: TrackingCallback;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════════════════════════

export type FeatureFlyEvent =
  | 'flagEvaluated'
  | 'flagChanged'
  | 'cacheHit'
  | 'cacheMiss'
  | 'cacheCleared'
  | 'requestFailed'
  | 'circuitOpen'
  | 'circuitClosed'
  | 'circuitHalfOpen'
  | 'flagsUpdated'
  | 'streamConnected'
  | 'streamDisconnected'
  | 'experimentAssigned';

export interface FlagEvaluatedPayload {
  slug: string;
  value: FlagValue;
  reason: EvaluationReason;
  durationMs: number;
}

export interface FlagChangedPayload {
  slug: string;
  previousValue: FlagValue;
  newValue: FlagValue;
}

export interface RequestFailedPayload {
  endpoint: string;
  error: string;
  attempt: number;
}

export interface CircuitStatePayload {
  state: 'open' | 'closed' | 'half-open';
  failures: number;
}

export type EventPayloadMap = {
  flagEvaluated: FlagEvaluatedPayload;
  flagChanged: FlagChangedPayload;
  cacheHit: { key: string };
  cacheMiss: { key: string };
  cacheCleared: void;
  requestFailed: RequestFailedPayload;
  circuitOpen: CircuitStatePayload;
  circuitClosed: CircuitStatePayload;
  circuitHalfOpen: CircuitStatePayload;
  flagsUpdated: { source: 'stream' | 'fetch'; count: number };
  streamConnected: void;
  streamDisconnected: { error?: Error };
  experimentAssigned: ExperimentAssignment;
};

export type EventHandler<E extends FeatureFlyEvent> = (payload: EventPayloadMap[E]) => void;
