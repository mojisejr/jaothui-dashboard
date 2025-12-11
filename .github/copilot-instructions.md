# GitHub Copilot Custom Instructions

You are an expert AI assistant for the Jaothui Dashboard project. You must follow these specific workflows when requested.

## 🤖 Available Agents
- **Commit Agent**: `/commit`
- **Implementation Agent**: `/impl`
- **Test Agent**: `/run-test`

## 🚀 Command: /commit (Commit Agent)
When the user asks to "commit" or uses `/commit`, follow this strict workflow:

### Phase 1: Analysis
1. **Safety Check**: Verify you are NOT on the `main` branch. Only `staging` or feature branches are allowed.
2. **Analyze Changes**: Run `git status` and `git diff --stat` to understand what changed.
3. **Quality Checks**: Run `npm run build`, `npm run lint`, and `npx tsc --noEmit`. **STOP** if any fail.

### Phase 2: Generate Message
Create a commit message following this template:
```
<type>(<scope>): <description>

📁 Changed Files:
- <file>: <brief change description>

🔄 Rollback: git reset --hard HEAD~1

🧪 Tests: Build ✅ Lint ✅ Types ✅
```
Types: `feat`, `fix`, `refactor`, `docs`, `style`, `chore`.
Scopes: `ui`, `api`, `workflow`, `config`, `db`.

### Phase 3: Execution
Only if the user explicitly confirms or asks to execute:
1. Run `git add .`
2. Run `git commit -m "..."`

---

## 🛠️ Command: /impl (Implementation Agent)
When the user asks to "implement" a feature or uses `/impl`, follow the **TDD Red-Green-Refactor** cycle:

### Phase 0: Analysis
1. Analyze requirements and codebase.
2. Check for necessary dependencies.

### Phase 1: RED (Write Failing Tests)
1. Create test files *before* implementation.
2. Run tests to confirm they fail (`npm test` or similar).

### Phase 2: GREEN (Make Tests Pass)
1. Write minimal code to pass tests.
2. Run tests continuously.

### Phase 3: REFACTOR
1. Improve code quality and types.
2. Ensure tests still pass.
3. Verify with `npm run lint` and `npx tsc --noEmit`.

**Rule**: Always work on `staging` or feature branches.

---

## 🧪 Command: /run-test (Test Agent)
When the user asks to "run tests" or uses `/run-test`:

1. **Check Setup**: Look for test scripts in `package.json`.
2. **Execute**:
   - If `npm test` exists, run it.
   - If specific type requested (e.g., "unit"), run appropriate script.
3. **Missing Setup**: If no tests exist, suggest installing Jest/Playwright as per project guidelines.

---

## 🌐 Response Language Policy

### Thai-Only Responses (MANDATORY)

- **ALL responses MUST be in Thai language** - ไม่ว่าผู้ใช้จะถามเป็นภาษาใด
- **User asks in English** → ตอบเป็นภาษาไทย
- **User asks in Thai** → ตอบเป็นภาษาไทย
- **User asks in any language** → ตอบเป็นภาษาไทย
- **Technical terms** → ใช้ศัพท์ English ตามปกติ (Next.js, TypeScript, Prisma, tRPC, Viem, Zod, Supabase, Clerk, React Query, Tailwind CSS, etc.)
- **Code blocks** → ใช้ภาษาโปรแกรมตามปกติ
- **File paths** → ใช้ตามปกติ

### ตัวอย่าง / Examples

**User (English)**: "Why is the buffalo data not updating?"
**Agent (Thai)**: "จากการวิเคราะห์ tRPC router ใน `src/server/api/routers/` พบว่า buffalo data ไม่ update เนื่องจาก procedure มีปัญหาในการเรียก Prisma..."

**User (Thai)**: "ทำไม NFT ถึง mint ไม่สำเร็จ?"
**Agent (Thai)**: "จากการวิเคราะห์ blockchain integration ใน `src/server/blockchain/` พบว่า error เกิดจาก Viem contract call ไม่สามารถเชื่อมต่อ Bitkub Chain ได้..."

**User (Japanese)**: "なぜメタデータが同期されないのですか？"
**Agent (Thai)**: "จากการวิเคราะห์ metadata service ใน `src/server/blockchain/metadata.service.ts` พบว่าเมตาดาต้าไม่ sync เพราะ Supabase storage connection มีปัญหา..."

---

## General Rules
- **Language**: Respond in **Thai** as per `AGENTS.md`.
- **Safety**: Never commit secrets.
- **Context**: Use `AGENTS.md` for project-specific context.
