// src/utils/secureApiHelper.js
import { getAuth } from 'firebase/auth';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL ;
// For local development, use: const API_BASE_URL = 'http://localhost:3001';

/**
 * Get Firebase ID token for authenticated requests
 */
const getAuthToken = async () => {
  const auth = getAuth();
  const user = auth.currentUser;
  
  if (!user) {
    throw new Error('User not authenticated');
  }
  
  const token = await user.getIdToken();
  return token;
};

/**
 * Make authenticated API request
 */
const secureApiCall = async (endpoint, method = 'POST', body = null) => {
  try {
    const token = await getAuthToken();
    
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || 'API request failed');
    }
    
    return await response.json();
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error);
    throw error;
  }
};

/**
 * Generate tasks via secure endpoint
 */
export const secureGenerateTasks = async (studentProfile) => {
  const response = await secureApiCall('/api/ai/generate-tasks', 'POST', { studentProfile });
  return response.content;
};

/**
 * Analyze skills via secure endpoint
 */
export const secureAnalyzeSkills = async (studentProfile) => {
  const response = await secureApiCall('/api/ai/analyze-skills', 'POST', { studentProfile });
  return response.content;
};

/**
 * Generate achievements via secure endpoint
 */
export const secureGenerateAchievements = async (studentProfile, tasks, skills) => {
  const response = await secureApiCall('/api/ai/generate-achievements', 'POST', {
    studentProfile,
    tasks,
    skills
  });
  return response.content;
};

/**
 * Generate learning path via secure endpoint
 */
export const secureGenerateLearningPath = async (studentProfile, skillName, currentScore, category) => {
  const response = await secureApiCall('/api/ai/generate-learning-path', 'POST', {
    studentProfile,
    skillName,
    currentScore,
    category
  });
  return response.content;
};

/**
 * AI Tutor chat via secure endpoint
 */
export const secureTutorChat = async (studentProfile, userMessage) => {
  const response = await secureApiCall('/api/ai/tutor-chat', 'POST', {
    studentProfile,
    userMessage
  });
  return response.content;
};

/**
 * Get skill recommendations via secure endpoint
 */
export const secureGetSkillRecommendations = async (studentProfile, completedTasksCount, currentStreak, skills, activityLog) => {
  const response = await secureApiCall('/api/student/skill-recommendations', 'POST', {
    studentProfile,
    completedTasksCount,
    currentStreak,
    skills,
    activityLog
  });
  return response.content;
};