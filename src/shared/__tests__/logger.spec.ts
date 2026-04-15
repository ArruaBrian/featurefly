import { ConsoleLogger } from '../logger';

describe('ConsoleLogger', () => {
  let spyDebug: jest.SpyInstance;
  let spyInfo: jest.SpyInstance;
  let spyWarn: jest.SpyInstance;
  let spyError: jest.SpyInstance;

  beforeEach(() => {
    spyDebug = jest.spyOn(console, 'debug').mockImplementation();
    spyInfo = jest.spyOn(console, 'info').mockImplementation();
    spyWarn = jest.spyOn(console, 'warn').mockImplementation();
    spyError = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('prefix configuration', () => {
    it('should use default prefix [FeatureFly]', () => {
      const logger = new ConsoleLogger('debug');
      logger.debug('hello');
      expect(spyDebug).toHaveBeenCalledWith('[FeatureFly] hello');
    });

    it('should use custom prefix when provided', () => {
      const logger = new ConsoleLogger('debug', '[MyApp]');
      logger.debug('test');
      expect(spyDebug).toHaveBeenCalledWith('[MyApp] test');
    });

    it('should apply custom prefix to all log levels', () => {
      const logger = new ConsoleLogger('debug', '[SDK]');

      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');

      expect(spyDebug).toHaveBeenCalledWith('[SDK] d');
      expect(spyInfo).toHaveBeenCalledWith('[SDK] i');
      expect(spyWarn).toHaveBeenCalledWith('[SDK] w');
      expect(spyError).toHaveBeenCalledWith('[SDK] e');
    });

    it('should allow empty string prefix', () => {
      const logger = new ConsoleLogger('warn', '');
      logger.warn('bare');
      expect(spyWarn).toHaveBeenCalledWith(' bare');
    });
  });

  describe('level filtering', () => {
    it('should not log below the configured level', () => {
      const logger = new ConsoleLogger('error');
      logger.debug('nope');
      logger.info('nope');
      logger.warn('nope');
      logger.error('yes');

      expect(spyDebug).not.toHaveBeenCalled();
      expect(spyInfo).not.toHaveBeenCalled();
      expect(spyWarn).not.toHaveBeenCalled();
      expect(spyError).toHaveBeenCalledTimes(1);
    });

    it('silent level should suppress all output', () => {
      const logger = new ConsoleLogger('silent');
      logger.debug('no');
      logger.info('no');
      logger.warn('no');
      logger.error('no');

      expect(spyDebug).not.toHaveBeenCalled();
      expect(spyInfo).not.toHaveBeenCalled();
      expect(spyWarn).not.toHaveBeenCalled();
      expect(spyError).not.toHaveBeenCalled();
    });

    it('debug level should log everything', () => {
      const logger = new ConsoleLogger('debug');
      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      logger.error('e');

      expect(spyDebug).toHaveBeenCalledTimes(1);
      expect(spyInfo).toHaveBeenCalledTimes(1);
      expect(spyWarn).toHaveBeenCalledTimes(1);
      expect(spyError).toHaveBeenCalledTimes(1);
    });
  });

  describe('extra arguments', () => {
    it('should forward additional args to console methods', () => {
      const logger = new ConsoleLogger('debug');
      const extra = { key: 'val' };
      logger.info('msg', extra, 42);
      expect(spyInfo).toHaveBeenCalledWith('[FeatureFly] msg', extra, 42);
    });
  });

  describe('FeatureFlagsConfig integration', () => {
    it('should use logPrefix from config', () => {
      // This is tested at the integration level via FeatureFlagsClient
      // but we verify the constructor signature supports it
      const logger = new ConsoleLogger('warn', '[Acme-Flags]');
      logger.warn('initialized');
      expect(spyWarn).toHaveBeenCalledWith('[Acme-Flags] initialized');
    });
  });
});
