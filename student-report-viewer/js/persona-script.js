// ============================================
// Student Persona App - Frontend Logic
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const selectionPage = document.getElementById('selection-page');
  const profilePage = document.getElementById('profile-page');
  const studentsGrid = document.getElementById('students-grid');
  const studentSearch = document.getElementById('student-search');
  const backButton = document.getElementById('back-button');

  // State
  let students = [];
  let currentPersona = null;
  let currentStudentName = null;
  let learningProfiles = {};

  // Initialize
  init();

  async function init() {
    await loadLearningProfiles();
    await loadStudents();

    // Check URL for student parameter
    const urlParams = new URLSearchParams(window.location.search);
    const studentParam = urlParams.get('student');
    if (studentParam) {
      // Auto-load the student persona
      loadStudentPersona(decodeURIComponent(studentParam));
    }
  }

  // Load learning profiles for the shift explorer
  async function loadLearningProfiles() {
    try {
      const response = await fetch('/api/learning-profiles');
      if (response.ok) {
        learningProfiles = await response.json();
      }
    } catch (error) {
      console.error('Error loading learning profiles:', error);
    }
  }

  // Load students list
  async function loadStudents() {
    try {
      const response = await fetch('/api/students');
      if (response.ok) {
        students = await response.json();
        renderStudentsGrid(students);
      }
    } catch (error) {
      console.error('Error loading students:', error);
      studentsGrid.innerHTML = '<p style="color: var(--danger);">Error loading students. Please try again.</p>';
    }
  }

  // Render students grid
  function renderStudentsGrid(studentsToShow) {
    if (studentsToShow.length === 0) {
      studentsGrid.innerHTML = '<p class="no-data">No students found.</p>';
      return;
    }

    studentsGrid.innerHTML = studentsToShow.map(student => {
      const initials = student.split(' ')
        .filter(word => word.length > 0)
        .map(word => word[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

      return `
        <div class="student-card" data-student="${encodeURIComponent(student)}">
          <div class="student-avatar">${initials}</div>
          <span class="student-name">${student}</span>
        </div>
      `;
    }).join('');

    // Add click handlers
    document.querySelectorAll('.student-card').forEach(card => {
      card.addEventListener('click', () => {
        const studentName = decodeURIComponent(card.dataset.student);
        loadStudentPersona(studentName);
      });
    });
  }

  // Search functionality
  studentSearch.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const filtered = students.filter(s => s.toLowerCase().includes(query));
    renderStudentsGrid(filtered);
  });

  // Back button - go back to report viewer with same student
  backButton.addEventListener('click', () => {
    if (currentStudentName) {
      // Go back to report viewer with the student pre-selected
      window.location.href = `index.html?student=${encodeURIComponent(currentStudentName)}`;
    } else {
      window.location.href = 'index.html';
    }
  });

  // Back to Reports link (on selection page) - also preserve student if one was selected
  const backToReportsLink = document.getElementById('back-to-reports');
  if (backToReportsLink) {
    backToReportsLink.addEventListener('click', (e) => {
      e.preventDefault();
      const urlParams = new URLSearchParams(window.location.search);
      const studentParam = urlParams.get('student');
      if (studentParam) {
        window.location.href = `index.html?student=${encodeURIComponent(studentParam)}`;
      } else {
        window.location.href = 'index.html';
      }
    });
  }

  // Load student persona
  async function loadStudentPersona(studentName) {
    currentStudentName = studentName;

    // Show profile page with loading state
    showPage('profile');

    // Update URL
    window.history.replaceState({}, '', `?student=${encodeURIComponent(studentName)}`);

    try {
      const response = await fetch(`/api/student-persona/${encodeURIComponent(studentName)}`);
      if (response.ok) {
        const data = await response.json();
        currentPersona = data.persona;
        renderProfile(studentName, data.persona);
      } else {
        throw new Error('Failed to load persona');
      }
    } catch (error) {
      console.error('Error loading persona:', error);
      document.getElementById('profile-header').innerHTML = `
        <div style="text-align: center; padding: 2rem;">
          <p style="color: var(--danger);">Error loading student data. Please try again.</p>
        </div>
      `;
    }
  }

  // Show page
  function showPage(page) {
    selectionPage.classList.remove('active');
    profilePage.classList.remove('active');

    if (page === 'selection') {
      selectionPage.classList.add('active');
    } else {
      profilePage.classList.add('active');
    }
  }

  // Render profile
  function renderProfile(studentName, persona) {
    // Header
    const initials = studentName.split(' ')
      .filter(word => word.length > 0)
      .map(word => word[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    document.getElementById('profile-avatar').textContent = initials;
    document.getElementById('student-name').textContent = studentName;
    document.getElementById('total-reports').textContent = `${persona.totalReports} Reports`;
    document.getElementById('subjects-count').textContent = `${Object.keys(persona.subjectsCount || {}).length} Subjects`;

    const tierBadge = document.getElementById('performance-tier');
    tierBadge.textContent = persona.performanceTier.tierName;
    tierBadge.style.background = persona.performanceTier.tierColor;
    tierBadge.style.color = 'white';

    // Set header quiz button link
    const headerQuizBtn = document.getElementById('header-quiz-btn');
    if (headerQuizBtn) {
      headerQuizBtn.href = `personality-quiz.html?student=${encodeURIComponent(studentName)}`;
    }

    // Render all sections (in new narrative order)
    renderHonestAssessment(persona.performanceTier);
    renderLearningProfile(persona.learningProfile);
    renderPersonalityProfile(persona.personalityProfile);
    renderPersonaType(persona.personaType);
    renderGapsAnalysis(persona.gapsAnalysis);
    renderPerformanceSkills(persona.performanceTier, persona.skillProfile);
    renderAcademicOrientation(persona.academicOrientation);
    renderCareerMatches(persona.careerMatches, persona.personalityProfile);
    renderProfileSelector(persona.learningProfile);

    // Load SQLite-backed sections
    loadTimeline(studentName);
    loadReinforcement(studentName);
    loadDesiredPersona(studentName);
  }

  // Render Academic Orientation
  function renderAcademicOrientation(orientation) {
    const container = document.getElementById('orientation-cards');

    if (!orientation.primary) {
      container.innerHTML = '<p class="no-data">Not enough data to determine academic orientation.</p>';
      return;
    }

    let html = '';

    // Primary orientation
    html += `
      <div class="orientation-card primary">
        <div class="orientation-header">
          <span class="orientation-icon">${orientation.primary.icon}</span>
          <span class="orientation-name">${orientation.primary.name}</span>
          <span class="orientation-tag">Primary</span>
        </div>
        <div class="orientation-stats">
          <span>Avg Rating: ${orientation.primary.avgRating}/5</span>
          <span>${orientation.primary.totalReports} sessions</span>
        </div>
        <div class="orientation-subjects">
          ${orientation.primary.subjects.slice(0, 3).map(s => s.name).join(', ')}
        </div>
      </div>
    `;

    // Secondary orientation
    if (orientation.secondary) {
      html += `
        <div class="orientation-card secondary">
          <div class="orientation-header">
            <span class="orientation-icon">${orientation.secondary.icon}</span>
            <span class="orientation-name">${orientation.secondary.name}</span>
            <span class="orientation-tag secondary">Secondary</span>
          </div>
          <div class="orientation-stats">
            <span>Avg Rating: ${orientation.secondary.avgRating}/5</span>
            <span>${orientation.secondary.totalReports} sessions</span>
          </div>
          <div class="orientation-subjects">
            ${orientation.secondary.subjects.slice(0, 3).map(s => s.name).join(', ')}
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  }

  // Render Learning Profile
  function renderLearningProfile(profile) {
    document.getElementById('profile-emoji').textContent = profile.emoji;
    document.getElementById('profile-name').textContent = profile.name;
    document.getElementById('profile-description').textContent = profile.description;
    document.getElementById('ideal-environment').textContent = profile.idealEnvironment;

    // Traits
    const traitsContainer = document.getElementById('profile-traits');
    traitsContainer.innerHTML = profile.traits.map(trait =>
      `<span class="trait-badge">${trait}</span>`
    ).join('');

    // Metrics
    const metricsGrid = document.getElementById('metrics-grid');
    const metrics = profile.metricsBreakdown;
    const metricInfo = {
      attention: { icon: '👁️', label: 'Attention', desc: 'Focus during class' },
      retention: { icon: '🧠', label: 'Retention', desc: 'Remembering lessons' },
      comprehension: { icon: '💡', label: 'Comprehension', desc: 'Understanding content' },
      behavior: { icon: '🎯', label: 'Behavior', desc: 'Classroom conduct' },
      handwriting: { icon: '✍️', label: 'Written Expression', desc: 'Writing quality' },
      conversation: { icon: '💬', label: 'Conversation', desc: 'Speaking ability' }
    };

    metricsGrid.innerHTML = Object.entries(metrics).map(([key, value]) => {
      const info = metricInfo[key];
      const percentage = (value / 5) * 100;
      const color = value >= 4 ? '#10b981' : value >= 3 ? '#f59e0b' : '#ef4444';
      const label = value >= 4 ? 'Good' : value >= 3 ? 'Needs work' : 'Low';

      return `
        <div class="metric-card" title="${info.desc}">
          <div class="metric-icon">${info.icon}</div>
          <div class="metric-label">${info.label}</div>
          <div class="metric-value" style="color: ${color}">${value.toFixed(1)}<span style="font-size: 0.7rem; color: #999;"> / 5</span></div>
          <div class="metric-bar">
            <div class="metric-fill" style="width: ${percentage}%; background: ${color}"></div>
          </div>
          <div style="font-size: 0.7rem; color: ${color}; margin-top: 2px;">${label}</div>
        </div>
      `;
    }).join('');
  }

  // Render Honest Assessment
  function renderHonestAssessment(performanceTier) {
    const container = document.getElementById('honest-assessment');
    const tierExplanations = {
      'Exceptional Progress': 'Consistently performing above expectations across all areas.',
      'Solid Progress': 'Meeting expectations with a strong foundation. Some areas can still improve.',
      'Developing': 'Making progress but several areas need consistent practice to reach proficiency.',
      'Emerging': 'Early stages of development. Needs significant support and targeted practice.',
      'Struggling': 'Facing challenges across multiple areas. Intensive support recommended.'
    };
    container.innerHTML = `
      <div class="assessment-tier">
        <span class="tier-label" style="color: ${performanceTier.tierColor}">${performanceTier.tierName}</span>
      </div>
      <p class="assessment-text">${performanceTier.honestAssessment}</p>
      <p style="font-size: 0.85rem; color: #888; margin-top: 8px;"><em>${tierExplanations[performanceTier.tierName] || ''}</em></p>
    `;
  }

  // Render Gaps Analysis
  function renderGapsAnalysis(gapsAnalysis) {
    const container = document.getElementById('gaps-container');

    const allGaps = [...(gapsAnalysis.metricGaps || []), ...(gapsAnalysis.skillGaps || [])];

    if (allGaps.length === 0) {
      container.innerHTML = `
        <div class="no-gaps">
          <p>No significant gaps identified - keep up the great work!</p>
        </div>
      `;
      return;
    }

    const severityLabels = {
      moderate: 'Slightly Below (3.5–4.0)',
      significant: 'Clearly Below (3.0–3.5)',
      critical: 'Far Below (under 3.0)'
    };

    container.innerHTML = allGaps.map(gap => `
      <div class="gap-item ${gap.severity}">
        <div class="gap-header">
          <span class="gap-area">${gap.area}</span>
          <span class="gap-severity ${gap.severity}">${severityLabels[gap.severity] || gap.severity}</span>
        </div>
        <div class="gap-details">
          ${gap.currentLevel ? `<div class="gap-level">Current: ${gap.currentLevel} → Target: ${gap.targetLevel}</div>` : ''}
          <div class="gap-impact">${gap.impact}</div>
        </div>
      </div>
    `).join('');
  }

  // Render Performance & Skills
  function renderPerformanceSkills(performanceTier, skillProfile) {
    // Stats
    document.getElementById('sf-met-rate').textContent =
      performanceTier.skillFocusMetRate !== null ? `${performanceTier.skillFocusMetRate}%` : 'N/A';
    document.getElementById('avg-test-score').textContent =
      performanceTier.avgTestScore !== null ? `${performanceTier.avgTestScore}%` : 'N/A';
    document.getElementById('metrics-avg').textContent = performanceTier.metricsAverage.toFixed(1);
    document.getElementById('lowest-metric').textContent = performanceTier.lowestMetric.toFixed(1);

    // Strengths
    const strengthsList = document.getElementById('strengths-list');
    if (skillProfile.strengths.length === 0) {
      strengthsList.innerHTML = '<p class="no-data">Building strengths - keep practicing!</p>';
    } else {
      strengthsList.innerHTML = skillProfile.strengths.map(s => `
        <div class="skill-item strength">
          <span>${s.skill}</span>
          <div class="skill-meta">${s.successRate}% success (${s.instances} times)</div>
        </div>
      `).join('');
    }

    // Weaknesses
    const weaknessesList = document.getElementById('weaknesses-list');
    if (skillProfile.weaknesses.length === 0) {
      weaknessesList.innerHTML = '<p class="no-data">No recurring weaknesses - excellent!</p>';
    } else {
      const trendExplanations = {
        worsening: 'Getting worse — appeared more in recent reports than earlier ones',
        stable: 'Not changing — has been consistent across reports',
        improving: 'Getting better — appeared less in recent reports'
      };
      const trendIcons = { worsening: '📉', stable: '➡️', improving: '📈' };

      weaknessesList.innerHTML = skillProfile.weaknesses.map(w => `
        <div class="skill-item weakness has-popup">
          <span>⚠️ ${w.skill}</span>
          <div class="skill-meta">${w.frequency}x reported · ${trendIcons[w.trend] || ''} ${w.trend}</div>
          <div class="weakness-popup">
            <div class="popup-title">${w.skill}</div>
            <div class="popup-row"><strong>How often:</strong> Mentioned ${w.frequency} time${w.frequency > 1 ? 's' : ''} across reports</div>
            <div class="popup-row"><strong>Trend:</strong> ${trendExplanations[w.trend] || w.trend}</div>
            <div class="popup-row"><strong>What this means:</strong> This is a recurring area where the student struggles and needs focused practice</div>
          </div>
        </div>
      `).join('');
    }
  }

  // Render Personality Profile
  function renderPersonalityProfile(personalityProfile) {
    const loadingEl = document.getElementById('personality-loading');
    const insufficientEl = document.getElementById('personality-insufficient');
    const profileEl = document.getElementById('personality-profile');
    const quizBtn = document.getElementById('take-quiz-btn');
    const quizHint = document.getElementById('quiz-hint');

    loadingEl.classList.add('hidden');

    if (!personalityProfile) {
      insufficientEl.classList.remove('hidden');
      profileEl.classList.add('hidden');
      return;
    }

    insufficientEl.classList.add('hidden');
    profileEl.classList.remove('hidden');

    // Render personality code
    const codeDisplay = document.getElementById('personality-code-display');
    codeDisplay.innerHTML = personalityProfile.code.split('').map(letter => {
      const isBalanced = letter === letter.toLowerCase();
      return `<div class="personality-code-letter ${isBalanced ? 'balanced' : ''}">${letter.toUpperCase()}</div>`;
    }).join('');

    // Render confidence
    document.getElementById('personality-confidence').textContent =
      Math.round(personalityProfile.confidence * 100) + '%';

    // Render personality code legend
    const codeLegend = document.getElementById('personality-code-legend');
    const dimLetterMap = {
      'E': { left: 'Breadth (Explores many topics)', right: 'Depth (Focuses deeply)', dim: 'Exploration' },
      'S': { left: 'Team Player (Learns with others)', right: 'Solo Learner (Prefers alone)', dim: 'Social Style' },
      'P': { left: 'Hands-on (Learns by doing)', right: 'Conceptual (Learns by thinking)', dim: 'Processing' },
      'R': { left: 'Routine (Likes structure)', right: 'Adventure (Likes variety)', dim: 'Novelty' },
      'A': { left: 'Thinker (Plans first)', right: 'Doer (Acts first)', dim: 'Action Style' },
      'D': { left: 'Detail-oriented', right: 'Big-picture thinker', dim: 'Focus Scope' }
    };

    if (codeLegend) {
      const codeLetters = personalityProfile.code.toUpperCase().split('');
      const isBalanced = personalityProfile.code.split('').map(c => c === c.toLowerCase());
      codeLegend.innerHTML = `<strong>Reading the code "${personalityProfile.code}":</strong><br>` +
        codeLetters.map((letter, i) => {
          const info = dimLetterMap[letter];
          if (!info) return '';
          const detail = personalityProfile.codeDetails?.[i];
          const poleDesc = isBalanced[i] ? 'Balanced between both' :
            (detail?.pole === 'left' ? info.left : info.right);
          return `<strong>${letter}</strong> = ${info.dim}: ${poleDesc}${isBalanced[i] ? ' (lowercase = balanced)' : ''}`;
        }).join(' &bull; ');
    }

    // Render dimension sliders with plain-English explanations
    const dimensionsContainer = document.getElementById('personality-dimensions');
    const dimExplanations = {
      'Exploration Style': { leftDesc: 'Likes exploring many different topics broadly', rightDesc: 'Prefers diving deep into fewer topics' },
      'Social Style': { leftDesc: 'Learns best when working with others in groups', rightDesc: 'Learns best when studying independently' },
      'Processing Style': { leftDesc: 'Learns by doing hands-on activities and practice', rightDesc: 'Learns by thinking through ideas and concepts' },
      'Novelty Preference': { leftDesc: 'Prefers familiar routines and structured lessons', rightDesc: 'Enjoys new challenges and variety in learning' },
      'Action Style': { leftDesc: 'Plans and thinks carefully before acting', rightDesc: 'Jumps in and learns by trial and error' },
      'Focus Scope': { leftDesc: 'Pays close attention to details and specifics', rightDesc: 'Focuses on the big picture and overall meaning' }
    };

    function getStrengthLabel(detail) {
      const poleName = detail.pole === 'left' ? detail.leftLabel :
                       detail.pole === 'right' ? detail.rightLabel : null;
      if (detail.strength === 'strong') return `Strong ${poleName}`;
      if (detail.strength === 'moderate') return `Slightly ${poleName}`;
      return 'Balanced';
    }

    function getDimExplanation(detail) {
      const expl = dimExplanations[detail.dimensionName];
      if (!expl) return '';
      if (detail.strength === 'balanced') return 'Comfortable with both approaches';
      if (detail.pole === 'left') return expl.leftDesc;
      return expl.rightDesc;
    }

    dimensionsContainer.innerHTML = personalityProfile.codeDetails.map(detail => `
      <div class="dimension-item">
        <div class="dimension-header">
          <span class="dimension-name">${detail.dimensionName}</span>
          <span class="dimension-strength ${detail.strength}">${getStrengthLabel(detail)}</span>
        </div>
        <div class="dimension-labels">
          <span>${detail.leftLabel}</span>
          <span>${detail.rightLabel}</span>
        </div>
        <div class="dimension-track">
          <div class="dimension-marker" style="left: ${detail.score}%"></div>
        </div>
        <div style="font-size: 0.8rem; color: #666; font-style: italic; margin-top: 2px;">
          → ${getDimExplanation(detail)}
        </div>
      </div>
    `).join('');

    // Render descriptions
    const descriptionsContainer = document.getElementById('personality-descriptions');
    descriptionsContainer.innerHTML = `
      <h4>What this means for you:</h4>
      <div class="description-list">
        ${personalityProfile.descriptions.map(desc => `
          <div class="description-item">
            <span class="description-bullet">•</span>
            <span>${desc.description}</span>
          </div>
        `).join('')}
      </div>
    `;

    // Update quiz button
    if (personalityProfile.quizTaken) {
      document.getElementById('quiz-btn-text').textContent = 'Retake Quiz';
      quizHint.textContent = 'Your quiz results are included in this profile';
    } else {
      document.getElementById('quiz-btn-text').textContent = 'Take Personality Quiz';
      quizHint.textContent = 'Take a short quiz to improve accuracy';
    }

    // Set quiz link
    quizBtn.href = `personality-quiz.html?student=${encodeURIComponent(currentStudentName)}`;
  }

  // Render Career Matches
  function renderCareerMatches(careers, personalityProfile) {
    const grid = document.getElementById('careers-grid');

    if (careers.length === 0) {
      grid.innerHTML = '<p class="no-data">Not enough data to suggest careers yet.</p>';
      return;
    }

    grid.innerHTML = careers.map(career => {
      // Check if this is a personality-based match with fit data
      const hasPersonalityFit = career.personalityFit &&
        (career.personalityFit.strengths?.length > 0 || career.personalityFit.challenges?.length > 0);

      const personalityFitHtml = hasPersonalityFit ? `
        <div class="career-personality-fit">
          ${career.personalityFit.strengths?.map(s => `
            <div class="personality-fit-item fit-good">
              <span class="fit-icon">✓</span>
              <span>${s.feedback}</span>
            </div>
          `).join('') || ''}
          ${career.personalityFit.challenges?.map(c => `
            <div class="personality-fit-item fit-challenge">
              <span class="fit-icon">!</span>
              <span>${c.feedback}</span>
            </div>
          `).join('') || ''}
        </div>
      ` : '';

      // Handle both old format (matchReason, skills) and new format (personalityFit)
      const reasonHtml = career.matchReason
        ? `<div class="career-reason">${career.matchReason}</div>`
        : '';

      const skillsHtml = career.skills?.length > 0
        ? `<div class="career-skills">${career.skills.map(s => `<span class="career-skill">${s}</span>`).join('')}</div>`
        : '';

      return `
        <div class="career-card">
          <div class="career-header">
            <span class="career-title">${career.title}</span>
            <span class="career-match">${career.matchScore}%</span>
          </div>
          <div class="career-field">${career.field}${career.emergingBy ? ` • ${career.emergingBy}` : ''}</div>
          ${reasonHtml}
          ${skillsHtml}
          ${personalityFitHtml}
          ${career.gapWarning ? `<div class="career-gap-warning">${career.gapWarning}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  // Render Profile Selector
  function renderProfileSelector(currentProfile) {
    const container = document.getElementById('profiles-selector');

    container.innerHTML = Object.values(learningProfiles).map(profile => {
      const isCurrent = profile.id === currentProfile.id;
      return `
        <div class="profile-option ${isCurrent ? 'current' : ''}" data-profile="${profile.id}" ${isCurrent ? 'title="Current profile"' : ''}>
          <span class="option-emoji">${profile.emoji}</span>
          <span class="option-name">${profile.name}</span>
          ${isCurrent ? '<span style="font-size: 0.7rem; color: var(--text-muted);">(Current)</span>' : ''}
        </div>
      `;
    }).join('');

    // Add click handlers
    document.querySelectorAll('.profile-option:not(.current)').forEach(option => {
      option.addEventListener('click', () => {
        document.querySelectorAll('.profile-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        analyzeProfileShift(option.dataset.profile);
      });
    });
  }

  // Analyze profile shift
  async function analyzeProfileShift(targetProfileId) {
    const resultContainer = document.getElementById('shift-result');
    resultContainer.classList.remove('hidden');
    resultContainer.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Analyzing shift requirements...</p></div>';

    try {
      const response = await fetch('/api/persona-shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: currentStudentName,
          currentProfile: currentPersona.learningProfile,
          targetProfileId
        })
      });

      if (response.ok) {
        const result = await response.json();
        renderShiftResult(result);
      } else {
        throw new Error('Failed to analyze shift');
      }
    } catch (error) {
      console.error('Error analyzing shift:', error);
      resultContainer.innerHTML = '<p class="no-data" style="color: var(--danger);">Error analyzing shift. Please try again.</p>';
    }
  }

  // Render shift result
  function renderShiftResult(result) {
    const container = document.getElementById('shift-result');

    const difficultyClass = result.difficulty.includes('Big change') ? 'hard' :
                           result.difficulty.includes('Some effort') ? 'moderate' : 'easy';

    container.innerHTML = `
      <div class="shift-header">
        <h4>${result.targetProfile.emoji} Shifting to ${result.targetProfile.name}</h4>
        <span class="difficulty-badge ${difficultyClass}">${result.difficulty}</span>
      </div>
      <p class="shift-timeframe">Estimated timeframe: ${result.estimatedTimeframe}</p>
      ${result.recommendations.length > 0 ? `
        <div class="shift-requirements">
          <h5 style="margin-bottom: 0.75rem;">What needs to improve:</h5>
          ${result.recommendations.map(rec => `
            <div class="requirement-item">
              <div class="requirement-header">
                <span class="requirement-metric">${rec.metric}</span>
                <span class="requirement-gap">${rec.currentValue} → ${rec.targetValue} (+${rec.gap})</span>
              </div>
              ${rec.tips.length > 0 ? `
                <ul class="requirement-tips">
                  ${rec.tips.map(tip => `<li>${tip}</li>`).join('')}
                </ul>
              ` : ''}
            </div>
          `).join('')}
        </div>
      ` : '<p class="no-data" style="color: var(--success);">Already well-aligned with this profile!</p>'}
    `;
  }

  // AI Career Analysis
  document.getElementById('generate-ai-careers').addEventListener('click', async () => {
    const button = document.getElementById('generate-ai-careers');
    const loading = document.getElementById('careers-loading');
    const result = document.getElementById('ai-careers-result');

    button.disabled = true;
    loading.classList.remove('hidden');
    result.classList.add('hidden');

    try {
      const response = await fetch('/api/ai-career-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: currentStudentName,
          persona: currentPersona
        })
      });

      if (response.ok) {
        const data = await response.json();
        renderAICareerResults(data);
      } else {
        throw new Error('Failed to get AI analysis');
      }
    } catch (error) {
      console.error('Error getting AI career analysis:', error);
      result.innerHTML = '<p class="no-data" style="color: var(--danger);">Error generating AI analysis. Please try again.</p>';
      result.classList.remove('hidden');
    } finally {
      button.disabled = false;
      loading.classList.add('hidden');
    }
  });

  // ============================================
  // Persona Type Rendering
  // ============================================

  function renderPersonaType(personaType) {
    const section = document.getElementById('persona-type-section');
    if (!personaType || !personaType.primary) {
      section.style.display = 'none';
      return;
    }

    section.style.display = '';
    const p = personaType.primary;

    document.getElementById('persona-type-emoji').textContent = p.emoji;
    document.getElementById('persona-type-name').textContent = p.name;
    document.getElementById('persona-type-tagline').textContent = p.tagline;
    document.getElementById('persona-type-match').textContent =
      personaType.lowConfidence ? 'Profile still emerging' : `${p.matchScore}% match`;
    document.getElementById('persona-type-description').textContent = p.description;

    // Alternates
    const altContainer = document.getElementById('persona-alternates');
    let altHtml = '';
    if (personaType.secondary) {
      altHtml += renderAlternateCard(personaType.secondary, 'Also resembles');
    }
    if (personaType.tertiary) {
      altHtml += renderAlternateCard(personaType.tertiary, 'Elements of');
    }
    altContainer.innerHTML = altHtml;

    // Set up tabs
    const tabsContainer = document.getElementById('persona-tabs');
    const contentContainer = document.getElementById('persona-tab-content');

    // Render default tab content
    renderPersonaTab('strengths', p, contentContainer);

    // Tab click handlers
    tabsContainer.querySelectorAll('.persona-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-info-icon')) return;
        tabsContainer.querySelectorAll('.persona-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderPersonaTab(tab.dataset.tab, p, contentContainer);
      });
    });

  }

  function renderAlternateCard(type, label) {
    return `
      <div class="persona-alternate-card">
        <span class="alt-emoji">${type.emoji}</span>
        <div class="alt-info">
          <span class="alt-label">${label}</span>
          <span class="alt-name">${type.name}</span>
        </div>
        <span class="alt-match">${type.matchScore}%</span>
      </div>
    `;
  }

  function renderPersonaTab(tabId, persona, container) {
    let html = '';

    switch (tabId) {
      case 'strengths':
        html = (persona.hiddenStrengths || []).map(s =>
          `<div class="persona-list-item strength">
            <span class="item-icon">💎</span>
            <span>${s}</span>
          </div>`
        ).join('');
        break;

      case 'weaknesses':
        html = (persona.hiddenWeaknesses || []).map(w =>
          `<div class="persona-list-item weakness">
            <span class="item-icon">⚠️</span>
            <span>${w}</span>
          </div>`
        ).join('');
        break;

      case 'assets':
        html = (persona.futureMiningAssets || []).map(a =>
          `<div class="persona-list-item asset">
            <span class="item-icon">⛏️</span>
            <span>${a}</span>
          </div>`
        ).join('');
        break;

      case 'careers':
        html = (persona.careerDirections || []).map(c =>
          `<div class="persona-career-card">
            <div class="career-title-row">
              <h5>${c.title}</h5>
              <span class="career-field-tag">${c.field}</span>
            </div>
            <p class="career-why">${c.why}</p>
          </div>`
        ).join('');
        break;

      case 'path':
        html = (persona.reconstructionPath || []).map((step, i) =>
          `<div class="persona-path-step">
            <div class="step-number">${i + 1}</div>
            <div class="step-content">
              <div class="step-phase">${step.phase}</div>
              <div class="step-title">${step.title}</div>
              <div class="step-desc">${step.description}</div>
            </div>
          </div>`
        ).join('');
        break;

      case 'goals':
        html = (persona.hopefulGoals || []).map(g =>
          `<div class="persona-list-item goal">
            <span class="item-icon">🌅</span>
            <span>${g}</span>
          </div>`
        ).join('');
        break;
    }

    container.innerHTML = html;
  }

  // Render AI Career Results
  function renderAICareerResults(data) {
    const container = document.getElementById('ai-careers-result');
    container.classList.remove('hidden');

    container.innerHTML = `
      <div class="ai-insights">
        <h5>🔮 AI Future Career Insights</h5>
        <p>${data.overallInsights}</p>
        <p style="margin-top: 0.5rem;"><strong>Future-Ready Development:</strong> ${data.developmentAdvice}</p>
      </div>

      ${data.careerPaths.map(career => `
        <div class="ai-career-card">
          <div class="ai-career-header">
            <span class="ai-career-emoji">${career.emoji}</span>
            <span class="ai-career-title">${career.title}</span>
            <span class="career-match">${career.matchScore}%</span>
          </div>
          ${career.emergingBy ? `<p class="ai-career-emerging"><span class="emerging-badge">🗓️ Emerging by ${career.emergingBy}</span></p>` : ''}
          <p class="ai-career-why">${career.whyGoodFit}</p>
          <div class="career-skills" style="margin-bottom: 0.75rem;">
            ${career.keySkillsNeeded.map(s => `<span class="career-skill">${s}</span>`).join('')}
          </div>
          <p class="ai-career-path"><strong>Path:</strong> ${career.howToGetThere}</p>
          <p class="ai-career-challenge"><strong>Challenge:</strong> ${career.potentialChallenges}</p>
        </div>
      `).join('')}
    `;
  }

  // ============================================
  // PERSONA JOURNEY TIMELINE (Phase 4)
  // ============================================

  async function loadTimeline(studentName) {
    const section = document.getElementById('timeline-section');
    try {
      const response = await fetch(`/api/persona-timeline/${encodeURIComponent(studentName)}`);
      if (!response.ok) { section.style.display = 'none'; return; }

      const data = await response.json();
      if (!data.snapshots || data.snapshots.length === 0) { section.style.display = 'none'; return; }

      section.style.display = '';
      renderTimeline(data.snapshots);
      initDatePicker(data.snapshots);
    } catch (e) {
      console.error('Error loading timeline:', e);
      section.style.display = 'none';
    }
  }

  function renderTimeline(snapshots) {
    const container = document.getElementById('timeline-nodes');
    const chartContainer = document.getElementById('timeline-chart-container');

    // Render timeline nodes (show every Nth node to avoid overcrowding)
    const step = Math.max(1, Math.floor(snapshots.length / 20));
    const displaySnapshots = snapshots.filter((_, i) => i % step === 0 || i === snapshots.length - 1);

    container.innerHTML = `
      <div class="timeline-track">
        ${displaySnapshots.map((s, i) => {
          const tierColors = {
            exceptional: '#10b981', solid: '#3b82f6', developing: '#f59e0b',
            emerging: '#f97316', struggling: '#ef4444'
          };
          const color = tierColors[s.performanceTier] || '#6b7280';
          const isLast = i === displaySnapshots.length - 1;

          return `
            <div class="timeline-node ${isLast ? 'latest' : ''}" data-date="${s.date}" title="${s.date}: ${s.personaTypeName || 'Computing...'} (${s.reportCount} reports)">
              <div class="timeline-dot" style="background: ${color}"></div>
              <div class="timeline-label">${formatDate(s.date)}</div>
              <div class="timeline-persona-name">${s.personaTypeName || '-'}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Render dimension score chart using simple ASCII-style bars (no Chart.js dependency)
    if (snapshots.length >= 2) {
      const latest = snapshots[snapshots.length - 1];
      const earliest = snapshots[0];
      const dims = ['EI', 'SC', 'PT', 'RN', 'AD', 'LG'];
      const dimNames = { EI: 'Exploration', SC: 'Social Style', PT: 'Processing', RN: 'Novelty', AD: 'Action Style', LG: 'Focus Scope' };

      chartContainer.innerHTML = `
        <div class="dimension-evolution">
          <h4 style="margin-bottom: 0.75rem;">How Personality Dimensions Changed Over Time</h4>
          <div class="evolution-legend">
            <span class="legend-item"><span class="legend-dot" style="background: #94a3b8;"></span> First snapshot (${formatDate(earliest.date)})</span>
            <span class="legend-item"><span class="legend-dot" style="background: #667eea;"></span> Latest snapshot (${formatDate(latest.date)})</span>
          </div>
          ${dims.map(dim => {
            const earlyVal = earliest.scores[dim] || 50;
            const latestVal = latest.scores[dim] || 50;
            const change = latestVal - earlyVal;
            const changeIcon = change > 5 ? '↑' : change < -5 ? '↓' : '→';
            const changeColor = Math.abs(change) <= 5 ? '#6b7280' : change > 0 ? '#10b981' : '#ef4444';
            return `
              <div class="evolution-row">
                <span class="evolution-label">${dimNames[dim]}</span>
                <div class="evolution-bars">
                  <div class="evolution-bar early" style="width: ${earlyVal}%; background: #94a3b8;" title="First: ${earlyVal}"></div>
                  <div class="evolution-bar latest" style="width: ${latestVal}%; background: #667eea;" title="Latest: ${latestVal}"></div>
                </div>
                <span class="evolution-change" style="color: ${changeColor}">${changeIcon} ${change > 0 ? '+' : ''}${change}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    // Click handlers for timeline nodes
    container.querySelectorAll('.timeline-node').forEach(node => {
      node.addEventListener('click', () => loadSnapshotDetail(node.dataset.date));
    });
  }

  async function loadSnapshotDetail(date) {
    const detailContainer = document.getElementById('timeline-detail');
    detailContainer.classList.remove('hidden');
    detailContainer.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

    try {
      const response = await fetch(`/api/persona-snapshot/${encodeURIComponent(currentStudentName)}/${date}`);
      if (!response.ok) throw new Error('Failed to load snapshot');

      const data = await response.json();
      const s = data.snapshot;
      const dims = ['EI', 'SC', 'PT', 'RN', 'AD', 'LG'];
      const dimNames = { EI: 'Exploration', SC: 'Social Style', PT: 'Processing', RN: 'Novelty', AD: 'Action Style', LG: 'Focus Scope' };

      detailContainer.innerHTML = `
        <div class="snapshot-detail-card">
          <div class="snapshot-detail-header">
            <h4>Snapshot: ${s.date}</h4>
            <span class="stat-badge">${s.reportCount} reports</span>
            <span class="stat-badge" style="background: #667eea; color: white;">${s.personalityCode}</span>
          </div>
          <div class="snapshot-persona-info">
            <span class="snapshot-persona-name">${s.personaTypeName || 'Unknown'}</span>
            <span class="snapshot-match">${s.personaMatchScore}% match</span>
            <span class="snapshot-tier">${s.performanceTier}</span>
          </div>
          <div class="snapshot-dimensions">
            ${dims.map(dim => `
              <div class="snapshot-dim">
                <span class="snapshot-dim-label">${dimNames[dim]}</span>
                <div class="snapshot-dim-bar">
                  <div class="snapshot-dim-fill" style="width: ${s.scores[dim]}%;"></div>
                </div>
                <span class="snapshot-dim-value">${s.scores[dim]}</span>
              </div>
            `).join('')}
          </div>
          <div class="snapshot-metrics-row">
            ${Object.entries(s.metrics).map(([k, v]) => `
              <div class="snapshot-metric">
                <span class="metric-name">${k}</span>
                <span class="metric-val" style="color: ${v >= 4 ? '#10b981' : v >= 3 ? '#f59e0b' : '#ef4444'}">${v ? v.toFixed(1) : '-'}</span>
              </div>
            `).join('')}
          </div>
          ${data.weaknesses.length > 0 ? `
            <div class="snapshot-weaknesses">
              <h5>Weaknesses at this point:</h5>
              ${data.weaknesses.map(w => `
                <span class="weakness-tag ${w.severity}">${w.area} (${w.severity})</span>
              `).join('')}
            </div>
          ` : ''}
          <button class="close-detail-btn" onclick="this.closest('.snapshot-detail-card').parentElement.classList.add('hidden')">Close</button>
        </div>
      `;
    } catch (e) {
      detailContainer.innerHTML = '<p class="no-data" style="color: var(--danger);">Error loading snapshot details.</p>';
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function formatDateLong(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ============================================
  // DATE PICKER / PERIOD COMPARISON (Phase 4b)
  // ============================================

  let timelineSnapshots = []; // stored after loadTimeline succeeds

  function initDatePicker(snapshots) {
    timelineSnapshots = snapshots;
    if (snapshots.length === 0) return;

    const earliest = snapshots[0].date;
    const latest = snapshots[snapshots.length - 1].date;

    // Set min/max on all date inputs
    const dateInputs = document.querySelectorAll('#date-picker-controls input[type="date"]');
    dateInputs.forEach(input => {
      input.min = earliest;
      input.max = latest;
    });

    // Default values
    document.getElementById('as-of-date').value = latest;
    document.getElementById('period-from').value = earliest;
    document.getElementById('period-to').value = latest;
    document.getElementById('compare-date-a').value = earliest;
    document.getElementById('compare-date-b').value = latest;

    // Tab switching
    document.querySelectorAll('.date-mode-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.date-mode-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.date-mode-panel').forEach(p => p.classList.add('hidden'));
        const panel = document.getElementById('mode-' + tab.dataset.mode);
        if (panel) panel.classList.remove('hidden');
      });
    });

    // Button handlers
    document.getElementById('btn-view-as-of').addEventListener('click', () => {
      const date = document.getElementById('as-of-date').value;
      if (date) viewAsOf(date);
    });

    document.getElementById('btn-view-period').addEventListener('click', () => {
      const from = document.getElementById('period-from').value;
      const to = document.getElementById('period-to').value;
      if (from && to) viewPeriod(from, to);
    });

    document.getElementById('btn-compare').addEventListener('click', () => {
      const dateA = document.getElementById('compare-date-a').value;
      const dateB = document.getElementById('compare-date-b').value;
      if (dateA && dateB) compareDates(dateA, dateB);
    });
  }

  async function viewAsOf(date) {
    const result = document.getElementById('date-picker-result');
    result.classList.remove('hidden');
    result.innerHTML = '<div class="date-result-loading"><div class="spinner"></div>&nbsp; Computing persona...</div>';

    try {
      const response = await fetch(`/api/persona-as-of/${encodeURIComponent(currentStudentName)}/${date}`);
      if (!response.ok) {
        const err = await response.json();
        result.innerHTML = `<div class="date-result-error">${err.error}${err.reportCount !== undefined ? ` (${err.reportCount} reports found, need ${err.minRequired})` : ''}</div>`;
        return;
      }
      const data = await response.json();
      renderDateSnapshot(data, `Persona as of ${formatDateLong(date)}`, result);
    } catch (e) {
      result.innerHTML = '<div class="date-result-error">Failed to compute persona. Please try again.</div>';
    }
  }

  async function viewPeriod(from, to) {
    const result = document.getElementById('date-picker-result');
    result.classList.remove('hidden');
    result.innerHTML = '<div class="date-result-loading"><div class="spinner"></div>&nbsp; Computing persona for period...</div>';

    try {
      const response = await fetch(`/api/persona-period/${encodeURIComponent(currentStudentName)}?from=${from}&to=${to}`);
      if (!response.ok) {
        const err = await response.json();
        result.innerHTML = `<div class="date-result-error">${err.error}${err.reportCount !== undefined ? ` (${err.reportCount} reports found, need ${err.minRequired})` : ''}</div>`;
        return;
      }
      const data = await response.json();
      renderDateSnapshot(data, `Persona for ${formatDateLong(from)} – ${formatDateLong(to)}`, result);
    } catch (e) {
      result.innerHTML = '<div class="date-result-error">Failed to compute persona. Please try again.</div>';
    }
  }

  async function compareDates(dateA, dateB) {
    const result = document.getElementById('date-picker-result');
    result.classList.remove('hidden');
    result.innerHTML = '<div class="date-result-loading"><div class="spinner"></div>&nbsp; Computing comparison...</div>';

    try {
      const [resA, resB] = await Promise.all([
        fetch(`/api/persona-as-of/${encodeURIComponent(currentStudentName)}/${dateA}`),
        fetch(`/api/persona-as-of/${encodeURIComponent(currentStudentName)}/${dateB}`)
      ]);

      if (!resA.ok || !resB.ok) {
        const errA = !resA.ok ? await resA.json() : null;
        const errB = !resB.ok ? await resB.json() : null;
        const msgs = [];
        if (errA) msgs.push(`Date A: ${errA.error}`);
        if (errB) msgs.push(`Date B: ${errB.error}`);
        result.innerHTML = `<div class="date-result-error">${msgs.join('<br>')}</div>`;
        return;
      }

      const dataA = await resA.json();
      const dataB = await resB.json();
      renderComparison(dataA, dataB, dateA, dateB, result);
    } catch (e) {
      result.innerHTML = '<div class="date-result-error">Failed to compute comparison. Please try again.</div>';
    }
  }

  function renderDateSnapshot(data, label, container) {
    const s = data.snapshot;
    const dims = ['EI', 'SC', 'PT', 'RN', 'AD', 'LG'];
    const dimNames = { EI: 'Exploration', SC: 'Social Style', PT: 'Processing', RN: 'Novelty', AD: 'Action Style', LG: 'Focus Scope' };
    const tierColors = {
      exceptional: '#10b981', solid: '#3b82f6', developing: '#f59e0b',
      emerging: '#f97316', struggling: '#ef4444'
    };

    container.innerHTML = `
      <div class="snapshot-detail-card">
        <div class="date-result-header">
          <h4>${label} <span class="stat-badge">${s.reportCount} reports</span> ${data.cached ? '<span class="stat-badge" style="background:#e0fce0;color:#16a34a;">cached</span>' : ''}</h4>
          <button class="date-result-close" onclick="document.getElementById('date-picker-result').classList.add('hidden')">Close</button>
        </div>
        <div class="snapshot-persona-info">
          <span class="snapshot-persona-name">${s.personaTypeName || 'Unknown'}</span>
          <span class="snapshot-match">${s.personaMatchScore}% match</span>
          <span class="snapshot-tier" style="color: ${tierColors[s.performanceTier] || '#888'}">${s.performanceTier}</span>
          <span class="stat-badge" style="background: #667eea; color: white;">${s.personalityCode}</span>
        </div>
        <div class="snapshot-dimensions">
          ${dims.map(dim => `
            <div class="snapshot-dim">
              <span class="snapshot-dim-label">${dimNames[dim]}</span>
              <div class="snapshot-dim-bar">
                <div class="snapshot-dim-fill" style="width: ${s.scores[dim]}%;"></div>
              </div>
              <span class="snapshot-dim-value">${s.scores[dim]}</span>
            </div>
          `).join('')}
        </div>
        <div class="snapshot-metrics-row">
          ${Object.entries(s.metrics).map(([k, v]) => `
            <div class="snapshot-metric">
              <span class="metric-name">${k}</span>
              <span class="metric-val" style="color: ${v >= 4 ? '#10b981' : v >= 3 ? '#f59e0b' : '#ef4444'}">${v ? v.toFixed(1) : '-'}</span>
            </div>
          `).join('')}
        </div>
        ${data.weaknesses && data.weaknesses.length > 0 ? `
          <div class="snapshot-weaknesses">
            <h5>Weaknesses:</h5>
            ${data.weaknesses.map(w => `
              <span class="weakness-tag ${w.severity}">${w.area} (${w.severity})</span>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderComparison(dataA, dataB, dateA, dateB, container) {
    const sA = dataA.snapshot;
    const sB = dataB.snapshot;
    const dims = ['EI', 'SC', 'PT', 'RN', 'AD', 'LG'];
    const dimNames = { EI: 'Exploration', SC: 'Social Style', PT: 'Processing', RN: 'Novelty', AD: 'Action Style', LG: 'Focus Scope' };
    const metricKeys = ['attention', 'retention', 'comprehension', 'behavior', 'handwriting', 'conversation'];

    function diffClass(val) {
      if (val > 2) return 'diff-positive';
      if (val < -2) return 'diff-negative';
      return 'diff-neutral';
    }

    function diffArrow(val) {
      const sign = val > 0 ? '+' : '';
      const arrow = val > 2 ? '&uarr;' : val < -2 ? '&darr;' : '&rarr;';
      return `${arrow} ${sign}${val}`;
    }

    function renderColumn(s, label) {
      const tierColors = {
        exceptional: '#10b981', solid: '#3b82f6', developing: '#f59e0b',
        emerging: '#f97316', struggling: '#ef4444'
      };
      return `
        <div class="comparison-column">
          <h5>${label} <span class="stat-badge">${s.reportCount} reports</span></h5>
          <div class="snapshot-persona-info">
            <span class="snapshot-persona-name">${s.personaTypeName || 'Unknown'}</span>
            <span class="snapshot-tier" style="color: ${tierColors[s.performanceTier] || '#888'}">${s.performanceTier}</span>
          </div>
          <div class="snapshot-dimensions">
            ${dims.map(dim => `
              <div class="snapshot-dim">
                <span class="snapshot-dim-label">${dimNames[dim]}</span>
                <div class="snapshot-dim-bar">
                  <div class="snapshot-dim-fill" style="width: ${s.scores[dim]}%;"></div>
                </div>
                <span class="snapshot-dim-value">${s.scores[dim]}</span>
              </div>
            `).join('')}
          </div>
          <div class="snapshot-metrics-row">
            ${metricKeys.map(k => `
              <div class="snapshot-metric">
                <span class="metric-name">${k}</span>
                <span class="metric-val" style="color: ${s.metrics[k] >= 4 ? '#10b981' : s.metrics[k] >= 3 ? '#f59e0b' : '#ef4444'}">${s.metrics[k] ? s.metrics[k].toFixed(1) : '-'}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    const personaChanged = sA.personaTypeName !== sB.personaTypeName;

    container.innerHTML = `
      <div class="snapshot-detail-card">
        <div class="date-result-header">
          <h4>Comparison: ${formatDateLong(dateA)} vs ${formatDateLong(dateB)}</h4>
          <button class="date-result-close" onclick="document.getElementById('date-picker-result').classList.add('hidden')">Close</button>
        </div>
        <div class="comparison-grid">
          ${renderColumn(sA, formatDateLong(dateA))}
          ${renderColumn(sB, formatDateLong(dateB))}
        </div>
        <div class="comparison-diff">
          <h5>Changes (A &rarr; B)</h5>
          ${personaChanged ? `
            <div class="diff-persona-change">
              ${sA.personaTypeName} <span class="persona-arrow">&rarr;</span> ${sB.personaTypeName}
            </div>
          ` : ''}
          ${dims.map(dim => {
            const diff = Math.round(sB.scores[dim] - sA.scores[dim]);
            return `
              <div class="diff-row">
                <span class="diff-label">${dimNames[dim]}</span>
                <span class="diff-arrow ${diffClass(diff)}">${diffArrow(diff)}</span>
                <span style="font-size:0.82rem;color:#888">(${sA.scores[dim]} &rarr; ${sB.scores[dim]})</span>
              </div>
            `;
          }).join('')}
          ${metricKeys.map(k => {
            const vA = sA.metrics[k] || 0;
            const vB = sB.metrics[k] || 0;
            const diff = Math.round((vB - vA) * 10) / 10;
            return `
              <div class="diff-row">
                <span class="diff-label" style="text-transform:capitalize">${k}</span>
                <span class="diff-arrow ${diffClass(diff * 10)}">${diff > 0 ? '+' : ''}${diff.toFixed(1)}</span>
                <span style="font-size:0.82rem;color:#888">(${vA.toFixed(1)} &rarr; ${vB.toFixed(1)})</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // ============================================
  // REINFORCEMENT SYSTEM (Phase 5)
  // ============================================

  let currentReinforcement = null;

  async function loadReinforcement(studentName) {
    const section = document.getElementById('reinforcement-section');
    try {
      const response = await fetch(`/api/reinforcement/${encodeURIComponent(studentName)}`);
      if (!response.ok) { section.style.display = 'none'; return; }

      currentReinforcement = await response.json();
      if (!currentReinforcement.recommendations || currentReinforcement.recommendations.length === 0) {
        section.style.display = 'none';
        return;
      }

      section.style.display = '';
      renderReinforcementList(currentReinforcement.recommendations);
      renderProjectedPersona(currentReinforcement);

      // Set up filter tabs
      document.querySelectorAll('.reinforcement-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          document.querySelectorAll('.reinforcement-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          const filter = tab.dataset.filter;
          const filtered = filter === 'all'
            ? currentReinforcement.recommendations
            : currentReinforcement.recommendations.filter(r => r.status === filter);
          renderReinforcementList(filtered);
        });
      });
    } catch (e) {
      console.error('Error loading reinforcement:', e);
      section.style.display = 'none';
    }
  }

  function renderReinforcementList(recommendations) {
    const container = document.getElementById('reinforcement-list');
    if (recommendations.length === 0) {
      container.innerHTML = '<p class="no-data">No recommendations in this category.</p>';
      return;
    }

    const statusIcons = { pending: '⏳', in_progress: '🔄', completed: '✅', skipped: '⏭️' };
    const statusLabels = { pending: 'Not Started', in_progress: 'In Progress', completed: 'Done', skipped: 'Skipped' };
    const sourceLabels = { template: 'Suggested', ai_generated: 'AI Personalized' };

    container.innerHTML = recommendations.map(rec => `
      <div class="reinforcement-card" data-rec-id="${rec.id}">
        <div class="reinforcement-card-header">
          <span class="reinforcement-source ${rec.source}">${sourceLabels[rec.source] || rec.source}</span>
          <span class="reinforcement-status">${statusIcons[rec.status]} ${statusLabels[rec.status] || rec.status}</span>
        </div>
        ${rec.weakness_area ? `<div class="reinforcement-reason">Recommended because: <strong>${rec.weakness_area}</strong> is below the 4.0 target</div>` : ''}
        <h5 class="reinforcement-title">${rec.title}</h5>
        <p class="reinforcement-desc">${rec.description}</p>
        <div class="reinforcement-meta">
          ${rec.activity_type ? `<span class="meta-tag">${rec.activity_type}</span>` : ''}
          ${rec.estimated_duration ? `<span class="meta-tag">${rec.estimated_duration}</span>` : ''}
        </div>
        <div class="reinforcement-actions">
          ${rec.status !== 'in_progress' ? `<button class="rec-action-btn start" data-id="${rec.id}" data-status="in_progress">Assign</button>` : ''}
          ${rec.status !== 'completed' ? `<button class="rec-action-btn complete" data-id="${rec.id}" data-status="completed">Mark Done</button>` : ''}
          ${rec.status !== 'skipped' && rec.status !== 'completed' ? `<button class="rec-action-btn skip" data-id="${rec.id}" data-status="skipped">Skip</button>` : ''}
        </div>
      </div>
    `).join('');

    // Add action handlers
    container.querySelectorAll('.rec-action-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const recId = btn.dataset.id;
        const newStatus = btn.dataset.status;
        try {
          await fetch(`/api/reinforcement/${recId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
          });
          // Reload reinforcement data
          loadReinforcement(currentStudentName);
        } catch (e) {
          console.error('Error updating recommendation:', e);
        }
      });
    });
  }

  function renderProjectedPersona(data) {
    const container = document.getElementById('projected-persona-container');
    if (!data.projectedPersona) { container.style.display = 'none'; return; }

    container.style.display = '';
    const current = data.currentScores;
    const proj = data.projectedPersona;
    const dims = ['EI', 'SC', 'PT', 'RN', 'AD', 'LG'];
    const dimNames = { EI: 'Exploration', SC: 'Social Style', PT: 'Processing', RN: 'Novelty', AD: 'Action Style', LG: 'Focus Scope' };

    const compContainer = document.getElementById('projected-comparison');
    compContainer.innerHTML = `
      <div class="projected-side-by-side">
        <div class="projected-current">
          <h5>Current</h5>
          <span class="projected-type-name">${currentPersona?.personaType?.primary?.name || 'Unknown'}</span>
        </div>
        <div class="projected-arrow">→</div>
        <div class="projected-target">
          <h5>Projected</h5>
          <span class="projected-type-name">${proj.projected_type_name || 'Unknown'}</span>
        </div>
      </div>
      <div class="projected-dims">
        ${dims.map(dim => {
          const curVal = current[dim] || 50;
          const projVal = proj[`projected_${dim.toLowerCase()}`] || curVal;
          const diff = projVal - curVal;
          return `
            <div class="projected-dim-row">
              <span class="projected-dim-label">${dimNames[dim]}</span>
              <div class="projected-dim-bars">
                <div class="projected-bar current-bar" style="width: ${curVal}%;"></div>
                <div class="projected-bar proj-bar" style="width: ${projVal}%;"></div>
              </div>
              <span class="projected-dim-change" style="color: ${diff === 0 ? '#6b7280' : diff > 0 ? '#10b981' : '#3b82f6'}">${diff > 0 ? '+' : ''}${diff}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // AI Reinforcement generator
  document.getElementById('generate-ai-reinforcement').addEventListener('click', async () => {
    const btn = document.getElementById('generate-ai-reinforcement');
    const loading = document.getElementById('reinforcement-loading');
    btn.disabled = true;
    loading.classList.remove('hidden');

    try {
      const response = await fetch(`/api/reinforcement/${encodeURIComponent(currentStudentName)}/generate-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        await loadReinforcement(currentStudentName);
      } else {
        throw new Error('Failed to generate');
      }
    } catch (e) {
      console.error('Error generating AI reinforcement:', e);
    } finally {
      btn.disabled = false;
      loading.classList.add('hidden');
    }
  });

  // ============================================
  // DESIRED PERSONA + GAP ANALYSIS (Phase 6)
  // ============================================

  let allPersonaTypes = null;
  let selectedDesiredTypeId = null;

  async function loadDesiredPersona(studentName) {
    const section = document.getElementById('desired-persona-section');
    if (!currentPersona?.personaType?.primary) { section.style.display = 'none'; return; }

    section.style.display = '';

    // Load persona types if not cached
    if (!allPersonaTypes) {
      try {
        const resp = await fetch('/api/persona-types');
        if (resp.ok) {
          const data = await resp.json();
          allPersonaTypes = data.types;
        }
      } catch (e) { console.error('Error loading persona types:', e); }
    }

    renderPersonaTypeGrid();

    // Load current desired persona
    try {
      const resp = await fetch(`/api/desired-persona/${encodeURIComponent(studentName)}`);
      if (resp.ok) {
        const data = await resp.json();
        renderDesiredPersonaCurrent(data);
        if (data.hasDesired) {
          loadGapAnalysis(studentName);
        }
      }
    } catch (e) { console.error('Error loading desired persona:', e); }
  }

  function renderPersonaTypeGrid() {
    const grid = document.getElementById('persona-type-grid');
    if (!allPersonaTypes) { grid.innerHTML = ''; return; }

    const currentTypeId = currentPersona?.personaType?.primary?.id;

    grid.innerHTML = allPersonaTypes.map(t => `
      <div class="persona-type-select-card ${t.id === currentTypeId ? 'is-current' : ''}" data-type-id="${t.id}" title="${t.tagline || ''}">
        <span class="ptsc-emoji">${t.emoji}</span>
        <span class="ptsc-name">${t.name}</span>
        ${t.tagline ? `<span style="font-size: 0.65rem; color: #888; margin-top: 2px; line-height: 1.2;">${t.tagline}</span>` : ''}
        ${t.id === currentTypeId ? '<span class="ptsc-current-badge">Current</span>' : ''}
      </div>
    `).join('');

    grid.querySelectorAll('.persona-type-select-card:not(.is-current)').forEach(card => {
      card.addEventListener('click', () => {
        grid.querySelectorAll('.persona-type-select-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedDesiredTypeId = card.dataset.typeId;
        document.getElementById('desired-set-controls').classList.remove('hidden');
      });
    });

    // Save button
    const saveBtn = document.getElementById('desired-save-btn');
    saveBtn.onclick = async () => {
      if (!selectedDesiredTypeId) return;
      try {
        const resp = await fetch('/api/desired-persona', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentName: currentStudentName,
            personaTypeId: selectedDesiredTypeId,
            setBy: document.getElementById('desired-set-by').value,
            setByName: document.getElementById('desired-set-by-name').value,
            reason: document.getElementById('desired-reason').value
          })
        });
        if (resp.ok) {
          document.getElementById('desired-set-controls').classList.add('hidden');
          loadDesiredPersona(currentStudentName);
        }
      } catch (e) { console.error('Error saving desired persona:', e); }
    };
  }

  function renderDesiredPersonaCurrent(data) {
    const container = document.getElementById('desired-persona-current');
    if (!data.hasDesired) {
      container.innerHTML = '<p class="no-data">No target persona set yet. Select one from the grid below.</p>';
      return;
    }

    const pt = data.personaType;
    container.innerHTML = `
      <div class="desired-current-card">
        <div class="desired-header">
          <span class="desired-emoji">${pt?.emoji || '🎯'}</span>
          <div class="desired-info">
            <h4>Target: ${pt?.name || data.personaTypeId}</h4>
            <p>Set by ${data.setBy}${data.setByName ? ` (${data.setByName})` : ''} on ${new Date(data.setAt).toLocaleDateString()}</p>
            ${data.reason ? `<p class="desired-reason">"${data.reason}"</p>` : ''}
          </div>
          <button class="remove-desired-btn" title="Remove target">✕</button>
        </div>
      </div>
    `;

    container.querySelector('.remove-desired-btn').addEventListener('click', async () => {
      try {
        await fetch(`/api/desired-persona/${encodeURIComponent(currentStudentName)}`, { method: 'DELETE' });
        document.getElementById('gap-analysis-container').classList.add('hidden');
        loadDesiredPersona(currentStudentName);
      } catch (e) { console.error('Error removing desired persona:', e); }
    });
  }

  async function loadGapAnalysis(studentName) {
    const container = document.getElementById('gap-analysis-container');
    try {
      const resp = await fetch(`/api/desired-persona-gap/${encodeURIComponent(studentName)}`);
      if (!resp.ok) { container.classList.add('hidden'); return; }

      const data = await resp.json();
      container.classList.remove('hidden');
      renderGapAnalysis(data);
    } catch (e) {
      console.error('Error loading gap analysis:', e);
      container.classList.add('hidden');
    }
  }

  function renderGapAnalysis(data) {
    const barsContainer = document.getElementById('gap-bars');
    const summaryContainer = document.getElementById('gap-summary');
    const dimNames = { EI: 'Exploration', SC: 'Social Style', PT: 'Processing', RN: 'Novelty', AD: 'Action Style', LG: 'Focus Scope' };
    const magLabels = { large: 'Big gap', moderate: 'Medium gap', small: 'Small gap' };

    barsContainer.innerHTML = data.gaps.map(g => {
      const magColors = { large: '#ef4444', moderate: '#f59e0b', small: '#10b981' };
      const dirLabel = g.direction === 'increase' ? 'needs to increase' : g.direction === 'decrease' ? 'needs to decrease' : 'on target';

      return `
        <div class="gap-bar-row">
          <span class="gap-dim-label">${dimNames[g.dimension]}</span>
          <div class="gap-bar-track">
            <div class="gap-bar-current" style="left: ${g.current}%; width: 6px; background: #667eea; border-radius: 3px;" title="Now: ${g.current}"></div>
            <div class="gap-bar-target" style="left: ${g.target}%; width: 6px; background: ${magColors[g.magnitude]}; border-radius: 3px;" title="Goal: ${g.target}"></div>
            <div class="gap-bar-arrow" style="left: ${Math.min(g.current, g.target)}%; width: ${Math.abs(g.gap)}%; background: ${magColors[g.magnitude]}15; border: 1px dashed ${magColors[g.magnitude]}"></div>
          </div>
          <span class="gap-val" style="color: ${magColors[g.magnitude]}" title="${magLabels[g.magnitude]} — ${dirLabel}">${Math.abs(g.gap)} pts</span>
        </div>
      `;
    }).join('');

    summaryContainer.innerHTML = `
      <div class="gap-summary-stats">
        <div class="gap-stat">
          <span class="gap-stat-label">Difficulty</span>
          <span class="gap-stat-value">${data.difficulty}</span>
        </div>
        <div class="gap-stat">
          <span class="gap-stat-label">Estimated Time</span>
          <span class="gap-stat-value">${data.estimatedTimeframe}</span>
        </div>
        <div class="gap-stat">
          <span class="gap-stat-label">Total Gap</span>
          <span class="gap-stat-value">${data.totalGap} points</span>
        </div>
      </div>
      ${data.suggestedTemplates.length > 0 ? `
        <div class="gap-suggested-templates">
          <h5>Suggested Activities to Close the Gap:</h5>
          ${data.suggestedTemplates.slice(0, 4).map(t => `
            <div class="suggested-template">
              <span class="template-title">${t.title}</span>
              <span class="template-area">${t.weakness_area}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;
  }
});
