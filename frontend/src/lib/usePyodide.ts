'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

type PyodideStatus = 'loading' | 'ready' | 'error';

interface PyodideInstance {
  runPython: (code: string) => unknown;
  runPythonAsync: (code: string) => Promise<unknown>;
  loadPackage: (names: string | string[]) => Promise<void>;
  loadPackagesFromImports: (code: string) => Promise<void>;
}

// Cache on globalThis to survive Next.js HMR module resets
const g = globalThis as Record<string, unknown>;

function getCache(): {
  instance: PyodideInstance | null;
  promise: Promise<void> | null;
  status: PyodideStatus;
  error: string | null;
} {
  if (!g.__pyodideCache) {
    g.__pyodideCache = { instance: null, promise: null, status: 'loading' as PyodideStatus, error: null };
  }
  return g.__pyodideCache as {
    instance: PyodideInstance | null;
    promise: Promise<void> | null;
    status: PyodideStatus;
    error: string | null;
  };
}

const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

async function initPyodide(): Promise<PyodideInstance> {
  await loadScript('https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js');

  const loadFn = (globalThis as Record<string, unknown>).loadPyodide as
    | ((opts: { indexURL: string }) => Promise<PyodideInstance>)
    | undefined;

  if (!loadFn) {
    throw new Error('loadPyodide not found on globalThis');
  }

  return loadFn({
    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/',
  });
}

function ensurePyodide() {
  const cache = getCache();
  if (cache.promise) return cache.promise;

  cache.promise = initPyodide()
    .then((pyodide) => {
      cache.instance = pyodide;
      cache.status = 'ready';
    })
    .catch((err) => {
      cache.status = 'error';
      cache.error = err instanceof Error ? err.message : String(err);
    })
    .finally(() => {
      notifyListeners();
    });

  return cache.promise;
}

export function usePyodide() {
  const cache = getCache();
  const [status, setStatus] = useState<PyodideStatus>(cache.status);
  const [error, setError] = useState<string | null>(cache.error);
  const mountedRef = useRef(true);

  useEffect(() => {
    const listener = () => {
      if (!mountedRef.current) return;
      const c = getCache();
      setStatus(c.status);
      setError(c.error);
    };
    listeners.add(listener);

    ensurePyodide();

    return () => {
      mountedRef.current = false;
      listeners.delete(listener);
    };
  }, []);

  const runCode = useCallback(
    async (code: string): Promise<{ output: string; error: string | null }> => {
      const c = getCache();
      if (!c.instance) {
        return { output: '', error: 'Pyodide 尚未加载完成' };
      }

      try {
        // Auto-load packages imported in the code
        await c.instance.loadPackagesFromImports(code);

        c.instance.runPython(`
import sys, io
sys.stdout = io.StringIO()
sys.stderr = io.StringIO()
`);

        await c.instance.runPythonAsync(code);

        const stdout = c.instance.runPython('sys.stdout.getvalue()') as string;
        const stderr = c.instance.runPython('sys.stderr.getvalue()') as string;

        return {
          output: stdout || '',
          error: stderr || null,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { output: '', error: msg };
      }
    },
    [],
  );

  return { status, error, runCode };
}
