# NEXSAI Manager — Social Media MCP Server

Production-ready Model Context Protocol (MCP) server built with **Next.js 16.4.3**, **TypeScript**, **`mcp-handler`**, and **Zod** for managing the **@nexsaicommunity** Instagram account via Claude.

## Architecture

```text
app/
└── api/
    └── mcp/
        └── route.ts          # Clean MCP HTTP handler (GET / POST / DELETE) + optional MCP_API_KEY auth

lib/
├── instagram.ts              # Barrel export for backwards compatibility
├── instagram/
│   ├── client.ts             # Graph API v24.0 client, timing, token redaction & error classification
│   ├── profile.ts            # Instagram profile retrieval
│   ├── media.ts              # Media listing & media details retrieval
│   ├── publishing.ts         # 2-step container + publish flow with confirm=true safety & duplicate guard
│   ├── comments.ts           # Comment listing, replies, hiding, and deletion with confirm=true safety
│   ├── insights.ts           # Media & account insights (v24.0 metrics) + content performance analyzer
│   └── types.ts              # TypeScript interfaces
│
├── mcp/
│   ├── tools.ts              # MCP tool registrations & descriptions
│   └── validation.ts         # Zod input validation schemas
│
└── utils/
    ├── errors.ts             # Safe error categorization (never exposes tokens or stack traces)
    ├── logger.ts             # Structured server-side logger with automatic secret redaction
    ├── media-storage.ts      # MediaStorageProvider abstraction & HTTPS URL validation
    └── rate-limit.ts         # In-memory duplicate publish & rate-limit protection

scripts/
├── test-mcp.mts              # Automated MCP verification & safety test suite
├── ts-loader.mjs             # Node ESM path resolver for test execution
└── ts-register.mjs           # Node loader registration helper
```

## Environment Variables

Copy `.env.example` to `.env.local` for local development:

```env
INSTAGRAM_ACCESS_TOKEN=your_instagram_access_token
# Optional (recommended for Vercel production):
# MCP_API_KEY=your_random_secret_key
```

## Running & Testing Locally

```bash
# Run automated MCP verification suite (protocol, live read tools, preview safety, error cases)
npm run test:mcp

# Start development server
npm run dev

# Production build check
npm run build
```
