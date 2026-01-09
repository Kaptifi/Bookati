interface LogContext {
  [key: string]: any;
}

export const logger = {
  info: (message: string, error?: any, context?: LogContext, metadata?: LogContext) => {
    const logData = {
      level: 'info',
      message,
      timestamp: new Date().toISOString(),
      ...context,
      ...metadata,
    };
    if (error) {
      logData.error = error.message || error;
      logData.stack = error.stack;
    }
    console.log(JSON.stringify(logData));
  },

  error: (message: string, error?: any, context?: LogContext, metadata?: LogContext) => {
    const logData = {
      level: 'error',
      message,
      timestamp: new Date().toISOString(),
      ...context,
      ...metadata,
    };
    if (error) {
      logData.error = error.message || error;
      logData.stack = error.stack;
    }
    console.error(JSON.stringify(logData));
  },

  warn: (message: string, error?: any, context?: LogContext, metadata?: LogContext) => {
    const logData = {
      level: 'warn',
      message,
      timestamp: new Date().toISOString(),
      ...context,
      ...metadata,
    };
    if (error) {
      logData.error = error.message || error;
      logData.stack = error.stack;
    }
    console.warn(JSON.stringify(logData));
  },

  extractContext: (req: any): LogContext => {
    return {
      method: req.method,
      path: req.path,
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.get('user-agent'),
    };
  },
};























