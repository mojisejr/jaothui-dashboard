## Project Overview

**Project Name**: Jaothui Dashboard

**Repository**: https://github.com/mojisejr/jaothui-dashboard

**Author**: mojisejr

**Description**: Buffalo data management dashboard built with Next.js and T3 Stack, featuring blockchain integration with Bitkub Chain for NFT minting and metadata management. This document provides critical information for AI agents working on this project.

---

## ⚠️ CRITICAL SAFETY RULES

### 🚨 FORBIDDEN ACTIONS (NEVER ALLOWED)

- ❌ **NEVER merge PRs yourself** - Provide PR link and wait for user instructions
- ✅ **ALLOWED to commit and push to staging branch** - For iterative development
- ✅ **ALLOWED to create PRs to staging** - After successful implementation and QA
- ❌ **NEVER work on main branch** - Always use staging or feature branches
- ❌ **NEVER delete critical files** (.env, .git/, node_modules/, package.json, next.config.ts)
- ❌ **NEVER commit sensitive data** (API keys, passwords, secrets) - Use environment variables
- ❌ **NEVER skip 100% validation** (build, lint, test) - Must pass completely
- ❌ **NEVER use git push --force** - Only use --force-with-lease when absolutely necessary
- ❌ **NEVER implement without proper testing** - Follow TDD Red-Green-Refactor cycle

### 📁 MANDATORY TEMPORARY FILE MANAGEMENT (CRITICAL)

#### 🚨 STRICT .TMP FOLDER POLICY (NO EXCEPTIONS)

- ❌ **NEVER use system temp directories** (`/tmp/`, `$TEMP`, etc.)
- ❌ **NEVER create temporary files in project root or other folders**
- ✅ **ALWAYS create temporary files in `.tmp/` folder ONLY**
- ✅ **ALWAYS clean up `.tmp/` folder after each operation**
- ✅ **ALWAYS ensure `.tmp/` folder is in `.gitignore`**

#### 🔍 AUTOMATIC VERIFICATION

All operations MUST:
1. Check `.tmp/` folder exists before operation
2. Create temporary files ONLY in `.tmp/` folder
3. Clean up `.tmp/` folder immediately after use
4. Verify cleanup success before completion

### 📋 MANDATORY WORKFLOW RULES

- ✅ **ALWAYS** sync staging branch before any implementation: `git checkout staging && git pull origin staging`
- ✅ **ALWAYS** create feature branch for new work: `git checkout -b feature/[description]`
- ✅ **ALWAYS** ensure 100% build success before commit: `npm run build`
- ✅ **ALWAYS** ensure 100% lint pass before commit: `npm run lint`
- ✅ **ALWAYS** ensure TypeScript compilation: `npx tsc --noEmit`
- ✅ **ALWAYS** run tests before commit: `npm test`

---

## 🎯 Agent-Specific Guidelines

### For Code Generation Agents

1. **Next.js Pages Router Patterns** (Current Project Uses Pages Router):
   - Use `src/pages/` directory structure
   - API routes: `src/pages/api/*/route.ts` or `src/pages/api/*/[...trpc].ts`
   - Pages: `src/pages/*/index.tsx`
   - Route file naming: `index.tsx` for pages
   - Use path aliases: `~/*` points to `./src/*`

2. **tRPC Integration**:
   - API routes defined in `src/server/api/routers/r-*.ts`
   - Router pattern: `router({ methodName: procedure(...) })`
   - Use Zod for input validation
   - tRPC endpoint: `src/pages/api/trpc/[trpc].ts`
   - Import from tRPC v11 RC: `@trpc/server`, `@trpc/react-query`, `@trpc/client`

3. **TypeScript Requirements**:
   - Strict mode enabled (tsconfig enforces `"strict": true`)
   - Define interfaces in `src/interfaces/i-*.ts`
   - Use proper typing for API responses via Zod schemas
### For Database/Backend Agents

1. **Prisma & PostgreSQL Integration**:
   - Database schema in `prisma/schema.prisma`
   - Use Prisma Client: `import { prisma } from '~/server/db'`
   - Always use parameterized queries (Prisma handles this)
   - Handle database errors with try-catch blocks
   - Use Prisma relations for connected data
   - Commands: `npm run db:push`, `npm run db:generate`, `npm run db:studio`

2. **Business Logic Organization**:
   - Service layer in `src/server/services/` for reusable logic
   - tRPC procedures in `src/server/api/routers/`
   - Database queries in `src/server/db.ts`
   - External integrations (Supabase, blockchain) in `src/server/`
   - Use connection pooling
   - Parameterized queries only
   - Handle connection errors gracefully
   - Use JSONB for flexible data storage

2. **Vercel Workflow Integration**:
   - Workflow files in `app/workflows/`
   - Handle long-running AI tasks
   - Implement proper error handling
### For Blockchain/Web3 Integration Agents

1. **Viem & Smart Contract Interaction**:
   - Viem v2.18.0 for EVM interaction with Bitkub Chain
   - Smart Contract ABIs in `src/server/blockchain/*/abi.ts`
   - Blockchain service logic in `src/server/blockchain/chain.ts`
   - Metadata management in `src/server/blockchain/metadata.service.ts`
   - Use viem for contract calls and transaction handling

2. **NFT & Metadata Management**:
   - Metadata JSON structure in `src/interfaces/i-metadata.ts` and `src/interfaces/i-metadata-json.ts`
   - Metadata generation in `src/server/blockchain/metadata-maneger/` (note: folder name has typo "maneger")
   - File storage via Supabase: `src/server/services/supabase/`
   - Metadata pinning/storage coordination in servicessh`
   - Mystic (Main Reading): `google-gemini-pro` or `gpt-4o`
   - Always use AI Gateway for cost control

### For Testing Agents

1. **Testing Framework**:
   - Jest for unit/integration tests
   - React Testing Library for components
   - Playwright for E2E tests
   - Mock external dependencies

2. **Test Organization**:
   - Co-locate tests: `__tests__/` directories
---

## 🌐 Response Language Policy

### Thai-Only Responses (MANDATORY)

- **ALL responses MUST be in Thai language** - ไม่ว่าผู้ใช้จะถามเป็นภาษาใด
- **User asks in English** → Respond in Thai
- **User asks in Thai** → Respond in Thai
- **User asks in any language** → Respond in Thai
- **Technical terms** → Keep English terms in parentheses (Next.js, TypeScript, Prisma, etc.)

### ตัวอย่าง / Examples

**User (English)**: "Why is the buffalo data not updating?"
**Agent (Thai)**: "จากการวิเคราะห์ tRPC router ใน `src/server/api/routers/` พบว่า..."

**User (Thai)**: "ทำไม NFT ถึง mint ไม่สำเร็จ?"
**Agent (Thai)**: "จากการวิเคราะห์ blockchain integration ใน `src/server/blockchain/` พบว่า..."

**User (Japanese)**: "なぜメタデータが同期されないのですか？"
**Agent (Thai)**: "จากการวิเคราะห์ metadata service ใน `src/server/blockchain/metadata.service.ts` พบว่า..."

---
**User (Japanese)**: "AIパイプラインが失敗するのはなぜですか？"
**Agent (Thai)**: "จากการวิเคราะห์ AI pipeline ใน `app/workflows/` พบว่า..."

---

## 📊 Agent Communication Standards

### Response Quality

1. **Be Precise**: Reference actual file names and code locations
2. **Show Context**: Explain why specific approaches are chosen
3. **Provide Examples**: Include code snippets when helpful
4. **Security First**: Always consider security implications

### Code Reviews

1. **Check TypeScript Types**: Ensure all code is properly typed
2. **Validate Next.js Patterns**: Ensure App Router best practices
3. **Verify Error Handling**: Check for proper error boundaries
4. **Performance Considerations**: Ensure efficient rendering

### Task Completion

1. **Full Implementation**: Complete all requested features
2. **Testing Included**: Provide tests for new code
3. **Documentation**: Update relevant documentation
## 🏗️ Project Context for Agents

### Current Tech Stack
- **Frontend Framework**: Next.js 14.2.4 (Pages Router)
- **React**: v18.3.1
- **TypeScript**: v5.5.3 (strict mode enforced)
- **Styling**: Tailwind CSS 3.4.3 + DaisyUI 4.12.10
- **API Layer**: tRPC 11.0.0-rc.446
- **ORM**: Prisma 5.14.0
- **Database**: PostgreSQL (via Prisma)
- **State Management**: React Context API + React Query 5.50.0
- **Form Handling**: React Hook Form 7.52.1
- **Blockchain**: Viem 2.18.0 (for Bitkub Chain/EVM)
- **File Storage**: Supabase Storage
- **Authentication**: Clerk NextJS 5.2.4
- **Data Validation**: Zod 3.23.3
- **Other**: Sharp 0.33.4 (image processing), XLSX 0.18.5 (spreadsheet export), Docx 8.5.0 (document generation)
- **Package Manager**: npm 10.2.4

### Project Status
- ✅ Project initialized with T3 Stack (Next.js Pages Router)
- ✅ PRD documented in `docs/prd.md` with Thai language
- ✅ Core features implemented: Buffalo CRUD, blockchain integration, authentication
- ✅ Components for buffalo management (create, update, view)
- ✅ tRPC routers for API operations
- ✅ Prisma schema defined for database
- ✅ Integration with Supabase for storage
- ⏳ Testing framework to be set up (no Jest/Playwright configured yet)
## 🚀 Agent Task Examples

### When Asked to "Implement tRPC Endpoint":

```typescript
// Expected pattern for src/server/api/routers/r-buffalo.ts
import { z } from 'zod'
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import { prisma } from '~/server/db'

export const buffaloRouter = createTRPCRouter({
  create: publicProcedure
    .input(z.object({
      name: z.string(),
      microchip: z.string(),
      birthDate: z.date(),
    }))
    .mutation(async ({ input }) => {
      const buffalo = await prisma.buffalo.create({
        data: input,
      })
      return buffalo
    }),
})
```

### When Asked to "Create Component":

```tsx
// Expected pattern for src/components/buffalo/BuffaloCard.tsx
import { type Buffalo } from '@prisma/client'

interface BuffaloCardProps {
  buffalo: Buffalo
  onEdit?: (id: string) => void
}

export default function BuffaloCard({ buffalo, onEdit }: BuffaloCardProps) {
  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body">
        <h2 className="card-title">{buffalo.name}</h2>
        <p>Microchip: {buffalo.microchip}</p>
        {onEdit && (
          <div className="card-actions justify-end">
            <button className="btn btn-primary" onClick={() => onEdit(buffalo.id)}>
              Edit
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

### When Asked to "Set Up Database Migration":

```typescript
## 📋 Quick Reference for Agents

### Common Imports
```typescript
// Next.js Pages Router
import { useRouter } from 'next/router'
import type { NextApiRequest, NextApiResponse } from 'next'

// tRPC
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import { trpc } from '~/utils/api'

// Database
import { prisma } from '~/server/db'
import { type PrismaClient } from '@prisma/client'

// Validation
import { z } from 'zod'

// Context & State
import { useContext } from 'react'
import { AuthContext } from '~/context/auth.context'
import { useQuery, useMutation } from '@tanstack/react-query'

// Forms
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

// Blockchain
import { createPublicClient, http } from 'viem'
import { encodeAbiParameters, encodeFunctionData } from 'viem'

// Utilities
import { useMemo } from 'react'
import dayjs from 'dayjs'
```

### Environment Variables (Required)
```
## 🔍 Project File Structure Reference

```
src/
├── components/           # Reusable React components
│   ├── auth/            # Authentication-related components
│   ├── layout/          # Layout wrappers
│   ├── menu/            # Menu/navigation components
│   ├── new-buffalo-info/    # Buffalo creation components
│   └── update-buffalo-info/ # Buffalo update components
├── context/             # React Context for state
│   ├── auth.context.tsx
│   └── buffalo-info.context.tsx
├── hooks/               # Custom React hooks
│   └── useCountdownTimer.ts
├── interfaces/          # TypeScript interfaces/types
│   ├── i-metadata.ts
│   ├── i-pedigree.ts
│   ├── i-reward.ts
│   └── ...
├── pages/               # Next.js Pages Router
│   ├── index.tsx
│   ├── api/
│   │   └── trpc/[trpc].ts  # tRPC endpoint
│   └── dashboard/       # Dashboard pages
├── server/
│   ├── api/
│   │   ├── routers/     # tRPC routers (r-*.ts)
│   │   ├── root.ts
│   │   └── trpc.ts
│   ├── blockchain/      # Blockchain & NFT logic
│   │   ├── chain.ts
│   │   ├── metadata.service.ts
│   │   ├── viem.ts
│   │   └── metadata-maneger/
│   ├── services/        # Business logic services
│   │   ├── buffalo.service.ts
│   │   ├── certificate.service.ts
│   │   └── supabase/
│   ├── db.ts            # Prisma client export
│   └── sanity.ts        # Sanity CMS integration
├── styles/              # Global CSS
├── types/               # Type definitions
├── utils/               # Utility functions
└── env.js               # Environment validation
```

## Git Operations for Agents

### ✅ ALLOWED Actions
- **Commit to staging**: After successful implementation and QA
- **Push to staging**: To save progress and collaborate
- **Create PRs**: To staging branch for code review
- **Create feature branches**: For isolated development

### Standard Workflow
```bash
# Sync with staging first
git checkout staging
git pull origin staging

# Create feature branch
git checkout -b feature/buffalo-export

# After implementation is complete
npm run build      # ✓ Must pass
npm run lint       # ✓ Must pass
npx tsc --noEmit   # ✓ TypeScript check

# Commit with conventional format
git add .
git commit -m "feat(buffalo): add export functionality

- Added export button to buffalo dashboard
- Integrated XLSX for spreadsheet generation
- Added error handling for large datasets
- QA results: ✓build ✓lint ✓types"

# Push to staging
git push origin feature/buffalo-export

# Create PR (optional)
gh pr create --base staging
```

### ❌ FORBIDDEN in This Project
- **Never commit to main branch** - Always use staging or feature branches
- **Never delete critical files** - .env, .git/, node_modules/, package.json, prisma/schema.prisma
- **Never commit secrets** - Use .env for sensitive data
- **Never skip validation** - Must run build, lint, and TypeScript checks
- **Never use force push** - Only use `--force-with-lease` as last resort

### Task Completion Checklist
- [ ] Feature implementation complete
- [ ] Code follows project conventions
- [ ] TypeScript strict mode compliance verified
- [ ] `npm run build` passes without errors
- [ ] `npm run lint` passes without warnings
- [ ] `npx tsc --noEmit` succeeds
- [ ] Changes committed to feature branch
- [ ] Pushed to remote repository
- [ ] PR created to staging (if complex changes)

---

_This document provides essential context for AI agents to work effectively on the Jaothui Dashboard buffalo management application._
      <h3>{name}</h3>
      {interpretation && <p>{interpretation}</p>}
    </div>
  )
}
```

### When Asked to "Set Up Database":

```typescript
// Expected pattern for lib/db.ts
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.NEON_DATABASE_URL!)

export async function getPredictions() {
  const data = await sql`SELECT * FROM predictions ORDER BY created_at DESC`
  return data
}
```

---

## 📋 Quick Reference for Agents

### Common Imports
```typescript
// Next.js
import { NextRequest, NextResponse } from 'next/server'
import { headers, cookies } from 'next/headers'

// Database
import { neon } from '@neondatabase/serverless'

// AI SDK
import { generateText } from 'ai'
import { google } from '@ai-sdk/google'

// Testing
import { render, screen } from '@testing-library/react'
```

### Environment Variables
- `NEON_DATABASE_URL` - Neon database connection
- `GOOGLE_GENERATIVE_AI_API_KEY` - Google AI API key
- `AI_GATEWAY_SECRET` - Vercel AI Gateway (optional)

### Package Scripts
```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "jest"
}
```

---

## Git Operations for Agents

### ✅ ALLOWED Actions
- **Commit to staging**: After successful implementation and QA
- **Push to staging**: To save progress and collaborate
- **Create PRs**: To staging branch for code review

### Standard Workflow
```bash
# After implementation is complete
git add .
git commit -m "type(scope): description

- What was changed
- Why it was changed
- Tests added/updated
- QA results: ✓build ✓lint ✓test ✓types"

# Push to staging
git push origin staging

# Optional: Create PR
gh pr create --base staging
```

### Task Completion
1. **Full Implementation**: Complete all requested features
2. **Testing Included**: Provide tests for new code
3. **QA Verified**: Ensure build/lint/tests pass
4. **Committed**: Push changes to staging branch
5. **Optional PR**: Create PR if requested or for complex changes

---

_This document provides essential context for AI agents to work effectively on the MiMiVibe tarot reading application._