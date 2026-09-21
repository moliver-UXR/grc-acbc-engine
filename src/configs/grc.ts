// Cyber GRC conjoint study config (UX1-275).
//
// Scope: the Cyber GRC bundle (Third-Party Risk + Cyber Risk Management + AI
// Governance), plus Business Continuity, per leadership Priority #5. Attribute
// and level source of truth: tabs/08-cybergrc-attributes-draft.md.
//
// Eight attributes, all in BYO. Price is deliberately excluded (standing "no
// money" decision), so no attribute carries a numeric price_type and none is
// introduced only in screening. estimation.price_function stays set because the
// schema requires it; with no price attribute it is inert (the estimation
// matrix simply carries no price column).
//
// PROPOSED (2026-09-21, v2 language + structural reconciliation). NOT YET
// APPLIED (Qualtrics/grc.ts hold). Changes vs live:
//  - All level labels reworded to the v2 team-named language (07-draft-survey.md
//    v2 tab / Google Doc v2). Level IDs unchanged except where noted below, so
//    analysis keying stays stable.
//  - controls_compliance: ADDED a 5th level `control_impact` (proactive top
//    rung). Reference level (last listed) moves from cross_framework to
//    control_impact. DORA retained in the cross_framework label.
//  - deployment_location: REMOVED `cmk_in_region` (moved to firmographics) and
//    RENAMED `onprem_sovereign` -> `onprem_selfhosted` (sovereign dropped).
//  - Net effects-coding K is unchanged (A3 +1 level, A7 -1 level cancel), so
//    K = 28 still. _attributes.R MUST mirror the A3 add + A7 remove/rename.
export const grcConfig = {
  study: {
    attributes: [
      {
        id: "connected_risk",
        label: "Risk-exposure visibility",
        in_byo: true,
        price_type: "none" as const,
        levels: [
          { id: "siloed", label: "When a compliance control fails, the risk team hears about it by email or at the next review, then updates the affected risk by hand" },
          { id: "shared_assessments", label: "The compliance team's results are visible to the risk team, so the risk team sees a failed control without having to ask for it" },
          { id: "unified_vendor", label: "Every team's risks and controls (cyber, compliance, financial, regulatory) roll into one shared record, so the risk team and the compliance team work from the same source rather than their own copies" },
          { id: "impact_network", label: "Vendors, controls, and obligations sit on one connected model, so a vendor breach, a failed control, or a new compliance gap flows to the risk, compliance, and business-unit owners it affects, each told what changed and what to fix" },
        ],
      },
      {
        id: "tprm_depth",
        label: "Third-party risk depth",
        in_byo: true,
        price_type: "none" as const,
        levels: [
          { id: "basic_questionnaires", label: "The vendor team sends security questionnaires by hand and chases vendors for answers over email" },
          { id: "full_suite", label: "The vendor team runs a full TPRM program (assessment workflows, remediation and SLA tracking, continuous monitoring) in one place" },
          { id: "automated_ingestion", label: "The vendor team's program pulls evidence automatically (SOC 2, trust center, financial and public data) and only sends questionnaires to fill the gaps" },
          { id: "nth_party", label: "The vendor team maps nth-party and supply-chain exposure and monitors it continuously from the outside (security ratings plus financial, sanctions, and reputational signals), so a supplier problem shows up before a questionnaire would catch it" },
        ],
      },
      {
        id: "controls_compliance",
        label: "Continuous controls",
        in_byo: true,
        price_type: "none" as const,
        levels: [
          { id: "none", label: "The controls team proves controls only at audit time (point-in-time)" },
          { id: "manual_evidence", label: "The controls team collects evidence by hand throughout the year" },
          { id: "continuous_monitoring", label: "Controls are monitored continuously (automated evidence, live status), so the controls team sees a failure as it happens" },
          { id: "cross_framework", label: "Plus cross-framework mapping (ISO 27001, NIST CSF, ISO 22301, DORA), so the compliance team tests one control and satisfies many frameworks at once" },
          { id: "control_impact", label: "The moment a control fails, the risk and compliance teams are automatically shown the risks, obligations, and remediation it triggers" },
        ],
      },
      {
        id: "reporting",
        label: "Risk reporting and insights",
        in_byo: true,
        price_type: "none" as const,
        levels: [
          { id: "standard_reports", label: "Each team assembles its own board slides by hand from its own tool" },
          { id: "prebuilt_dashboards", label: "Each team pulls from prebuilt dashboards and exports its own section" },
          { id: "automated_board_pack", label: "Board packs are generated automatically from every team's live data" },
          { id: "unified_rollup", label: "One report unifies third-party, cyber, compliance, and AI for executives and the board, instead of each team reporting separately" },
          { id: "quantified_exposure", label: "That unified report puts a dollar figure on exposure (FAIR-style, in local currency), so the board sees risk in money" },
        ],
      },
      {
        id: "ai_governance",
        label: "AI governance",
        in_byo: true,
        price_type: "none" as const,
        levels: [
          { id: "not_included", label: "AI use is not governed" },
          { id: "ai_inventory", label: "The governance team keeps a maintained register of the AI models and tools teams use" },
          { id: "ai_risk_assessment", label: "The governance team assesses those AI systems against the EU AI Act and ISO 42001, flagging which ones carry regulatory risk" },
          { id: "continuous_ai_monitoring", label: "AI risk is monitored continuously in real time, so the governance team is alerted the moment a model drifts or a new one appears" },
        ],
      },
      {
        id: "agentic_autonomy",
        label: "Agentic autonomy",
        in_byo: true,
        price_type: "none" as const,
        levels: [
          { id: "no_ai", label: "No AI; the controls team does the work itself" },
          { id: "ai_suggests", label: "AI drafts the next step (a remediation, an evidence request) and a person on the team sends it" },
          { id: "ai_acts_approve", label: "AI acts once someone on the team approves each action" },
          { id: "ai_autonomous_review", label: "AI runs the routine work (collecting evidence, testing controls) on its own and the team reviews only the exceptions" },
          { id: "fully_autonomous", label: "AI runs fully autonomously within the guardrails the team sets" },
        ],
      },
      {
        id: "deployment_location",
        label: "Deployment and data location",
        in_byo: true,
        price_type: "none" as const,
        levels: [
          { id: "shared_no_guarantee", label: "Shared cloud with no guarantee of where the data sits" },
          { id: "shared_major_region", label: "The security team picks the region the data stays in" },
          { id: "tenant_in_region", label: "Each business unit or site runs in its own isolated tenant, in-region (for complex, multi-entity orgs)" },
          { id: "onprem_selfhosted", label: "The IT team runs it on-premises or self-hosted in your own environment" },
        ],
      },
      {
        id: "business_continuity",
        label: "Business continuity",
        in_byo: true,
        price_type: "none" as const,
        levels: [
          { id: "none", label: "The continuity team keeps BIAs and plans in spreadsheets, separate from the risk team's work" },
          { id: "standalone_tool", label: "The continuity team uses a standalone tool for its BIAs and plans, still apart from the risk data" },
          { id: "integrated_module", label: "The continuity team's BIAs, plans, and recovery tests sit alongside the risk and controls teams' work rather than in a separate tool, though the plans do not yet update automatically when the risk data changes" },
          { id: "connected_bcm", label: "When the vendor team or security team logs a failure or breach, it flows straight into the affected continuity plans, so the continuity team's recovery reflects the risk as it happens" },
        ],
      },
    ],
    design: {
      T: 16,
      Amin: 2,
      Amax: 4,
      screens_per_concept_batch: 4,
      total_screening_screens: 4,
      price_variation_pct: 0,
      price_rounding: 1,
    },
    phases: {
      byo: true,
      screening: true,
      must_have: true,
      unacceptable: true,
      tournament: true,
      calibration: true,
    },
    estimation: {
      method: "mnl" as const,
      price_function: "linear" as const,
    },
  },
} as const;
