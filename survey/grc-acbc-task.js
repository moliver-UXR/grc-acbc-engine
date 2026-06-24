/* grc-acbc-task.js
 * Paste into the "JavaScript" editor of the Qualtrics ACBC Task question.
 * OnLoad: reads acbcTaskJson embedded data, renders the correct UI.
 * OnSubmit: captures choice, writes to acbcChoice + acbcTaskId + acbcTaskType.
 */

Qualtrics.SurveyEngine.addOnload(function () {
  var self = this;

  // Piped text resolves at page-load time — safe to read synchronously.
  var rawTask = '${e://Field/acbcTaskJson}';
  if (!rawTask || rawTask === '${e://Field/acbcTaskJson}') {
    // Fallback: no task JSON available (preview / first load before init)
    document.getElementById('acbc-prompt').textContent =
      'Loading your survey — please wait...';
    return;
  }

  var task;
  try { task = JSON.parse(rawTask); } catch (e) {
    document.getElementById('acbc-prompt').textContent =
      'Survey configuration error. Please contact the study team.';
    return;
  }

  console.log('[acbc] addOnload parsed task:', task.taskType, 'taskId:', task.taskId);

  // Write prompt
  document.getElementById('acbc-prompt').textContent = task.prompt;

  // Hide all containers, then show the right one
  var containers = [
    'acbc-byo-container',
    'acbc-screening-container',
    'acbc-confirm-container',
    'acbc-tournament-container',
    'acbc-calibration-container',
  ];
  containers.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  switch (task.taskType) {
    case 'byo':         renderBYO(task); break;
    case 'screening':   renderScreening(task); break;
    case 'confirm':     renderConfirm(task); break;
    case 'tournament':  renderTournament(task); break;
    case 'calibration': renderCalibration(task); break;
  }
});

Qualtrics.SurveyEngine.addOnPageSubmit(function () {
  var rawTask = '${e://Field/acbcTaskJson}';
  if (!rawTask) return;
  var task;
  try { task = JSON.parse(rawTask); } catch (e) { return; }

  var choice = collectChoice(task);
  console.log('[acbc] addOnPageSubmit choice:', choice);
  Qualtrics.SurveyEngine.setEmbeddedData('acbcChoice', JSON.stringify(choice));
  Qualtrics.SurveyEngine.setEmbeddedData('acbcTaskId', task.taskId);
  Qualtrics.SurveyEngine.setEmbeddedData('acbcTaskType', task.taskType);
  // Log full task for provenance (mirrors Leeper's traits logging pattern)
  Qualtrics.SurveyEngine.setEmbeddedData('acbcLastTaskFull', rawTask);
});

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function renderBYO(task) {
  console.log('[acbc] renderBYO', (task.attributes || []).length, 'attributes');
  var container = document.getElementById('acbc-byo-container');
  container.style.display = 'block';
  container.innerHTML = (task.attributes || []).map(function (attr) {
    var options = attr.levels.map(function (level) {
      return '<option value="' + esc(level.id) + '">' + esc(level.label) + '</option>';
    }).join('');
    return (
      '<div style="margin-bottom:1rem;">' +
        '<label style="font-weight:600; display:block; margin-bottom:0.4rem;">' +
          esc(attr.label) +
        '</label>' +
        '<select id="byo-' + esc(attr.id) + '" ' +
                'data-attr-id="' + esc(attr.id) + '" ' +
                'style="padding:0.4rem 0.8rem; border:1px solid #ccc; border-radius:4px; width:100%; max-width:340px;">' +
          '<option value="">-- Select --</option>' +
          options +
        '</select>' +
      '</div>'
    );
  }).join('');
}

function renderScreening(task) {
  console.log('[acbc] renderScreening', (task.concepts || []).length, 'concepts');
  var container = document.getElementById('acbc-screening-container');
  container.style.removeProperty('display');
  container.style.display = 'flex';
  container.innerHTML = (task.concepts || []).map(function (concept) {
    var rows = (concept.attributes || []).map(function (a) {
      return (
        '<div style="display:flex; justify-content:space-between; padding:0.35rem 0; ' +
                    'border-bottom:1px solid #f0f0f0;">' +
          '<span style="color:#666; font-size:0.9em;">' + esc(a.label) + '</span>' +
          '<span style="font-weight:600; font-size:0.9em;">' + esc(a.level) + '</span>' +
        '</div>'
      );
    }).join('');
    return (
      '<div data-concept-id="' + esc(concept.id) + '" ' +
           'style="flex:1; min-width:220px; border:1px solid #ddd; border-radius:8px; ' +
                  'overflow:hidden; background:#fff;">' +
        '<div style="padding:0.75rem 1rem; background:#2d5fa8; color:#fff; font-weight:600;">' +
          'Platform Option' +
        '</div>' +
        '<div style="padding:0.75rem 1rem;">' + rows + '</div>' +
        '<div style="padding:0.75rem 1rem; background:#f8f9fa; display:flex; gap:0.75rem;">' +
          '<label style="flex:1; text-align:center; cursor:pointer;">' +
            '<input type="radio" name="screen-' + esc(concept.id) + '" value="possible" ' +
                   'style="margin-right:0.4rem;" />' +
            'Possible' +
          '</label>' +
          '<label style="flex:1; text-align:center; cursor:pointer;">' +
            '<input type="radio" name="screen-' + esc(concept.id) + '" value="not-possible" ' +
                   'style="margin-right:0.4rem;" />' +
            'Not possible' +
          '</label>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}

function renderConfirm(task) {
  var container = document.getElementById('acbc-confirm-container');
  container.style.display = 'block';
  var rule = task.candidateRule;
  if (!rule) return;
  var msg = rule.kind === 'mustHave'
    ? 'It appears <strong>' + esc(rule.attributeLabel) +
      ': ' + esc(rule.levelLabel) + '</strong> is a must-have for you. Is that right?'
    : 'It appears <strong>' + esc(rule.attributeLabel) +
      ': ' + esc(rule.levelLabel) + '</strong> is a deal-breaker for you. Is that right?';
  document.getElementById('acbc-confirm-message').innerHTML = msg;
}

function renderTournament(task) {
  console.log('[acbc] renderTournament', (task.concepts || []).length, 'concepts');
  var container = document.getElementById('acbc-tournament-container');
  container.style.display = 'block';
  var concepts = task.concepts || [];
  var grayed = task.grayedAttributes || [];
  var allAttrs = concepts.length ? concepts[0].attributes : [];

  // Build table header
  var headerCells = concepts.map(function (_, i) {
    return '<th style="padding:0.6rem 1rem; background:#2d5fa8; color:#fff;">Option ' +
      (i + 1) + '</th>';
  }).join('');

  // Build attribute rows
  var attrRows = allAttrs.map(function (attr) {
    var isGrayed = grayed.indexOf(attr.id) >= 0;
    var rowStyle = isGrayed
      ? 'color:#999; font-style:italic;'
      : '';
    var cells = concepts.map(function (c) {
      var level = (c.attributes.filter(function (a) { return a.id === attr.id; })[0] || {}).level || '—';
      return '<td style="padding:0.6rem 1rem; border-bottom:1px solid #eee; ' +
        rowStyle + '">' + esc(level) + '</td>';
    }).join('');
    return (
      '<tr>' +
        '<th style="padding:0.6rem 1rem; text-align:left; background:#f8f9fa; ' +
             'border-bottom:1px solid #eee; ' + rowStyle + '">' +
          esc(attr.label) +
        '</th>' +
        cells +
      '</tr>'
    );
  }).join('');

  document.getElementById('acbc-tournament-table').innerHTML =
    '<thead><tr>' +
      '<th style="padding:0.6rem 1rem; background:#2d5fa8; color:#fff;">Attribute</th>' +
      headerCells +
    '</tr></thead><tbody>' + attrRows + '</tbody>';

  // Radio buttons
  var radios = concepts.map(function (concept, i) {
    return (
      '<label style="cursor:pointer; padding:0.6rem 1.2rem; border:2px solid #ddd; ' +
             'border-radius:6px; display:flex; align-items:center; gap:0.5rem;">' +
        '<input type="radio" name="acbc-tournament-radio" value="' + esc(concept.id) + '" />' +
        'Choose Option ' + (i + 1) +
      '</label>'
    );
  }).join('');
  var noneRadio =
    '<label style="cursor:pointer; padding:0.6rem 1.2rem; border:2px solid #ddd; ' +
           'border-radius:6px; display:flex; align-items:center; gap:0.5rem;">' +
      '<input type="radio" name="acbc-tournament-radio" value="none" />' +
      'None of these' +
    '</label>';
  document.getElementById('acbc-tournament-choices').innerHTML = radios + noneRadio;
}

function renderCalibration(task) {
  console.log('[acbc] renderCalibration winner concept id:', task.winnerConcept ? task.winnerConcept.id : 'none');
  var container = document.getElementById('acbc-calibration-container');
  container.style.display = 'block';
  var winner = task.winnerConcept;
  if (winner) {
    var rows = (winner.attributes || []).map(function (a) {
      return (
        '<div style="display:flex; justify-content:space-between; padding:0.35rem 0; ' +
                    'border-bottom:1px solid #f0f0f0;">' +
          '<span style="color:#666;">' + esc(a.label) + '</span>' +
          '<span style="font-weight:600;">' + esc(a.level) + '</span>' +
        '</div>'
      );
    }).join('');
    document.getElementById('acbc-calibration-concept').innerHTML =
      '<div style="border:1px solid #ddd; border-radius:8px; overflow:hidden;">' +
        '<div style="padding:0.75rem 1rem; background:#2d5fa8; color:#fff; font-weight:600;">' +
          'Your Best-Matched Platform' +
        '</div>' +
        '<div style="padding:0.75rem 1rem;">' + rows + '</div>' +
      '</div>';
  }
  var scaleLabels = [
    '1 — Definitely would not purchase',
    '2', '3', '4',
    '5 — Definitely would purchase',
  ];
  var radios = scaleLabels.map(function (label, i) {
    return (
      '<label style="cursor:pointer; flex:1; text-align:center; padding:0.5rem; ' +
             'border:2px solid #ddd; border-radius:6px; font-size:0.85em;">' +
        '<input type="radio" name="acbc-calibration-radio" value="' + (i + 1) + '" ' +
               'style="display:block; margin:0 auto 0.3rem;" />' +
        esc(label) +
      '</label>'
    );
  }).join('');
  document.getElementById('acbc-calibration-scale').innerHTML = radios;
}

// ---------------------------------------------------------------------------
// Choice collector — called OnSubmit
// ---------------------------------------------------------------------------

function collectChoice(task) {
  if (task.taskType === 'byo') {
    var choices = {};
    var selects = document.querySelectorAll('#acbc-byo-container select');
    selects.forEach(function (sel) {
      choices[sel.getAttribute('data-attr-id')] = sel.value;
    });
    return choices;
  }
  if (task.taskType === 'screening') {
    var choices = {};
    (task.concepts || []).forEach(function (concept) {
      var checked = document.querySelector(
        'input[name="screen-' + concept.id + '"]:checked'
      );
      if (checked) choices[concept.id] = checked.value;
    });
    return choices;
  }
  if (task.taskType === 'confirm') {
    var checked = document.querySelector('input[name="acbc-confirm-radio"]:checked');
    return { confirm_decision: checked ? checked.value : '' };
  }
  if (task.taskType === 'tournament') {
    var checked = document.querySelector('input[name="acbc-tournament-radio"]:checked');
    return { tournament_choice: checked ? checked.value : '' };
  }
  if (task.taskType === 'calibration') {
    var checked = document.querySelector('input[name="acbc-calibration-radio"]:checked');
    return { purchase_intent: checked ? checked.value : '' };
  }
  return {};
}

// ---------------------------------------------------------------------------
// XSS-safe escape (Qualtrics renders innerHTML directly)
// ---------------------------------------------------------------------------

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
