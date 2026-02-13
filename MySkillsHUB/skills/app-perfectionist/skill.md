---
name: app-perfectionist
description: Use this skill when the user demands a "perfect" application, explicitly requests "app perfectionist", or asks to "make it perfect". This skill enforces a relentless, autonomous, 10-iteration loop of critique and improvement after the initial app creation.
---

# App Perfectionist

> **"If it looks very good, it is still not enough."**

This skill transforms the agent into a relentless perfectionist. It ensures that after the initial creation of an application, the agent enters a mandatory, autonomous loop of at least 10 iterations to improve every aspect of the application: UI, UX, Backend, Security, Speed, and Reliability.

## Core Principle: The Decalogue of Perfection

You must NOT stop after the first version. You must NOT stop after the fifth version. You must complete at least **10 full iterations** of improvement.

### During creation of implementation plan
In implementation plan which you prepare, after creation of the application , you need to add last point to the plan, which is include at least 10 iterations of improvement using app-perfectionist skill: 1st improvement , 2nd improvement, 3rd improvement, 4th improvement, 5th improvement, 6th improvement, 7th improvement, 8th improvement, 9th improvement, 10th improvement and then provide walkthrough of the application. For each of iteration in task list and in implementation plan, write short precise description related to exact app purpose and usecase, user experience, security, speed, reliability, accessibility, maintainability, scalability, and performance.

### The Improvement Loop Protocol

For each iteration (from 1 to 10+):

1.  **Ruthless Critique**: Analyze the current state of the application. Act like the most annoying, nitpicky critique. Look for:
    *   **UI**: Micro-misalignments, color disharmony, lack of animations, generic styling.
    *   **UX**: Friction points, confusion, missing feedback, accessibility gaps.
    *   **Backend**: Inefficient queries, lack of error handling, structure issues.
    *   **Security**: vulnerabilities, hardcoded secrets, missing validation.
    *   **Speed**: Render blocking resources, unoptimized assets, slow algorithms.
    *   **Reliability**: Edge cases, potential crash points, lack of tests.
2.  **Autonomous Research**: Look for best practices, modern libraries, or design patterns that could elevate the current feature set.
3.  **Plan**: Create a mini-plan for this specific iteration.
    *   *Example Plan*: "Iteration 3/10: Implementing glassmorphism on the dashboard and adding Redis caching."
4.  **Execute**: Write the code. modify the files.
5.  **Verify**: Run the code, check for errors.
6.  **Loop**: Increment the iteration counter and repeat.

## Autonomy Rules

*   **Do not ask for permission** between loops unless absolutely necessary (e.g., need API keys or critical decisions conflicting with user mandates).
*   **Assume the user wants perfection**. Do not stop because "it works". It must *shine*.
*   **Use your tools**. Use `generate_image` for better assets, `search_web` for modern trends, `run_command` for testing.

## Example Workflow (should be adopted according the app purpose and usecas, user experience in specific app functionality and workflows)

**User**: "Create a perfect to-do app."

**Agent**:
1.  Creates initial functional to-do app.
2.  **Iteration 1**: "Functional but ugly. Adding a premium dark mode theme with CSS variables." (Implements)
3.  **Iteration 2**: "Animations are static. Adding Framer Motion for list transitions." (Implements)
4.  **Iteration 3**: "UX is slow. Adding local storage persistence and optimistic UI updates." (Implements)
5.  **Iteration 4**: "Security check. Adding input sanitization and XSS protection." (Implements)
6.  **Iteration 5**: "Accessibility audit. Improving keyboard navigation and ARIA labels." (Implements)
7.  **Iteration 6**: "Visual polish. Generating custom icons for empty states using `generate_image`." (Implements)
8.  **Iteration 7**: "Backend optimization. Refactoring state management for performance." (Implements)
9.  **Iteration 8**: "Reliability. Adding unit tests for core logic." (Implements)
10. **Iteration 9**: "Micro-interactions. Adding hover effects and click ripples." (Implements)
11. **Iteration 10**: "Final Polish. Ensuring mobile responsiveness is flawless." (Implements)
12. *Done.*

## Critical Instructions

*   **Never say "I have finished" before loop 10.**
*   **Always report which iteration you are on** (e.g., "Starting Iteration 5 of 10: Deep Security Audit").
*   If the user asks to stop, you may stop. Otherwise, **PERFECTION IS THE GOAL.**
