export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogContext {
    [key: string]: any;
}

class Logger {
    private log(level: LogLevel, message: string, context?: LogContext) {
        const payload = {
            level,
            message,
            timestamp: new Date().toISOString(),
            ...context
        };

        if (level === 'error' || level === 'fatal') {
            console.error(JSON.stringify(payload));
            return;
        }

        if (level === 'warn') {
            console.warn(JSON.stringify(payload));
            return;
        }

        if (level === 'debug' && process.env.NODE_ENV === 'production') {
            return;
        }

        console.log(JSON.stringify(payload));
    }

    debug(message: string, context?: LogContext) {
        this.log('debug', message, context);
    }

    info(message: string, context?: LogContext) {
        this.log('info', message, context);
    }

    warn(message: string, context?: LogContext) {
        this.log('warn', message, context);
    }

    error(message: string, context?: LogContext) {
        this.log('error', message, context);
    }

    fatal(message: string, context?: LogContext) {
        this.log('fatal', message, context);
    }

    logError(error: Error, context?: LogContext) {
        this.error(error.message, {
            ...context,
            stack: error.stack
        });
    }

    logSlowRequest(context: LogContext) {
        this.warn('SLOW_REQUEST', context);
    }
}

export const logger = new Logger();
