import { ILogger, LogLevel } from './types';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

/**
 * Default console-based logger with level filtering.
 * Users can replace this with any ILogger implementation (pino, winston, etc).
 */
export class ConsoleLogger implements ILogger {
  private readonly level: number;
  private readonly prefix: string;

  constructor(level: LogLevel = 'warn', prefix: string = '[FeatureFly]') {
    this.level = LOG_LEVELS[level];
    this.prefix = prefix;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.level <= LOG_LEVELS.debug) {
      console.debug(`${this.prefix} ${message}`, ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.level <= LOG_LEVELS.info) {
      console.info(`${this.prefix} ${message}`, ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.level <= LOG_LEVELS.warn) {
      console.warn(`${this.prefix} ${message}`, ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.level <= LOG_LEVELS.error) {
      console.error(`${this.prefix} ${message}`, ...args);
    }
  }
}
