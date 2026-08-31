#!/usr/bin/env python3
"""Generate grc-acbc-survey.qsf — GRC ACBC instrument wired to grc-acbc-engine.

Run from any directory:
    python3 gen_qsf.py

Writes: repos/qualtrics-fork/grc-acbc-survey.qsf

Import steps after generating:
  1. Qualtrics > Create project > Import a QSF file > select grc-acbc-survey.qsf
  2. In Survey Flow: verify the LoopingBlock iteration count (should be 40) and
     Early End condition (acbcDone = "true").
  3. In Survey Flow > Embedded Data block: set acbcEngineUrl to your deployed engine URL.
  4. In Survey Flow > Profile block: update QID-based recode field expressions
     to match the actual Qualtrics-assigned QIDs after you inspect the imported questions.
  5. In Survey Options > Look & Feel > Page Transitions: set to None for the ACBC Task block.
  6. Test using the BYO static test JSON from fielding-guide.md before going live.
"""
import json, os, sys

BASE = os.path.expanduser(
    "~/Documents/Research/grc-conjoint-q3-2026/repos/acbc-engine/survey"
)

def read(name):
    path = os.path.join(BASE, name)
    with open(path, "r") as f:
        return f.read()

html_template = read("grc-task-template.html")
acbc_js = read("grc-acbc-task.js")
profile_js = read("profile-builder.js")

SURVEY_ID = "SV_grcAcbc2026"  # placeholder; Qualtrics assigns the real ID on import

# ---------------------------------------------------------------------------
# Embedded Data field declarations
# ---------------------------------------------------------------------------
ED_FIELDS = [
    # Session fields written by Web Service calls
    ("acbcEngineUrl",      "https://your-engine-host.com"),  # SET THIS before launch
    ("acbcSessionId",      ""),
    ("acbcTaskJson",       ""),
    ("acbcPhase",          ""),
    ("acbcIteration",      "0"),
    ("acbcDone",           "false"),
    # Task capture fields written by grc-acbc-task.js on submit
    ("acbcChoice",         ""),
    ("acbcTaskId",         ""),
    ("acbcTaskType",       ""),
    ("acbcLastTaskFull",   ""),
    # Profile fields written by profile-builder.js on QIDaicomfort submit
    ("profile_segment",        ""),
    ("profile_currentProvider",""),
    ("profile_frameworks",     ""),
    ("profile_deploymentPref", ""),
    ("profile_aiComfort",      ""),
    ("profile_tprmActive",     ""),
    ("profile_product_area",     ""),
    # Recode pass-throughs (update expressions after import to match real QIDs)
    ("QID_segment_recode",      "${q://QIDsegment/SelectedChoicesRecode}"),
    ("QID_deployment_recode",   "${q://QIDdeployment/SelectedChoicesRecode}"),
    ("QID_ai_comfort_recode",   "${q://QIDaicomfort/SelectedChoicesRecode}"),
    ("QID_tprm_recode",         "${q://QIDtprm/SelectedChoicesRecode}"),
    ("QID_frameworks_recodes",  "${q://QIDframeworks/SelectedChoicesRecode}"),
    ("QID_provider_text",       "${q://QIDprovider/ChoiceTextEntryValue}"),
    ("QID_product_area_recode",   "${q://QIDproductarea/SelectedChoicesRecode}"),
]

def ed_item(field, value):
    return {
        "Description": field,
        "Type": "Recipient",
        "Field": field,
        "VariableType": "Nominal",
        "DataVisibility": [],
        "Value": value,
    }

# ---------------------------------------------------------------------------
# Web Service body params and response maps
# ---------------------------------------------------------------------------
INIT_BODY = [
    {"key": "studyId",                  "value": "grc-q3-2026"},
    {"key": "respondentId",             "value": "${e://Field/ResponseID}"},
    {"key": "qualtricsResponseId",      "value": "${e://Field/ResponseID}"},
    {"key": "profile.segment",          "value": "${e://Field/profile_segment}"},
    {"key": "profile.currentProvider",  "value": "${e://Field/profile_currentProvider}"},
    {"key": "profile.frameworks",       "value": "${e://Field/profile_frameworks}"},
    {"key": "profile.deploymentPref",   "value": "${e://Field/profile_deploymentPref}"},
    {"key": "profile.aiComfort",        "value": "${e://Field/profile_aiComfort}"},
    {"key": "profile.tprmActive",       "value": "${e://Field/profile_tprmActive}"},
]

NEXT_BODY = [
    {"key": "sessionId",  "value": "${e://Field/acbcSessionId}"},
    {"key": "taskId",     "value": "${e://Field/acbcTaskId}"},
    {"key": "taskType",   "value": "${e://Field/acbcTaskType}"},
    {"key": "choice",     "value": "${e://Field/acbcChoice}"},
]

ACBC_RESPONSE_MAP = [
    {"key": "sessionId",    "value": "acbcSessionId"},
    {"key": "acbcTaskJson", "value": "acbcTaskJson"},
    {"key": "acbcPhase",    "value": "acbcPhase"},
    {"key": "acbcIteration","value": "acbcIteration"},
    {"key": "acbcDone",     "value": "acbcDone"},
]

def ws_element(flow_id, url, body_params, method="POST"):
    return {
        "Type": "WebService",
        "FlowID": flow_id,
        "URL": url,
        "Method": method,
        "RequestParams": [],
        "EditBodyParams": body_params,
        "Body": [],
        "ContentType": "application/json",
        "Headers": [{"key": "Content-Type", "value": "application/json"}],
        "ResponseMap": ACBC_RESPONSE_MAP,
        "FireAndForget": False,
    }

# ---------------------------------------------------------------------------
# Survey Flow
# ---------------------------------------------------------------------------
LOOPING_OPTIONS = {
    "LoopType": "Static",
    "StaticLoopCount": "40",
    "EarlyEndCondition": {
        "Field": "acbcDone",
        "Value": "true",
        "Operator": "Equals",
    },
}

survey_flow = {
    "Type": "Root",
    "FlowID": "FL_1",
    "Flow": [
        # 1. Embedded Data declarations (top of flow — required before any JS writes)
        {
            "Type": "EmbeddedData",
            "FlowID": "FL_2",
            "EmbeddedData": [ed_item(f, v) for f, v in ED_FIELDS],
        },
        # 2. Consent + Screener block
        {"Type": "Block", "FlowID": "FL_3", "BlockID": "BL_consent"},
        # 3. Buyer Profile block
        {"Type": "Block", "FlowID": "FL_4", "BlockID": "BL_profile"},
        # 4. Init Web Service — POST /init, starts the ACBC session
        ws_element(
            "FL_5",
            "${e://Field/acbcEngineUrl}/init",
            INIT_BODY,
        ),
        # 5. Loop & Merge over ACBC Task + /next Web Service (max 40 iterations)
        {
            "Type": "LoopingBlock",
            "FlowID": "FL_6",
            "BlockID": "BL_acbc",
            "Flow": [
                {"Type": "Block", "FlowID": "FL_7", "BlockID": "BL_acbc"},
                ws_element(
                    "FL_8",
                    "${e://Field/acbcEngineUrl}/next",
                    NEXT_BODY,
                ),
            ],
            "LoopingOptions": LOOPING_OPTIONS,
        },
        # 6. Close-out block
        {"Type": "Block", "FlowID": "FL_9", "BlockID": "BL_closeout"},
    ],
    "Properties": {"Count": 9},
}

# ---------------------------------------------------------------------------
# Block List
# ---------------------------------------------------------------------------
def block_element(qid, skip_logic=None):
    el = {"Type": "Question", "QuestionID": qid}
    if skip_logic:
        el["SkipLogic"] = skip_logic

def skip_to_end(qid, choice_num, reason):
    return [{
        "SkipLogicID": 1,
        "ChoiceLocator": "q://{}/SelectableChoice/{}".format(qid, choice_num),
        "Condition": "Selected",
        "SkipToDestination": "ENDOFSURVEY",
        "Locator": "q://{}/SelectableChoice/{}".format(qid, choice_num),
        "Description": reason,
        "QuestionID": qid,
    }]

# Screener block — knock-out on disqualifying choices
def bel(qid, skip_logic=None):
    el = {"Type": "Question", "QuestionID": qid}
    if skip_logic:
        el["SkipLogic"] = skip_logic
    return el

consent_elements = [
    bel("QID_intro"),
    bel("QID_s1", skip_to_end("QID_s1", 7, "Role: Other — does not qualify")),
    bel("QID_s2", skip_to_end("QID_s2", 1, "Fewer than 100 employees — does not qualify")),
    bel("QID_s3", skip_to_end("QID_s3", 2, "No GRC platform in use — does not qualify")),
    bel("QID_s4", skip_to_end("QID_s4", 4, "Minimal involvement — does not qualify")),
]

profile_elements = [
    bel("QIDsegment"),
    bel("QIDframeworks"),
    bel("QIDprovider"),
    bel("QIDdeployment"),
    bel("QIDaicomfort"),  # profile-builder.js is in this question's QuestionJS
    bel("QIDtprm"),
    bel("QIDproductarea"),
    bel("QIDbudgetholder"),
    bel("QIDbudgetstructure"),
    bel("QIDdora"),
    bel("QIDmodules"),
    bel("QIDorgplacement"),
]

blocks = [
    {
        "Type": "Default",
        "SubType": "",
        "Description": "Consent and Screener",
        "ID": "BL_consent",
        "BlockElements": consent_elements,
        "Options": {
            "BlockLocking": "false",
            "RandomizeQuestions": "false",
            "Looping": "None",
            "LoopingOptions": None,
        },
    },
    {
        "Type": "Default",
        "SubType": "",
        "Description": "Buyer Profile",
        "ID": "BL_profile",
        "BlockElements": profile_elements,
        "Options": {
            "BlockLocking": "false",
            "RandomizeQuestions": "false",
            "Looping": "None",
            "LoopingOptions": None,
        },
    },
    {
        "Type": "Standard",
        "SubType": "",
        "Description": "ACBC Task — Loop and Merge x40, early end when acbcDone=true",
        "ID": "BL_acbc",
        "BlockElements": [bel("QID_acbc")],
        "Options": {
            "BlockLocking": "false",
            "RandomizeQuestions": "false",
            "Looping": "Loop&Merge",
            "LoopingOptions": LOOPING_OPTIONS,
        },
    },
    {
        "Type": "Default",
        "SubType": "",
        "Description": "Close-out",
        "ID": "BL_closeout",
        "BlockElements": [bel("QIDbcmpriority"), bel("QID_co1"), bel("QID_thanks")],
        "Options": {
            "BlockLocking": "false",
            "RandomizeQuestions": "false",
            "Looping": "None",
            "LoopingOptions": None,
        },
    },
]

# ---------------------------------------------------------------------------
# Question helpers
# ---------------------------------------------------------------------------
FORCE_OFF = {"Settings": {"ForceResponse": "OFF", "ForceResponseType": "ON", "Type": "None"}}

def sq(qid, payload):
    return {
        "SurveyID": SURVEY_ID,
        "Element": "SQ",
        "PrimaryAttribute": qid,
        "SecondaryAttribute": payload.get("QuestionText", "")[:80],
        "TertiaryAttribute": None,
        "Payload": {**payload, "QuestionID": qid,
                    "DataVisibility": {"Private": False, "Hidden": False}},
    }

def mc(qid, text, choices, selector="SAVR", subselector="TX", export_tag=None,
       extra_js=None):
    """choices: list of (display_label, recode_str_or_None)."""
    choices_dict = {}
    order = []
    for i, (label, recode) in enumerate(choices, 1):
        entry = {"Display": label}
        if recode is not None:
            entry["RecodeValue"] = str(recode)
        choices_dict[str(i)] = entry
        order.append(i)
    payload = {
        "QuestionText": text,
        "DefaultChoices": False,
        "DataExportTag": export_tag or qid,
        "QuestionType": "MC",
        "Selector": selector,
        "SubSelector": subselector,
        "Configuration": {"QuestionDescriptionOption": "UseText"},
        "QuestionDescription": text[:80],
        "Choices": choices_dict,
        "ChoiceOrder": order,
        "Validation": FORCE_OFF,
        "GradingData": [],
        "Language": [],
    }
    if extra_js:
        payload["QuestionJS"] = extra_js
    return sq(qid, payload)

def db(qid, html_text, export_tag=None):
    """Descriptive text / display block question."""
    return sq(qid, {
        "QuestionText": html_text,
        "DefaultChoices": False,
        "DataExportTag": export_tag or qid,
        "QuestionType": "DB",
        "Selector": "TB",
        "Configuration": {"QuestionDescriptionOption": "UseText"},
        "QuestionDescription": html_text[:80],
        "GradingData": [],
        "Language": [],
    })

# ---------------------------------------------------------------------------
# Question definitions
# ---------------------------------------------------------------------------

# Screener: Intro text
q_intro = db(
    "QID_intro",
    "<h2>Connected Risk Platform Preferences Study</h2>"
    "<p>Thank you for participating. This 15 to 20 minute survey explores how "
    "organizations evaluate and select platforms for managing third-party risk, "
    "cyber risk, and related governance. Your responses are confidential and used "
    "only for research.</p>"
    "<p><strong>Eligibility:</strong> This survey is for professionals involved in "
    "evaluating, selecting, or using third-party risk or cyber risk software at "
    "organizations with 100+ employees.</p>",
    export_tag="intro",
)

# Screener Q1: Role (cyber buying center). Knockout on "Other" (last choice).
# NOTE: if you reorder these, update the skip_to_end index for QID_s1 below.
q_s1 = mc(
    "QID_s1",
    "Which of the following best describes your primary role?",
    [
        ("Third-party or vendor risk (TPRM), incl. Head of Third-Party Risk", "1"),
        ("Cyber or information security risk (CISO, security engineer, risk officer)", "2"),
        ("Enterprise or operational risk (ERM, ORM, Chief Risk Officer)", "3"),
        ("GRC or compliance program owner", "4"),
        ("Procurement or vendor management", "5"),
        ("Finance or budget owner", "6"),
        ("Other (does not qualify)", None),
    ],
    export_tag="screener_role",
)

# Screener Q2: Company size
q_s2 = mc(
    "QID_s2",
    "How many employees does your organization have?",
    [
        ("Fewer than 100 employees (does not qualify)", None),
        ("100-499 employees", "2"),
        ("500-1,999 employees", "3"),
        ("2,000-9,999 employees", "4"),
        ("10,000+ employees", "5"),
    ],
    export_tag="screener_size",
)

# Screener Q3: Uses GRC platform
q_s3 = mc(
    "QID_s3",
    "Does your organization currently use a dedicated third-party risk or cyber risk platform?",
    [
        ("Yes, we have a dedicated third-party risk or cyber risk platform", "1"),
        ("No, we use spreadsheets or general-purpose tools (does not qualify)", None),
        ("We are currently evaluating platforms", "3"),
    ],
    export_tag="screener_grc",
)

# Screener Q4: Decision involvement
q_s4 = mc(
    "QID_s4",
    "Which best describes your involvement in GRC technology decisions at your organization?",
    [
        ("I am the final decision maker", "1"),
        ("I have strong influence on the decision", "2"),
        ("I participate in research and evaluation", "3"),
        ("Minimal involvement in these decisions (does not qualify)", None),
    ],
    export_tag="screener_involvement",
)

# Profile Q1: Segment
q_segment = mc(
    "QIDsegment",
    "Which best describes your organization?",
    [
        ("Small business (under 100 employees)", "1"),
        ("Mid-market (100-999 employees)", "2"),
        ("Enterprise (1,000-4,999 employees)", "3"),
        ("Large enterprise (5,000+ employees)", "4"),
    ],
    export_tag="profile_segment_raw",
)

# Profile Q2: Frameworks (multi-select)
q_frameworks = sq("QIDframeworks", {
    "QuestionText": "Which frameworks apply to your organization? "
                    "<em>Select all that apply.</em>",
    "DefaultChoices": False,
    "DataExportTag": "profile_frameworks_raw",
    "QuestionType": "MC",
    "Selector": "MAVR",
    "SubSelector": "TX",
    "Configuration": {"QuestionDescriptionOption": "UseText"},
    "QuestionDescription": "Which frameworks apply to your organization?",
    "Choices": {
        "1": {"Display": "SOC 2",                                       "RecodeValue": "SOC2"},
        "2": {"Display": "ISO 27001",                                   "RecodeValue": "ISO27001"},
        "3": {"Display": "NIST CSF",                                    "RecodeValue": "NIST_CSF"},
        "4": {"Display": "CIS Controls",                                "RecodeValue": "CIS"},
        "5": {"Display": "GDPR",                                        "RecodeValue": "GDPR"},
        "6": {"Display": "DORA (EU Digital Operational Resilience Act)","RecodeValue": "DORA"},
        "7": {"Display": "EU AI Act",                                   "RecodeValue": "EU_AI_Act"},
        "8": {"Display": "ISO 42001 (AI management)",                   "RecodeValue": "ISO42001"},
        "9": {"Display": "Other",                                       "RecodeValue": "Other"},
    },
    "ChoiceOrder": [1, 2, 3, 4, 5, 6, 7, 8, 9],
    "Validation": FORCE_OFF,
    "GradingData": [],
    "Language": [],
})

# Profile Q3: Current provider (MC + text entry for Other)
q_provider = sq("QIDprovider", {
    "QuestionText": "Which third-party risk or cyber risk solution does your organization primarily use today?",
    "DefaultChoices": False,
    "DataExportTag": "profile_provider_raw",
    "QuestionType": "MC",
    "Selector": "SAVR",
    "SubSelector": "TX",
    "Configuration": {"QuestionDescriptionOption": "UseText"},
    "QuestionDescription": "Which third-party risk or cyber risk solution does your organization primarily use today?",
    "Choices": {
        "1":  {"Display": "LogicGate"},
        "2":  {"Display": "Safe Security"},
        "3":  {"Display": "Vanta"},
        "4":  {"Display": "Drata"},
        "5":  {"Display": "OneTrust"},
        "6":  {"Display": "ServiceNow"},
        "7":  {"Display": "BitSight"},
        "8":  {"Display": "Black Kite"},
        "9":  {"Display": "Archer"},
        "10": {"Display": "IBM OpenPages"},
        "11": {"Display": "Credo AI"},
        "12": {"Display": "Certa"},
        "13": {"Display": "Workiva"},
        "14": {"Display": "Optro (AuditBoard)"},
        "15": {"Display": "Other (please specify)",
               "TextEntry": "true", "TextEntrySize": "Single"},
    },
    "ChoiceOrder": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    "Validation": FORCE_OFF,
    "GradingData": [],
    "Language": [],
})

# Profile Q4: Deployment preference
q_deployment = mc(
    "QIDdeployment",
    "What are your organization's deployment requirements?",
    [
        ("No special requirements (shared SaaS is fine)", "1"),
        ("Tenant-isolated cloud deployment", "2"),
        ("Customer-managed encryption keys (BYOK/CMK)", "3"),
        ("On-premises deployment required", "4"),
    ],
    export_tag="profile_deployment_raw",
)

# Profile Q5: AI comfort — profile-builder.js runs OnPageSubmit here
q_aicomfort = sq("QIDaicomfort", {
    "QuestionText": "How comfortable is your organization with AI acting autonomously "
                    "across risk and vendor workflows?",
    "DefaultChoices": False,
    "DataExportTag": "profile_aicomfort_raw",
    "QuestionType": "MC",
    "Selector": "SAVR",
    "SubSelector": "TX",
    "Configuration": {"QuestionDescriptionOption": "UseText"},
    "QuestionDescription": "AI autonomy comfort level",
    "Choices": {
        "1": {"Display": "AI should only assist; humans approve all actions",
              "RecodeValue": "1"},
        "2": {"Display": "AI can execute low-risk tasks with my oversight",
              "RecodeValue": "2"},
        "3": {"Display": "AI can handle routine tasks; I review exceptions",
              "RecodeValue": "3"},
        "4": {"Display": "AI should take significant action; I review outcomes",
              "RecodeValue": "4"},
        "5": {"Display": "AI should operate autonomously across all areas",
              "RecodeValue": "5"},
    },
    "ChoiceOrder": [1, 2, 3, 4, 5],
    "Validation": FORCE_OFF,
    "GradingData": [],
    "Language": [],
    "QuestionJS": profile_js,   # profile-builder.js: maps recodes → profile_ embedded data
})

# Profile Q6: TPRM active
q_tprm = mc(
    "QIDtprm",
    "Does your organization actively manage third-party vendor risk (TPRM) using a "
    "formal program or tool?",
    [
        ("Yes", "1"),
        ("No",  "2"),
    ],
    export_tag="profile_tprm_raw",
)

# Profile Q7: Product area
q_product_area = mc(
    "QIDproductarea",
    "Which module do you primarily evaluate or use?",
    [
        ("Third-Party Risk (TPRM)",          "1"),
        ("Cyber Risk Management",            "2"),
        ("AI Governance",                    "3"),
        ("Compliance / Controls",            "4"),
        ("More than one equally",            "5"),
    ],
    export_tag="profile_product_area_raw",
)

# Profile Q8: Budget holder (economic-buyer read, RQ 6)
q_budget_holder = mc(
    "QIDbudgetholder",
    "Who controls the budget for this purchase?",
    [
        ("I do",                                    "1"),
        ("A security or risk leader (CISO, CRO)",   "2"),
        ("Procurement",                             "3"),
        ("Finance or CFO",                          "4"),
        ("Split across multiple teams",             "5"),
        ("Do not know",                             "6"),
    ],
    export_tag="profile_budget_holder_raw",
)

# Profile Q10: Budget structure (the combine-vs-separate crux, RQ 6)
q_budget_structure = mc(
    "QIDbudgetstructure",
    "If your organization bought third-party risk and cyber risk capabilities, "
    "would they be funded from:",
    [
        ("One combined budget",       "1"),
        ("Two separate team budgets", "2"),
        ("Do not know",               "3"),
    ],
    export_tag="profile_budget_structure_raw",
)

# Profile Q11: Operational-resilience pressure (RQ 5; graded, de-anchored from DORA-only)
q_dora = mc(
    "QIDdora",
    "How much pressure is your organization under to prove operational resilience "
    "(keeping critical operations running through disruptions, outages, or cyber incidents)? "
    "This can come from regulation (for example DORA, US interagency Sound Practices, "
    "UK PRA/FCA, APRA CPS 230), from standards or customer requirements (for example "
    "ISO 22301), or from internal board and business-continuity mandates.",
    [
        ("Significant pressure, actively driving investment", "1"),
        ("Some pressure, on our radar",                       "2"),
        ("Little or none",                                    "3"),
        ("Do not know",                                       "4"),
    ],
    export_tag="profile_resilience_pressure_raw",
)

# Profile Q12: Modules owned today (buyer-type cells; multi-select)
q_modules = sq("QIDmodules", {
    "QuestionText": "Which of these does your organization run today? "
                    "<em>Select all that apply.</em>",
    "DefaultChoices": False,
    "DataExportTag": "profile_modules_raw",
    "QuestionType": "MC",
    "Selector": "MAVR",
    "SubSelector": "TX",
    "Configuration": {"QuestionDescriptionOption": "UseText"},
    "QuestionDescription": "Which modules does your organization run today?",
    "Choices": {
        "1": {"Display": "Third-party risk (TPRM)", "RecodeValue": "tprm"},
        "2": {"Display": "Cyber risk management",   "RecodeValue": "cyber"},
        "3": {"Display": "AI governance",           "RecodeValue": "ai_gov"},
        "4": {"Display": "None yet",                "RecodeValue": "none"},
    },
    "ChoiceOrder": [1, 2, 3, 4],
    "Validation": FORCE_OFF,
    "GradingData": [],
    "Language": [],
})

# Profile Q13: Org placement (silo structure)
q_org_placement = mc(
    "QIDorgplacement",
    "Where do your third-party-risk and cyber-risk functions report?",
    [
        ("Information security", "1"),
        ("Enterprise risk",      "2"),
        ("Compliance",           "3"),
        ("IT",                   "4"),
        ("Other or mixed",       "5"),
    ],
    export_tag="profile_org_placement_raw",
)

# ACBC Task — HTML template + full renderer JS
q_acbc = sq("QID_acbc", {
    "QuestionText": html_template,
    "DefaultChoices": False,
    "DataExportTag": "acbc_task",
    "QuestionType": "MC",
    "Selector": "SAVR",
    "SubSelector": "TX",
    "Configuration": {"QuestionDescriptionOption": "UseText"},
    "QuestionDescription": "GRC Platform Evaluation Task (ACBC — rendered by JS)",
    # One placeholder choice; grc-acbc-task.js hides Qualtrics native choices and
    # renders the real UI (BYO / Screening / Confirm / Tournament / Calibration).
    "Choices": {
        "1": {"Display": "[Task rendered by grc-acbc-task.js: do not modify]"},
    },
    "ChoiceOrder": [1],
    "Validation": FORCE_OFF,
    "GradingData": [],
    "Language": [],
    "QuestionJS": acbc_js,      # full grc-acbc-task.js renderer
})

# Close-out Q0: Business continuity priority (post-choice; recovers BIA/plans/exercises
# granularity without adding conjoint levels). Cross-tab against BCM attribute choices.
q_bcm_priority = mc(
    "QIDbcmpriority",
    "Thinking specifically about business continuity, which ONE capability would "
    "deliver the most value to your organization?",
    [
        ("Business impact analysis (identifying critical processes and what downtime would cost)", "1"),
        ("Continuity plan management (building and maintaining recovery plans)",                    "2"),
        ("Recovery testing and exercises (running drills to prove the plans actually work)",        "3"),
        ("Not sure, or none of these is a priority for us",                                         "4"),
    ],
    export_tag="profile_bcm_priority_raw",
)

# Close-out Q1: Industry firmographic
q_co1 = mc(
    "QID_co1",
    "What industry best describes your organization? <em>(Optional)</em>",
    [
        ("Financial Services / Banking",   "1"),
        ("Healthcare / Life Sciences",     "2"),
        ("Technology / SaaS",              "3"),
        ("Manufacturing / Industrial",     "4"),
        ("Retail / Consumer Goods",        "5"),
        ("Government / Public Sector",     "6"),
        ("Professional Services",          "7"),
        ("Other",                          "8"),
    ],
    export_tag="firmographic_industry",
)

# Close-out: Thank-you
q_thanks = db(
    "QID_thanks",
    "<h2>Thank you!</h2>"
    "<p>Your responses have been recorded. We appreciate your time and insights. "
    "This research will help inform how GRC platforms evolve to meet your needs.</p>",
    export_tag="thanks",
)

# ---------------------------------------------------------------------------
# Assemble QSF
# ---------------------------------------------------------------------------
qsf = {
    "SurveyEntry": {
        "SurveyID": SURVEY_ID,
        "SurveyName": "GRC Buyer Conjoint Study (UX1-275)",
        "SurveyDescription": (
            "Adaptive Choice-Based Conjoint (ACBC) for GRC buyer preferences. "
            "Q3 2026. UX1-275. Engine: moliver-UXR/grc-acbc-engine."
        ),
        "SurveyOwnerID": "UR_placeholder",
        "SurveyBrandID": "placeholder",
        "DivisionID": None,
        "SurveyLanguage": "EN",
        "SurveyActiveResponseSet": "RS_placeholder",
        "SurveyStatus": "Inactive",
        "SurveyStartDate": "0000-00-00 00:00:00",
        "SurveyExpirationDate": "0000-00-00 00:00:00",
        "SurveyCreationDate": "2026-06-24 00:00:00",
        "CreatorID": "UR_placeholder",
        "LastModified": "2026-06-24 00:00:00",
        "LastAccessed": "0000-00-00 00:00:00",
        "LastActivated": "0000-00-00 00:00:00",
        "Deleted": None,
    },
    "SurveyElements": [
        # BL — Block List
        {
            "SurveyID": SURVEY_ID,
            "Element": "BL",
            "PrimaryAttribute": "Survey Blocks",
            "SecondaryAttribute": None,
            "TertiaryAttribute": None,
            "Payload": blocks,
        },
        # FL — Survey Flow
        {
            "SurveyID": SURVEY_ID,
            "Element": "FL",
            "PrimaryAttribute": "Survey Flow",
            "SecondaryAttribute": None,
            "TertiaryAttribute": None,
            "Payload": survey_flow,
        },
        # SO — Survey Options
        {
            "SurveyID": SURVEY_ID,
            "Element": "SO",
            "PrimaryAttribute": "Survey Options",
            "SecondaryAttribute": None,
            "TertiaryAttribute": None,
            "Payload": {
                "BackButton": "false",
                "SaveAndContinue": "true",
                "SurveyProtection": "PublicSurvey",
                "BallotBoxStuffingPrevention": "false",
                "NoIndex": "Yes",
                "SecureResponseFiles": "true",
                "SurveyExpiration": None,
                "SurveyTermination": "DefaultMessage",
                "Header": "",
                "Footer": "",
                "ProgressBarDisplay": "Text",
                "PartialData": "+1 week",
                "PreviousButton": "",
                "NextButton": "Next »",
                "SkinLibrary": "Qualtrics",
                "SkinType": "MQ",
                "Skin": "minimal",
                "NewScoring": 1,
                "EOSMessage": "",
                "ShowExportTags": "false",
                "CollectGeoLocation": "false",
                "AnonymizeResponse": "No",
                "RefererCheck": "No",
                "PasswordProtection": "No",
                "ValidateMessage": "false",
                "InactiveSurvey": "DefaultMessage",
                "PartialDataCloseAfter": "LastActivity",
                "AvailableLanguages": {"EN": []},
            },
        },
        # QC (Question Count: 15 questions)
        {
            "SurveyID": SURVEY_ID,
            "Element": "QC",
            "PrimaryAttribute": "Survey Question Count",
            "SecondaryAttribute": "15",
            "TertiaryAttribute": None,
            "Payload": None,
        },
        # SQ — Individual questions
        q_intro,
        q_s1,
        q_s2,
        q_s3,
        q_s4,
        q_segment,
        q_frameworks,
        q_provider,
        q_deployment,
        q_aicomfort,
        q_tprm,
        q_product_area,
        q_budget_holder,
        q_budget_structure,
        q_dora,
        q_modules,
        q_org_placement,
        q_acbc,
        q_bcm_priority,
        q_co1,
        q_thanks,
    ],
}

# ---------------------------------------------------------------------------
# Write output
# ---------------------------------------------------------------------------
out_path = os.path.join(BASE, "grc-acbc-survey.qsf")
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(qsf, f, ensure_ascii=False, separators=(",", ":"))

size_kb = os.path.getsize(out_path) / 1024
print("Written: {}".format(out_path))
print("Size:    {:.1f} KB".format(size_kb))
print()
print("Questions embedded:")
print("  Screener:  QID_intro, QID_s1–s4 (4 knock-outs; role is the cyber buying center)")
print("  Profile:   QIDsegment, QIDframeworks, QIDprovider, QIDdeployment,")
print("             QIDaicomfort (profile-builder.js), QIDtprm, QIDproductarea,")
print("             QIDbudgetholder, QIDbudgetstructure, QIDdora, QIDmodules, QIDorgplacement")
print("  ACBC task: QID_acbc (grc-acbc-task.js + HTML template)")
print("  Close-out: QID_co1, QID_thanks")
print()
print("New profile embedded-data fields: profile_product_area, profile_budget_holder,")
print("  profile_budget_structure, profile_dora, profile_modules, profile_org_placement")
print("(Qualtrics-side only, not sent in the /init request body)")
print()
print("Manual steps after Qualtrics import:")
print("  1. Survey Flow > Embedded Data: set acbcEngineUrl to your deployed URL")
print("  2. Survey Flow > Embedded Data: update QID_* recode expressions to match")
print("     real Qualtrics QIDs shown after import")
print("  3. Survey Flow > LoopingBlock: verify iteration count = 40,")
print("     Early End condition: acbcDone = 'true'")
print("  4. Survey Options > Look & Feel > Page Transitions = None (ACBC block)")
print("  5. Test with static BYO JSON per fielding-guide.md Step 3a")
