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
export const grcConfig = {
  study: {
    attributes: [
      {
        id: "connected_risk",
        label: "Connected risk (TPRM, Cyber Risk, and Compliance)",
        in_byo: true,
        price_type: "none" as const,
        levels: [
          { id: "siloed", label: "Siloed (each team's data separate, records created twice: TPRM, cyber, and compliance each keep their own)" },
          { id: "shared_assessments", label: "Shared assessments and issues across TPRM, cyber, and compliance teams" },
          { id: "unified_vendor", label: "Unified risk record (every risk and control type: cyber, compliance, financial, regulatory, and reputational, rolls up to one record)" },
          { id: "impact_network", label: "Connected impact network (vendors, risks, controls, assets, and compliance obligations on one model, so a vendor issue, a cyber finding, and a compliance gap flow to the same business-unit view)" },
        ],
      },
      {
        id: "tprm_depth",
        label: "Third-party risk depth",
        in_byo: true,
        price_type: "none" as const,
        levels: [
          { id: "basic_questionnaires", label: "Basic vendor questionnaires (manual send and collect)" },
          { id: "full_suite", label: "Full TPRM program (assessment workflows, remediation and SLA tracking, continuous monitoring)" },
          { id: "automated_ingestion", label: "Automated evidence ingestion (auto-pull SOC 2, trust center, financial and public data; questionnaires for gaps only)" },
          { id: "nth_party", label: "Nth-party and supply-chain mapping with continuous external monitoring (security ratings plus financial, sanctions, and reputational signals)" },
        ],
      },
      {
        id: "controls_compliance",
        label: "Controls monitoring and compliance",
        in_byo: true,
        price_type: "none" as const,
        levels: [
          { id: "none", label: "None (point-in-time audits only)" },
          { id: "manual_evidence", label: "Manual evidence collection" },
          { id: "continuous_monitoring", label: "Continuous control monitoring (automated evidence, live control status)" },
          { id: "cross_framework", label: "Cross-framework control mapping across security and operational-resilience frameworks (for example ISO 27001, NIST CSF, ISO 22301, DORA): test one control, satisfy many frameworks" },
        ],
      },
      {
        id: "reporting",
        label: "Risk reporting and insights",
        in_byo: true,
        price_type: "none" as const,
        levels: [
          { id: "standard_reports", label: "Standard reports and dashboards, you assemble the board pack from exports and screenshots" },
          { id: "prebuilt_dashboards", label: "Prebuilt cyber risk dashboards with self-serve export" },
          { id: "automated_board_pack", label: "Automated board-pack generation (the system produces the committee-ready PPT or PDF, you review rather than assemble)" },
          { id: "unified_rollup", label: "Unified cross-module executive rollup (one board-ready view across third-party, cyber, compliance, and AI, with CISO / CRO / CAE lenses)" },
          { id: "quantified_exposure", label: "Rollup carries quantified monetary risk exposure (FAIR-style, in local currency) to the board" },
        ],
      },
      {
        id: "ai_governance",
        label: "AI governance",
        in_byo: true,
        price_type: "none" as const,
        levels: [
          { id: "not_included", label: "Not included" },
          { id: "ai_inventory", label: "AI asset inventory" },
          { id: "ai_risk_assessment", label: "AI risk assessment vs EU AI Act / ISO 42001" },
          { id: "continuous_ai_monitoring", label: "Continuous AI risk monitoring and controls" },
        ],
      },
      {
        id: "agentic_autonomy",
        label: "Agentic autonomy",
        in_byo: true,
        price_type: "none" as const,
        levels: [
          { id: "no_ai", label: "No AI" },
          { id: "ai_suggests", label: "AI suggests, human executes" },
          { id: "ai_acts_approve", label: "AI acts, you approve" },
          { id: "ai_autonomous_review", label: "AI runs autonomously, you review exceptions" },
          { id: "fully_autonomous", label: "Fully autonomous" },
        ],
      },
      {
        id: "deployment_location",
        label: "Deployment and data location",
        in_byo: true,
        price_type: "none" as const,
        levels: [
          { id: "shared_no_guarantee", label: "Shared SaaS, no regional guarantee" },
          { id: "shared_major_region", label: "Shared SaaS, choice of major region" },
          { id: "tenant_in_region", label: "Tenant-isolated, in-region" },
          { id: "cmk_in_region", label: "Customer-managed keys, in-region" },
          { id: "onprem_sovereign", label: "On-prem / sovereign" },
        ],
      },
      {
        id: "business_continuity",
        label: "Business continuity",
        in_byo: true,
        price_type: "none" as const,
        levels: [
          { id: "none", label: "None (spreadsheets and documents)" },
          { id: "standalone_tool", label: "Standalone BCM tool (separate from your risk data)" },
          { id: "integrated_module", label: "In-platform BCM lifecycle (impact analysis, continuity plans, recovery testing), not yet connected to risk data" },
          { id: "connected_bcm", label: "BCM connected to your cyber and third-party risk model (an outage or breach flows into continuity plans)" },
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
