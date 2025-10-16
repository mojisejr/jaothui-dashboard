## Project Overview

**Project Name**: Jaothui Dashboard

**Repository**: https://github.com/mojisejr/jaothui-dashboard

**Description**: The Jaothui Dashboard is an admin-facing backend system for managing buffalo data. Its primary function is to link a central database with the **Bitkub Chain blockchain** to create and manage NFTs that represent each buffalo. This includes creating new buffalo entries, updating existing data, and managing related information like certificates, rewards, DNA, and pedigree information.

**Project Goals**:

- Create a secure and reliable platform for managing buffalo data
- Facilitate the creation and management of buffalo NFTs on the Bitkub Chain
- Provide a user-friendly interface for administrators to perform key tasks
- Ensure data integrity and type-safety throughout the system
- Streamline buffalo registration, certificate management, and reward systems

---

### Development Guidelines

**⚠️ CRITICAL: Synchronize Time Before Any File Operations**

Before creating a new file or saving any timestamps, you **MUST** use the following command to retrieve the current date and time from the system:

```bash
date +"%Y-%m-%d %H:%M:%S"
```

#### File Naming Conventions

- **Log Files**: `YYYY-MM-DD-[type].log`
- **Backup Files**: `backup-YYYY-MM-DD-HHMM.sql`
- **Migration Files**: Follow Prisma naming conventions

#### Important Notes

- **ALL timestamps** in documentation, logs, and file names must use your local timezone
- **Year format** must be consistent
- **Development sessions** should reference local time

---

## Architecture Overview

### Core Structure

- **Framework**: T3 Stack (Next.js with TypeScript)
- **Frontend/Framework**: Next.js (Page Router)
- **API Layer**: tRPC (for type-safe API)
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
- **Data Validation**: Zod schemas for type safety

### Backend Routers

- **`auth` router** (`r-auth.ts`): User authentication and authorization
- **`buffalo` router** (`r-buffalo.ts`): Core buffalo data management
- **`certificate` router** (`r-certificate.ts`): Certificate issuance and management
- **`dna` router** (`r-dna.ts`): DNA data management
- **`image` router** (`r-image.ts`): Image upload and management
- **`kwaithai` router** (`r-kwaithai.ts`): Kwaithai member services
- **`metadata` router** (`r-metadata.ts`): NFT metadata generation and management
- **`pedigree` router** (`r-pedigree.ts`): Buffalo pedigree data management
- **`reward` router** (`r-reward.ts`): Reward and achievement management

### Frontend User Journeys

- **Login Flow**: An administrator logs in, credentials are sent to the `r-auth.ts` router for verification, and if they have `ADMIN` rights, they are granted access to the dashboard.
- **Add New Buffalo & Mint NFT Flow**: The admin fills in buffalo data and uploads an image. The system generates a metadata JSON, and upon confirmation, the NFT is minted on the Bitkub Chain and the data is saved to the database.
- **Update Buffalo Info Flow**: The admin searches for a buffalo by microchip and selects the data to update. Multiple specialized modals open for editing different aspects (name, color, DNA, height, parents, etc.). The changes are sent to the backend to update both the database and blockchain metadata.
- **Certificate Management Flow**: Admins can approve certificates, manage certificate approvers, and handle the certificate lifecycle.
- **Reward Management Flow**: Create and manage rewards for buffaloes, including event information and reward images.
- **DNA Management Flow**: Update and manage DNA information for buffaloes with specialized interfaces.

---

## 🗄️ Database Architecture

### PostgreSQL with Prisma ORM (via Supabase)

#### Key Features

- **Type-safe Database Access**: Prisma Client with full TypeScript support
- **Database Migrations**: Automated schema migrations with version control
- **Data Validation**: Zod schemas for API input validation
- **Relationship Management**: Proper foreign key relationships between models

#### Database Models Structure

```typescript
// Buffalo Management
Buffalo -> Certificate (One-to-Many)
Buffalo -> DNA (One-to-One)
Buffalo -> Pedigree (One-to-Many)
Buffalo -> Reward (One-to-Many)
Buffalo -> Image (One-to-Many)

// User Management
User -> Certificate (One-to-Many) // as approver
User -> Buffalo (One-to-Many) // as owner/manager
```

---

## 📁 File Storage System

### Supabase Storage Integration

- **Image Uploads**: Buffalo photos, certificate images, reward images
- **File Types**: JPEG, PNG for images; PDF for documents
- **Access Control**: Public read access with secure upload endpoints
- **URL Generation**: Presigned URLs for secure uploads

---

## 🎨 UI/UX Design System

### Tailwind CSS + DaisyUI

- **Component Library**: DaisyUI components for consistent design
- **Responsive Design**: Mobile-first approach with Tailwind utilities
- **Typography**: Consistent font hierarchy and spacing
- **Admin-Focused Interface**: Optimized for data management workflows

### Visual Design Validation Requirements

**CRITICAL**: Visual design quality is equally important as functional implementation, especially for admin-facing features.

#### Pre-Implementation Design Checklist

✅ Color contrast validation (WCAG 2.1 AA compliance)
✅ Accessibility standards verification
✅ Responsive design across device sizes
✅ Typography hierarchy consistency
✅ Animation performance optimization
✅ Reduced motion preference support

#### Design Quality Assurance Process

**3-Phase Approach**:

1. **Design System Integration**: Follow component patterns, centralized utilities (60% duplication reduction)
2. **Accessibility Implementation**: WCAG 2.1 AA compliance (4.5:1 contrast), keyboard navigation, screen reader support, reduced motion
3. **Performance Optimization**: 60fps animations, bundle size monitoring, critical CSS, responsive images

### Centralized Styling Architecture

- **Utility-Based System**: Centralized styling utilities for consistent design
- **TypeScript Interfaces**: Proper typing for styling configurations
- **Accessibility Integration**: Built-in WCAG compliance and reduced motion support
- **Duplication Reduction**: Proven efficiency through centralized approach

---

## 🛠️ Development Commands

### Core Development

```bash
# Development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

### Database Management

```bash
# Push schema changes to database
npm run db:push

# Open Prisma Studio
npm run db:studio

# Generate Prisma client
npx prisma generate
```

### Type Checking

```bash
# Type check without emitting files
npx tsc --noEmit
```

---

## 🔄 Development Workflow

### Shortcut Commands (Agent-Driven Workflow)

These commands streamline development with GitHub-based context tracking:

- **`=fcs > [topic-name]`**: Creates new GitHub issue `[XXXX] [topic-name]` for context tracking
- **`=fcs > [XXXX]`**: Updates existing context issue by number  
- **`=fcs list`**: Shows all active context issues
- **`=fcs recent`**: Shows recent context issues
- **`=plan > [question/problem]`**: Creates/Updates GitHub Task Issue with detailed action plan
- **`=impl > [message]`**: Iterative implementation workflow (creates feature branch, executes from GitHub issue)
- **`=pr > [feedback]`**: Pull request and integration workflow
- **`=stage > [message]`**: Staging deployment workflow
- **`=prod > [message]`**: Production deployment workflow
- **`=rrr > [message]`**: Creates daily retrospective file and GitHub Issue

### GitHub Context Tracking Features

- **Pure GitHub Storage**: No local context files needed
- **Issue Naming**: `[XXXX] [topic-name]` format for easy identification
- **Stateless**: Works from any machine with GitHub access
- **Collaborative**: Team members can view and contribute to context
- **Searchable**: Full GitHub search capabilities for context history

### Workflow Features

- **GitHub Context + Task Issue Pattern**: All context lives in GitHub issues
- **Automated Branch Management**: Feature branches created from staging
- **Iteration Tracking**: Progress tracking with TodoWrite integration
- **Staging-First Deployment**: All features go through staging before production

### Git Workflow

- **Main Branch**: Production-ready code
- **Staging Branch**: Pre-production validation
- **Feature Branches**: `feature/[issue-number]-[description]` for new features
- **Development**: Work on feature branches, create PRs to staging → main

### Code Quality

- **TypeScript**: Strict mode enabled for type safety
- **ESLint**: Code linting with Next.js configuration
- **Prettier**: Code formatting with consistent style
- **Prisma**: Type-safe database operations

---

## ⚠️ CRITICAL SAFETY RULES

### NEVER MERGE PRS YOURSELF

**DO NOT** use any commands to merge Pull Requests, such as `gh pr merge`. Your role is to create a well-documented PR and provide the link to the user.

**ONLY** provide the PR link to the user and **WAIT** for explicit user instruction to merge. The user will review and merge when ready.

### DO NOT DELETE CRITICAL FILES

You are **FORBIDDEN** from deleting or moving critical files and directories in the project. This includes, but is not limited to: `.env`, `.git/`, `node_modules/`, `package.json`, `prisma/schema.prisma`, and the main project root files.

### HANDLE SENSITIVE DATA WITH CARE

You must **NEVER** include sensitive information such as API keys, passwords, or user data in any commit messages, Pull Request descriptions, or public logs. Always use environment variables for sensitive data.

**Critical Environment Variables**:
- `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- Bitkub Chain RPC endpoints and private keys
- Any other API keys and secrets

### STICK TO THE SCOPE

You are instructed to focus **ONLY** on the task described in the assigned task. Do not perform refactoring or new feature development unless explicitly part of the plan.

### BRANCH SAFETY

**MANDATORY STAGING BRANCH SYNC**: Before any implementation (`=impl`), you **MUST** ensure the local staging branch is synchronized with remote origin.

**STAGING-FIRST WORKFLOW**: All implementations work exclusively with staging branch. **NEVER** create PRs to main branch during implementation.

**FORCE PUSH RESTRICTIONS**: Only use `git push --force-with-lease` when absolutely necessary. **NEVER** use `git push --force`.

**HIGH-RISK FILE COORDINATION**: Files requiring team coordination include:
- `src/pages/page.tsx`, `src/pages/_app.tsx` (main app structure)
- `package.json`, `package-lock.json` (dependency management)
- `prisma/schema.prisma` (database schema)
- `.env.example`, configuration files

### AUTOMATED WORKFLOW SAFETY

**BRANCH NAMING ENFORCEMENT**: All feature branches **MUST** follow the pattern `feature/[issue-number]-[description]`.

**COMMIT MESSAGE STANDARDS**: All commits **MUST** include:
- Clear, descriptive subject line (max 50 characters)
- Reference to related issue number
- Type prefix: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`

**CRITICAL RULES**:
- **NEVER** work directly on main/staging branches
- **ALWAYS** create feature branches from staging
- **ALWAYS** deploy to staging before production

---

## 🌿 Enhanced Workflow Implementation

### Multi-Phase Implementation Strategy

**Proven 5-Phase Approach** (15-34 minute sessions):

1. **Analysis & Preparation** (5-8 min): Component analysis, dependency mapping
2. **Core Implementation** (8-15 min): Primary changes, API updates
3. **Integration & Testing** (3-8 min): Build validation, error resolution
4. **Documentation & Cleanup** (2-5 min): Commits, documentation
5. **Review & Validation** (1-2 min): Final validation

### TodoWrite Integration Patterns

**High-Impact Usage**: Complex refactoring (3+ files), multi-phase implementations, large system changes

**Workflow Pattern**:
1. Break into 5-12 manageable todos
2. Mark exactly ONE todo in_progress → completed
3. Provides real-time visibility and accountability
4. Enables accurate time estimation

**High-Impact TodoWrite Usage Patterns**:
✅ Complex multi-component refactoring (3+ files)
✅ Full-stack implementations (API + Frontend)
✅ Multi-phase system changes (Database + Application)
✅ Large refactoring with dependency management
✅ Blockchain integration updates
✅ NFT metadata management changes

### Branch Management Excellence

- **ALWAYS** create feature branches: `feature/[issue-number]-[description]`
- **NEVER** work directly on main branch
- **Workflow**: Analysis → Branch → Implementation → Build → Commit → PR → Updates

---

## 🔧 Key Features Implementation

### Buffalo Management System

- **Multi-step Registration**: Buffalo information collection with image upload
- **NFT Minting**: Automated metadata generation and blockchain minting
- **Microchip Tracking**: Unique identification system for each buffalo
- **Data Status Tracking**: Active/inactive buffalo management

### Certificate Management System

- **Certificate Approval**: Multi-step approval workflow for certificates
- **Approver Management**: Admin assignment and permission management
- **Certificate Lifecycle**: Issue, approve, expire, and renew certificates
- **Document Upload**: Certificate image and PDF management via Supabase

### DNA & Pedigree Management

- **DNA Information Tracking**: Genetic data management for breeding
- **Pedigree Charts**: Family tree visualization and management
- **Breeding Records**: Parent-child relationship tracking
- **Genetic Analysis Tools**: DNA data analysis and reporting

### Reward Management System

- **Reward Creation**: Event-based reward system management
- **Reward Distribution**: Automated and manual reward allocation
- **Event Integration**: Link rewards to specific events and achievements
- **Reward History**: Complete tracking of all buffalo rewards

---

## 📊 Data Models

### Buffalo Information

- **Basic Info**: Name, gender, color, birthday, microchip ID
- **Physical Data**: Height, weight, measurements
- **Health Records**: Vaccine documentation and certificates
- **Blockchain Data**: NFT token ID, metadata, transaction history

### Certificate Types

- **Birth Certificates**: Official birth registration
- **Health Certificates**: Veterinary health certifications
- **Breeding Certificates**: Genetic and pedigree validation
- **Competition Certificates**: Show and competition achievements

---

## 🚀 Deployment Architecture

### Next.js Deployment

- **Static Generation**: Optimized pages for better performance
- **API Routes**: Server-side API endpoints for data operations
- **Environment Variables**: Secure configuration management
- **Database**: PostgreSQL via Supabase with connection pooling

### File Storage

- **Supabase Storage**: Scalable file storage for images and documents
- **CDN Integration**: Fast content delivery worldwide
- **Security**: Presigned URLs and access control

### Blockchain Integration

- **Bitkub Chain**: Primary blockchain for NFT minting
- **Smart Contracts**: NFT and metadata management contracts
- **Transaction Management**: Secure and reliable blockchain operations
- **Metadata Storage**: IPFS integration for NFT metadata

---

## 📈 Performance Optimization

### Frontend Optimizations

- **Code Splitting**: Automatic code splitting with Next.js
- **Image Optimization**: Next.js Image component for optimized loading
- **Caching Strategy**: React Query for intelligent data caching
- **Bundle Analysis**: Regular bundle size monitoring

### Backend Optimizations

- **Database Indexing**: Optimized queries with proper indexing
- **Connection Pooling**: Efficient database connection management
- **API Response Caching**: Cached responses for frequently accessed data
- **Prisma Optimization**: Efficient database queries with Prisma

### Blockchain Optimizations

- **Batch Transactions**: Group multiple NFT operations
- **Gas Optimization**: Efficient smart contract interactions
- **Metadata Caching**: Cache frequently accessed NFT metadata
- **Transaction Monitoring**: Track and optimize blockchain performance

---

## ⚡ Efficiency Patterns & Performance Optimization

### 15-Minute Implementation Strategy

**Results**: 15-minute implementations vs 34+ minute baseline

**Prerequisites**: Reference pattern, TodoWrite initialized, component structure analyzed, integration points identified

**Speed Optimization Techniques**:

1. **Pattern Recognition**: 56% faster when following proven patterns
2. **MultiEdit**: Batch multiple edits instead of sequential single edits
3. **Systematic Analysis**: 2-3 minute analysis of target areas and integration points
4. **Build Validation**: `npm run build` after major changes, `npx tsc --noEmit` for type checking

### High-Impact Optimization Areas

#### TodoWrite Integration ROI

- **Setup Time**: 2-3 minutes
- **Visibility Benefit**: Real-time progress tracking
- **Accountability**: Prevents skipping critical steps
- **Stakeholder Communication**: Clear progress indicators
- **Proven Results**: 56% faster implementations documented

#### Reference Pattern Utilization

- **Pattern Documentation**: Create detailed retrospectives for reusable approaches
- **Pattern Library**: Maintain reference files as implementation guides
- **Systematic Replication**: Follow proven approaches exactly
- **Context Adaptation**: Modify only necessary elements

#### Tool Optimization

- **Efficient Pattern**: Read (targeted) → MultiEdit (batch) → Build (validation)
- **Avoid**: Multiple single Edits → Multiple Reads → Late build testing

### Efficiency Factor Analysis

**High Efficiency Sessions** (15-20 minutes):
- ✅ TodoWrite usage for progress tracking
- ✅ Reference pattern available
- ✅ Clear component structure understanding
- ✅ Systematic 5-phase approach
- ✅ Proactive build validation

**Low Efficiency Sessions** (45+ minutes):
- ❌ No reference pattern
- ❌ Schema assumptions without verification
- ❌ Working directly on main branch
- ❌ Build testing only at end
- ❌ Complex dependency analysis needed

---

## 🛡️ Security Considerations

### Data Protection

- **Input Validation**: Zod schemas for all API inputs
- **SQL Injection Prevention**: Prisma ORM parameterized queries
- **File Upload Security**: Type validation and size limits
- **Authentication**: Secure user authentication and authorization via Clerk

### Blockchain Security

- **Private Key Management**: Secure storage and handling of blockchain private keys
- **Smart Contract Security**: Audited and secure smart contract interactions
- **Transaction Validation**: Verify all blockchain transactions before execution
- **Metadata Integrity**: Ensure NFT metadata integrity and authenticity

### Privacy & Compliance

- **Data Encryption**: Sensitive data encryption in transit
- **Access Control**: Role-based access to different features
- **Audit Logs**: Track important system activities
- **Data Retention**: Proper data lifecycle management

---

## 🛡️ Security Implementation Methodology

### Systematic Security Audit Approach

**8-Phase Security Audit Process** (31-minute comprehensive audits):

1. **Infrastructure Analysis** (2-3 min): Environment variables, database schema, authentication
2. **Core Endpoint Analysis** (5-8 min): Input validation, rate limiting, error handling, authorization
3. **Blockchain Security Analysis** (3-5 min): Smart contract security, key management, transaction validation
4. **Data Integrity Analysis** (3-5 min): Transaction security, data flow assessment, logging
5. **Compliance Assessment** (3-5 min): Industry standards and regulations
6. **Vulnerability Testing** (5-8 min): Injection prevention, authentication bypass, authorization
7. **Security Implementation** (8-12 min): Rate limiting, input validation, error hardening
8. **Build Validation** (2-3 min): TypeScript compilation, dependency validation
9. **Documentation & Reporting** (3-5 min): Security audit report, compliance metrics

### Enterprise-Grade Security Measures

#### Critical Security Implementations

- **Rate Limiting**: 15-minute windows, configurable limits per endpoint
- **Input Validation**: Comprehensive Zod schemas for all API endpoints
- **Secure Error Handling**: Generic error responses prevent information disclosure
- **File Upload Security**: Type validation, size limits, and secure storage
- **Blockchain Security**: Multi-signature approvals, secure key management

### Security Best Practices

**Key Security Areas**:

- **API Security**: Input validation, rate limiting, authentication, authorization
- **Blockchain Security**: Smart contract auditing, secure key management, transaction validation
- **File Upload System**: Server-side validation, secure storage, access control
- **Error Handling**: Generic error responses, sanitized logging
- **Data Protection**: Encryption in transit, secure storage of sensitive data

---

## 🔍 Monitoring & Debugging

### Error Handling

- **Global Error Boundaries**: React error boundaries for UI errors
- **API Error Handling**: Consistent error responses
- **Logging**: Structured logging for debugging
- **Performance Monitoring**: Track application performance

### Blockchain Monitoring

- **Transaction Monitoring**: Track NFT minting and transfer transactions
- **Gas Fee Monitoring**: Optimize blockchain transaction costs
- **Smart Contract Events**: Listen for and process contract events
- **Network Health**: Monitor Bitkub Chain network status

### Development Tools

- **Prisma Studio**: Database inspection and management
- **React DevTools**: Component state debugging
- **Network Tab**: API request/response monitoring
- **Console Logging**: Development-time debugging information

---

## 📝 Documentation Standards

### Code Documentation

- **TypeScript Comments**: JSDoc comments for functions and types
- **API Documentation**: tRPC auto-generated API documentation
- **Database Schema**: Prisma schema as source of truth
- **Component Documentation**: Storybook-style component documentation

### Project Documentation

- **README**: Project setup and usage instructions
- **CHANGELOG**: Track important changes and updates
- **CONTRIBUTING**: Guidelines for contributors
- **DEPLOYMENT**: Deployment instructions and checklists

### Blockchain Documentation

- **Smart Contract Documentation**: ABI documentation, function descriptions
- **NFT Metadata Schema**: Standard metadata structure documentation
- **Blockchain Integration Guides**: Step-by-step integration tutorials

---

## 📈 Retrospective Workflow

When you use the `=rrr` command, the agent will create a file and an Issue with the following sections and details:

### Retrospective Structure

**Required Sections**:

- **Session Details**: Date (YYYY-MM-DD local timezone), Duration, Focus, Issue/PR references
- **Session Summary**: Overall work accomplished
- **Timeline**: Key events with local timestamps
- **📝 AI Diary** (MANDATORY): First-person reflection on approach and decisions
- **💭 Honest Feedback** (MANDATORY): Performance assessment and improvement suggestions
- **What Went Well**: Successes achieved
- **What Could Improve**: Areas for enhancement
- **Blockers & Resolutions**: Obstacles and solutions
- **Lessons Learned**: Patterns, mistakes, and discoveries

**File Naming**: `session-YYYY-MM-DD-[description].md` with local date

---

## 📚 Best Practices from Retrospectives

### TodoWrite Integration Best Practices

**Results**: **15-minute implementations** vs 34+ minute sessions

**When to Use**: Complex multi-step tasks (3+ phases), multi-component refactoring, full-stack implementations, large refactoring projects, security audits, database migrations, blockchain integrations

**Workflow Pattern**:

1. Break into 5-12 manageable todos
2. Mark exactly ONE todo in_progress → completed
3. Provides real-time visibility and accountability
4. Enables accurate time estimation

**Proven Benefits**: 56% faster implementation, reduces context switching, prevents missing steps, ensures comprehensive testing

### Pattern Replication Strategy

#### Reference Implementation Approach

1. **Document Successful Patterns**: Create detailed retrospectives for reusable approaches
2. **Systematic Replication**: Use previous session files as implementation guides
3. **Adapt, Don't Recreate**: Modify proven patterns for new contexts
4. **Measure Efficiency**: Track implementation time improvements

### Build Validation Checkpoints

#### Critical Validation Points

- **Schema Changes**: `npm run build && npx tsc --noEmit`
- **API Modifications**: `npm run build 2>&1 | grep -A 5 "error"`
- **Large Refactoring**: `npx prisma generate && npm run build`
- **Blockchain Updates**: Test blockchain integration after changes

#### Proactive Testing Strategy

- **Incremental Builds**: Test builds after each major change, not just at the end
- **TypeScript Validation**: Run `npx tsc --noEmit` for pure type checking
- **Dependency Verification**: Check imports and exports after file restructuring
- **Database Sync**: Verify `npx prisma generate` after schema changes
- **Blockchain Testing**: Test smart contract interactions after updates

### Schema Investigation Protocol

#### Before Implementation Checklist

1. **Verify Database Schema**: Always check actual Prisma schema definitions
2. **Trace Data Structures**: Follow interface definitions through the codebase
3. **Validate Field Names**: Don't assume field naming conventions
4. **Check Relationships**: Understand model relationships before querying
5. **Verify Blockchain Integration**: Check smart contract ABI and integration points

#### Common Schema Pitfalls

- **Assumption Errors**: Making assumptions about field names/structures
- **Interface Misalignment**: Frontend interfaces not matching database schema
- **Relationship Complexity**: Not understanding foreign key relationships
- **Type Mismatches**: TypeScript interfaces not reflecting actual data structures
- **Blockchain Integration Issues**: Incorrect ABI usage or transaction parameters

### Multi-Phase Implementation Approach

#### Systematic Phase Breakdown

- **Phase 1**: Analysis & Preparation (10-15%)
- **Phase 2**: Core Implementation (40-50%)
- **Phase 3**: Integration & Testing (25-30%)
- **Phase 4**: Documentation & Cleanup (10-15%)

#### Phase Management Best Practices

- **Clear Phase Objectives**: Define specific deliverables for each phase
- **Dependency Mapping**: Identify cross-phase dependencies upfront
- **Progress Checkpoints**: Validate phase completion before proceeding
- **Issue Tracking**: Update GitHub issues after each phase completion

### Database Best Practices

#### PostgreSQL Sequence Management

- **Check Sequence**: `SELECT last_value FROM "TableName_id_seq";`
- **Reset Sequence**: `SELECT setval('"TableName_id_seq"', COALESCE(MAX(id), 0) + 1) FROM "TableName";`
- **Common Issue**: Auto-increment sequences become desynchronized after manual insertions

### Blockchain Integration Best Practices

#### Smart Contract Interaction

- **Transaction Validation**: Always validate transaction parameters before sending
- **Gas Optimization**: Optimize gas usage for cost-effective operations
- **Error Handling**: Comprehensive error handling for blockchain failures
- **Event Listening**: Monitor smart contract events for state changes

#### NFT Management

- **Metadata Standards**: Follow established NFT metadata standards
- **IPFS Integration**: Use IPFS for decentralized metadata storage
- **Batch Operations**: Group NFT operations to reduce transaction costs
- **Verification**: Verify NFT ownership and authenticity

### Documentation Standards

#### PR Description Requirements

- **Implementation Summary**: Clear overview of changes made
- **Technical Details**: Specific technical implementation notes
- **Blockchain Changes**: Smart contract updates and integration changes
- **Before/After Analysis**: Impact assessment and improvement metrics
- **Testing Validation**: Build success and functionality verification
- **Iteration Note Summary**: Key decisions and hurdles from development

#### Retrospective Documentation

- **AI Diary**: First-person reflection on approach and decision-making
- **Honest Feedback**: Critical assessment of session efficiency and quality
- **Pattern Recognition**: Identification of reusable patterns and approaches
- **Lessons Learned**: Specific insights for future implementation improvement

---

## Troubleshooting

### Common Issues

### Build Failures

```bash
# Check for type errors or syntax issues
npm run build 2>&1 | grep -A 5 "error"

# Clear cache and reinstall dependencies
rm -rf node_modules .cache dist build
npm install

# Type check without emitting
npx tsc --noEmit
```

### Port Conflicts

```bash
# Find the process using a specific port
lsof -i :[port-number]

# Kill the process
kill -9 [PID]
```

### Blockchain Issues

```bash
# Check blockchain connection
# Verify smart contract deployment
# Test transaction signing
# Check gas fees and network status
```

### Database Issues

```bash
# Reset database
npx prisma db push --force-reset

# Regenerate Prisma client
npx prisma generate

# Open database studio
npx prisma studio
```
