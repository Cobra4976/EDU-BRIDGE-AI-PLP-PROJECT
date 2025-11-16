import express from 'express';
import cors from 'cors';
import admin from 'firebase-admin';
import dotenv from 'dotenv';
import mpesaService from './mpesaService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = [
 'https://edu-bridge-ai-plp-project.vercel.app'
];

// Middleware
app.use(cors(
  {
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    
    // Remove trailing slash for comparison
    const normalizedOrigin = origin.replace(/\/$/, '');
    const normalizedAllowed = allowedOrigins.map(o => o.replace(/\/$/, ''));
    
    if (normalizedAllowed.includes(normalizedOrigin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}
));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Firebase Admin
const serviceAccount = JSON.parse(process.env.VITE_FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================

/**
 * Verify Firebase ID token from request
 */
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: No token provided'
      });
    }

    const idToken = authHeader.split('Bearer ')[1];
    
    // Verify the Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    
    // Attach user info to request
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email
    };
    
    console.log('✅ Authenticated user:', req.user.uid);
    next();
    
  } catch (error) {
    console.error('❌ Authentication error:', error);
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid token'
    });
  }
};

/**
 * Check user's subscription and usage limits
 */
const checkUsageLimit = (featureType) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.uid;
      
      // Get user's subscription
      const subscriptionDoc = await db.collection('subscriptions').doc(userId).get();
      
      if (!subscriptionDoc.exists) {
        // Create free tier subscription if doesn't exist
        await db.collection('subscriptions').doc(userId).set({
          userId,
          tier: 'free',
          status: 'active',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          usage: {
            aiTutorQueries: { count: 0, lastReset: new Date().toISOString(), resetPeriod: 'daily' },
            taskGeneration: { count: 0, lastReset: new Date().toISOString(), resetPeriod: 'weekly' },
            skillsAnalysis: { count: 0, lastReset: new Date().toISOString(), resetPeriod: 'weekly' },
            learningPaths: { count: 0, lastReset: new Date().toISOString(), resetPeriod: 'weekly' },
            achievements: { count: 0, lastReset: new Date().toISOString(), resetPeriod: 'weekly' }
          }
        });
        
        req.subscription = { tier: 'free', usage: {} };
        return next();
      }
      
      const subscription = subscriptionDoc.data();
      req.subscription = subscription;
      
      // Premium users have unlimited access
      if (subscription.tier === 'premium') {
        return next();
      }
      
      // Check limits for free tier
      const limits = {
        aiTutorQueries: { limit: 20, period: 'daily' },
        taskGeneration: { limit: 3, period: 'weekly' },
        skillsAnalysis: { limit: 2, period: 'weekly' },
        learningPaths: { limit: 5, period: 'weekly' },
        achievements: { limit: 2, period: 'weekly' }
      };
      
      const featureUsage = subscription.usage?.[featureType];
      const featureLimit = limits[featureType];
      
      if (!featureUsage || !featureLimit) {
        return next();
      }
      
      // Check if reset is needed
      const lastReset = new Date(featureUsage.lastReset);
      const now = new Date();
      let needsReset = false;
      
      if (featureLimit.period === 'daily') {
        needsReset = lastReset.toDateString() !== now.toDateString();
      } else if (featureLimit.period === 'weekly') {
        const weekDiff = Math.floor((now - lastReset) / (7 * 24 * 60 * 60 * 1000));
        needsReset = weekDiff >= 1;
      }
      
      if (needsReset) {
        // Reset counter
        await db.collection('subscriptions').doc(userId).update({
          [`usage.${featureType}.count`]: 0,
          [`usage.${featureType}.lastReset`]: now.toISOString()
        });
        return next();
      }
      
      // Check if limit exceeded
      if (featureUsage.count >= featureLimit.limit) {
        return res.status(429).json({
          success: false,
          error: 'Usage limit exceeded',
          feature: featureType,
          limit: featureLimit.limit,
          period: featureLimit.period,
          message: `You've reached your ${featureLimit.period} limit of ${featureLimit.limit} for ${featureType}. Upgrade to Premium for unlimited access.`
        });
      }
      
      next();
      
    } catch (error) {
      console.error('❌ Usage check error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to check usage limits'
      });
    }
  };
};

/**
 * Increment usage counter after successful request
 */
const incrementUsage = async (userId, featureType) => {
  try {
    await db.collection('subscriptions').doc(userId).update({
      [`usage.${featureType}.count`]: admin.firestore.FieldValue.increment(1),
      [`usage.${featureType}.lastUsed`]: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error('❌ Failed to increment usage:', error);
  }
};

// ============================================
// END AUTHENTICATION MIDDLEWARE
// ============================================

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'Server running' });
});

// ============================================
// SECURED AI FEATURE ENDPOINTS
// ============================================

/**
 * Generate personalized tasks
 */
app.post('/api/ai/generate-tasks', authenticateUser, checkUsageLimit('taskGeneration'), async (req, res) => {
  try {
    const { studentProfile } = req.body;
    const userId = req.user.uid;

    console.log('📝 Generating tasks for user:', userId);

    if (!studentProfile) {
      return res.status(400).json({
        success: false,
        error: 'Missing studentProfile in request body'
      });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'Gemini API key not configured'
      });
    }

    const systemPrompt = `You are an educational assistant. Generate 4 practical study tasks for a single student based on the profile below.
Return the result strictly as JSON: an array of task objects.
Each task object must have:
- "title" (short),
- "description" (concise steps or resources),
- "difficulty" ("Easy"|"Medium"|"Hard"),
- "estimatedMinutes" (integer)
- "answer" (detailed solution/answer with step-by-step explanation)

For the "answer" field:
- Provide complete solutions for problems/exercises
- Include step-by-step explanations
- Add helpful tips or common mistakes to avoid
- Make answers educational and detailed (3-5 sentences minimum)
- Format for easy reading

Use local context where useful and keep tasks actionable in low-resource settings.
Return only JSON.`;

    const userPrompt = `Student profile:
- Name: ${studentProfile.name || 'Student'}
- Country: ${studentProfile.country || 'Unknown'}
- Educational System: ${studentProfile.educationalSystem || 'Unknown'}
- Strengths: ${studentProfile.strengths || 'None'}
- Weaknesses: ${studentProfile.weaknesses || 'None'}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
            topP: 0.95,
            topK: 40
          }
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ Gemini API Error:', errorData);
      return res.status(response.status).json({
        success: false,
        error: 'Failed to generate tasks',
        details: errorData
      });
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Increment usage
    await incrementUsage(userId, 'taskGeneration');

    console.log('✅ Tasks generated successfully');

    return res.json({
      success: true,
      content: generatedText
    });

  } catch (error) {
    console.error('❌ Task generation error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * Analyze student skills
 */
app.post('/api/ai/analyze-skills', authenticateUser, checkUsageLimit('skillsAnalysis'), async (req, res) => {
  try {
    const { studentProfile } = req.body;
    const userId = req.user.uid;

    console.log('📊 Analyzing skills for user:', userId);

    if (!studentProfile) {
      return res.status(400).json({
        success: false,
        error: 'Missing studentProfile in request body'
      });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'Gemini API key not configured'
      });
    }

    const systemPrompt = `You are an educational assessment assistant for African students.`;

    const userPrompt = `Based on the student's profile below, estimate TWO categories of skills:

1. ACADEMIC SKILLS (5-6 skills): Traditional academic competencies relevant to their education system
2. TECHNOLOGY SKILLS (5-6 skills): Digital literacy and tech skills relevant for career readiness

For each skill, provide a score from 0 to 100 indicating current competency.

Consider:
- Student's educational system and country context
- Available technology infrastructure in ${studentProfile.country || 'their region'}
- Career opportunities in African tech ecosystem
- Skills that can be learned with low resources (mobile-first)
- Local job market demands

Student profile:
- Name: ${studentProfile.name || 'Student'}
- Country: ${studentProfile.country || 'Unknown'}
- Educational System: ${studentProfile.educationalSystem || 'Unknown'}
- Strengths: ${studentProfile.strengths || 'None'}
- Weaknesses: ${studentProfile.weaknesses || 'None'}

Return strictly as JSON with this structure:
{
  "academic": {
    "Numeracy": 72,
    "Reading Comprehension": 80,
    "Problem Solving": 60,
    "Critical Thinking": 70,
    "Writing Skills": 65
  },
  "technology": {
    "Digital Literacy": 45,
    "Mobile Computing": 55,
    "Internet Research": 70,
    "Basic Coding": 30,
    "Data Entry & Spreadsheets": 65,
    "Email & Communication": 75
  }
}

Focus on practical, achievable tech skills that are in-demand in Africa.
Return only JSON.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
            topP: 0.95,
            topK: 40
          }
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ Gemini API Error:', errorData);
      return res.status(response.status).json({
        success: false,
        error: 'Failed to analyze skills',
        details: errorData
      });
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Increment usage
    await incrementUsage(userId, 'skillsAnalysis');

    console.log('✅ Skills analyzed successfully');

    return res.json({
      success: true,
      content: generatedText
    });

  } catch (error) {
    console.error('❌ Skills analysis error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * Generate achievements
 */
app.post('/api/ai/generate-achievements', authenticateUser, checkUsageLimit('achievements'), async (req, res) => {
  try {
    const { studentProfile, tasks, skills } = req.body;
    const userId = req.user.uid;

    console.log('🏆 Generating achievements for user:', userId);

    if (!studentProfile) {
      return res.status(400).json({
        success: false,
        error: 'Missing studentProfile in request body'
      });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'Gemini API key not configured'
      });
    }

    const tasksContext = JSON.stringify(tasks || []);
    const skillsContext = JSON.stringify(skills || {});

    const systemPrompt = `You are an achievement engine.`;

    const userPrompt = `Create up to 5 achievement objects for this student based on the profile, tasks, and skills.
Each achievement object should have:
- "title"
- "description"
- "criteria" (short explanation of how to earn it)
- "date" (ISO string or empty for not yet achieved)

Student profile:
- Name: ${studentProfile.name || 'Student'}
- Country: ${studentProfile.country || 'Unknown'}
- Educational System: ${studentProfile.educationalSystem || 'Unknown'}
- Strengths: ${studentProfile.strengths || 'None'}
- Weaknesses: ${studentProfile.weaknesses || 'None'}

Current tasks: ${tasksContext}
Current skills: ${skillsContext}

Return only JSON array.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
            topP: 0.95,
            topK: 40
          }
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ Gemini API Error:', errorData);
      return res.status(response.status).json({
        success: false,
        error: 'Failed to generate achievements',
        details: errorData
      });
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Increment usage
    await incrementUsage(userId, 'achievements');

    console.log('✅ Achievements generated successfully');

    return res.json({
      success: true,
      content: generatedText
    });

  } catch (error) {
    console.error('❌ Achievements generation error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * Generate learning path for a skill
 */
app.post('/api/ai/generate-learning-path', authenticateUser, checkUsageLimit('learningPaths'), async (req, res) => {
  try {
    const { studentProfile, skillName, currentScore, category } = req.body;
    const userId = req.user.uid;

    console.log('🎯 Generating learning path for user:', userId);

    if (!studentProfile || !skillName || currentScore === undefined || !category) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: studentProfile, skillName, currentScore, category'
      });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'Gemini API key not configured'
      });
    }

    const isTechSkill = category === 'technology';

    const systemPrompt = `You are an educational content creator specializing in ${isTechSkill ? 'technology education for African students' : 'academic skill development'}.`;

    const userPrompt = `Generate a personalized learning path for this student to improve their ${skillName} skill from ${currentScore}% proficiency to mastery.

Student Profile:
- Name: ${studentProfile.name}
- Country: ${studentProfile.country}
- Educational System: ${studentProfile.educationalSystem}
- Strengths: ${studentProfile.strengths}
- Weaknesses: ${studentProfile.weaknesses}

${isTechSkill ? `
IMPORTANT for Technology Skills:
- Focus on mobile-first learning (most students use smartphones)
- Suggest FREE resources and tools available in Africa
- Consider low bandwidth situations
- Include practical projects they can do offline
- Mention local tech communities and opportunities (e.g., iHub Kenya, CcHub Nigeria)
- Emphasize skills valuable for freelancing/remote work
- Recommend apps available on Google Play Store
` : `
IMPORTANT for Academic Skills:
- Align with ${studentProfile.educationalSystem} curriculum
- Use local examples from ${studentProfile.country}
- Consider low-resource classroom settings
- Include offline practice activities
- Reference local educational resources
`}

Create a JSON response with:
{
  "learningSteps": [
    {
      "step": 1, 
      "title": "...", 
      "description": "Detailed explanation of what to learn...", 
      "estimatedDays": 3,
      "resources": "Specific free tools/apps/websites",
      "offline": true
    },
    ...5-7 progressive steps
  ],
  "practiceExercises": [
    {
      "title": "...", 
      "description": "Clear instructions for the exercise...", 
      "difficulty": "Easy",
      "toolsNeeded": "smartphone with internet",
      "estimatedTime": "30 mins"
    },
    ...4-6 exercises from easy to hard
  ],
  "quickTips": [
    "Practical tip 1 specific to ${studentProfile.country}",
    "Tip 2...",
    "Tip 3..."
  ],
  "freeResources": [
    {
      "name": "Resource name", 
      "type": "app|website|youtube|pdf", 
      "url": "actual URL or 'Available offline'",
      "offline": true,
      "description": "Why this resource is useful"
    },
    ...5-8 resources
  ],
  ${isTechSkill ? `
  "careerOpportunities": [
    "Specific job/freelance opportunity 1",
    "Opportunity 2...",
    "Opportunity 3..."
  ],
  ` : ''}
  "milestones": [
    {"progress": 25, "achievement": "What you'll achieve at 25%"},
    {"progress": 50, "achievement": "What you'll achieve at 50%"},
    {"progress": 75, "achievement": "What you'll achieve at 75%"},
    {"progress": 100, "achievement": "Master level achievement"}
  ]
}

Make it highly practical and achievable with limited resources.
Return only valid JSON.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192, // Larger for learning paths
            topP: 0.95,
            topK: 40
          }
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ Gemini API Error:', errorData);
      return res.status(response.status).json({
        success: false,
        error: 'Failed to generate learning path',
        details: errorData
      });
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Increment usage
    await incrementUsage(userId, 'learningPaths');

    console.log('✅ Learning path generated successfully');

    return res.json({
      success: true,
      content: generatedText
    });

  } catch (error) {
    console.error('❌ Learning path generation error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * AI Tutor chat
 */
app.post('/api/ai/tutor-chat', authenticateUser, checkUsageLimit('aiTutorQueries'), async (req, res) => {
  try {
    const { studentProfile, userMessage } = req.body;
    const userId = req.user.uid;

    console.log('💬 AI Tutor chat for user:', userId);

    if (!studentProfile || !userMessage) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: studentProfile, userMessage'
      });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        error: 'Gemini API key not configured'
      });
    }

    const systemPrompt = `You are a personalized AI tutor for ${studentProfile.name || 'a student'} who is studying ${studentProfile.educationalSystem || 'their curriculum'} in ${studentProfile.country || 'their country'}.

Student's Profile:
- Name: ${studentProfile.name || 'Student'}
- Country: ${studentProfile.country || 'Not specified'}
- Educational System: ${studentProfile.educationalSystem || 'Not specified'}
- Strengths: ${studentProfile.strengths || 'Not specified'}
- Areas for Improvement: ${studentProfile.weaknesses || 'Not specified'}

Be supportive, use local examples and low-tech suggestions where helpful.`;

    const userPrompt = `User question: ${userMessage}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
            topP: 0.95,
            topK: 40
          }
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ Gemini API Error:', errorData);
      return res.status(response.status).json({
        success: false,
        error: 'Failed to get tutor response',
        details: errorData
      });
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Increment usage
    await incrementUsage(userId, 'aiTutorQueries');

    console.log('✅ AI Tutor response generated');

    return res.json({
      success: true,
      content: generatedText
    });

  } catch (error) {
    console.error('❌ AI Tutor error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});
app.post('/api/student/skill-recommendations', authenticateUser, async (req, res) => {
  try {
    const { studentProfile, completedTasksCount, currentStreak, skills, activityLog } = req.body;
    const userId = req.user.uid;

    console.log('🎯 Generating skill recommendations for user:', userId);
    console.log('📦 Request body:', { studentProfile, completedTasksCount, currentStreak });

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    
    if (!GEMINI_API_KEY) {
      console.error('❌ No API key found');
      return res.status(500).json({
        success: false,
        error: 'Gemini API key not configured'
      });
    }

    console.log('✅ API key found');

    const systemPrompt = `You are a career advisor for African students.`;

    const userPrompt = `Based on this student's progress, recommend 3-5 skills they should learn next.

Student Profile:
- Name: ${studentProfile?.name || 'Unknown'}
- Country: ${studentProfile?.country || 'Unknown'}
- Educational System: ${studentProfile?.educationalSystem || 'Unknown'}
- Strengths: ${studentProfile?.strengths || 'None'}
- Weaknesses: ${studentProfile?.weaknesses || 'None'}

Progress:
- Tasks Completed: ${completedTasksCount || 0}
- Current Streak: ${currentStreak || 0} days
- Current Skills: ${JSON.stringify(skills || {})}

Return JSON:
{
  "recommendations": [
    {
      "skillName": "...",
      "category": "academic|technology",
      "priority": "high|medium|low",
      "reason": "Why this skill is important for this student",
      "estimatedWeeks": 4,
      "prerequisites": ["skill1", "skill2"],
      "careerBenefit": "How this helps their career in Africa"
    }
  ]
}

Focus on practical skills with high demand in African job markets.`;

    console.log('📤 Calling Gemini API for recommendations...');

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
            topP: 0.95,
            topK: 40
          }
        })
      }
    );

    console.log('📥 Gemini API response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ Gemini API Error Response:', JSON.stringify(errorData, null, 2));
      return res.status(response.status).json({
        success: false,
        error: 'Failed to generate recommendations',
        details: errorData
      });
    }

    const data = await response.json();
    console.log('📊 Gemini API response received');
    
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log('✅ Recommendations generated successfully');
    console.log('📝 Response length:', generatedText.length, 'characters');

    return res.json({
      success: true,
      content: generatedText
    });

  } catch (error) {
    console.error('❌ Recommendations error:', error);
    console.error('❌ Error stack:', error.stack);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});
// ============================================
// END SECURED AI FEATURE ENDPOINTS
// ============================================

// ============================================
// M-PESA PAYMENT ROUTES (ADD THIS SECTION)
// ============================================

/**
 * Initiate M-Pesa STK Push payment
 */
app.post('/api/payment/mpesa/initiate', async (req, res) => {
  try {
    const { phoneNumber, amount, userId, subscriptionTier } = req.body;

    console.log('📱 M-Pesa payment initiation:', { phoneNumber, amount, userId, subscriptionTier });

    // Validate input
    if (!phoneNumber || !amount || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: phoneNumber, amount, userId'
      });
    }

    // Validate transaction
    const validation = mpesaService.validateTransaction(phoneNumber, amount);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.errors
      });
    }

    // Create transaction record in Firestore
    const transactionRef = db.collection('transactions').doc();
    const transactionId = transactionRef.id;

    const transactionData = {
      transactionId,
      userId,
      phoneNumber: mpesaService.formatPhoneNumber(phoneNumber),
      amount: Math.round(amount),
      subscriptionTier: subscriptionTier || 'premium',
      status: 'pending',
      provider: 'mpesa',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await transactionRef.set(transactionData);

    // Initiate STK Push
    const result = await mpesaService.initiateSTKPush(
      phoneNumber,
      amount,
      userId, // Account reference
      `Premium Subscription - ${transactionId.substring(0, 8)}`
    );

    if (result.success) {
      // Update transaction with M-Pesa details
      await transactionRef.update({
        checkoutRequestId: result.checkoutRequestId,
        merchantRequestId: result.merchantRequestId,
        responseCode: result.responseCode,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log('✅ M-Pesa STK Push initiated successfully');

      return res.json({
        success: true,
        transactionId,
        checkoutRequestId: result.checkoutRequestId,
        message: result.customerMessage || 'Please check your phone to complete payment'
      });
    } else {
      // Update transaction as failed
      await transactionRef.update({
        status: 'failed',
        error: result.error,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error('❌ M-Pesa payment initiation error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * M-Pesa callback endpoint - receives payment confirmation
 */
app.post('/api/payment/mpesa/callback', async (req, res) => {
  try {
    console.log('📩 M-Pesa Callback received:', JSON.stringify(req.body, null, 2));

    // Process callback
    const result = mpesaService.processCallback(req.body);

    // Find transaction
    const transactionQuery = await db.collection('transactions')
      .where('checkoutRequestId', '==', result.checkoutRequestId)
      .limit(1)
      .get();

    if (transactionQuery.empty) {
      console.error('❌ Transaction not found for checkout:', result.checkoutRequestId);
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    const transactionDoc = transactionQuery.docs[0];
    const transactionData = transactionDoc.data();

    if (result.success) {
      // Payment successful
      console.log('✅ Payment successful:', result);

      // Update transaction
      await transactionDoc.ref.update({
        status: 'completed',
        mpesaReceiptNumber: result.mpesaReceiptNumber,
        transactionDate: result.transactionDate,
        paidAmount: result.amount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Upgrade user subscription
      const subscriptionRef = db.collection('subscriptions').doc(transactionData.userId);
      
      // Check if subscription document exists
      const subscriptionSnap = await subscriptionRef.get();
      
      if (!subscriptionSnap.exists()) {
        // Create new subscription
        await subscriptionRef.set({
          userId: transactionData.userId,
          tier: 'premium',
          status: 'active',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          upgradedAt: admin.firestore.FieldValue.serverTimestamp(),
          paymentDetails: {
            provider: 'mpesa',
            transactionId: transactionData.transactionId,
            mpesaReceiptNumber: result.mpesaReceiptNumber,
            amount: result.amount,
            currency: 'KES',
            paidAt: admin.firestore.FieldValue.serverTimestamp()
          },
          premiumSince: admin.firestore.FieldValue.serverTimestamp(),
          nextBillingDate: admin.firestore.Timestamp.fromDate(
            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
          ),
          usage: {
            aiTutorQueries: { count: 0, lastReset: new Date().toISOString(), resetPeriod: 'daily' },
            taskGeneration: { count: 0, lastReset: new Date().toISOString(), resetPeriod: 'weekly' },
            skillsAnalysis: { count: 0, lastReset: new Date().toISOString(), resetPeriod: 'weekly' },
            learningPaths: { count: 0, lastReset: new Date().toISOString(), resetPeriod: 'weekly' },
            achievements: { count: 0, lastReset: new Date().toISOString(), resetPeriod: 'weekly' }
          }
        });
      } else {
        // Update existing subscription
        await subscriptionRef.update({
          tier: 'premium',
          status: 'active',
          upgradedAt: admin.firestore.FieldValue.serverTimestamp(),
          paymentDetails: {
            provider: 'mpesa',
            transactionId: transactionData.transactionId,
            mpesaReceiptNumber: result.mpesaReceiptNumber,
            amount: result.amount,
            currency: 'KES',
            paidAt: admin.firestore.FieldValue.serverTimestamp()
          },
          premiumSince: admin.firestore.FieldValue.serverTimestamp(),
          nextBillingDate: admin.firestore.Timestamp.fromDate(
            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          )
        });
      }

      console.log('🎉 Subscription upgraded for user:', transactionData.userId);

    } else {
      // Payment failed
      console.log('❌ Payment failed:', result);

      await transactionDoc.ref.update({
        status: 'failed',
        error: result.errorMessage || result.resultDesc,
        resultCode: result.resultCode,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // Respond to M-Pesa
    return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  } catch (error) {
    console.error('❌ M-Pesa callback error:', error);
    return res.json({ ResultCode: 1, ResultDesc: 'Failed' });
  }
});

/**
 * M-Pesa timeout callback
 */
app.post('/api/payment/mpesa/timeout', async (req, res) => {
  console.log('⏰ M-Pesa Timeout:', JSON.stringify(req.body, null, 2));
  
  try {
    const { CheckoutRequestID } = req.body;

    // Find and update transaction
    const transactionQuery = await db.collection('transactions')
      .where('checkoutRequestId', '==', CheckoutRequestID)
      .limit(1)
      .get();

    if (!transactionQuery.empty) {
      await transactionQuery.docs[0].ref.update({
        status: 'timeout',
        error: 'Payment timeout - User did not complete payment',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    console.error('❌ Timeout processing error:', error);
    return res.json({ ResultCode: 1, ResultDesc: 'Failed' });
  }
});

/**
 * Check M-Pesa payment status
 */
app.get('/api/payment/mpesa/status/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;

    const transactionDoc = await db.collection('transactions').doc(transactionId).get();

    if (!transactionDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    const transaction = transactionDoc.data();

    // If still pending and has checkoutRequestId, query M-Pesa
    if (transaction.status === 'pending' && transaction.checkoutRequestId) {
      const result = await mpesaService.querySTKPushStatus(transaction.checkoutRequestId);
      
      if (result.success) {
        // Update based on result code
        let newStatus = transaction.status;
        if (result.resultCode === '0') {
          newStatus = 'completed';
        } else if (result.resultCode === '1032') {
          newStatus = 'cancelled';
        } else {
          newStatus = 'failed';
        }

        if (newStatus !== transaction.status) {
          await transactionDoc.ref.update({
            status: newStatus,
            resultCode: result.resultCode,
            resultDesc: result.resultDesc,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          transaction.status = newStatus;
        }
      }
    }

    return res.json({
      success: true,
      transaction: {
        transactionId: transaction.transactionId,
        status: transaction.status,
        amount: transaction.amount,
        phoneNumber: transaction.phoneNumber,
        mpesaReceiptNumber: transaction.mpesaReceiptNumber,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt
      }
    });

  } catch (error) {
    console.error('❌ Status check error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// ============================================
// END M-PESA PAYMENT ROUTES
// ============================================
// ============================================
// GEMINI AI PROXY ROUTE
// ============================================
// ============================================
// GEMINI AI PROXY ROUTE (Updated)
// ============================================

app.post('/api/gemini', async (req, res) => {
    // NOTE: Changed route name from '/api/claude' to '/api/gemini' for clarity
    
    try {
        const { systemPrompt, userPrompt, maxTokens = 4096 } = req.body;

        console.log('📝 Received Gemini API request');
        console.log('SystemPrompt length:', systemPrompt?.length);
        console.log('UserPrompt length:', userPrompt?.length);

        if (!systemPrompt || !userPrompt) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: systemPrompt, userPrompt'
            });
        }

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        
        console.log('🔑 API Key exists:', !!GEMINI_API_KEY);
        console.log('🔑 API Key preview:', GEMINI_API_KEY ? `${GEMINI_API_KEY.substring(0, 10)}...` : 'MISSING');
        
        if (!GEMINI_API_KEY) {
            console.error('❌ GEMINI_API_KEY is not set in environment variables');
            return res.status(500).json({
                success: false,
                error: 'Gemini API key not configured on server'
            });
        }

        console.log('📤 Calling Gemini API...');

        // *** FIX: Removed combinedPrompt. System and user prompts are now separate. ***

        const response = await fetch(
            // Consider gemini-2.5-flash for a faster, lower-cost alternative to gemini-1.5-pro
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    // *** FIX: systemPrompt is now passed correctly via system_instruction ***
                    system_instruction: {
                        parts: [
                            { text: systemPrompt }
                        ]
                    },
                    contents: [
                        {
                            parts: [
                                {
                                    text: userPrompt // *** FIX: Only userPrompt is in contents ***
                                }
                            ]
                        }
                    ],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: maxTokens,
                        topP: 0.95,
                        topK: 40
                    }
                })
            }
        );

        console.log('📥 Gemini API response status:', response.status);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('❌ Gemini API Error Response:', JSON.stringify(errorData, null, 2));

            // Log special message for the 503 UNAVAILABLE error you encountered
            if (response.status === 503) {
                console.error('🚨 The server returned a 503 UNAVAILABLE error. This is a capacity issue on Google\'s side. Please retry the request later.');
            }

            return res.status(response.status).json({
                success: false,
                error: errorData
            });
        }

        const data = await response.json();
        console.log('✅ Gemini API Success');

        // Extract text from Gemini response
        const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response received from Gemini.";

        return res.json({
            success: true,
            content: [{ text: generatedText }], // Kept for compatibility with Claude-style responses
            response: generatedText
        });

    } catch (error) {
        console.error('❌ Gemini API Error:', error);
        console.error('❌ Error stack:', error.stack);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================
// END GEMINI AI PROXY ROUTE
// ============================================


// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
