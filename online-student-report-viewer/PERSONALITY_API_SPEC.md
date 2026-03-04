# STELLAR Personality System - Technical API Specification

## Overview

This document provides detailed technical specifications for implementing the Personality System APIs.

---

## Table of Contents

1. [Constants & Configuration](#1-constants--configuration)
2. [API Endpoints](#2-api-endpoints)
3. [Data Storage](#3-data-storage)
4. [Algorithm Implementations](#4-algorithm-implementations)
5. [Error Handling](#5-error-handling)
6. [Frontend Integration](#6-frontend-integration)

---

## 1. Constants & Configuration

### 1.1 Personality Dimensions Constants

```javascript
// Add to app.js or create new file: constants/personality.js

const PERSONALITY_DIMENSIONS = {
  EI: {
    code: 'EI',
    name: 'Interest Scope',
    leftPole: { code: 'E', name: 'Explorer', description: 'Enjoys variety and breadth' },
    rightPole: { code: 'I', name: 'Investigator', description: 'Prefers depth and mastery' }
  },
  SC: {
    code: 'SC',
    name: 'Work Style',
    leftPole: { code: 'S', name: 'Social', description: 'Energized by collaboration' },
    rightPole: { code: 'C', name: 'Concentrated', description: 'Prefers independent focus' }
  },
  PT: {
    code: 'PT',
    name: 'Learning Mode',
    leftPole: { code: 'P', name: 'Practical', description: 'Learns by doing' },
    rightPole: { code: 'T', name: 'Theoretical', description: 'Learns by thinking' }
  },
  RN: {
    code: 'RN',
    name: 'Change Preference',
    leftPole: { code: 'R', name: 'Routine', description: 'Values consistency' },
    rightPole: { code: 'N', name: 'Novel', description: 'Embraces change' }
  },
  AD: {
    code: 'AD',
    name: 'Decision Style',
    leftPole: { code: 'A', name: 'Analytical', description: 'Deliberate and thorough' },
    rightPole: { code: 'D', name: 'Decisive', description: 'Quick and action-oriented' }
  },
  LG: {
    code: 'LG',
    name: 'Focus Level',
    leftPole: { code: 'L', name: 'Local', description: 'Detail-oriented' },
    rightPole: { code: 'G', name: 'Global', description: 'Big-picture thinker' }
  }
};

const SCORE_THRESHOLDS = {
  STRONG_LEFT: 35,      // 0-35: Strong left pole
  MODERATE_LEFT: 44,    // 36-44: Moderate left pole
  BALANCED_LOW: 45,     // 45-55: Balanced
  BALANCED_HIGH: 55,
  MODERATE_RIGHT: 65,   // 56-65: Moderate right pole
  STRONG_RIGHT: 100     // 66-100: Strong right pole
};

const INFERENCE_WEIGHTS = {
  QUIZ: 0.65,           // Quiz results weight
  INFERRED: 0.35        // Inferred data weight
};

const MIN_REPORTS_FOR_INFERENCE = 3;
const MIN_CONFIDENCE_THRESHOLD = 0.4;
```

### 1.2 Quiz Questions Configuration

```javascript
// Add to: data/quiz-questions.json or constants/quiz.js

const QUIZ_QUESTIONS = [
  {
    number: 1,
    dimension: 'EI',
    text: "When you have free time to learn something new, you prefer to...",
    optionA: {
      text: "Try out many different topics to see what's interesting",
      direction: 'left',  // Explorer
      points: -25
    },
    optionB: {
      text: "Pick one topic and learn everything you can about it",
      direction: 'right', // Investigator
      points: +25
    }
  },
  {
    number: 2,
    dimension: 'EI',
    text: "If you could choose your school schedule, you would...",
    optionA: {
      text: "Take many different subjects, even if you're not expert in any",
      direction: 'left',
      points: -25
    },
    optionB: {
      text: "Focus on fewer subjects but become really good at them",
      direction: 'right',
      points: +25
    }
  },
  {
    number: 3,
    dimension: 'SC',
    text: "You understand new ideas better when you...",
    optionA: {
      text: "Discuss them with classmates or friends",
      direction: 'left',  // Social
      points: -25
    },
    optionB: {
      text: "Think about them quietly by yourself",
      direction: 'right', // Concentrated
      points: +25
    }
  },
  {
    number: 4,
    dimension: 'SC',
    text: "For a big project, you would rather...",
    optionA: {
      text: "Work with a group and share ideas",
      direction: 'left',
      points: -25
    },
    optionB: {
      text: "Work alone and create your own vision",
      direction: 'right',
      points: +25
    }
  },
  {
    number: 5,
    dimension: 'PT',
    text: "You find it more exciting to...",
    optionA: {
      text: "Build, create, or make something with your hands",
      direction: 'left',  // Practical
      points: -25
    },
    optionB: {
      text: "Think about ideas, theories, or possibilities",
      direction: 'right', // Theoretical
      points: +25
    }
  },
  {
    number: 6,
    dimension: 'PT',
    text: "When learning about a topic, you prefer...",
    optionA: {
      text: "Doing experiments or real-world activities",
      direction: 'left',
      points: -25
    },
    optionB: {
      text: "Reading, watching videos, or hearing explanations",
      direction: 'right',
      points: +25
    }
  },
  {
    number: 7,
    dimension: 'RN',
    text: "You feel most comfortable when...",
    optionA: {
      text: "You know what to expect and have a clear plan",
      direction: 'left',  // Routine
      points: -25
    },
    optionB: {
      text: "Things are new, different, and surprising",
      direction: 'right', // Novel
      points: +25
    }
  },
  {
    number: 8,
    dimension: 'RN',
    text: "If your teacher suddenly changed the lesson plan, you would...",
    optionA: {
      text: "Feel a bit frustrated and prefer sticking to the plan",
      direction: 'left',
      points: -25
    },
    optionB: {
      text: "Feel excited about trying something different",
      direction: 'right',
      points: +25
    }
  },
  {
    number: 9,
    dimension: 'AD',
    text: "When making a decision, you usually...",
    optionA: {
      text: "Think carefully about all options before choosing",
      direction: 'left',  // Analytical
      points: -25
    },
    optionB: {
      text: "Go with your gut feeling and decide quickly",
      direction: 'right', // Decisive
      points: +25
    }
  },
  {
    number: 10,
    dimension: 'AD',
    text: "When solving a problem, you prefer to...",
    optionA: {
      text: "Take your time and consider every detail",
      direction: 'left',
      points: -25
    },
    optionB: {
      text: "Jump in and figure it out as you go",
      direction: 'right',
      points: +25
    }
  },
  {
    number: 11,
    dimension: 'LG',
    text: "When reading instructions, you usually...",
    optionA: {
      text: "Follow each step carefully, one at a time",
      direction: 'left',  // Local
      points: -25
    },
    optionB: {
      text: "Skim to get the big picture, then figure out details",
      direction: 'right', // Global
      points: +25
    }
  },
  {
    number: 12,
    dimension: 'LG',
    text: "You're more interested in understanding...",
    optionA: {
      text: "How the small parts work in detail",
      direction: 'left',
      points: -25
    },
    optionB: {
      text: "How everything connects together as a whole",
      direction: 'right',
      points: +25
    }
  }
];
```

---

## 2. API Endpoints

### 2.1 Get Personality Profile

```javascript
/**
 * GET /api/personality/:studentName
 *
 * Returns the complete personality profile for a student.
 * If no profile exists, calculates inferred scores from report data.
 */

app.get('/api/personality/:studentName', async (req, res) => {
  try {
    const { studentName } = req.params;
    const decodedName = decodeURIComponent(studentName);

    // Get student reports
    const reports = await getStudentReports(decodedName);

    if (reports.length < MIN_REPORTS_FOR_INFERENCE) {
      return res.json({
        studentName: decodedName,
        hasProfile: false,
        message: `Need at least ${MIN_REPORTS_FOR_INFERENCE} reports to generate personality profile`,
        reportCount: reports.length
      });
    }

    // Check for existing quiz data
    const quizData = await getStudentQuizData(decodedName);

    // Calculate inferred scores
    const inferredScores = calculateInferredPersonality(reports, decodedName);

    // Combine scores if quiz exists
    let finalProfile;
    if (quizData && quizData.taken) {
      finalProfile = combineScores(inferredScores.scores, quizData.scores);
    } else {
      finalProfile = {
        scores: inferredScores.scores,
        source: 'inferred',
        confidence: inferredScores.confidence
      };
    }

    // Generate personality code
    const codeResult = generatePersonalityCode(finalProfile.scores);

    // Generate descriptions
    const descriptions = generatePersonalityDescriptions(finalProfile.scores, codeResult);

    res.json({
      studentName: decodedName,
      hasProfile: true,
      inferredScores: inferredScores.scores,
      quizData: quizData || null,
      finalProfile: {
        scores: finalProfile.scores,
        code: codeResult.code,
        codeDetails: codeResult.details,
        source: finalProfile.source,
        confidence: finalProfile.confidence,
        generatedAt: new Date().toISOString()
      },
      descriptions,
      dataPoints: {
        reportCount: reports.length,
        dateRange: calculateDateRange(reports),
        subjectsCount: new Set(reports.map(r => r.subject)).size
      }
    });

  } catch (error) {
    console.error('Error getting personality profile:', error);
    res.status(500).json({ error: 'Failed to get personality profile', details: error.message });
  }
});
```

### 2.2 Recalculate Inferred Personality

```javascript
/**
 * POST /api/personality/infer/:studentName
 *
 * Forces recalculation of inferred personality scores from report data.
 */

app.post('/api/personality/infer/:studentName', async (req, res) => {
  try {
    const { studentName } = req.params;
    const decodedName = decodeURIComponent(studentName);

    const reports = await getStudentReports(decodedName);

    if (reports.length < MIN_REPORTS_FOR_INFERENCE) {
      return res.status(400).json({
        error: 'Insufficient data',
        message: `Need at least ${MIN_REPORTS_FOR_INFERENCE} reports`,
        reportCount: reports.length
      });
    }

    const inferredScores = calculateInferredPersonality(reports, decodedName);

    // Store inferred scores (optional - for caching)
    await storeInferredScores(decodedName, inferredScores);

    res.json({
      studentName: decodedName,
      inferredScores: inferredScores.scores,
      confidence: inferredScores.confidence,
      calculatedAt: new Date().toISOString(),
      dataPoints: {
        reportCount: reports.length,
        dateRange: calculateDateRange(reports),
        subjectsCount: new Set(reports.map(r => r.subject)).size
      }
    });

  } catch (error) {
    console.error('Error calculating inferred personality:', error);
    res.status(500).json({ error: 'Failed to calculate personality', details: error.message });
  }
});
```

### 2.3 Get Quiz Questions

```javascript
/**
 * GET /api/personality/quiz/questions
 *
 * Returns all quiz questions for the personality assessment.
 */

app.get('/api/personality/quiz/questions', (req, res) => {
  // Return questions without the scoring information (for fairness)
  const questionsForClient = QUIZ_QUESTIONS.map(q => ({
    number: q.number,
    dimension: q.dimension,
    text: q.text,
    optionA: { text: q.optionA.text },
    optionB: { text: q.optionB.text }
  }));

  res.json({
    totalQuestions: questionsForClient.length,
    estimatedTime: '3-5 minutes',
    questions: questionsForClient
  });
});
```

### 2.4 Submit Quiz Answers

```javascript
/**
 * POST /api/personality/quiz/:studentName
 *
 * Submits quiz answers and calculates quiz-based personality scores.
 *
 * Request Body:
 * {
 *   answers: ['A', 'B', 'A', 'B', 'A', 'A', 'B', 'B', 'A', 'B', 'A', 'B']
 * }
 */

app.post('/api/personality/quiz/:studentName', async (req, res) => {
  try {
    const { studentName } = req.params;
    const { answers } = req.body;
    const decodedName = decodeURIComponent(studentName);

    // Validate answers
    if (!answers || !Array.isArray(answers) || answers.length !== 12) {
      return res.status(400).json({
        error: 'Invalid answers',
        message: 'Must provide exactly 12 answers (A or B)'
      });
    }

    const validAnswers = answers.every(a => a === 'A' || a === 'B');
    if (!validAnswers) {
      return res.status(400).json({
        error: 'Invalid answer format',
        message: 'Each answer must be either "A" or "B"'
      });
    }

    // Calculate quiz scores
    const quizScores = calculateQuizScores(answers);

    // Store quiz data
    const quizData = {
      taken: true,
      takenAt: new Date().toISOString(),
      answers: answers,
      scores: quizScores
    };

    await storeQuizData(decodedName, quizData);

    // Get inferred scores to combine
    const reports = await getStudentReports(decodedName);
    let finalProfile;

    if (reports.length >= MIN_REPORTS_FOR_INFERENCE) {
      const inferredScores = calculateInferredPersonality(reports, decodedName);
      finalProfile = combineScores(inferredScores.scores, quizScores);
    } else {
      finalProfile = {
        scores: quizScores,
        source: 'quiz',
        confidence: 0.75  // Quiz-only confidence
      };
    }

    // Generate new code
    const codeResult = generatePersonalityCode(finalProfile.scores);
    const descriptions = generatePersonalityDescriptions(finalProfile.scores, codeResult);

    res.json({
      studentName: decodedName,
      quizScores,
      combinedProfile: {
        scores: finalProfile.scores,
        code: codeResult.code,
        codeDetails: codeResult.details,
        source: finalProfile.source,
        confidence: finalProfile.confidence
      },
      descriptions,
      message: 'Quiz completed successfully'
    });

  } catch (error) {
    console.error('Error submitting quiz:', error);
    res.status(500).json({ error: 'Failed to submit quiz', details: error.message });
  }
});
```

### 2.5 Get Career-Personality Matches

```javascript
/**
 * GET /api/careers/personality-match/:studentName
 *
 * Returns career recommendations based on personality profile.
 */

app.get('/api/careers/personality-match/:studentName', async (req, res) => {
  try {
    const { studentName } = req.params;
    const { limit = 6 } = req.query;
    const decodedName = decodeURIComponent(studentName);

    // Get personality profile
    const profileResponse = await getPersonalityProfile(decodedName);

    if (!profileResponse.hasProfile) {
      return res.status(400).json({
        error: 'No personality profile',
        message: 'Student needs more reports or to complete the quiz'
      });
    }

    // Get academic orientation for additional filtering
    const persona = await getStudentPersona(decodedName);

    // Calculate career matches
    const careerMatches = calculateCareerPersonalityMatches(
      profileResponse.finalProfile,
      persona?.academicOrientation,
      parseInt(limit)
    );

    res.json({
      studentName: decodedName,
      personalityCode: profileResponse.finalProfile.code,
      confidence: profileResponse.finalProfile.confidence,
      careers: careerMatches
    });

  } catch (error) {
    console.error('Error getting career matches:', error);
    res.status(500).json({ error: 'Failed to get career matches', details: error.message });
  }
});
```

### 2.6 Get Detailed Career-Personality Fit

```javascript
/**
 * GET /api/careers/:careerTitle/personality-fit/:studentName
 *
 * Returns detailed personality fit analysis for a specific career.
 */

app.get('/api/careers/:careerTitle/personality-fit/:studentName', async (req, res) => {
  try {
    const { careerTitle, studentName } = req.params;
    const decodedName = decodeURIComponent(studentName);
    const decodedCareer = decodeURIComponent(careerTitle);

    // Get career mapping
    const careerMapping = CAREER_PERSONALITY_MAPPINGS[decodedCareer];
    if (!careerMapping) {
      return res.status(404).json({
        error: 'Career not found',
        message: `No personality mapping for career: ${decodedCareer}`
      });
    }

    // Get student personality
    const profileResponse = await getPersonalityProfile(decodedName);

    if (!profileResponse.hasProfile) {
      return res.status(400).json({
        error: 'No personality profile',
        message: 'Student needs more reports or to complete the quiz'
      });
    }

    // Calculate detailed fit
    const detailedFit = calculateDetailedCareerFit(
      profileResponse.finalProfile,
      careerMapping
    );

    res.json({
      career: {
        title: decodedCareer,
        field: careerMapping.field,
        emergingBy: careerMapping.emergingBy
      },
      studentProfile: {
        code: profileResponse.finalProfile.code,
        scores: profileResponse.finalProfile.scores
      },
      fit: detailedFit
    });

  } catch (error) {
    console.error('Error getting career fit:', error);
    res.status(500).json({ error: 'Failed to get career fit', details: error.message });
  }
});
```

---

## 3. Data Storage

### 3.1 File-Based Storage (Simple Implementation)

```javascript
// For MVP, store personality data in a JSON file
// Location: data/personality-profiles.json

const PERSONALITY_DATA_FILE = path.join(__dirname, 'data', 'personality-profiles.json');

function loadPersonalityData() {
  try {
    if (fs.existsSync(PERSONALITY_DATA_FILE)) {
      const data = fs.readFileSync(PERSONALITY_DATA_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading personality data:', error);
  }
  return {};
}

function savePersonalityData(data) {
  try {
    const dir = path.dirname(PERSONALITY_DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(PERSONALITY_DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving personality data:', error);
    throw error;
  }
}

async function getStudentQuizData(studentName) {
  const data = loadPersonalityData();
  return data[studentName]?.quizData || null;
}

async function storeQuizData(studentName, quizData) {
  const data = loadPersonalityData();
  if (!data[studentName]) {
    data[studentName] = {};
  }
  data[studentName].quizData = quizData;
  data[studentName].updatedAt = new Date().toISOString();
  savePersonalityData(data);
}

async function storeInferredScores(studentName, inferredScores) {
  const data = loadPersonalityData();
  if (!data[studentName]) {
    data[studentName] = {};
  }
  data[studentName].inferredScores = inferredScores;
  data[studentName].inferredAt = new Date().toISOString();
  savePersonalityData(data);
}
```

### 3.2 Data Structure

```javascript
// Structure of personality-profiles.json
{
  "John Smith": {
    "inferredScores": {
      "scores": {
        "EI": 65,
        "SC": 40,
        "PT": 55,
        "RN": 48,
        "AD": 35,
        "LG": 60
      },
      "confidence": 0.65,
      "dataPoints": {
        "reportCount": 15,
        "dateRange": 120,
        "subjectsCount": 8
      }
    },
    "inferredAt": "2025-01-20T10:30:00.000Z",
    "quizData": {
      "taken": true,
      "takenAt": "2025-01-25T14:20:00.000Z",
      "answers": ["A", "B", "A", "A", "B", "A", "B", "B", "A", "A", "B", "A"],
      "scores": {
        "EI": 75,
        "SC": 25,
        "PT": 50,
        "RN": 50,
        "AD": 25,
        "LG": 75
      }
    },
    "updatedAt": "2025-01-25T14:20:00.000Z"
  }
}
```

---

## 4. Algorithm Implementations

### 4.1 Quiz Score Calculation

```javascript
function calculateQuizScores(answers) {
  // Initialize all dimensions at neutral (50)
  const scores = {
    EI: 50,
    SC: 50,
    PT: 50,
    RN: 50,
    AD: 50,
    LG: 50
  };

  // Apply each answer
  answers.forEach((answer, index) => {
    const question = QUIZ_QUESTIONS[index];
    const points = answer === 'A' ? question.optionA.points : question.optionB.points;
    scores[question.dimension] += points;
  });

  // Clamp all scores to 0-100
  Object.keys(scores).forEach(key => {
    scores[key] = Math.max(0, Math.min(100, scores[key]));
  });

  return scores;
}
```

### 4.2 Inference Implementation

```javascript
function calculateInferredPersonality(reports, studentName) {
  // Gather data for inference
  const metrics = calculateAverageMetrics(reports);
  const subjectData = analyzeSubjectPatterns(reports);
  const temporalData = analyzeTemporalPatterns(reports);
  const orientationData = analyzeAcademicOrientation(reports);

  // Calculate each dimension
  const scores = {
    EI: inferEI(subjectData, orientationData),
    SC: inferSC(metrics),
    PT: inferPT(metrics, orientationData),
    RN: inferRN(temporalData, subjectData),
    AD: inferAD(metrics),
    LG: inferLG(metrics, subjectData)
  };

  // Calculate confidence
  const confidence = calculateInferenceConfidence(reports, subjectData);

  return { scores, confidence };
}

function inferEI(subjectData, orientationData) {
  // Factor 1: Subject variety (40%)
  const varietyRatio = subjectData.uniqueSubjects / Math.min(subjectData.totalReports, 20);
  const varietyScore = varietyRatio * 100;

  // Factor 2: Subject switching frequency (30%)
  const switchRate = subjectData.switches / Math.max(subjectData.totalReports - 1, 1);
  const switchScore = switchRate * 100;

  // Factor 3: Academic orientation spread (30%)
  const topWeight = orientationData.primary?.weight || 0;
  const totalWeight = orientationData.totalWeight || 1;
  const concentration = topWeight / totalWeight;
  const spreadScore = (1 - concentration) * 100;

  // Combine (high = Investigator, low = Explorer)
  const explorerScore = (varietyScore * 0.4) + (switchScore * 0.3) + (spreadScore * 0.3);
  return Math.round(100 - explorerScore);
}

function inferSC(metrics) {
  // Factor 1: Conversation score (50%)
  const conversationScore = (metrics.conversation / 5) * 100;

  // Factor 2: Social behavior indicator (30%)
  const socialBehavior = ((metrics.behavior + metrics.conversation) / 10) * 100;

  // Factor 3: Concentration indicator (20%)
  const concentrationIndicator = ((metrics.retention - metrics.conversation + 5) / 10) * 100;

  // Combine (high = Concentrated, low = Social)
  const socialScore = (conversationScore * 0.5) + (socialBehavior * 0.3);
  return Math.round(100 - socialScore + (concentrationIndicator * 0.2));
}

function inferPT(metrics, orientationData) {
  // Define category types
  const practicalCategories = ['stem', 'trades', 'arts'];
  const theoreticalCategories = ['language_arts', 'social_sciences', 'writing'];

  // Factor 1: Subject category analysis (50%)
  let practicalWeight = 0;
  let theoreticalWeight = 0;

  orientationData.allOrientations?.forEach(cat => {
    if (practicalCategories.includes(cat.category)) {
      practicalWeight += cat.weight;
    } else if (theoreticalCategories.includes(cat.category)) {
      theoreticalWeight += cat.weight;
    }
  });

  const totalWeight = (practicalWeight + theoreticalWeight) || 1;
  const categoryScore = (theoreticalWeight / totalWeight) * 100;

  // Factor 2: Execution vs Concept (30%)
  const executionVsConcept = ((metrics.comprehension - metrics.handwriting + 5) / 10) * 100;

  // Factor 3: Retention pattern (20%)
  const retentionFactor = (metrics.retention / 5) * 100;

  return Math.round((categoryScore * 0.5) + (executionVsConcept * 0.3) + (retentionFactor * 0.2));
}

function inferRN(temporalData, subjectData) {
  // Factor 1: Metric consistency over time (60%)
  const variance = temporalData.metricsVariance || 0;
  const varianceScore = Math.min(variance * 25, 100);

  // Factor 2: Subject experimentation (40%)
  const newSubjectsRate = subjectData.newSubjectsPerMonth || 0;
  const experimentScore = Math.min(newSubjectsRate * 30, 100);

  return Math.round((varianceScore * 0.6) + (experimentScore * 0.4));
}

function inferAD(metrics) {
  // Factor 1: Comprehension depth (40%)
  const comprehensionScore = (metrics.comprehension / 5) * 100;

  // Factor 2: Retention thoroughness (30%)
  const retentionScore = (metrics.retention / 5) * 100;

  // Factor 3: Action orientation (30%)
  const deliberate = (metrics.attention + metrics.retention) / 10 * 100;
  const action = (metrics.behavior + metrics.conversation) / 10 * 100;
  const balanceScore = action - deliberate + 50;

  // High analytical indicator = low score (Analytical)
  const analyticalIndicator = (comprehensionScore * 0.4) + (retentionScore * 0.3);
  return Math.round(100 - analyticalIndicator + (balanceScore * 0.3));
}

function inferLG(metrics, subjectData) {
  // Factor 1: Handwriting precision (40%) - indicates detail focus
  const handwritingScore = (metrics.handwriting / 5) * 100;

  // Factor 2: Comprehension of concepts (35%) - indicates big picture
  const comprehensionScore = (metrics.comprehension / 5) * 100;

  // Factor 3: Cross-subject consistency (25%)
  const crossSubjectConsistency = subjectData.performanceConsistency || 50;

  // High handwriting = Local, High comprehension = Global
  const localIndicator = handwritingScore * 0.4;
  const globalIndicator = (comprehensionScore * 0.35) + (crossSubjectConsistency * 0.25);

  return Math.round(globalIndicator + (50 - localIndicator * 0.5));
}
```

### 4.3 Score Combination

```javascript
function combineScores(inferredScores, quizScores) {
  const combined = {};
  const dimensions = ['EI', 'SC', 'PT', 'RN', 'AD', 'LG'];

  dimensions.forEach(dim => {
    combined[dim] = Math.round(
      (inferredScores[dim] * INFERENCE_WEIGHTS.INFERRED) +
      (quizScores[dim] * INFERENCE_WEIGHTS.QUIZ)
    );
    // Ensure bounds
    combined[dim] = Math.max(0, Math.min(100, combined[dim]));
  });

  return {
    scores: combined,
    source: 'combined',
    confidence: 0.9  // High confidence with both data sources
  };
}
```

### 4.4 Code Generation

```javascript
function generatePersonalityCode(scores) {
  const codeMap = {
    EI: { left: 'E', right: 'I', name: 'Interest Scope' },
    SC: { left: 'S', right: 'C', name: 'Work Style' },
    PT: { left: 'P', right: 'T', name: 'Learning Mode' },
    RN: { left: 'R', right: 'N', name: 'Change Preference' },
    AD: { left: 'A', right: 'D', name: 'Decision Style' },
    LG: { left: 'L', right: 'G', name: 'Focus Level' }
  };

  let code = '';
  const details = [];

  Object.entries(codeMap).forEach(([dimension, map]) => {
    const score = scores[dimension];
    let letter, pole, strength;

    if (score <= SCORE_THRESHOLDS.STRONG_LEFT) {
      letter = map.left;
      pole = 'left';
      strength = 'strong';
    } else if (score <= SCORE_THRESHOLDS.MODERATE_LEFT) {
      letter = map.left;
      pole = 'left';
      strength = 'moderate';
    } else if (score <= SCORE_THRESHOLDS.BALANCED_HIGH) {
      letter = map.left.toLowerCase();
      pole = 'balanced';
      strength = 'balanced';
    } else if (score <= SCORE_THRESHOLDS.MODERATE_RIGHT) {
      letter = map.right;
      pole = 'right';
      strength = 'moderate';
    } else {
      letter = map.right;
      pole = 'right';
      strength = 'strong';
    }

    code += letter;
    details.push({
      dimension,
      dimensionName: map.name,
      score,
      letter,
      pole,
      strength,
      leftLabel: map.left,
      rightLabel: map.right
    });
  });

  return { code, details };
}
```

### 4.5 Career Matching

```javascript
function calculateCareerPersonalityMatches(profile, academicOrientation, limit = 6) {
  const matches = [];

  Object.entries(CAREER_PERSONALITY_MAPPINGS).forEach(([title, mapping]) => {
    const fitResult = calculateCareerFitScore(profile.scores, mapping);

    // Boost score if academic orientation matches
    let academicBoost = 0;
    if (academicOrientation?.primary?.category) {
      const careerField = mapping.field.toLowerCase();
      const primaryCategory = academicOrientation.primary.category;
      if (isFieldMatchingCategory(careerField, primaryCategory)) {
        academicBoost = 5;
      }
    }

    matches.push({
      title,
      field: mapping.field,
      emergingBy: mapping.emergingBy,
      skills: mapping.skills || [],
      matchScore: Math.min(100, fitResult.overallMatch + academicBoost),
      recommendation: fitResult.recommendation,
      personalityFit: {
        strengths: fitResult.strengths.map(s => ({
          dimension: s.dimension,
          feedback: s.feedback
        })),
        challenges: fitResult.challenges.map(c => ({
          dimension: c.dimension,
          feedback: c.feedback
        }))
      }
    });
  });

  // Sort by match score
  matches.sort((a, b) => b.matchScore - a.matchScore);

  return matches.slice(0, limit);
}

function calculateCareerFitScore(studentScores, careerMapping) {
  let totalScore = 0;
  let totalWeight = 0;
  const fitAnalysis = [];

  const dimensions = ['EI', 'SC', 'PT', 'RN', 'AD', 'LG'];

  dimensions.forEach(dim => {
    const studentScore = studentScores[dim];
    const idealScore = careerMapping.idealTraits[dim];
    const weight = careerMapping.traitWeights?.[dim] || 1;

    const distance = Math.abs(studentScore - idealScore);
    const dimensionMatch = 100 - distance;

    totalScore += dimensionMatch * weight;
    totalWeight += weight;

    const isGoodFit = distance <= 25;
    const isChallenge = distance >= 40;

    fitAnalysis.push({
      dimension: dim,
      studentScore,
      idealScore,
      distance,
      match: dimensionMatch,
      weight,
      isGoodFit,
      isChallenge,
      feedback: isGoodFit
        ? careerMapping.traitFit?.[dim]?.good
        : (isChallenge ? careerMapping.traitFit?.[dim]?.challenge : null)
    });
  });

  const overallMatch = Math.round(totalScore / totalWeight);

  return {
    overallMatch,
    fitAnalysis,
    strengths: fitAnalysis.filter(f => f.isGoodFit && f.feedback).sort((a, b) => b.weight - a.weight).slice(0, 2),
    challenges: fitAnalysis.filter(f => f.isChallenge && f.feedback).sort((a, b) => b.weight - a.weight).slice(0, 1),
    recommendation: overallMatch >= 70 ? 'strong' : (overallMatch >= 50 ? 'moderate' : 'developing')
  };
}
```

---

## 5. Error Handling

```javascript
// Standard error responses

const PersonalityErrors = {
  INSUFFICIENT_DATA: {
    code: 'INSUFFICIENT_DATA',
    status: 400,
    message: 'Not enough report data to generate personality profile'
  },
  INVALID_QUIZ_ANSWERS: {
    code: 'INVALID_QUIZ_ANSWERS',
    status: 400,
    message: 'Invalid quiz answers format'
  },
  STUDENT_NOT_FOUND: {
    code: 'STUDENT_NOT_FOUND',
    status: 404,
    message: 'Student not found'
  },
  CAREER_NOT_FOUND: {
    code: 'CAREER_NOT_FOUND',
    status: 404,
    message: 'Career not found in mappings'
  },
  CALCULATION_ERROR: {
    code: 'CALCULATION_ERROR',
    status: 500,
    message: 'Error calculating personality scores'
  }
};

function handlePersonalityError(res, errorType, details = null) {
  const error = PersonalityErrors[errorType] || PersonalityErrors.CALCULATION_ERROR;
  res.status(error.status).json({
    error: error.code,
    message: error.message,
    details
  });
}
```

---

## 6. Frontend Integration

### 6.1 API Call Examples

```javascript
// In persona-script.js or personality-display.js

// Get personality profile
async function fetchPersonalityProfile(studentName) {
  try {
    const response = await fetch(`/api/personality/${encodeURIComponent(studentName)}`);
    if (!response.ok) throw new Error('Failed to fetch profile');
    return await response.json();
  } catch (error) {
    console.error('Error fetching personality:', error);
    return null;
  }
}

// Submit quiz
async function submitQuiz(studentName, answers) {
  try {
    const response = await fetch(`/api/personality/quiz/${encodeURIComponent(studentName)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers })
    });
    if (!response.ok) throw new Error('Failed to submit quiz');
    return await response.json();
  } catch (error) {
    console.error('Error submitting quiz:', error);
    return null;
  }
}

// Get career matches with personality
async function fetchCareerMatches(studentName) {
  try {
    const response = await fetch(`/api/careers/personality-match/${encodeURIComponent(studentName)}`);
    if (!response.ok) throw new Error('Failed to fetch careers');
    return await response.json();
  } catch (error) {
    console.error('Error fetching career matches:', error);
    return null;
  }
}
```

### 6.2 URL Parameters

```javascript
// Support for deep linking to quiz
// persona.html?student=John%20Smith&action=quiz

function checkUrlActions() {
  const params = new URLSearchParams(window.location.search);
  const action = params.get('action');

  if (action === 'quiz') {
    openQuizModal();
  }
}
```

---

## Summary

This technical specification provides:

1. **Complete API definitions** for all personality-related endpoints
2. **Data structures** for storing personality profiles
3. **Algorithm implementations** for inference, quiz scoring, and career matching
4. **Error handling** patterns
5. **Frontend integration** examples

The implementation follows a progressive enhancement approach:
- Works with inferred data only (no quiz needed)
- Quiz improves accuracy when taken
- All calculations are transparent and explainable

---

*Document Version: 1.0*
*API Version: v1*
