import { after as nextAfter } from 'next/server';
import { registerBackgroundWork } from './background-work';

/** Register before responding, including nested callbacks and registration failures. */
export function after(task: () => void | Promise<unknown>): void {
  const release = registerBackgroundWork();
  try {
    nextAfter(async () => {
      try { await task(); }
      finally { release(); }
    });
  } catch (error) {
    release();
    throw error;
  }
}
