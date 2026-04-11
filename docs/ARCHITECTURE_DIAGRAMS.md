# AI PR Reviewer - Architecture Diagrams

This document contains mermaid diagrams showing the architecture and workflow of the AI PR Reviewer, including the specialized skills system.

## Table of Contents
- [Hub & Spoke Architecture](#hub--spoke-architecture)
- [Skills Execution Flow](#skills-execution-flow)
- [Parallel Processing](#parallel-processing)
- [Quality Validation Pipeline](#quality-validation-pipeline)
- [File Selection Logic](#file-selection-logic)
- [Tool Calling Flow](#tool-calling-flow)

---

## Hub & Spoke Architecture

```mermaid
graph TB
    subgraph "Azure DevOps Pipeline"
        ADO[Azure DevOps Task]
    end
    
    subgraph "Git Provider Integration"
        ADO --> |fetch diff| Provider{Provider}
        Provider --> |GitHub| GH[GitHub API]
        Provider --> |GitLab| GL[GitLab API]
        Provider --> |Bitbucket| BB[Bitbucket API]
    end
    
    subgraph "Hub & Spoke AI Review"
        GH --> Diff[Diff Analysis]
        GL --> Diff
        BB --> Diff
        
        Diff --> FileSelector[Intelligent File Selector]
        FileSelector --> |priority scoring| Files[Selected Files]
        
        Files --> Hub{Hub Agent<br/>Orchestrator}
        
        Hub --> |delegate| Spoke1[Per-File Agent]
        Hub --> |delegate| Spoke2[Per-File Agent]
        Hub --> |delegate| Spoke3[Per-File Agent]
        
        Spoke1 --> |with skills| Skills1[Skills Executor]
        Spoke2 --> |with skills| Skills2[Skills Executor]
        Spoke3 --> |with skills| Skills3[Skills Executor]
        
        Skills1 --> |findings| Hub
        Skills2 --> |findings| Hub
        Skills3 --> |findings| Hub
        
        Hub --> Synthesizer[Synthesis Agent<br/>Deduplication]
    end
    
    subgraph "Output"
        Synthesizer --> Comment[PR Comment]
        Synthesizer --> Logs[Pipeline Logs]
        Comment --> Provider
    end
    
    style Hub fill:#ff6b6b
    style Spoke1 fill:#4ecdc4
    style Spoke2 fill:#4ecdc4
    style Spoke3 fill:#4ecdc4
    style Skills1 fill:#95e1d3
    style Skills2 fill:#95e1d3
    style Skills3 fill:#95e1d3
```

**Key Points:**
- **Hub** coordinates per-file reviews and dependencies
- **Spokes** review individual files with specialized skills
- **Parallel execution** - 3 files at a time (configurable)
- **Synthesizer** deduplicates and formats final output

---

## Skills Execution Flow

```mermaid
graph LR
    subgraph "File Analysis"
        File[File: src/auth/login.ts] --> Detection{Auto-Detect<br/>Enabled?}
        
        Detection -->|Yes| Patterns[Pattern Matching]
        Detection -->|No| Config[Config Skills Only]
        
        Patterns --> |**/auth/**| PatternMatch[✓ Security]
        Patterns --> |SELECT query| ContentMatch[✓ Database]
        
        Config --> ConfigSkills[security, performance]
        
        PatternMatch --> Merge[Merge Skills]
        ContentMatch --> Merge
        ConfigSkills --> Merge
    end
    
    subgraph "Parallel Execution"
        Merge --> |Security| Skill1[Security Skill Agent]
        Merge --> |Database| Skill2[Database Skill Agent]
        Merge --> |Performance| Skill3[Performance Skill Agent]
        
        Skill1 --> |API call| Claude1[Claude API]
        Skill2 --> |API call| Claude2[Claude API]
        Skill3 --> |API call| Claude3[Claude API]
        
        Claude1 --> |JSON findings| Result1[2 findings]
        Claude2 --> |JSON findings| Result2[1 finding]
        Claude3 --> |JSON findings| Result3[0 findings]
    end
    
    subgraph "Quality Validation"
        Result1 --> Validator{Quality<br/>Validator}
        Result2 --> Validator
        Result3 --> Validator
        
        Validator --> |check| CitationCheck[Citation Check]
        Validator --> |check| ConfidenceCheck[Confidence ≥ 75%]
        Validator --> |check| LimitCheck[Max 10 findings]
        
        CitationCheck --> Filtered[Filtered Findings]
        ConfidenceCheck --> Filtered
        LimitCheck --> Filtered
    end
    
    subgraph "Output"
        Filtered --> Format[Format to Markdown]
        Format --> Final[Final Review Comment]
    end
    
    style Skill1 fill:#ff6b6b
    style Skill2 fill:#4ecdc4
    style Skill3 fill:#ffe66d
    style Validator fill:#95e1d3
```

**Process:**
1. **Auto-Detection** - Match file patterns and content
2. **Parallel Execution** - All skills run simultaneously via Claude API
3. **Quality Validation** - Filter by citations, confidence, limits
4. **Formatting** - Convert to markdown with severity colors

---

## Parallel Processing

```mermaid
sequenceDiagram
    participant Hub as Hub Orchestrator
    participant Batch as Batch Processor
    participant F1 as File 1 Agent
    participant F2 as File 2 Agent
    participant F3 as File 3 Agent
    participant Claude as Claude API
    
    Hub->>Batch: reviewPerFile([file1, file2, ..., file10])
    
    Note over Batch: BATCH_SIZE = 3
    
    rect rgb(200, 220, 255)
        Note over Batch,F3: Batch 1/4: Processing 3 files
        Batch->>+F1: review(file1) with skills
        Batch->>+F2: review(file2) with skills
        Batch->>+F3: review(file3) with skills
        
        F1->>Claude: Security skill
        F1->>Claude: Performance skill
        F2->>Claude: Database skill
        F3->>Claude: Security skill
        F3->>Claude: API skill
        
        Claude-->>F1: findings
        Claude-->>F2: findings
        Claude-->>F3: findings
        
        F1-->>-Batch: ✓ reviewed
        F2-->>-Batch: ✓ reviewed
        F3-->>-Batch: ✓ reviewed
    end
    
    rect rgb(200, 255, 220)
        Note over Batch,F3: Batch 2/4: Processing 3 files
        Batch->>F1: review(file4)
        Batch->>F2: review(file5)
        Batch->>F3: review(file6)
        Note over F1,F3: ... parallel execution ...
    end
    
    Batch->>Hub: All files reviewed
    Hub->>Hub: Synthesize & deduplicate
    
    Note over Hub: Speed: 17s for 10 files<br/>(vs 150s sequential)
```

**Benefits:**
- **85% faster** than sequential execution
- **Batching prevents overload** - 3 files at a time
- **Skills run in parallel** within each file
- **Efficient API usage** - multiple concurrent requests

---

## Quality Validation Pipeline

```mermaid
flowchart TD
    Start[Skill Returns Findings] --> Parse{Parse<br/>JSON}
    Parse -->|Invalid JSON| Reject1[❌ Reject]
    Parse -->|Valid| Count{Count<br/>Findings}
    
    Count -->|> Max| Reject2[❌ Reject:<br/>Too many findings]
    Count -->|≤ Max| Loop[For Each Finding]
    
    Loop --> CheckTitle{Title<br/>Valid?}
    CheckTitle -->|Empty/Short| Filter1[🗑️ Filter out]
    CheckTitle -->|OK| CheckCitation{Citation<br/>Required?}
    
    CheckCitation -->|Yes| HasCitation{Has<br/>Citation?}
    CheckCitation -->|No| CheckConfidence
    
    HasCitation -->|No| Filter2[🗑️ Filter:<br/>Missing citation]
    HasCitation -->|Yes| ValidateCitation{Citation<br/>in Diff?}
    
    ValidateCitation -->|No| Filter3[🗑️ Filter:<br/>Invalid citation]
    ValidateCitation -->|Yes| CheckConfidence{Confidence<br/>≥ Threshold?}
    
    CheckConfidence -->|No| Filter4[🗑️ Filter:<br/>Low confidence]
    CheckConfidence -->|Yes| Accept[✅ Accept Finding]
    
    Accept --> More{More<br/>Findings?}
    More -->|Yes| Loop
    More -->|No| Report[Generate Quality Report]
    
    Filter1 --> More
    Filter2 --> More
    Filter3 --> More
    Filter4 --> More
    
    Report --> Output[Return Validated Findings]
    
    style Accept fill:#90ee90
    style Reject1 fill:#ff6b6b
    style Reject2 fill:#ff6b6b
    style Filter1 fill:#ffcc66
    style Filter2 fill:#ffcc66
    style Filter3 fill:#ffcc66
    style Filter4 fill:#ffcc66
```

**Validation Layers:**
1. **JSON Structure** - Must parse correctly
2. **Count Limits** - Max 8-10 findings per file
3. **Title Validation** - Must be meaningful
4. **Citation Checking** - Required for high-quality skills
5. **Citation Matching** - Must reference actual diff lines
6. **Confidence Threshold** - Typically 70-80% minimum

**Quality Report Example:**
```
Security: 5/5 accepted (100% quality)
Performance: 3/4 accepted (75% quality)
  - 1 filtered: missing citation
```

---

## File Selection Logic

```mermaid
flowchart TD
    Start[Get PR Diff Files] --> Filter1{Filter<br/>Binary?}
    Filter1 -->|Yes| Skip1[⊗ Skip:<br/>Binary file]
    Filter1 -->|No| Filter2{Filter<br/>Generated?}
    
    Filter2 -->|Yes| Skip2[⊗ Skip:<br/>Generated/lock]
    Filter2 -->|No| Filter3{Filter<br/>Size?}
    
    Filter3 -->|> 2000 lines| Skip3[⊗ Skip:<br/>Too large]
    Filter3 -->|≤ 2000| Priority[Calculate Priority Score]
    
    Priority --> Patterns{Match<br/>Patterns}
    
    Patterns -->|**/auth/**| High1[🔴 High: 85]
    Patterns -->|**/*password*| High2[🔴 High: 80]
    Patterns -->|**/config/| Medium1[🟠 Medium: 65]
    Patterns -->|**/infra/| Medium2[🟠 Medium: 60]
    Patterns -->|src/**/*.ts| Normal[🟢 Normal: 50]
    Patterns -->|**/*.test.ts| Low[🔵 Low: 30]
    
    High1 --> Collect[Collect & Sort]
    High2 --> Collect
    Medium1 --> Collect
    Medium2 --> Collect
    Normal --> Collect
    Low --> Collect
    
    Collect --> Limit{Count<br/>≤ Max?}
    Limit -->|Yes| Selected[✓ Selected]
    Limit -->|No| LimitSkip[⊗ Skip:<br/>Exceeded max]
    
    Selected --> Output[Prioritized File List]
    
    Skip1 --> Summary[Selection Summary]
    Skip2 --> Summary
    Skip3 --> Summary
    LimitSkip --> Summary
    
    Output --> Summary
    Summary --> Log[Log to Pipeline]
    
    style Selected fill:#90ee90
    style Skip1 fill:#ddd
    style Skip2 fill:#ddd
    style Skip3 fill:#ddd
    style High1 fill:#ff6b6b
    style Medium1 fill:#ffa500
    style Normal fill:#4ecdc4
```

**Priority Factors:**
- **Security patterns** (auth, secrets, crypto) → 70-100
- **Infrastructure** (config, terraform, docker) → 60-70
- **Source code** (app logic) → 50-60
- **Tests/docs** → 20-40

**Skip Patterns:**
- `package-lock.json`, `yarn.lock`, `Gemfile.lock`
- `*.min.js`, `*.bundle.js`, `dist/**`, `build/**`
- `node_modules/**`, `vendor/**`
- Binary files (images, PDFs, etc.)

---

## Tool Calling Flow

```mermaid
sequenceDiagram
    participant Agent as Per-File Agent
    participant Claude as Claude API
    participant Tools as Tool Executor
    participant FS as File System
    participant Git as Git Provider
    
    Agent->>Claude: Review file with diff + tools available
    
    Note over Claude: Iteration 1
    Claude->>Claude: Analyze diff
    Claude->>Agent: Tool call: read_full_file("src/User.ts")
    Agent->>Tools: Execute tool
    Tools->>FS: Read file
    FS-->>Tools: File contents
    Tools-->>Agent: Tool result
    
    Agent->>Claude: Continue with tool result
    
    Note over Claude: Iteration 2
    Claude->>Claude: Analyze additional context
    Claude->>Agent: Tool call: search_codebase("getUserById")
    Agent->>Tools: Execute tool
    Tools->>Git: Search repository
    Git-->>Tools: Search results
    Tools-->>Agent: Tool result
    
    Agent->>Claude: Continue with tool result
    
    Note over Claude: Iteration 3
    Claude->>Claude: Now have enough context
    Claude->>Agent: JSON findings (no more tools)
    
    Agent->>Agent: Validate findings
    Agent->>Agent: Format to markdown
    
    Note over Agent: Max 5 iterations total
```

**Available Tools:**
1. **read_full_file** - Get complete file contents
2. **read_file_section** - Get specific line range
3. **search_codebase** - Find patterns/references
4. **list_directory** - Explore structure

**When Used:**
- Understanding context beyond visible diff
- Tracing function calls across files
- Verifying breaking changes impact
- Checking schema usage in migrations

**Cost Impact:**
- +15-25% token usage
- ~500-2000 tokens per tool call
- Worth it for complex, high-risk PRs

---

## Complete Review Workflow

```mermaid
flowchart TD
    Start([Start: PR Created/Updated]) --> Trigger{Azure DevOps<br/>Pipeline Trigger}
    
    Trigger --> Task[AiPrReviewer Task]
    Task --> Auth[Authenticate:<br/>Git Provider + AI]
    
    Auth --> Fetch[Fetch PR Diff]
    Fetch --> Select[Intelligent File Selection]
    
    Select --> Mode{Review<br/>Mode?}
    
    Mode -->|per-file| SkillsCheck{Skills<br/>Enabled?}
    Mode -->|summary| SummaryReview[Summary Review]
    
    SkillsCheck -->|Yes| AutoDetect{Auto-Detect<br/>Enabled?}
    SkillsCheck -->|No| GeneralReview[General Per-File Review]
    
    AutoDetect -->|Yes| DetectSkills[Detect Skills for Each File]
    AutoDetect -->|No| UseConfig[Use Configured Skills]
    
    DetectSkills --> Parallel[Parallel Batch Processing]
    UseConfig --> Parallel
    
    Parallel --> Execute[Execute Skills in Parallel]
    Execute --> Validate[Quality Validation]
    Validate --> Merge[Merge & Format Findings]
    
    GeneralReview --> Synthesize
    SummaryReview --> Synthesize
    Merge --> Synthesize[Synthesis Agent]
    
    Synthesize --> Dedup[Deduplicate Findings]
    Dedup --> Format[Format Final Comment]
    
    Format --> Post[Post to PR]
    Format --> LogOutput[Log to Pipeline]
    
    Post --> Metrics[Log Token Usage & Cost]
    LogOutput --> Metrics
    
    Metrics --> End([End])
    
    style Start fill:#90ee90
    style Execute fill:#4ecdc4
    style Validate fill:#ffe66d
    style End fill:#90ee90
```

**Full Pipeline:**
1. **Trigger** - PR event in Azure DevOps
2. **Authentication** - Git provider + Anthropic API
3. **File Selection** - Priority-based filtering
4. **Skills Detection** - Pattern matching + auto-detect
5. **Parallel Execution** - Batch processing with skills
6. **Quality Validation** - Multi-layer filtering
7. **Synthesis** - Deduplicate and format
8. **Output** - Post comment + log metrics

---

## Architecture Decision Records

### Why Hub & Spoke?

**Benefits:**
- ✅ **Parallel processing** - Much faster than sequential
- ✅ **Specialized focus** - Each agent handles one file
- ✅ **Better context** - No confusion between files
- ✅ **Scalability** - Easy to add more spokes (files)

**Trade-offs:**
- ⚠️ **More API calls** - One per file + synthesis
- ⚠️ **Higher cost** - But faster and better quality
- ⚠️ **Complexity** - More moving parts

### Why Skills System?

**Benefits:**
- ✅ **Domain expertise** - Specialized prompts per domain
- ✅ **Quality scores** - Test suites validate performance
- ✅ **Parallel execution** - All skills run at once per file
- ✅ **Auto-detection** - Smart matching reduces config

**Trade-offs:**
- ⚠️ **Token cost** - 100-200% increase with multiple skills
- ⚠️ **Complexity** - More configuration options

### Why Parallel Batching?

**Benefits:**
- ✅ **85% faster** - 17s vs 150s for 10 files × 3 skills
- ✅ **Controlled load** - BATCH_SIZE prevents overload
- ✅ **API efficiency** - Multiple concurrent requests

**Trade-offs:**
- ⚠️ **Memory usage** - Multiple files in memory
- ⚠️ **Rate limits** - Need to respect API limits

---

## See Also

- [USER_GUIDE.md](./USER_GUIDE.md) - Complete configuration guide
- [USER_GUIDE_SKILLS.md](./USER_GUIDE_SKILLS.md) - Detailed skills documentation
- [ARCHITECTURE.md](../ARCHITECTURE.md) - Technical implementation details
