# NEXSAI Manager 3.0 — AI Social Media Operating System (Instagram + Threads MCP)

Production-ready Model Context Protocol (MCP) server and 8-tab dashboard built with **Next.js 16.4.3**, **TypeScript**, **`mcp-handler`**, and **Zod** for managing the **@nexsaicommunity** Instagram and Threads accounts through Claude and ChatGPT.

---

## 1. V3 Architecture Overview

```text
app/
├── page.tsx                              # 8-Tab Visual Web Dashboard (Instagram + Threads)
└── api/
    ├── mcp/
    │   └── route.ts                      # MCP HTTP handler (43 tools, 8 resources, 8 prompts)
    ├── dashboard/
    │   └── route.ts                      # Live dashboard state aggregator (Instagram + Threads)
    └── webhooks/
        └── threads/
            └── route.ts                  # Optional Meta Threads Webhook verification & HMAC receiver

lib/
├── instagram.ts                          # Instagram barrel export
├── instagram/                            # Official Instagram Graph API v24.0 provider
│   ├── client.ts
│   ├── profile.ts
│   ├── media.ts
│   ├── publishing.ts
│   ├── comments.ts
│   ├── insights.ts
│   └── types.ts
├── threads.ts                            # Threads barrel export
├── threads/                              # Official Meta Threads Graph API v1.0 provider (graph.threads.net)
│   ├── client.ts                         # Token handling, timeout, idempotent GET retry, token refresh
│   ├── profile.ts                        # Profile, 24h publishing quota & capability status matrix
│   ├── media.ts                          # Threads post listing & details (with carousel children)
│   ├── publishing.ts                     # 2-step TEXT, IMAGE, VIDEO, CAROUSEL publishing + confirm=true gate
│   ├── replies.ts                        # Replies, flat conversations, reply visibility, pending replies
│   ├── search.ts                         # Keyword/tag search & mentions with conditional scope handling
│   ├── insights.ts                       # Post & account insights + epistemic analyzer + Threads recommender
│   └── types.ts
├── platforms/
│   └── index.ts                          # Cross-platform provider abstraction & idempotent multi-platform publish
├── analytics/                            # Epistemic analytics engine (OBSERVATION / CALCULATION / INFERENCE / RECOMMENDATION)
├── research/                             # Multi-source AI & tech research engine + competitor intelligence
├── strategy/                             # Opportunity ranker, 7-day planner, approval workflow & A/B experiments
├── database/                             # Dual-adapter persistence (Supabase PostgreSQL + durable JSON store)
├── mcp/
│   ├── tools.ts                          # 43 registered MCP tools
│   ├── resources.ts                      # 8 MCP resources
│   ├── prompts.ts                        # 8 reusable MCP prompts
│   └── validation.ts                     # Strict Zod schemas
└── utils/
    ├── errors.ts                         # Structured Meta API error classification (Instagram + Threads)
    ├── logger.ts                         # Redacted server-side logger (never logs IGAA/THAA tokens)
    ├── media-storage.ts                  # HTTPS media URL validation
    └── rate-limit.ts                     # Duplicate publish & burst protection
```

---

## 2. Official Meta Threads API v1.0 Capabilities Matrix

Source of truth: [Meta Threads API Documentation](https://developers.facebook.com/docs/threads/)

| Capability | Status | Endpoint | Required Permission |
| :--- | :---: | :--- | :--- |
| **Profile & Verification Retrieval** | **Supported** | `GET /v1.0/me` | `threads_basic` |
| **Published Threads Listing & Details** | **Supported** | `GET /v1.0/me/threads`, `GET /v1.0/{media-id}` | `threads_basic` |
| **Publishing (`TEXT`, `IMAGE`, `VIDEO`, `CAROUSEL`, `topic_tag`, `link_attachment`)** | **Supported** | `POST /v1.0/me/threads`, `POST /v1.0/me/threads_publish` | `threads_content_publish` |
| **Publishing Quota Inspection (250 posts/24h, 1,000 replies/24h)** | **Supported** | `GET /v1.0/me/threads_publishing_limit` | `threads_basic`, `threads_content_publish` |
| **Post & Account Insights (`views`, `likes`, `replies`, `reposts`, `quotes`, `shares`, `followers_count`)** | **Supported** | `GET /v1.0/{media-id}/insights`, `GET /v1.0/me/threads_insights` | `threads_manage_insights` |
| **Replies, Conversations & Hide/Unhide Moderation** | **Supported** | `GET /v1.0/{media-id}/replies`, `GET /v1.0/{media-id}/conversation`, `POST /v1.0/{reply-id}/manage_reply` | `threads_read_replies`, `threads_manage_replies` |
| **Pending Replies Queue** | **Conditional** | `GET /v1.0/{media-id}/pending_replies` | `threads_read_replies`, `threads_manage_replies` (requires `enable_reply_approvals=true` on the target post) |
| **Keyword & Topic Tag Search** | **Conditional** | `GET /v1.0/keyword_search` | `threads_keyword_search` (requires scope enabled in Meta App Dashboard) |
| **Mentions Retrieval** | **Conditional** | `GET /v1.0/me/mentions` | `threads_manage_mentions` (requires scope enabled in Meta App Dashboard) |
| **Follower Demographics Breakdown** | **Conditional** | `GET /v1.0/me/threads_insights?metric=follower_demographics` | `threads_manage_insights` (requires >= 100 followers) |
| **Private Direct Messages (DMs)** | **Unavailable** | N/A | Not exposed by official Meta Threads API v1.0 |

---

## 3. Meta App Setup & Authentication Guide

1. Go to [Meta for Developers](https://developers.facebook.com/apps/) and open your app configured with the **Access the Threads API** use case.
2. Under **Use cases → Access the Threads API → Permissions**, add:
   - `threads_basic` (Required)
   - `threads_content_publish` (Required for publishing posts & replies)
   - `threads_manage_insights` (Required for post & account analytics)
   - `threads_read_replies` (Required for reading replies & conversations)
   - `threads_manage_replies` (Required for posting & hiding/unhiding replies)
   - `threads_keyword_search` (Optional — enables global keyword/tag search)
   - `threads_manage_mentions` (Optional — enables mentions feed)
3. Under **Use cases → Access the Threads API → Settings**, generate a long-lived User Access Token for `@nexsaicommunity` (valid for 60 days; refreshable via `GET https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=...`).
4. Add `THREADS_ACCESS_TOKEN` to `.env.local` (for local development) and **Vercel Project Settings → Environment Variables** (for production).

---

## 4. Environment Variables

Copy `.env.example` to `.env.local`:

```env
INSTAGRAM_ACCESS_TOKEN=your_instagram_user_access_token
THREADS_ACCESS_TOKEN=your_threads_user_access_token

# Optional: Webhook verification for /api/webhooks/threads
# THREADS_APP_SECRET=your_threads_app_secret
# THREADS_WEBHOOK_VERIFY_TOKEN=your_webhook_verify_token

# Optional: Bearer/Header protection for /api/mcp
# MCP_API_KEY=your_mcp_api_key

# Optional: Supabase PostgreSQL persistence
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

---

## 5. Verification & Deployment

```bash
# TypeScript strict check
npx tsc --noEmit

# ESLint check
npm run lint

# Full automated MCP verification suite (43 tools, 8 resources, 8 prompts, safety gates)
npm run test:mcp

# Production build check
npm run build
```
