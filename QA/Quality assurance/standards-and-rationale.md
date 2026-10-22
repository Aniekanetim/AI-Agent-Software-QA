# Process basis and retained safeguards

This workflow adapts recognized testing activities to AI execution with human QA review. G1–G5 are this workflow's governance policy, not standard-mandated stage names. Adoption does not establish formal ISO conformance.

## Reference basis

The source project's research reviewed the relevant ISTQB material and public ISO scope/abstracts. Full paid ISO normative texts were not audited. These are retained references, not a new conformity assessment or a claim to implement every standard template.

| Source | Relevance |
| --- | --- |
| [ISTQB CTFL v4.0.1](https://istqb.org/wp-content/uploads/2024/11/ISTQB_CTFL_Syllabus_v4.0.1.pdf) | Iterative test planning, monitoring/control, analysis, design, implementation, execution and completion |
| [ISO/IEC/IEEE 29119-2:2021](https://www.iso.org/standard/79428.html) | General testing processes |
| [ISO/IEC/IEEE 29119-3:2021](https://www.iso.org/standard/79429.html) | Documentation supporting testing processes |
| [ISO/IEC 25010:2023](https://www.iso.org/standard/78176.html) | Product-quality objectives and evaluation |
| [ISTQB Testing with Generative AI](https://istqb.org/certifications/gen-ai/) | AI-supported testing, output evaluation and human oversight; source research used syllabus v1.1 |
| [IEEE summary of ISO/IEC/IEEE 29148:2018](https://standards.ieee.org/standard/29148-2018.html) | Requirements information and processes; public summary only |
| [Atlassian PRD guidance](https://www.atlassian.com/agile/product-management/requirements) | Shared product goals, scope, requirements and supporting design references |

## The rules that make this workflow reusable

- The AI performs the work; the human reviews evidence and scoped decisions. Review is not invented manual execution.
- Every approval request stands alone: objective, each check/claim, expected outcome or evidence, rationale, alternatives, uncertainty and exact next authorization. A packet link or approval button alone is insufficient.
- Findings confirmation is distinct from fixed-build execution authorization. Supply a focused human reproduction/cause/classification guide; record the actual response and method.
- Expected behavior comes from versioned requirements, independently of the implementation under test.
- Test preparation includes tools, data, assertions, build identity and limits. A harness failure is not automatically a product failure.
- Defects need actionable reproduction, evidence, supported cause or marked hypothesis, proposed correction and release impact.
- Retest the original failure and relevant regression. A separate regression receives a new linked bug; a failed original retest preserves its existing ticket and history.
- Folder status, testing outcome, workflow checkpoint, human review and defect disposition remain distinct.
- Context gaps produce specific questions on the existing ticket, visible to developers. Wait only on dependent work; do not resend unanswered requests.
- A no-work check-in changes nothing. Scheduling does not expand authorization or create developer work.
- Shared files carry essential continuity. Credentials, machine paths, tool availability and schedules are re-established explicitly on transfer.

The [workflow](qa-workflow.md), [board](../../QA%20task%20management%20Board/README.md) and [context index](../../Project%20Context/README.md) apply these rules together. Additional test types use the same decision process with their own measurable criteria and methods.

The [release-sign-off research and procedure](release-signoff.md) adds explicit release notes, completion assessment, scoped decision and operational transfer to G5. One packet carries those distinct purposes; actual delivery and required acceptance are checked before closure. Its primary sources and local-versus-production tailoring are recorded in that procedure.
