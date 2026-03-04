/**
 * Persona Engine - Extracted computation functions from app.js
 * Shared by both the API server and the migration script.
 */

const fs = require('fs');
const path = require('path');

// ============================================
// Constants
// ============================================

const SUBJECT_CATEGORIES = {
  'language_arts': {
    keywords: ['reading', 'vocab', 'vocabulary', 'book club', 'fiction', 'literature', 'grammar', 'phonics', 'spelling'],
    name: 'Language Arts',
    icon: '\u{1F4DA}'
  },
  'writing': {
    keywords: ['essay', 'writing', 'creative writing', 'composition', 'journal'],
    name: 'Writing & Composition',
    icon: '\u{270D}\u{FE0F}'
  },
  'stem': {
    keywords: ['math', 'science', 'stem', 'physics', 'chemistry', 'biology', 'algebra', 'geometry', 'calculus'],
    name: 'STEM',
    icon: '\u{1F52C}'
  },
  'social_sciences': {
    keywords: ['social', 'history', 'geography', 'civics', 'economics', 'trinity', 'current events'],
    name: 'Social Sciences',
    icon: '\u{1F30D}'
  },
  'media_communication': {
    keywords: ['ted', 'documentary', 'video', 'presentation', 'speech', 'debate', 'public speaking'],
    name: 'Media & Communication',
    icon: '\u{1F3AC}'
  },
  'arts': {
    keywords: ['art', 'music', 'drama', 'theater', 'dance', 'creative'],
    name: 'Arts',
    icon: '\u{1F3A8}'
  }
};

const PERSONALITY_DIMENSIONS = {
  EI: {
    code: 'EI',
    name: 'Breadth vs Depth',
    leftPole: { code: 'E', name: 'Wide Learner', description: 'Enjoys variety and breadth of interests' },
    rightPole: { code: 'I', name: 'Deep Learner', description: 'Prefers depth and mastery of specific areas' }
  },
  SC: {
    code: 'SC',
    name: 'Team vs Solo',
    leftPole: { code: 'S', name: 'Team Player', description: 'Energized by collaboration and discussion' },
    rightPole: { code: 'C', name: 'Solo Worker', description: 'Prefers independent, focused work' }
  },
  PT: {
    code: 'PT',
    name: 'Hands-on vs Conceptual',
    leftPole: { code: 'P', name: 'Hands-on', description: 'Learns best through hands-on activities' },
    rightPole: { code: 'T', name: 'Conceptual', description: 'Learns best through concepts and ideas' }
  },
  RN: {
    code: 'RN',
    name: 'Routine vs Adventure',
    leftPole: { code: 'R', name: 'Routine Lover', description: 'Values consistency and predictability' },
    rightPole: { code: 'N', name: 'Adventure Seeker', description: 'Embraces change and new experiences' }
  },
  AD: {
    code: 'AD',
    name: 'Think First vs Act Fast',
    leftPole: { code: 'A', name: 'Careful Thinker', description: 'Deliberate and thorough in decisions' },
    rightPole: { code: 'D', name: 'Quick Decider', description: 'Quick and action-oriented in decisions' }
  },
  LG: {
    code: 'LG',
    name: 'Details vs Big Picture',
    leftPole: { code: 'L', name: 'Detail Focused', description: 'Detail-oriented, focuses on specifics' },
    rightPole: { code: 'G', name: 'Big Picture', description: 'Big-picture thinker, sees patterns' }
  }
};

const PERSONALITY_SCORE_THRESHOLDS = {
  STRONG_LEFT: 35,
  MODERATE_LEFT: 44,
  BALANCED_LOW: 45,
  BALANCED_HIGH: 55,
  MODERATE_RIGHT: 65,
  STRONG_RIGHT: 100
};

const PERSONALITY_WEIGHTS = {
  QUIZ: 0.65,
  INFERRED: 0.35
};

const MIN_REPORTS_FOR_PERSONALITY = 3;

const LEARNING_PROFILES = {
  engaged_communicator: {
    id: 'engaged_communicator',
    name: 'Engaged Communicator',
    emoji: '\u{1F4AC}',
    description: 'Thrives in discussion-based learning. Excellent at verbal expression and understanding complex concepts through dialogue.',
    primaryMetrics: ['conversation', 'comprehension'],
    traits: ['Articulate', 'Collaborative', 'Empathetic', 'Quick-thinking'],
    idealEnvironment: 'Group discussions, debates, presentations, peer learning',
    careerStrengths: ['Public speaking', 'Team collaboration', 'Client relations', 'Teaching']
  },
  disciplined_executor: {
    id: 'disciplined_executor',
    name: 'Disciplined Executor',
    emoji: '\u{1F3AF}',
    description: 'Self-motivated with excellent focus. Excels in structured environments with clear goals and expectations.',
    primaryMetrics: ['attention', 'behavior'],
    traits: ['Focused', 'Reliable', 'Goal-oriented', 'Self-regulated'],
    idealEnvironment: 'Independent study, structured tasks, clear objectives',
    careerStrengths: ['Project management', 'Deadline-driven work', 'Quality control', 'Operations']
  },
  meticulous_documenter: {
    id: 'meticulous_documenter',
    name: 'Meticulous Documenter',
    emoji: '\u{1F4DD}',
    description: 'Detail-oriented learner with strong memory. Produces high-quality written work and retains information well.',
    primaryMetrics: ['handwriting', 'retention'],
    traits: ['Precise', 'Organized', 'Thorough', 'Patient'],
    idealEnvironment: 'Note-taking, written assignments, research projects',
    careerStrengths: ['Documentation', 'Research', 'Data entry', 'Archival work']
  },
  analytical_absorber: {
    id: 'analytical_absorber',
    name: 'Analytical Absorber',
    emoji: '\u{1F9E0}',
    description: 'Deep thinker who processes and retains complex information. Strong at understanding underlying concepts.',
    primaryMetrics: ['retention', 'comprehension'],
    traits: ['Logical', 'Curious', 'Systematic', 'Reflective'],
    idealEnvironment: 'Reading, analysis, problem-solving, independent research',
    careerStrengths: ['Data analysis', 'Research', 'Strategy', 'Problem-solving']
  },
  expressive_performer: {
    id: 'expressive_performer',
    name: 'Expressive Performer',
    emoji: '\u{1F31F}',
    description: 'Creative communicator who brings energy and personality to learning. Strong verbal and written expression.',
    primaryMetrics: ['conversation', 'handwriting'],
    traits: ['Creative', 'Confident', 'Expressive', 'Imaginative'],
    idealEnvironment: 'Creative projects, presentations, storytelling, performance',
    careerStrengths: ['Creative work', 'Performance', 'Content creation', 'Design']
  },
  quiet_reflector: {
    id: 'quiet_reflector',
    name: 'Quiet Reflector',
    emoji: '\u{1F52E}',
    description: 'Thoughtful observer who learns through careful observation and internal processing. Retains information deeply.',
    primaryMetrics: ['retention', 'behavior'],
    traits: ['Observant', 'Thoughtful', 'Independent', 'Deep-thinking'],
    idealEnvironment: 'Individual work, reading, written reflection, quiet study spaces',
    careerStrengths: ['Research', 'Writing', 'Analysis', 'Backend work']
  },
  active_collaborator: {
    id: 'active_collaborator',
    name: 'Active Collaborator',
    emoji: '\u{1F91D}',
    description: 'Energized by working with others. Excellent at coordinating group efforts and maintaining positive dynamics.',
    primaryMetrics: ['behavior', 'conversation', 'attention'],
    traits: ['Team-oriented', 'Energetic', 'Inclusive', 'Motivating'],
    idealEnvironment: 'Group projects, team activities, collaborative problem-solving',
    careerStrengths: ['Team leadership', 'Coordination', 'Facilitation', 'HR']
  },
  visual_processor: {
    id: 'visual_processor',
    name: 'Visual Processor',
    emoji: '\u{1F441}\u{FE0F}',
    description: 'Learns best through visual information. Strong at creating and interpreting diagrams, charts, and visual content.',
    primaryMetrics: ['comprehension', 'handwriting'],
    traits: ['Visual-minded', 'Creative', 'Spatial-aware', 'Detail-oriented'],
    idealEnvironment: 'Diagrams, mind maps, visual projects, graphic organizers',
    careerStrengths: ['Design', 'Data visualization', 'Architecture', 'Visual arts']
  },
  kinesthetic_learner: {
    id: 'kinesthetic_learner',
    name: 'Hands-On Learner',
    emoji: '\u{1F6E0}\u{FE0F}',
    description: 'Learns best through doing and physical engagement. May find traditional desk work challenging but excels in practical applications.',
    primaryMetrics: ['behavior', 'attention'],
    traits: ['Practical', 'Action-oriented', 'Experimental', 'Physical'],
    idealEnvironment: 'Labs, workshops, hands-on projects, physical activities',
    careerStrengths: ['Technical work', 'Engineering', 'Healthcare', 'Trades']
  },
  steady_achiever: {
    id: 'steady_achiever',
    name: 'Steady Achiever',
    emoji: '\u{1F422}',
    description: 'Consistent and reliable learner who makes gradual but steady progress. Values routine and predictability.',
    primaryMetrics: ['behavior', 'retention'],
    traits: ['Consistent', 'Reliable', 'Methodical', 'Persistent'],
    idealEnvironment: 'Structured routines, incremental challenges, clear expectations',
    careerStrengths: ['Administrative work', 'Accounting', 'Quality assurance', 'Process management']
  },
  balanced_achiever: {
    id: 'balanced_achiever',
    name: 'Balanced Achiever',
    emoji: '\u{2B50}',
    description: 'Well-rounded learner with consistent performance across all areas. Adapts easily to different learning situations.',
    primaryMetrics: ['all'],
    traits: ['Versatile', 'Adaptable', 'Consistent', 'Well-rounded'],
    idealEnvironment: 'Varied activities, mixed learning approaches',
    careerStrengths: ['Management', 'Consulting', 'Entrepreneurship', 'General leadership']
  },
  emerging_learner: {
    id: 'emerging_learner',
    name: 'Emerging Learner',
    emoji: '\u{1F331}',
    description: 'Currently building foundational skills with great potential for growth. Benefits from supportive, encouraging environment.',
    primaryMetrics: ['developing'],
    traits: ['Growing', 'Curious', 'Resilient', 'Open-minded'],
    idealEnvironment: 'Supportive guidance, scaffolded learning, encouragement',
    careerStrengths: ['Entry-level positions', 'Apprenticeships', 'Training programs']
  }
};

// Load persona types data
let PERSONA_TYPES_DATA;
let PERSONA_TYPES;
try {
  PERSONA_TYPES_DATA = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'data', 'persona-types.json'), 'utf8')
  );
  PERSONA_TYPES = PERSONA_TYPES_DATA.types;
} catch (e) {
  console.error('Warning: Could not load persona-types.json:', e.message);
  PERSONA_TYPES_DATA = { types: {}, groups: [] };
  PERSONA_TYPES = {};
}

const QUIZ_QUESTIONS = [
  { number: 1, dimension: 'EI', text: "When you have free time to learn something new, you prefer to...", optionA: { text: "Try out many different topics to see what's interesting", points: -25 }, optionB: { text: "Pick one topic and learn everything you can about it", points: 25 } },
  { number: 2, dimension: 'EI', text: "If you could choose your school schedule, you would...", optionA: { text: "Take many different subjects, even if you're not expert in any", points: -25 }, optionB: { text: "Focus on fewer subjects but become really good at them", points: 25 } },
  { number: 3, dimension: 'SC', text: "You understand new ideas better when you...", optionA: { text: "Discuss them with classmates or friends", points: -25 }, optionB: { text: "Think about them quietly by yourself", points: 25 } },
  { number: 4, dimension: 'SC', text: "For a big project, you would rather...", optionA: { text: "Work with a group and share ideas", points: -25 }, optionB: { text: "Work alone and create your own vision", points: 25 } },
  { number: 5, dimension: 'PT', text: "You find it more exciting to...", optionA: { text: "Build, create, or make something with your hands", points: -25 }, optionB: { text: "Think about ideas, theories, or possibilities", points: 25 } },
  { number: 6, dimension: 'PT', text: "When learning about a topic, you prefer...", optionA: { text: "Doing experiments or real-world activities", points: -25 }, optionB: { text: "Reading, watching videos, or hearing explanations", points: 25 } },
  { number: 7, dimension: 'RN', text: "You feel most comfortable when...", optionA: { text: "You know what to expect and have a clear plan", points: -25 }, optionB: { text: "Things are new, different, and surprising", points: 25 } },
  { number: 8, dimension: 'RN', text: "If your teacher suddenly changed the lesson plan, you would...", optionA: { text: "Feel a bit frustrated and prefer sticking to the plan", points: -25 }, optionB: { text: "Feel excited about trying something different", points: 25 } },
  { number: 9, dimension: 'AD', text: "When making a decision, you usually...", optionA: { text: "Think carefully about all options before choosing", points: -25 }, optionB: { text: "Go with your gut feeling and decide quickly", points: 25 } },
  { number: 10, dimension: 'AD', text: "When solving a problem, you prefer to...", optionA: { text: "Take your time and consider every detail", points: -25 }, optionB: { text: "Jump in and figure it out as you go", points: 25 } },
  { number: 11, dimension: 'LG', text: "When reading instructions, you usually...", optionA: { text: "Follow each step carefully, one at a time", points: -25 }, optionB: { text: "Skim to get the big picture, then figure out details", points: 25 } },
  { number: 12, dimension: 'LG', text: "You're more interested in understanding...", optionA: { text: "How the small parts work in detail", points: -25 }, optionB: { text: "How everything connects together as a whole", points: 25 } }
];

// ============================================
// Core Computation Functions
// ============================================

function calculateInferredPersonality(reports, metrics, academicOrientation) {
  if (!reports || reports.length < MIN_REPORTS_FOR_PERSONALITY) {
    return null;
  }

  const uniqueSubjects = new Set(reports.map(r => r.subject || r.Subject)).size;
  const totalReports = reports.length;

  let switches = 0;
  const sortedReports = [...reports].sort((a, b) => {
    const dateA = a.report_date || a.Date;
    const dateB = b.report_date || b.Date;
    return new Date(dateA) - new Date(dateB);
  });
  for (let i = 1; i < sortedReports.length; i++) {
    const subj1 = sortedReports[i].subject || sortedReports[i].Subject;
    const subj0 = sortedReports[i-1].subject || sortedReports[i-1].Subject;
    if (subj1 !== subj0) {
      switches++;
    }
  }

  const recentReports = sortedReports.slice(-10);
  const avgMetrics = recentReports.map(r => {
    const vals = [
      r.attention || r.Attention,
      r.retention || r.Retention,
      r.comprehension || r.Comprehension,
      r.behavior || r.Behavior,
      r.handwriting || r.Handwriting,
      r.conversation || r.Conversation
    ].map(v => parseFloat(v)).filter(v => !isNaN(v));
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  });
  const avgMean = avgMetrics.reduce((a, b) => a + b, 0) / avgMetrics.length;
  const variance = avgMetrics.reduce((sum, val) => sum + Math.pow(val - avgMean, 2), 0) / avgMetrics.length;

  let topCategoryWeight = 0;
  let totalWeight = 0;
  if (academicOrientation?.allOrientations || academicOrientation?.all) {
    const orientations = academicOrientation.allOrientations || academicOrientation.all;
    orientations.forEach(cat => {
      if (cat.weight > topCategoryWeight) topCategoryWeight = cat.weight;
      totalWeight += cat.weight;
    });
  }
  const concentration = totalWeight > 0 ? topCategoryWeight / totalWeight : 0.5;

  // Infer EI
  const varietyRatio = uniqueSubjects / Math.min(totalReports, 20);
  const switchRate = switches / Math.max(totalReports - 1, 1);
  const explorerScore = (varietyRatio * 40) + (switchRate * 30) + ((1 - concentration) * 30);
  const EI = Math.round(Math.max(0, Math.min(100, 100 - (explorerScore * 100))));

  // Infer SC
  const conversationNorm = (metrics.conversation / 5) * 100;
  const socialBehavior = ((metrics.behavior + metrics.conversation) / 10) * 100;
  const socialScore = (conversationNorm * 0.5) + (socialBehavior * 0.3);
  const concentrationIndicator = ((metrics.retention - metrics.conversation + 5) / 10) * 100;
  const SC = Math.round(Math.max(0, Math.min(100, 100 - socialScore + (concentrationIndicator * 0.2))));

  // Infer PT
  const practicalCategories = ['stem', 'trades', 'arts'];
  const theoreticalCategories = ['language_arts', 'social_sciences', 'writing'];
  let practicalWeight = 0, theoreticalWeight = 0;
  const orientations = academicOrientation?.allOrientations || academicOrientation?.all || [];
  orientations.forEach(cat => {
    if (practicalCategories.includes(cat.category)) practicalWeight += cat.weight;
    if (theoreticalCategories.includes(cat.category)) theoreticalWeight += cat.weight;
  });
  const ptTotal = (practicalWeight + theoreticalWeight) || 1;
  const categoryScore = (theoreticalWeight / ptTotal) * 100;
  const executionVsConcept = ((metrics.comprehension - metrics.handwriting + 5) / 10) * 100;
  const PT = Math.round(Math.max(0, Math.min(100, (categoryScore * 0.5) + (executionVsConcept * 0.3) + ((metrics.retention / 5) * 20))));

  // Infer RN
  const varianceScore = Math.min(variance * 30, 100);
  const newSubjectsRate = uniqueSubjects / Math.max(totalReports / 5, 1);
  const experimentScore = Math.min(newSubjectsRate * 25, 100);
  const RN = Math.round(Math.max(0, Math.min(100, (varianceScore * 0.6) + (experimentScore * 0.4))));

  // Infer AD
  const comprehensionScore = (metrics.comprehension / 5) * 100;
  const retentionScore = (metrics.retention / 5) * 100;
  const analyticalIndicator = (comprehensionScore * 0.4) + (retentionScore * 0.3);
  const actionScore = ((metrics.behavior + metrics.conversation) / 10) * 100;
  const deliberateScore = ((metrics.attention + metrics.retention) / 10) * 100;
  const balanceScore = actionScore - deliberateScore + 50;
  const AD = Math.round(Math.max(0, Math.min(100, 100 - analyticalIndicator + (balanceScore * 0.3))));

  // Infer LG
  const handwritingScore = (metrics.handwriting / 5) * 100;
  const localIndicator = handwritingScore * 0.4;
  const globalIndicator = (comprehensionScore * 0.35) + (50 * 0.25);
  const LG = Math.round(Math.max(0, Math.min(100, globalIndicator + (50 - localIndicator * 0.5))));

  let confidence = 0.5;
  if (totalReports >= 20) confidence += 0.15;
  else if (totalReports >= 10) confidence += 0.1;
  else if (totalReports >= 5) confidence += 0.05;
  if (uniqueSubjects >= 5) confidence += 0.05;
  confidence = Math.min(confidence, 0.7);

  return {
    scores: { EI, SC, PT, RN, AD, LG },
    confidence,
    dataPoints: { reportCount: totalReports, subjectsCount: uniqueSubjects }
  };
}

function calculateQuizScores(answers) {
  const scores = { EI: 50, SC: 50, PT: 50, RN: 50, AD: 50, LG: 50 };
  answers.forEach((answer, index) => {
    const question = QUIZ_QUESTIONS[index];
    if (question) {
      const points = answer === 'A' ? question.optionA.points : question.optionB.points;
      scores[question.dimension] += points;
    }
  });
  Object.keys(scores).forEach(key => {
    scores[key] = Math.max(0, Math.min(100, scores[key]));
  });
  return scores;
}

function combinePersonalityScores(inferredScores, quizScores) {
  const combined = {};
  const dimensions = ['EI', 'SC', 'PT', 'RN', 'AD', 'LG'];
  dimensions.forEach(dim => {
    combined[dim] = Math.round(
      (inferredScores[dim] * PERSONALITY_WEIGHTS.INFERRED) +
      (quizScores[dim] * PERSONALITY_WEIGHTS.QUIZ)
    );
    combined[dim] = Math.max(0, Math.min(100, combined[dim]));
  });
  return combined;
}

function generatePersonalityCode(scores) {
  const codeMap = {
    EI: { left: 'E', right: 'I' },
    SC: { left: 'S', right: 'C' },
    PT: { left: 'P', right: 'T' },
    RN: { left: 'R', right: 'N' },
    AD: { left: 'A', right: 'D' },
    LG: { left: 'L', right: 'G' }
  };

  let code = '';
  const details = [];

  Object.entries(codeMap).forEach(([dimension, map]) => {
    const score = scores[dimension];
    let letter, pole, strength;

    if (score <= PERSONALITY_SCORE_THRESHOLDS.STRONG_LEFT) {
      letter = map.left; pole = 'left'; strength = 'strong';
    } else if (score <= PERSONALITY_SCORE_THRESHOLDS.MODERATE_LEFT) {
      letter = map.left; pole = 'left'; strength = 'moderate';
    } else if (score <= PERSONALITY_SCORE_THRESHOLDS.BALANCED_HIGH) {
      letter = map.left.toLowerCase(); pole = 'balanced'; strength = 'balanced';
    } else if (score <= PERSONALITY_SCORE_THRESHOLDS.MODERATE_RIGHT) {
      letter = map.right; pole = 'right'; strength = 'moderate';
    } else {
      letter = map.right; pole = 'right'; strength = 'strong';
    }

    code += letter;
    details.push({
      dimension,
      dimensionName: PERSONALITY_DIMENSIONS[dimension].name,
      score,
      letter,
      pole,
      strength,
      leftLabel: PERSONALITY_DIMENSIONS[dimension].leftPole.name,
      rightLabel: PERSONALITY_DIMENSIONS[dimension].rightPole.name,
      leftDesc: PERSONALITY_DIMENSIONS[dimension].leftPole.description,
      rightDesc: PERSONALITY_DIMENSIONS[dimension].rightPole.description
    });
  });

  return { code, details };
}

function matchPersonaType(scores, confidence) {
  if (!scores) return null;

  if (confidence !== undefined && confidence < 0.4) {
    const phoenix = PERSONA_TYPES['rising_phoenix'];
    if (phoenix) {
      return {
        primary: { ...phoenix, matchScore: 100 },
        secondary: null,
        tertiary: null,
        lowConfidence: true
      };
    }
  }

  const results = [];
  const dimensions = ['EI', 'SC', 'PT', 'RN', 'AD', 'LG'];

  Object.values(PERSONA_TYPES).forEach(persona => {
    if (persona.id === 'rising_phoenix') return;

    let weightedDistSq = 0;
    let totalWeight = 0;

    dimensions.forEach(dim => {
      const raw = scores[dim];
      const studentScore = (raw != null && !Number.isNaN(raw)) ? raw : 50;
      const archetypeScore = persona.archetypeScores[dim];
      const weight = persona.dominantDimensions.includes(dim) ? 3 : 1;
      const diff = studentScore - archetypeScore;
      weightedDistSq += weight * diff * diff;
      totalWeight += weight;
    });

    const avgDist = Math.sqrt(weightedDistSq / totalWeight);
    const matchScore = Math.max(0, Math.round(100 - avgDist));

    results.push(Object.assign({}, persona, { matchScore }));
  });

  results.sort((a, b) => b.matchScore - a.matchScore);

  return {
    primary: results[0] || null,
    secondary: results[1] || null,
    tertiary: results[2] || null,
    lowConfidence: false
  };
}

function categorizeSubject(subjectName) {
  if (!subjectName) return 'general';
  const lowerName = subjectName.toLowerCase();
  for (const [category, config] of Object.entries(SUBJECT_CATEGORIES)) {
    if (config.keywords.some(kw => lowerName.includes(kw))) {
      return category;
    }
  }
  return 'general';
}

function analyzeAcademicOrientation(subjectComparison) {
  if (!subjectComparison || subjectComparison.length === 0) {
    return { primary: null, secondary: null, all: [], isSpecialized: false };
  }

  const categoryScores = {};

  for (const subject of subjectComparison) {
    const subjectName = subject.subject || subject.Subject;
    const category = categorizeSubject(subjectName);
    if (!categoryScores[category]) {
      categoryScores[category] = { totalScore: 0, totalReports: 0, subjects: [] };
    }
    const rating = subject.averageRating || subject.average_rating;
    const count = subject.reportCount || subject.report_count;
    categoryScores[category].totalScore += rating * count;
    categoryScores[category].totalReports += count;
    categoryScores[category].subjects.push({
      name: subjectName,
      rating: rating,
      reports: count
    });
  }

  const orientations = [];
  for (const [category, data] of Object.entries(categoryScores)) {
    if (category === 'general') continue;
    const avgRating = data.totalReports > 0 ? data.totalScore / data.totalReports : 0;
    const config = SUBJECT_CATEGORIES[category];
    orientations.push({
      category,
      name: config?.name || category,
      icon: config?.icon || '\u{1F4D6}',
      avgRating: parseFloat(avgRating.toFixed(2)),
      totalReports: data.totalReports,
      subjects: data.subjects,
      weight: data.totalReports * avgRating
    });
  }

  orientations.sort((a, b) => b.weight - a.weight);

  return {
    primary: orientations[0] || null,
    secondary: orientations[1] || null,
    all: orientations,
    allOrientations: orientations,
    isSpecialized: orientations.length > 0 && orientations[0].weight > (orientations[1]?.weight || 0) * 1.5
  };
}

function analyzeLearningProfile(metrics) {
  const { attention, retention, comprehension, behavior, handwriting, conversation } = metrics;
  const avg = (attention + retention + comprehension + behavior + handwriting + conversation) / 6;

  if (attention >= 4 && retention >= 4 && comprehension >= 4 &&
      behavior >= 4 && handwriting >= 4 && conversation >= 4) {
    return LEARNING_PROFILES.balanced_achiever;
  }

  if (avg < 2.5) {
    return LEARNING_PROFILES.emerging_learner;
  }

  const variance = [attention, retention, comprehension, behavior, handwriting, conversation]
    .map(m => Math.abs(m - avg))
    .reduce((a, b) => a + b, 0) / 6;
  if (variance < 0.4 && behavior >= 3.5 && avg >= 3.0 && avg < 4.0) {
    return LEARNING_PROFILES.steady_achiever;
  }

  const metricPairs = [
    { profile: 'engaged_communicator', metrics: [conversation, comprehension], sum: conversation + comprehension },
    { profile: 'disciplined_executor', metrics: [attention, behavior], sum: attention + behavior },
    { profile: 'meticulous_documenter', metrics: [handwriting, retention], sum: handwriting + retention },
    { profile: 'analytical_absorber', metrics: [retention, comprehension], sum: retention + comprehension },
    { profile: 'expressive_performer', metrics: [conversation, handwriting], sum: conversation + handwriting },
    { profile: 'quiet_reflector', metrics: [retention, behavior], sum: retention + behavior, condition: conversation < 3.5 },
    { profile: 'active_collaborator', metrics: [behavior, conversation, attention], sum: (behavior + conversation + attention) / 1.5, condition: behavior >= 4 && conversation >= 3.5 },
    { profile: 'visual_processor', metrics: [comprehension, handwriting], sum: comprehension + handwriting, condition: handwriting >= 4 && comprehension >= 4 },
    { profile: 'kinesthetic_learner', metrics: [behavior, attention], sum: behavior + attention, condition: handwriting < 3.5 && behavior >= 3.5 }
  ];

  const validPairs = metricPairs.filter(p => p.condition === undefined || p.condition);
  validPairs.sort((a, b) => b.sum - a.sum);

  return LEARNING_PROFILES[validPairs[0].profile];
}

function analyzeSkillProfile(chartData) {
  const strengths = [];
  const weaknesses = [];

  const skillFocus = chartData.skillFocusBreakdown || [];
  for (const skill of skillFocus) {
    if (skill.percentage >= 80 && skill.total >= 2) {
      strengths.push({
        skill: skill.topic,
        subject: skill.subject,
        successRate: skill.percentage,
        instances: skill.total
      });
    }
  }

  const weaknessData = chartData.weaknessFrequency || [];
  for (const w of weaknessData.slice(0, 10)) {
    weaknesses.push({
      skill: w.weakness,
      frequency: w.count,
      trend: w.trend,
      priority: w.priorityScore
    });
  }

  return { strengths, weaknesses };
}

function analyzeGaps(metrics, skillProfile, performanceTier) {
  const gaps = [];

  const metricLabels = {
    attention: 'Attention & Focus',
    retention: 'Information Retention',
    comprehension: 'Comprehension',
    behavior: 'Behavior & Self-Regulation',
    handwriting: 'Written Expression',
    conversation: 'Verbal Communication'
  };

  const impacts = {
    attention: 'Affects ability to absorb new information and stay engaged',
    retention: 'Limits long-term learning and knowledge building',
    comprehension: 'Impacts understanding of complex concepts',
    behavior: 'May affect classroom participation and peer relationships',
    handwriting: 'Can impact written assessments and note-taking effectiveness',
    conversation: 'Limits verbal participation and collaborative learning'
  };

  for (const [key, label] of Object.entries(metricLabels)) {
    const value = metrics[key];
    if (value < 4.0) {
      gaps.push({
        area: label,
        currentLevel: parseFloat(value.toFixed(1)),
        targetLevel: 4.0,
        severity: value < 3.0 ? 'critical' : value < 3.5 ? 'significant' : 'moderate',
        impact: impacts[key] || 'Area needs development'
      });
    }
  }

  const severityOrder = { critical: 0, significant: 1, moderate: 2 };
  gaps.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const persistentWeaknesses = (skillProfile.weaknesses || [])
    .filter(w => w.trend === 'worsening' || w.frequency >= 5)
    .slice(0, 3)
    .map(w => ({
      area: w.skill,
      severity: w.trend === 'worsening' ? 'significant' : 'moderate',
      impact: `Recurring issue (${w.frequency} occurrences, trend: ${w.trend})`,
      isSkillGap: true
    }));

  return {
    metricGaps: gaps,
    skillGaps: persistentWeaknesses,
    totalGaps: gaps.length + persistentWeaknesses.length,
    overallAssessment: gaps.length === 0 && persistentWeaknesses.length === 0
      ? 'On track - maintain current effort'
      : gaps.length >= 3 || persistentWeaknesses.length >= 2
        ? 'Multiple areas need focused attention'
        : 'Specific areas identified for improvement'
  };
}

function getImprovementTips(metric, gap) {
  const tips = {
    attention: [
      'Practice focused work in 25-minute intervals (Pomodoro technique)',
      'Remove distractions during study time',
      'Use active engagement strategies like note-taking'
    ],
    retention: [
      'Use spaced repetition when reviewing material',
      'Create mind maps to connect concepts',
      'Teach what you learn to others'
    ],
    comprehension: [
      'Ask "why" and "how" questions while learning',
      'Summarize concepts in your own words',
      'Connect new information to what you already know'
    ],
    behavior: [
      'Set personal goals for each class',
      'Practice self-regulation techniques',
      'Develop consistent routines'
    ],
    handwriting: [
      'Practice letter formation with purpose',
      'Use proper posture and grip',
      'Slow down to focus on quality'
    ],
    conversation: [
      'Start by contributing one thought per class',
      'Prepare questions beforehand',
      'Practice explaining ideas to family/friends'
    ]
  };
  return tips[metric]?.slice(0, gap > 1.5 ? 3 : 2) || [];
}

/**
 * Compute average metrics from an array of report objects (SQLite format).
 * Reports should have .attention, .retention, .comprehension, .behavior, .handwriting, .conversation
 */
function computeAverageMetrics(reports) {
  if (!reports || reports.length === 0) {
    return { attention: 3, retention: 3, comprehension: 3, behavior: 3, handwriting: 3, conversation: 3 };
  }

  const sums = { attention: 0, retention: 0, comprehension: 0, behavior: 0, handwriting: 0, conversation: 0 };
  const counts = { attention: 0, retention: 0, comprehension: 0, behavior: 0, handwriting: 0, conversation: 0 };

  for (const r of reports) {
    for (const key of Object.keys(sums)) {
      const val = parseFloat(r[key]);
      if (!isNaN(val)) {
        sums[key] += val;
        counts[key]++;
      }
    }
  }

  const result = {};
  for (const key of Object.keys(sums)) {
    result[key] = counts[key] > 0 ? parseFloat((sums[key] / counts[key]).toFixed(2)) : 3;
  }
  return result;
}

/**
 * Full snapshot computation for a student at a given date.
 * Takes all reports up to that date, computes metrics, personality, persona type, and weaknesses.
 * Returns an object ready for insertion.
 */
function computeSnapshot(reports, quizData, subjectComparison) {
  if (!reports || reports.length < MIN_REPORTS_FOR_PERSONALITY) {
    return null;
  }

  const metrics = computeAverageMetrics(reports);
  const academicOrientation = analyzeAcademicOrientation(subjectComparison || []);
  const learningProfile = analyzeLearningProfile(metrics);

  // Calculate personality
  const inferredResult = calculateInferredPersonality(reports, metrics, academicOrientation);
  if (!inferredResult) return null;

  let finalScores, source, confidence;
  if (quizData && quizData.taken) {
    const quizScores = typeof quizData.scores === 'string' ? JSON.parse(quizData.scores) : quizData.scores;
    finalScores = combinePersonalityScores(inferredResult.scores, quizScores);
    source = 'combined';
    confidence = Math.min(0.95, inferredResult.confidence + 0.25);
  } else {
    finalScores = inferredResult.scores;
    source = 'inferred';
    confidence = inferredResult.confidence;
  }

  const codeResult = generatePersonalityCode(finalScores);
  const personaType = matchPersonaType(finalScores, confidence);

  // Compute performance tier (simplified without chart data)
  const metricsAvg = (metrics.attention + metrics.retention + metrics.comprehension +
    metrics.behavior + metrics.handwriting + metrics.conversation) / 6;
  const lowestMetric = Math.min(metrics.attention, metrics.retention, metrics.comprehension,
    metrics.behavior, metrics.handwriting, metrics.conversation);

  let tier;
  if (metricsAvg >= 4.5 && lowestMetric >= 4.2) tier = 'exceptional';
  else if (metricsAvg >= 4.0 && lowestMetric >= 3.5) tier = 'solid';
  else if (metricsAvg >= 3.5 && lowestMetric >= 3.0) tier = 'developing';
  else if (metricsAvg >= 3.0) tier = 'emerging';
  else tier = 'struggling';

  // Compute weaknesses from metrics
  const weaknesses = [];
  const metricLabels = {
    attention: 'Attention & Focus',
    retention: 'Information Retention',
    comprehension: 'Comprehension',
    behavior: 'Behavior & Self-Regulation',
    handwriting: 'Written Expression',
    conversation: 'Verbal Communication'
  };
  for (const [key, label] of Object.entries(metricLabels)) {
    if (metrics[key] < 4.0) {
      weaknesses.push({
        weakness_type: 'metric',
        area: label,
        current_level: metrics[key],
        target_level: 4.0,
        severity: metrics[key] < 3.0 ? 'critical' : metrics[key] < 3.5 ? 'significant' : 'moderate',
        frequency: null,
        trend: null,
        impact: null
      });
    }
  }

  return {
    snapshot: {
      report_count: reports.length,
      score_ei: finalScores.EI,
      score_sc: finalScores.SC,
      score_pt: finalScores.PT,
      score_rn: finalScores.RN,
      score_ad: finalScores.AD,
      score_lg: finalScores.LG,
      score_source: source,
      confidence: confidence,
      personality_code: codeResult.code,
      persona_type_id: personaType?.primary?.id || null,
      persona_type_name: personaType?.primary?.name || null,
      persona_match_score: personaType?.primary?.matchScore || null,
      learning_profile_id: learningProfile.id,
      performance_tier: tier,
      metrics_average: parseFloat(metricsAvg.toFixed(2)),
      avg_attention: metrics.attention,
      avg_retention: metrics.retention,
      avg_comprehension: metrics.comprehension,
      avg_behavior: metrics.behavior,
      avg_handwriting: metrics.handwriting,
      avg_conversation: metrics.conversation
    },
    weaknesses,
    personalityScores: finalScores,
    personaType
  };
}

module.exports = {
  // Constants
  SUBJECT_CATEGORIES,
  PERSONALITY_DIMENSIONS,
  PERSONALITY_SCORE_THRESHOLDS,
  PERSONALITY_WEIGHTS,
  MIN_REPORTS_FOR_PERSONALITY,
  LEARNING_PROFILES,
  PERSONA_TYPES,
  PERSONA_TYPES_DATA,
  QUIZ_QUESTIONS,
  // Functions
  calculateInferredPersonality,
  calculateQuizScores,
  combinePersonalityScores,
  generatePersonalityCode,
  matchPersonaType,
  categorizeSubject,
  analyzeAcademicOrientation,
  analyzeLearningProfile,
  analyzeSkillProfile,
  analyzeGaps,
  getImprovementTips,
  computeAverageMetrics,
  computeSnapshot
};
