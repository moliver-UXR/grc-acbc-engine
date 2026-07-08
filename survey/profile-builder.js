/* profile-builder.js
 * Paste into OnSubmit for the last profile question (e.g., QID_ai_comfort).
 * Reads answered profile questions and writes structured Embedded Data fields
 * consumed by the /init Web Service call.
 *
 * Replace QID_XXX with actual Qualtrics question IDs.
 * Recode values are set on each question's answer choices in Qualtrics.
 */

Qualtrics.SurveyEngine.addOnPageSubmit(function () {
  // Segment — recode: 1=smb, 2=midmarket, 3=enterprise, 4=large_enterprise
  var segmentMap = { '1': 'smb', '2': 'midmarket', '3': 'enterprise', '4': 'large_enterprise' };
  var segmentRaw = Qualtrics.SurveyEngine.getEmbeddedData('QID_segment_recode');
  Qualtrics.SurveyEngine.setEmbeddedData(
    'profile_segment',
    segmentMap[segmentRaw] || segmentRaw || ''
  );

  // Current provider — free text (QID_provider ChoiceTextEntryValue)
  var provider = Qualtrics.SurveyEngine.getEmbeddedData('QID_provider_text');
  Qualtrics.SurveyEngine.setEmbeddedData('profile_currentProvider', provider || '');

  // Regulatory frameworks — multi-select recodes, pipe-delimited
  // Set on QID_frameworks via SelectedChoicesRecode in Survey Flow
  var frameworks = Qualtrics.SurveyEngine.getEmbeddedData('QID_frameworks_recodes') || '';
  // Convert "SOX|ISO27001|SOC2" to JSON array string
  var frameworkList = frameworks.split('|').filter(function (f) { return f.length > 0; });
  Qualtrics.SurveyEngine.setEmbeddedData(
    'profile_frameworks',
    JSON.stringify(frameworkList)
  );

  // Deployment preference — recode: 1=shared_saas, 2=tenant_isolated, 3=cmk, 4=on_prem
  var deployMap = {
    '1': 'shared_saas', '2': 'tenant_isolated',
    '3': 'cmk', '4': 'on_prem',
  };
  var deployRaw = Qualtrics.SurveyEngine.getEmbeddedData('QID_deployment_recode');
  Qualtrics.SurveyEngine.setEmbeddedData(
    'profile_deploymentPref',
    deployMap[deployRaw] || deployRaw || ''
  );

  // AI comfort — recode maps to ai_autonomy level IDs
  var aiMap = {
    '1': 'zero_ai',
    '2': 'ai_suggests',
    '3': 'ai_executes_approved',
    '4': 'ai_auto_spot',
    '5': 'fully_auto',
  };
  var aiRaw = Qualtrics.SurveyEngine.getEmbeddedData('QID_ai_comfort_recode');
  Qualtrics.SurveyEngine.setEmbeddedData(
    'profile_aiComfort',
    aiMap[aiRaw] || aiRaw || ''
  );

  // TPRM active — recode: 1=yes, 2=no
  var tprmRaw = Qualtrics.SurveyEngine.getEmbeddedData('QID_tprm_recode');
  Qualtrics.SurveyEngine.setEmbeddedData('profile_tprmActive', tprmRaw === '1' ? 'yes' : 'no');

  // Product area, recode: 1=controls_sox, 2=internal_audit, 3=tprm, 4=enterprise_risk, 5=compliance
  // Qualtrics-side profile field only; not sent to the engine /init request.
  var productAreaMap = {
    '1': 'controls_sox',
    '2': 'internal_audit',
    '3': 'tprm',
    '4': 'enterprise_risk',
    '5': 'compliance',
  };
  var productAreaRaw = Qualtrics.SurveyEngine.getEmbeddedData('QID_product_area_recode');
  Qualtrics.SurveyEngine.setEmbeddedData(
    'profile_product_area',
    productAreaMap[productAreaRaw] || productAreaRaw || ''
  );

  // Time-to-value importance, recode: 1=not_important, 2=somewhat_important,
  // 3=important, 4=critical_under_90_days
  // Qualtrics-side profile field only; not sent to the engine /init request.
  var ttvImportanceMap = {
    '1': 'not_important',
    '2': 'somewhat_important',
    '3': 'important',
    '4': 'critical_under_90_days',
  };
  var ttvImportanceRaw = Qualtrics.SurveyEngine.getEmbeddedData('QID_ttv_importance_recode');
  Qualtrics.SurveyEngine.setEmbeddedData(
    'profile_ttv_importance',
    ttvImportanceMap[ttvImportanceRaw] || ttvImportanceRaw || ''
  );

  // Log the complete profile so developers can inspect all 8 fields in the browser console.
  console.log('[profile] fields written:', {
    profile_segment: Qualtrics.SurveyEngine.getEmbeddedData('profile_segment'),
    profile_currentProvider: Qualtrics.SurveyEngine.getEmbeddedData('profile_currentProvider'),
    profile_frameworks: Qualtrics.SurveyEngine.getEmbeddedData('profile_frameworks'),
    profile_deploymentPref: Qualtrics.SurveyEngine.getEmbeddedData('profile_deploymentPref'),
    profile_aiComfort: Qualtrics.SurveyEngine.getEmbeddedData('profile_aiComfort'),
    profile_tprmActive: Qualtrics.SurveyEngine.getEmbeddedData('profile_tprmActive'),
    profile_product_area: Qualtrics.SurveyEngine.getEmbeddedData('profile_product_area'),
    profile_ttv_importance: Qualtrics.SurveyEngine.getEmbeddedData('profile_ttv_importance'),
  });
});
