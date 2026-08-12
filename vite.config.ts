/// <reference types="vitest/config" />
import type { IncomingMessage } from 'node:http'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { handleReceiptOcrRequest } from './api/receipt-ocr'
import { handleReceiptJobsRequest } from './api/receipt-jobs'
import { handleReceiptWorkerRequest } from './api/receipt-worker'
import { handleHealthRequest } from './api/health'
import { handleHouseholdRequest } from './api/household'
import { handleAccountRequest } from './api/account'
import { handleReceiptAliasesRequest } from './api/receipt-aliases'

async function readRequestBody(request: IncomingMessage): Promise<ArrayBuffer | undefined> {
  const chunks: Uint8Array[] = []
  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : new Uint8Array(chunk))
  }

  if (chunks.length === 0) return undefined
  const combined = Buffer.concat(chunks)
  const body = new Uint8Array(combined.byteLength)
  body.set(combined)
  return body.buffer
}

async function toWebRequest(request: IncomingMessage, apiPath: string): Promise<Request> {
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) headers.set(name, value.join(', '))
    else if (value !== undefined) headers.set(name, value)
  }

  const host = request.headers.host || '127.0.0.1:5173'
  const suffix = request.url && request.url !== '/' ? request.url : ''
  const body = request.method === 'GET' || request.method === 'HEAD'
    ? undefined
    : await readRequestBody(request)
  return new Request(`http://${host}${apiPath}${suffix}`, {
    method: request.method,
    headers,
    body,
  })
}

async function sendWebResponse(
  webResponse: Response,
  response: import('node:http').ServerResponse,
): Promise<void> {
  response.statusCode = webResponse.status
  webResponse.headers.forEach((value, name) => response.setHeader(name, value))
  response.end(Buffer.from(await webResponse.arrayBuffer()))
}

function receiptOcrDevApi(): Plugin {
  return {
    name: 'receipt-ocr-dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/receipt-ocr', async (request, response, next) => {
        try {
          await sendWebResponse(
            await handleReceiptOcrRequest(await toWebRequest(request, '/api/receipt-ocr')),
            response,
          )
        } catch (error) {
          next(error)
        }
      })

      server.middlewares.use('/api/receipt-jobs', async (request, response, next) => {
        try {
          await sendWebResponse(
            await handleReceiptJobsRequest(await toWebRequest(request, '/api/receipt-jobs')),
            response,
          )
        } catch (error) {
          next(error)
        }
      })

      server.middlewares.use('/api/receipt-worker', async (request, response, next) => {
        try {
          await sendWebResponse(
            await handleReceiptWorkerRequest(await toWebRequest(request, '/api/receipt-worker')),
            response,
          )
        } catch (error) {
          next(error)
        }
      })

      server.middlewares.use('/api/health', async (request, response, next) => {
        try {
          await sendWebResponse(
            await handleHealthRequest(await toWebRequest(request, '/api/health')),
            response,
          )
        } catch (error) {
          next(error)
        }
      })

      server.middlewares.use('/api/household', async (request, response, next) => {
        try {
          await sendWebResponse(
            await handleHouseholdRequest(await toWebRequest(request, '/api/household')),
            response,
          )
        } catch (error) {
          next(error)
        }
      })

      server.middlewares.use('/api/account', async (request, response, next) => {
        try {
          await sendWebResponse(
            await handleAccountRequest(await toWebRequest(request, '/api/account')),
            response,
          )
        } catch (error) {
          next(error)
        }
      })

      server.middlewares.use('/api/receipt-aliases', async (request, response, next) => {
        try {
          await sendWebResponse(
            await handleReceiptAliasesRequest(await toWebRequest(request, '/api/receipt-aliases')),
            response,
          )
        } catch (error) {
          next(error)
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const serverEnv = loadEnv(mode, process.cwd(), '')
  if (serverEnv.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT) {
    process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT ||= serverEnv.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT
  }
  if (serverEnv.AZURE_DOCUMENT_INTELLIGENCE_KEY) {
    process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY ||= serverEnv.AZURE_DOCUMENT_INTELLIGENCE_KEY
  }
  const serverOnlyEnvironment = [
    'SUPABASE_URL',
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SECRET_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'RATE_LIMIT_SALT',
    'AZURE_DOCUMENT_INTELLIGENCE_COST_PER_PAGE_USD',
    'AZURE_DOCUMENT_INTELLIGENCE_MODEL_ID',
    'AZURE_CUSTOM_RECEIPT_MODEL_APPROVED',
    'RECEIPT_OCR_PROVIDER',
    'RECEIPT_OCR_FALLBACK_PROVIDER',
    'RECEIPT_OCR_CLOUD_FALLBACK_ENABLED',
    'RECEIPT_OCR_REQUIRE_USER_CONSENT',
    'RECEIPT_OCR_MONTHLY_PAGE_BUDGET',
    'RECEIPT_OCR_MONTHLY_USD_BUDGET',
    'RECEIPT_WORKER_BATCH_SIZE',
    'MISTRAL_API_KEY',
    'MISTRAL_OCR_MODEL',
    'MISTRAL_OCR_COST_PER_PAGE_USD',
    'OPEN_FOOD_FACTS_USER_AGENT',
    'CRON_SECRET',
  ] as const
  for (const name of serverOnlyEnvironment) {
    if (serverEnv[name]) process.env[name] ||= serverEnv[name]
  }

  return {
    plugins: [react(), receiptOcrDevApi()],
    esbuild: mode === 'production'
      ? { drop: ['console', 'debugger'] }
      : undefined,
    server: {
      host: '127.0.0.1',
      strictPort: false,
    },
    build: {
      chunkSizeWarningLimit: 650,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            data: ['dexie', 'dexie-react-hooks'],
            barcode: ['html5-qrcode'],
            ocr: ['tesseract.js'],
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/__tests__/setup.ts'],
      include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        exclude: [
          'node_modules/',
          'src/__tests__/setup.ts',
        ],
      },
    },
  }
})
