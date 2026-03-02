export interface RetryOptions {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffMultiplier?: number;
}

export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const maxAttempts = options.maxAttempts ?? 3;
    const initialDelay = options.initialDelay ?? 1000;
    const maxDelay = options.maxDelay ?? 4000;
    const backoffMultiplier = options.backoffMultiplier ?? 2;

    let attempt = 1;
    let delay = initialDelay;

    while (true) {
        try {
            return await fn();
        } catch (error) {
            if (attempt >= maxAttempts) {
                throw error;
            }

            console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay));

            attempt++;
            delay = Math.min(delay * backoffMultiplier, maxDelay);
        }
    }
}
