import { useState, useCallback } from 'react';
import type { LoadingState } from '@/types';

interface AsyncState<T> {
    data: T | null;
    error: string | null;
    status: LoadingState;
}

interface UseAsyncReturn<T> extends AsyncState<T> {
    execute: (...args: any[]) => Promise<void>;
    reset: () => void;
    isLoading: boolean;
    isSuccess: boolean;
    isError: boolean;
}

const initialState = <T>(): AsyncState<T> => ({ data: null, error: null, status: 'idle' });

/**
 * Wraps an async function with loading / success / error state.
 * Removes the boilerplate of try/catch + loading flags from every component.
 *
 * @example
 * const { execute, data, isLoading, error } = useAsync(getStudents);
 * useEffect(() => { execute(); }, []);
 */
export function useAsync<T>(fn: (...args: any[]) => Promise<{ data: T | null; error: string | null }>): UseAsyncReturn<T> {
    const [state, setState] = useState<AsyncState<T>>(initialState<T>());

    const execute = useCallback(async (...args: any[]) => {
        setState({ data: null, error: null, status: 'loading' });
        try {
            const result = await fn(...args);
            if (result.error) {
                setState({ data: null, error: result.error, status: 'error' });
            } else {
                setState({ data: result.data, error: null, status: 'success' });
            }
        } catch (err: any) {
            setState({ data: null, error: err?.message ?? 'Unknown error', status: 'error' });
        }
    }, [fn]);

    const reset = useCallback(() => setState(initialState<T>()), []);

    return {
        ...state,
        execute,
        reset,
        isLoading: state.status === 'loading',
        isSuccess: state.status === 'success',
        isError: state.status === 'error',
    };
}
