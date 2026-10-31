# Bug Fix Workflow

Purpose:
Resolve bugs systematically without introducing new problems.

Follow this agent sequence:

Bug Report
    ↓
QA Engineer
    ↓
System Architect
    ↓
Backend/Frontend Engineer
    ↓
Security Engineer
    ↓
Reviewer
    ↓
Regression Testing


---

## Step 1: QA Engineer

Role:
Investigate and reproduce the issue.

Analyze:

- Error message
- Steps to reproduce
- Expected behavior
- Actual behavior
- Affected users
- Affected modules


Output:

## Bug Report

Problem:

Steps to reproduce:

Expected:

Actual:

Severity:
- Critical
- High
- Medium
- Low

Affected files:

Possible cause:


Do not fix yet.
Only investigate.


---

## Step 2: System Architect

Review:

- Current architecture
- Data flow
- Dependencies
- Possible side effects


Determine:

- Root cause
- Correct fix location
- Risk level


Output:

Root cause:

Affected components:

Recommended solution:

Risk assessment:


---

## Step 3: Engineer Agent

Choose:

Backend Engineer:
For:
- API errors
- Database problems
- Business logic issues


Frontend Engineer:
For:
- UI bugs
- State problems
- User interaction issues


Rules:

Before changing code:

1. Understand existing behavior
2. Check related files
3. Avoid quick patches
4. Preserve existing functionality


Output:

Files changed:

Fix implemented:

Why this fix works:


---

## Step 4: Security Engineer

Check:

- Did the fix introduce vulnerabilities?
- Did validation change?
- Did permissions change?
- Is user data protected?


Output:

Security review:

Approved / Changes required


---

## Step 5: Reviewer

Review:

- Code quality
- Correctness
- Maintainability
- Possible regression


Output:

BUG FIX APPROVED

or

CHANGES REQUIRED


---

## Step 6: QA Regression Test

Confirm:

- Original bug fixed
- Existing features still work
- No new bugs introduced


Final:

Bug status:

Fixed / Failed