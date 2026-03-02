export class AppError extends Error {
    public statusCode: number;
    public isOperational: boolean;
    public errors?: any;

    constructor(message: string, statusCode: number = 500, isOperational: boolean = true, errors?: any) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.errors = errors;
        Error.captureStackTrace(this, this.constructor);
    }
}

export class ValidationError extends AppError {
    constructor(message: string = 'Validation Error', errors?: any) {
        super(message, 400, true, errors);
    }
}

export class AuthenticationError extends AppError {
    constructor(message: string = 'Authentication failed') {
        super(message, 401, true);
    }
}

export class AuthorizationError extends AppError {
    constructor(message: string = 'Not authorized to access this resource') {
        super(message, 403, true);
    }
}

export class NotFoundError extends AppError {
    constructor(message: string = 'Resource not found') {
        super(message, 404, true);
    }
}

export class RateLimitError extends AppError {
    constructor(message: string = 'Too many requests, please try again later') {
        super(message, 429, true);
    }
}

export class ExternalServiceError extends AppError {
    constructor(message: string = 'External service failed') {
        super(message, 502, true);
    }
}
