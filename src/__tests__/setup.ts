import '@testing-library/jest-dom';
import { vi, beforeEach } from 'vitest';

// Mock IndexedDB for Dexie
import 'fake-indexeddb/auto';

// Mock console methods to reduce noise in tests
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});

// Mock fetch globally
global.fetch = vi.fn();

// Helper to create a mock Response
export function createMockResponse(data: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers(),
    redirected: false,
    statusText: ok ? 'OK' : 'Error',
    type: 'basic',
    url: '',
    clone: () => createMockResponse(data, ok, status),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}
