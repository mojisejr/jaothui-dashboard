## Project Overview

**Project Name**: Jaothui Dashboard

**Description**: The Jaothui Dashboard is an admin-facing backend system for managing buffalo data. Its primary function is to link a central database with the **Bitkub Chain blockchain** to create and manage NFTs that represent each buffalo. This includes creating new buffalo entries, updating existing data, and managing related information like certificates and rewards.

**Project Goals**:

- Create a secure and reliable platform for managing buffalo data.
- Facilitate the creation and management of buffalo NFTs on the Bitkub Chain.
- Provide a user-friendly interface for administrators to perform key tasks.
- Ensure data integrity and type-safety throughout the system.

---

## Architecture Overview

### Core Structure

- **Framework**: T3 Stack (with a focus on simplicity and type-safety)
- **Frontend/Framework**: Next.js
- **API Layer**: tRPC (for a type-safe API)
- **Database**: PostgreSQL with Prisma ORM
- **File Storage**: Supabase Storage
- **Styling**: Tailwind CSS and DaisyUI
- **Authentication**: `clerk/nextjs` with `auth.context.tsx`
- **Data Validation**: Zod

### Tech Stack

- **Frontend**: Next.js, tRPC, Tailwind CSS, DaisyUI **Page Router Approach**
- **Backend**: Node.js, Prisma, tRPC
- **Blockchain Integration**: Viem, Smart Contracts for NFT and Metadata Management
- **Database**: PostgreSQL (via Prisma) **Using Supabase Database via DATABASE_URL**
- **File Storage**: Supabase Storage
- **Authentication**: `clerk/nextjs`

### Backend

- **`auth` router** (`r-auth.ts`): User authentication and authorization
- **`buffalo` router** (`r-buffalo.ts`): Core buffalo data management
- **`certificate` router** (`r-certificate.ts`): Certificate issuance and management
- **`dna` router** (`r-dna.ts`): DNA data management
- **`image` router** (`r-image.ts`): Image upload and management
- **`kwaithai` router** (`r-kwaithai.ts`): Kwaithai member services
- **`metadata` router** (`r-metadata.ts`): NFT metadata generation and management
- **`pedigree` router** (`r-pedigree.ts`): Buffalo pedigree data management
- **`reward` router** (`r-reward.ts`): Reward and achievement management

### Frontend

- **User Journey Flows**:
  - **Login Flow**: An administrator logs in, credentials are sent to the `r-auth.ts` router for verification, and if they have `ADMIN` rights, they are granted access to the dashboard.
  - **Add New Buffalo & Mint NFT Flow**: The admin fills in buffalo data and uploads an image. The system generates a metadata JSON, and upon confirmation, the NFT is minted on the Bitkub Chain and the data is saved to the database.
  - **Update Buffalo Info Flow**: The admin searches for a buffalo by microchip and selects the data to update. Multiple specialized modals open for editing different aspects (name, color, DNA, height, parents, etc.). The changes are sent to the backend to update both the database and blockchain metadata.
  - **Certificate Management Flow**: Admins can approve certificates, manage certificate approvers, and handle the certificate lifecycle.
  - **Reward Management Flow**: Create and manage rewards for buffaloes, including event information and reward images.
  - **DNA Management Flow**: Update and manage DNA information for buffaloes with specialized interfaces.

---

## ⚠️ CRITICAL SAFETY RULES

### NEVER MERGE PRS YOURSELF

**DO NOT** use any commands to merge Pull Requests, such as `gh pr merge`. Your role is to create a well-documented PR and provide the link to the user.

**ONLY** provide the PR link to the user and **WAIT** for explicit user instruction to merge. The user will review and merge when ready.

### DO NOT DELETE CRITICAL FILES

You are **FORBIDDEN** from deleting or moving critical files and directories in the project. This includes, but is not limited to: `.env`, `.git/`, `node_modules/`, `package.json`, and the main project root files. If a file or directory needs to be removed, you must explicitly ask for user permission and provide a clear explanation.

### HANDLE SENSITIVE DATA WITH CARE

You must **NEVER** include sensitive information such as API keys, passwords, or user data in any commit messages, Pull Request descriptions, or public logs. Always use environment variables for sensitive data. If you detect sensitive data, you must alert the user and **REFUSE** to proceed until the information is properly handled.

### STICK TO THE SCOPE

You are instructed to focus **ONLY** on the task described in the assigned Issue. Do not perform any refactoring, code cleanup, or new feature development unless it is explicitly part of the plan. If you encounter an opportunity to improve the code outside of the current scope, you must create a new task and discuss it with the user first.

---

## 🚀 Development Workflows

### The Two-Issue Pattern

This project uses a Two-Issue Pattern to separate work context from actionable plans, integrating local workflows with GitHub Issues for clarity and traceability.

- **Context Issues (`=fcs`):** Used to record the current state and context of a session on GitHub.

- **Task Issues (`=plan`):** Used to create a detailed and comprehensive plan of action on GitHub. The agent will use information from the latest Context Issue as a reference.

---

### Shortcut Commands

These commands are standard across all projects and streamline our communication.

- **`=fcs > [message]`**: Updates the `current-focus.md` file on the local machine and creates a **GitHub Context Issue** with the specified `[message]` as the title. **WARNING**: This command will only work if there are no open GitHub issues. If there are, the agent will alert you to clear the backlog before you can save a new context. To bypass this check, use the command `=fcs -f > [message]`.

- **`=plan > [question/problem]`**: Creates a **GitHub Task Issue** with a detailed and comprehensive plan of action. The agent will use all the information from the `current-focus.md` file and previous conversations to create this Issue. If an open Task Issue already exists, the agent will **update** that Issue with the latest information instead of creating a new one.

- **`=impl > [message]`**: Instructs the agent to execute the plan contained in the latest **GitHub Task Issue**. If you include a `[message]`, the agent will consider it as an addition to the original plan and process it before beginning the implementation.

- **`=rrr > [message]`**: Creates a daily Retrospective file in the `docs/retrospective/` folder and creates a GitHub Issue containing a summary of the work, an AI Diary, and Honest Feedback, allowing you and the team to review the session accurately.

---

## 📈 Retrospective Workflow

When you use the `=rrr` command, the agent will create a file and an Issue with the following sections and details:

### Session Retrospective

**Session Date**: [Date]
**Start Time**: [Start Time]
**End Time**: [End Time]
**Duration**: \~X minutes
**Primary Focus**: [Main Focus]
**Current Issue**: \#XXX
**Last PR**: \#XXX

### Session Summary

[Overall summary of the work done today]

### Timeline

- HH:MM - Start, review issue \#XXX
- HH:MM - [Event]
- HH:MM - [Event]
- HH:MM - Work completed

### 📝 AI Diary (REQUIRED - DO NOT SKIP)

**⚠️ MANDATORY**: The agent must write this section in the first person.
[Record initial understanding, how the approach changed, confusing or clarifying points, decisions made, and their reasoning.]

### 💭 Honest Feedback (REQUIRED - DO NOT SKIP)

**⚠️ MANDATORY**: The agent must honestly evaluate its performance in this section.
[Assess the session's overall efficiency, tools and their limitations, clarity of communication, and suggestions for improvement.]

### What Went Well

- The successes that occurred

### What Could Improve

- Areas that could be made better

### Blockers & Resolutions

- **Blocker**: Description of the obstacle
  **Resolution**: The solution implemented

### Lessons Learned

- **Pattern**: [Pattern discovered] - [Reason why it's important]
- **Mistake**: [Mistake made] - [How to avoid it]
- **Discovery**: [New finding] - [How to apply it]

---

## Troubleshooting

### Common Issues

### Build Failures

```bash
# Check for type errors or syntax issues
[build-command] 2>&1 | grep -A 5 \"error\"

# Clear cache and reinstall dependencies
rm -rf node_modules .cache dist build
[package-manager] install

```

### Port Conflicts

```bash
# Find the process using a specific port
lsof -i :[port-number]

# Kill the process
kill -9 [PID]

```
