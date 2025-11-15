import { useState, useEffect } from 'react';
import { doc, updateDoc,getDoc, setDoc,serverTimestamp } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { getAuth } from 'firebase/auth';


// Add this import at the top with your other imports
import { initDB } from '../utils/offlineStorage';
import { useOnlineStatus } from '../utils/useOnlineStatus';
import { 
  saveTasksWithSync, 
  saveSkillsWithSync, 
  saveAchievementsWithSync,
  saveChatMessagesWithSync,
 
  processSyncQueue,
  getSyncStatus,
  forceSyncNow
} from '../utils/syncManager';
// ADD THIS with your other imports
// REPLACE your offlineStorage imports with these
import { 
  saveProfile,               // ✅ For profile
  saveTasksWithAnswers,      // ✅ For tasks
  saveSkills,                // ✅ For skills
  saveAchievements,          // ✅ For achievements
  saveChatMessages,          // ✅ For chat
  saveLearningPath,          // ✅ For learning paths
  loadAllCachedData,         // ✅ Load all data
  getCacheStats,
  nukeDatabase // ✅ ADD THIS  
              // ✅ For cache stats
} from '../utils/offlineStorage';
import {
  getUserStats,
  getLeaderboard,
  getPosts,
  createPost,
  createReply,
  votePost,
  voteReply,
  markBestAnswer,
  flagContent,
  getPostWithReplies,
  searchPosts,
  incrementViews,
  getUserProfile,
  BADGES
} from '../utils/communityService';
// ADD THESE IMPORTS after your existing imports
import SubscriptionModal from '../components/SubscriptionModal';
import { 
  canUseFeature, 
  trackFeatureUsage, 
  getUserSubscription, 
  getUsageSummary,
  upgradeToPremium,
  FEATURE_TYPES 
} from '../utils/usageTracking';
import { SUBSCRIPTION_TIERS } from '../utils/subscriptionLimits';

import { 
  secureGenerateTasks, 
  secureAnalyzeSkills, 
  secureGenerateAchievements, 
  secureGenerateLearningPath, 
  secureTutorChat,
  secureGetSkillRecommendations 
} from '../utils/secureApiHelper';


// African countries list (unchanged)
const AFRICAN_COUNTRIES = [
  'Algeria', 'Angola', 'Benin', 'Botswana', 'Burkina Faso', 'Burundi', 'Cameroon', 'Cape Verde',
  'Central African Republic', 'Chad', 'Comoros', 'Congo', 'Democratic Republic of the Congo',
  'Djibouti', 'Egypt', 'Equatorial Guinea', 'Eritrea', 'Eswatini', 'Ethiopia', 'Gabon', 'Gambia',
  'Ghana', 'Guinea', 'Guinea-Bissau', 'Ivory Coast', 'Kenya', 'Lesotho', 'Liberia', 'Libya',
  'Madagascar', 'Malawi', 'Mali', 'Mauritania', 'Mauritius', 'Morocco', 'Mozambique', 'Namibia',
  'Niger', 'Nigeria', 'Rwanda', 'Sao Tome and Principe', 'Senegal', 'Seychelles', 'Sierra Leone',
  'Somalia', 'South Africa', 'South Sudan', 'Sudan', 'Tanzania', 'Togo', 'Tunisia', 'Uganda',
  'Zambia', 'Zimbabwe'
];

// African education systems (unchanged)
const EDUCATIONAL_SYSTEMS = [
  '8-4-4 System (Kenya)',
  'CBC - Competency Based Curriculum (Kenya)',
  'IGCSE - International General Certificate of Secondary Education',
  'IB - International Baccalaureate',
  'A-Levels - Advanced Level',
  'WAEC - West African Examinations Council',
  'NECO - National Examinations Council (Nigeria)',
  'Matric - National Senior Certificate (South Africa)',
  'WASSCE - West African Senior School Certificate Examination',
  'Baccalauréat (North African French System)',
  'Thanaweya Amma (Egypt)',
  'UCE - Uganda Certificate of Education',
  'UNEB - Uganda National Examinations Board',
  'ZIMSEC - Zimbabwe School Examinations Council',
  'Cambridge International',
  'American Curriculum',
  'British Curriculum',
  'French Baccalauréat',
  'National Curriculum'
];
// ADD THESE: Community constants
const COMMUNITY_CATEGORIES = [
  'All',
  'Mathematics',
  'Science',
  'Technology',
  'Languages',
  'History',
  'Career Advice',
  'Study Tips',
  'Exam Prep',
  'Other'
];

const POST_TYPES = [
  { value: 'all', label: 'All Posts', icon: '📚' },
  { value: 'question', label: 'Questions', icon: '❓' },
  { value: 'discussion', label: 'Discussions', icon: '💬' },
  { value: 'resource', label: 'Resources', icon: '📖' },
  { value: 'idea', label: 'Ideas', icon: '💡' }
];

export default function StudentDashboard({ user, studentProfile, onLogout }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState({
    country: studentProfile?.country || '',
    educationalSystem: studentProfile?.educationalSystem || '',
    strengths: studentProfile?.strengths || '',
    weaknesses: studentProfile?.weaknesses || ''
  });
  const [updateMessage, setUpdateMessage] = useState('');
  const [updateError, setUpdateError] = useState('');
  // ADD THIS: Online/Offline detection
  const isOnline = useOnlineStatus();
  // / ADD THESE: Sync management state
const [syncStatus, setSyncStatus] = useState({ 
  hasPendingOperations: false, 
  pendingCount: 0,
  message: 'All changes synced'
});
const [isSyncing, setIsSyncing] = useState(false);
// ADD THESE: Community state
const [communityView, setCommunityView] = useState('feed'); // feed, post, create, leaderboard
const [communityPosts, setCommunityPosts] = useState([]);
const [selectedPost, setSelectedPost] = useState(null);
const [postReplies, setPostReplies] = useState([]);
const [userCommunityStats, setUserCommunityStats] = useState(null);
const [leaderboard, setLeaderboard] = useState([]);
const [selectedCategory, setSelectedCategory] = useState('All');
const [selectedPostType, setSelectedPostType] = useState('all');
const [sortBy, setSortBy] = useState('recent');
const [searchTerm, setSearchTerm] = useState('');
const [newPost, setNewPost] = useState({
  type: 'question',
  category: 'Mathematics',
  title: '',
  content: '',
  tags: ''
});
const [replyContent, setReplyContent] = useState('');
const [communityLoading, setCommunityLoading] = useState(false);
const [communityError, setCommunityError] = useState('');
const [communitySuccess, setCommunitySuccess] = useState('');
// ADD THESE: Profile viewing
const [viewingProfile, setViewingProfile] = useState(null);
const [profileModalOpen, setProfileModalOpen] = useState(false);
// ADD THESE STATE VARIABLES after your existing state declarations
const [subscriptionTier, setSubscriptionTier] = useState(SUBSCRIPTION_TIERS.FREE);
const [usageSummary, setUsageSummary] = useState(null);
const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
const [limitReachedMessage, setLimitReachedMessage] = useState('');

  // / Add this useEffect to initialize IndexedDB when component mounts
useEffect(() => {
  const setupOfflineDB = async () => {
    try {
      // await nukeDatabase();
      await initDB();
      console.log('✅ IndexedDB initialized successfully');
    } catch (error) {
      console.error('❌ IndexedDB initialization failed:', error);
    }
  };
  
  setupOfflineDB();
}, []); // Empty dependency array = runs once on mount
// Auto-sync when connection is restored
useEffect(() => {
  const handleSync = async () => {
    if (isOnline && !isSyncing) {
      console.log('🌐 Connection restored, checking for pending sync...');
      
      // Check sync status
      const status = await getSyncStatus();
      setSyncStatus(status);
      
      // If there are pending operations, sync them
      if (status.hasPendingOperations) {
        setIsSyncing(true);
        const result = await processSyncQueue(user.uid);
        
        if (result.success) {
          console.log(`✅ Auto-sync completed: ${result.processed} items synced`);
        }
        
        // Update sync status after sync
        const newStatus = await getSyncStatus();
        setSyncStatus(newStatus);
        setIsSyncing(false);
      }
    }
  };

  handleSync();
}, [isOnline, user.uid]); // Run when online status changes
// Listen for service worker updates
useEffect(() => {
  const handleUpdate = (event) => {
    const shouldUpdate = window.confirm(
      'A new version is available! Reload to update?'
    );
    
    if (shouldUpdate) {
      window.location.reload();
    }
  };

  window.addEventListener('serviceWorkerUpdate', handleUpdate);

  return () => {
    window.removeEventListener('serviceWorkerUpdate', handleUpdate);
  };
}, []);
// ADD THIS: Load community data when tab is active
useEffect(() => {
  if (activeTab === 'community') {
    ensureStatsExist().then(() => {
      loadUserCommunityStats();
      loadLeaderboard();
      if (communityView === 'feed') {
        loadCommunityPosts();
      }
    });
  }
}, [activeTab, communityView, selectedCategory, selectedPostType, sortBy]);
// ADD THIS: Load offline data on mount
useEffect(() => {
  const loadCachedData = async () => {
    if (!isOnline) {
      console.log('📴 Offline mode - loading cached data...');
      
      const cachedData = await loadAllCachedData(user.uid);
      
      if (cachedData.tasks.length > 0) {
        setTasks(cachedData.tasks);
        console.log(`✅ Loaded ${cachedData.tasks.length} cached tasks`);
      }
      
      if (Object.keys(cachedData.skills).length > 0) {
        setSkills(cachedData.skills);
        console.log('✅ Loaded cached skills');
      }
      
      if (cachedData.achievements.length > 0) {
        setAchievements(cachedData.achievements);
        console.log(`✅ Loaded ${cachedData.achievements.length} cached achievements`);
      }
      
      if (cachedData.chatMessages.length > 0) {
        setChatMessages(cachedData.chatMessages);
        console.log(`✅ Loaded ${cachedData.chatMessages.length} cached chat messages`);
      }
      
      if (cachedData.learningPaths.length > 0) {
        const pathsObj = {};
        cachedData.learningPaths.forEach(path => {
          pathsObj[path.skill] = path.content.content;
        });
        setLearningContent(pathsObj);
        console.log(`✅ Loaded ${cachedData.learningPaths.length} cached learning paths`);
      }
      
      console.log('✅ All cached data loaded successfully');
    }
  };
  
  loadCachedData();
}, [isOnline, user.uid]);
// ADD THIS: Cache profile on component mount
useEffect(() => {
  const cacheInitialProfile = async () => {
    if (studentProfile) {
      await saveProfile(user.uid, {
        name: studentProfile.name,
        email: user.email,
        country: studentProfile.country,
        educationalSystem: studentProfile.educationalSystem,
        strengths: studentProfile.strengths,
        weaknesses: studentProfile.weaknesses,
        createdAt: studentProfile.createdAt
      });
      console.log('✅ Initial profile cached');
    }
  };
  
  cacheInitialProfile();
}, [studentProfile, user]);
// ADD THIS useEffect after your existing useEffects
useEffect(() => {
  const loadSubscription = async () => {
    const subscription = await getUserSubscription(user.uid);
    if (subscription) {
      setSubscriptionTier(subscription.tier);
    }
    
    const summary = await getUsageSummary(user.uid);
    setUsageSummary(summary);
  };
  
  loadSubscription();
  
  // Refresh every 5 minutes
  const interval = setInterval(loadSubscription, 5 * 60 * 1000);
  return () => clearInterval(interval);
}, [user.uid]);


  // --- AI Tutor state (updated to include full student profile) ---
const [chatMessages, setChatMessages] = useState([
  {
    role: 'assistant',
    content: `Hello ${studentProfile?.name || 'there'}! 👋 
I'm your personal AI tutor, and I've reviewed your learning profile.

Here's what I know about you:
- 🌍 Country: ${studentProfile?.country || 'N/A'}
- 🎓 Educational System: ${studentProfile?.educationalSystem || 'N/A'}
- 💪 Strengths: ${studentProfile?.strengths || 'Not specified'}
- 🧩 Weaknesses: ${studentProfile?.weaknesses || 'Not specified'}
- 🗣️ Language Proficiency: ${studentProfile?.languageProficiency || 'Not specified'}

I'm here to help you strengthen your skills, overcome your challenges, and make learning more enjoyable. 
How would you like to begin today?`
  }
]);
const [userMessage, setUserMessage] = useState('');
const [isTyping, setIsTyping] = useState(false);

  // // AI Tutor state (unchanged)
  // const [chatMessages, setChatMessages] = useState([
  //   { 
  //     role: 'assistant', 
  //     content: `Hello ${studentProfile?.name || 'there'}! I'm your personal AI tutor, and I've reviewed your profile. I understand you're studying ${studentProfile?.educationalSystem || 'your curriculum'} in ${studentProfile?.country || 'your country'}. I'm here to help you strengthen your skills and improve in areas where you'd like to grow. How can I assist you today?`
  //   }
  // ]);
  // const [userMessage, setUserMessage] = useState('');
  // const [isTyping, setIsTyping] = useState(false);

  // New: Tasks / Skills / Achievements state
  const [tasks, setTasks] = useState(studentProfile?.tasks || []); // array of { title, description, difficulty }
  const [skills, setSkills] = useState(studentProfile?.skills || {}); // object { skillName: score }
  const [achievements, setAchievements] = useState(studentProfile?.achievements || []); // array of { title, description, date }

  // Loading / error states for AI features
  const [aiLoadingTasks, setAiLoadingTasks] = useState(false);
  const [aiErrorTasks, setAiErrorTasks] = useState('');

  const [aiLoadingSkills, setAiLoadingSkills] = useState(false);
  const [aiErrorSkills, setAiErrorSkills] = useState('');

  const [aiLoadingAchievements, setAiLoadingAchievements] = useState(false);
  const [aiErrorAchievements, setAiErrorAchievements] = useState('');
  const [activeLearningSkill, setActiveLearningSkill] = useState(null);
  const [learningContent, setLearningContent] = useState({});
  const [isLoadingLearning, setIsLoadingLearning] = useState(false);
  const [learningError, setLearningError] = useState('');
  const [skillCategory, setSkillCategory] = useState(''); // 'academic' or 'technology'
  // Progress tracking state
const [completedTasks, setCompletedTasks] = useState(studentProfile?.completedTasks || []);
const [activityLog, setActivityLog] = useState(studentProfile?.activityLog || []);
const [currentStreak, setCurrentStreak] = useState(studentProfile?.currentStreak || 0);
const [lastActivityDate, setLastActivityDate] = useState(studentProfile?.lastActivityDate || null);
const [skillRecommendations, setSkillRecommendations] = useState([]);
const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);

  // Helper to persist to Firestore safely (saves into 'students' doc, merges)
  const persistStudentData = async (payload) => {
    try {
      const studentRef = doc(db, 'students', user.uid);
      // use setDoc with merge semantics to avoid overwrite
      await setDoc(studentRef, payload, { merge: true });
      // Also update the base users doc for convenience (optional)
      const usersRef = doc(db, 'users', user.uid);
      await setDoc(usersRef, { updatedAt: new Date().toISOString() }, { merge: true });
      return true;
    } catch (err) {
      console.error('Persist error:', err);
      return false;
    }
  };

  // Profile update (unchanged except using setDoc/updateDoc)
  const handleProfileUpdate = async () => {
    if (!editedProfile.country || !editedProfile.educationalSystem || !editedProfile.strengths || !editedProfile.weaknesses) {
      setUpdateError('Please fill in all fields');
      return;
    }

    try {
      // update users doc and students doc so both reflect latest profile
      const usersRef = doc(db, 'users', user.uid);
      const studentRef = doc(db, 'students', user.uid);

      await setDoc(usersRef, {
        country: editedProfile.country,
        educationalSystem: editedProfile.educationalSystem,
        strengths: editedProfile.strengths,
        weaknesses: editedProfile.weaknesses
      }, { merge: true });

      await setDoc(studentRef, {
        country: editedProfile.country,
        educationalSystem: editedProfile.educationalSystem,
        strengths: editedProfile.strengths,
        weaknesses: editedProfile.weaknesses
      }, { merge: true });

      setUpdateMessage('Profile updated successfully!');
      setUpdateError('');
      setIsEditing(false);
      // ADD THIS: Cache profile offline
    await saveProfile(user.uid, {
      name: studentProfile?.name,
      email: user.email,
      country: editedProfile.country,
      educationalSystem: editedProfile.educationalSystem,
      strengths: editedProfile.strengths,
      weaknesses: editedProfile.weaknesses
    });
    console.log('✅ Profile cached offline');

    setTimeout(() => setUpdateMessage(''), 3000);


      // update local state copies
      // (Note: parent may re-fetch, but we update local copies to be immediate)
      // setTasks(prev => prev);
      // setSkills(prev => prev);
      // setAchievements(prev => prev);

      // setTimeout(() => setUpdateMessage(''), 3000);
    } catch (error) {
      console.error('Profile update error:', error);
      setUpdateError('Failed to update profile. Please try again.');
      setUpdateMessage('');
    }
  };
// ADD THIS FUNCTION before your generateTasks function
const checkFeatureLimit = async (featureType, featureName) => {
  const check = await canUseFeature(user.uid, featureType);
  
  if (!check.allowed) {
    setLimitReachedMessage(
      `⚠️ ${featureName} limit reached! You've used all your ${check.reason}. Upgrade to Premium for unlimited access.`
    );
    setShowSubscriptionModal(true);
    return false;
  }
  
  // Clear any previous messages
  setLimitReachedMessage('');
  return true;
}

  // 1) Generate tasks based on student strengths/weaknesses
const generateTasks = async () => {
  const canProceed = await checkFeatureLimit(
    FEATURE_TYPES.TASK_GENERATION, 
    'Task Generation'
  );
  
  if (!canProceed) return;

  setAiErrorTasks('');
  setAiLoadingTasks(true);

  try {
    // Call secure backend endpoint
    const text = await secureGenerateTasks({
      name: studentProfile?.name || 'Student',
      country: studentProfile?.country || 'Unknown',
      educationalSystem: studentProfile?.educationalSystem || 'Unknown',
      strengths: studentProfile?.strengths || 'None',
      weaknesses: studentProfile?.weaknesses || 'None'
    });

    const jsonTextMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    const jsonText = jsonTextMatch ? jsonTextMatch[0] : text;

    const parsed = JSON.parse(jsonText);
    const generatedTasks = Array.isArray(parsed) ? parsed : [];
    
    await trackFeatureUsage(user.uid, FEATURE_TYPES.TASK_GENERATION);
    const summary = await getUsageSummary(user.uid);
    setUsageSummary(summary);

    const ok = await persistStudentData({ tasks: generatedTasks });
    if (!ok) throw new Error('Failed to persist tasks to Firestore');

    setTasks(generatedTasks);
    await saveTasksWithAnswers(user.uid, generatedTasks);
    console.log('✅ Tasks cached offline');

  } catch (err) {
    console.error('generateTasks error:', err);
    setAiErrorTasks(`Failed to generate tasks: ${err.message || err}`);
  } finally {
    setAiLoadingTasks(false);
  }
}; 
// 2) Analyze and score skills based on profile
const analyzeSkills = async () => {
  const canProceed = await checkFeatureLimit(
    FEATURE_TYPES.SKILLS_ANALYSIS, 
    'Skills Analysis'
  );
  
  if (!canProceed) return;

  setAiErrorSkills('');
  setAiLoadingSkills(true);

  try {
    // Call secure backend endpoint
    const text = await secureAnalyzeSkills({
      name: studentProfile?.name || 'Student',
      country: studentProfile?.country || 'Unknown',
      educationalSystem: studentProfile?.educationalSystem || 'Unknown',
      strengths: studentProfile?.strengths || 'None',
      weaknesses: studentProfile?.weaknesses || 'None'
    });

    const jsonTextMatch = text.match(/\{[\s\S]*\}/);
    const jsonText = jsonTextMatch ? jsonTextMatch[0] : text;

    const parsed = JSON.parse(jsonText);
    
    await trackFeatureUsage(user.uid, FEATURE_TYPES.SKILLS_ANALYSIS);
    const summary = await getUsageSummary(user.uid);
    setUsageSummary(summary);

    const ok = await persistStudentData({ skills: parsed });
    if (!ok) throw new Error('Failed to persist skills to Firestore');

    setSkills(parsed);
    await saveSkills(user.uid, parsed);
    console.log('✅ Skills cached offline');

  } catch (err) {
    console.error('analyzeSkills error:', err);
    setAiErrorSkills(`Failed to analyze skills: ${err.message || err}`);
  } finally {
    setAiLoadingSkills(false);
  }
};
  // 3) Generate achievements based on tasks/skills (milestones)
const generateAchievements = async () => {
  const canProceed = await checkFeatureLimit(
    FEATURE_TYPES.ACHIEVEMENTS,
     'Achievements'
  );
  
  if (!canProceed) return;

  setAiErrorAchievements('');
  setAiLoadingAchievements(true);

  try {
    // Call secure backend endpoint
    const text = await secureGenerateAchievements(
      {
        name: studentProfile?.name || 'Student',
        country: studentProfile?.country || 'Unknown',
        educationalSystem: studentProfile?.educationalSystem || 'Unknown',
        strengths: studentProfile?.strengths || 'None',
        weaknesses: studentProfile?.weaknesses || 'None'
      },
      tasks || [],
      skills || {}
    );

    await trackFeatureUsage(user.uid, FEATURE_TYPES.ACHIEVEMENTS);
    const summary = await getUsageSummary(user.uid);
    setUsageSummary(summary);

    const jsonTextMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    const jsonText = jsonTextMatch ? jsonTextMatch[0] : text;

    const parsed = JSON.parse(jsonText);
    const generatedAchievements = Array.isArray(parsed) ? parsed : [];

    const ok = await persistStudentData({ achievements: generatedAchievements });
    if (!ok) throw new Error('Failed to persist achievements to Firestore');

    setAchievements(generatedAchievements);
    await saveAchievements(user.uid, generatedAchievements);
    console.log('✅ Achievements cached offline');

  } catch (err) {
    console.error('generateAchievements error:', err);
    setAiErrorAchievements(`Failed to generate achievements: ${err.message || err}`);
  } finally {
    setAiLoadingAchievements(false);
  }
};
// ADD THIS new function after your generateAchievements function:
const handleUpgrade = async (paymentDetails) => {
  const result = await upgradeToPremium(user.uid, paymentDetails);
  
  if (result.success) {
    setSubscriptionTier(SUBSCRIPTION_TIERS.PREMIUM);
    const summary = await getUsageSummary(user.uid);
    setUsageSummary(summary);
  } else {
    throw new Error(result.error);
  }
};

  // Generate personalized learning path for a skill (GUIDE mode)
const generateSkillLearningPath = async (skillName, currentScore, category) => {
  const canProceed = await checkFeatureLimit(
     FEATURE_TYPES.LEARNING_PATHS, 
    'Learning Paths'
  );
  if (!canProceed) return;

  setLearningError('');
  setIsLoadingLearning(true);
  setActiveLearningSkill(skillName);
  setSkillCategory(category);

  try {
    // Call secure backend endpoint
    const text = await secureGenerateLearningPath(
      {
        name: studentProfile?.name,
        country: studentProfile?.country,
        educationalSystem: studentProfile?.educationalSystem,
        strengths: studentProfile?.strengths,
        weaknesses: studentProfile?.weaknesses
      },
      skillName,
      currentScore,
      category
    );

    const jsonTextMatch = text.match(/\{[\s\S]*\}/);
    const jsonText = jsonTextMatch ? jsonTextMatch[0] : text;

    const parsed = JSON.parse(jsonText);
    
    await trackFeatureUsage(user.uid, FEATURE_TYPES.LEARNING_PATHS);
    const summary = await getUsageSummary(user.uid);
    setUsageSummary(summary);
    
    setLearningContent(prev => ({
      ...prev,
      [skillName]: parsed
    }));
    
    await persistStudentData({ 
      learningPaths: { 
        [skillName]: {
          category,
          startedAt: new Date().toISOString(),
          currentScore,
          content: parsed
        }
      } 
    });
    
    await saveLearningPath(user.uid, skillName, {
      category,
      startedAt: new Date().toISOString(),
      currentScore,
      content: parsed
    });
    console.log(`✅ Learning path for ${skillName} cached offline`);
    
  } catch (err) {
    console.error('Learning path generation error:', err);
    setLearningError(`Failed to generate learning path: ${err.message}`);
  } finally {
    setIsLoadingLearning(false);
  }
};
// Start AI tutoring for a skill (TEACHER mode)
const startSkillTutoring = (skillName, currentScore, category) => {
  const isTechSkill = category === 'technology';
  
  // Create a focused tutoring message
  const tutorMessage = {
    role: 'assistant',
    content: `Great! I'll help you improve your ${skillName} skill from ${currentScore}% to mastery. 🎯

Your Profile:
- Current Level: ${currentScore}%
- Country: ${studentProfile?.country}
- Education: ${studentProfile?.educationalSystem}

${isTechSkill ? `
Since this is a technology skill, I'll focus on:
✅ Mobile-friendly learning (you can practice on your phone)
✅ Free resources available in ${studentProfile?.country}
✅ Practical projects you can build
✅ Career opportunities in African tech
` : `
Since this is an academic skill, I'll focus on:
✅ ${studentProfile?.educationalSystem} curriculum alignment
✅ Local examples from ${studentProfile?.country}
✅ Practice exercises you can do offline
✅ Exam preparation strategies
`}

Let's start! What would you like to know first?
- What are the basics of ${skillName}?
- What's the best way to start learning?
- Can you give me practice exercises?
- What resources should I use?

Ask me anything! 🚀`
  };
  
  // Add to chat and switch to tutor tab
  setChatMessages(prev => [...prev, tutorMessage]);
  setActiveTab('tutor');
  
  // Optionally scroll to bottom of chat
  setTimeout(() => {
    const chatContainer = document.querySelector('.overflow-y-auto');
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }, 100);
};



  // AI Tutor chat (unchanged logic but using same getGenerativeModel)
const sendMessageToAI = async () => {
  if (!userMessage.trim()) return;
  
  const canProceed = await checkFeatureLimit(
    FEATURE_TYPES.AI_TUTOR, 
    'AI Tutor'
  );
  
  if (!canProceed) return;
  
  const newUserMessage = { role: 'user', content: userMessage };
  setChatMessages(prev => [...prev, newUserMessage]);
  setUserMessage('');
  setIsTyping(true);

  try {
    // Call secure backend endpoint
    const text = await secureTutorChat(
      {
        name: studentProfile?.name || 'Student',
        country: studentProfile?.country || 'Not specified',
        educationalSystem: studentProfile?.educationalSystem || 'Not specified',
        strengths: studentProfile?.strengths || 'Not specified',
        weaknesses: studentProfile?.weaknesses || 'Not specified'
      },
      userMessage
    );

    const updatedMessages = [...chatMessages, newUserMessage, { role: 'assistant', content: text }];
    setChatMessages(updatedMessages);

    await trackFeatureUsage(user.uid, FEATURE_TYPES.AI_TUTOR);
    const summary = await getUsageSummary(user.uid);
    setUsageSummary(summary);
    
    await saveChatMessages(user.uid, updatedMessages);
    console.log('✅ Chat messages cached offline');

  } catch (error) {
    console.error('AI Error:', error);
    setChatMessages(prev => [...prev, { 
      role: 'assistant', 
      content: `I apologize, but I encountered an error. ${error.message || 'Unknown error.'}` 
    }]);
  } finally {
    setIsTyping(false);
  }
};
// // Add this function after sendMessageToAI
const handleKeyPress = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessageToAI();
  }
};

const getTechSkillRelevance = (skillName) => {
  const relevance = {
    'Digital Literacy': 'Essential for all modern jobs',
    'Mobile Computing': 'High demand in Africa',
    'Internet Research': 'Critical for self-learning',
    'Basic Coding': 'Tech career gateway',
    'Python Programming': 'Most in-demand language',
    'JavaScript': 'Web development essential',
    'Data Entry & Spreadsheets': 'Remote work ready',
    'Excel Skills': 'Business skill essential',
    'Social Media Management': 'Growing freelance market',
    'Graphic Design Basics': 'Creative economy skill',
    'Video Editing': 'Content creation boom',
    'Web Browsing': 'Information access',
    'Email & Communication': 'Professional communication',
    'Cloud Storage': 'Modern workplace essential',
    'Cybersecurity Basics': 'Digital safety',
    'Word Processing': 'Office work essential',
    'Presentation Skills': 'Career advancement',
    'HTML/CSS': 'Web design foundation',
    'Database Basics': 'Data management skill'
  };
  return relevance[skillName] || 'Valuable digital skill';
};

const getFocusArea = (skills) => {
  if (!skills || (!skills.academic && !skills.technology)) return 'N/A';
  
  const academicAvg = skills.academic 
    ? Object.values(skills.academic).reduce((a,b) => a+b, 0) / Object.values(skills.academic).length 
    : 0;
  const techAvg = skills.technology 
    ? Object.values(skills.technology).reduce((a,b) => a+b, 0) / Object.values(skills.technology).length 
    : 0;
  
  if (academicAvg < 50 && techAvg < 50) return 'Both Areas';
  if (academicAvg < techAvg - 10) return 'Academic Skills';
  if (techAvg < academicAvg - 10) return 'Tech Skills';
  return 'Balanced';
};
// Add this function after getTechSkillRelevance function

const getTechSkillIcon = (skillName) => {
  const icons = {
    'Digital Literacy': '💻',
    'Mobile Computing': '📱',
    'Internet Research': '🔍',
    'Basic Coding': '👨‍💻',
    'Python Programming': '🐍',
    'JavaScript': '⚡',
    'Data Entry & Spreadsheets': '📊',
    'Excel Skills': '📈',
    'Social Media Management': '📱',
    'Graphic Design Basics': '🎨',
    'Video Editing': '🎬',
    'Web Browsing': '🌐',
    'Email & Communication': '📧',
    'Cloud Storage': '☁️',
    'Cybersecurity Basics': '🔒',
    'Word Processing': '📝',
    'Presentation Skills': '📊',
    'HTML/CSS': '🌐',
    'Database Basics': '🗄️',
    'App Development': '📱',
    'Web Development': '🌐',
    'Data Analysis': '📊',
    'Machine Learning': '🤖',
    'API Integration': '🔌',
    'Version Control': '🔀',
    'Testing & Debugging': '🐛',
    'UI/UX Design': '🎨'
  };
  return icons[skillName] || '💻'; // Default icon
};
// Calculate and update learning streak
const updateStreak = async () => {
  const today = new Date().toDateString();
  
  // If no last activity, this is day 1
  if (!lastActivityDate) {
    setCurrentStreak(1);
    setLastActivityDate(today);
    await persistStudentData({ 
      currentStreak: 1, 
      lastActivityDate: today 
    });
    return 1;
  }

  const lastDate = new Date(lastActivityDate).toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString(); // 24 hours ago

  // If activity today, don't update
  if (lastDate === today) {
    return currentStreak;
  }

  // If activity was yesterday, increment streak
  if (lastDate === yesterday) {
    const newStreak = currentStreak + 1;
    setCurrentStreak(newStreak);
    setLastActivityDate(today);
    await persistStudentData({ 
      currentStreak: newStreak, 
      lastActivityDate: today 
    });
    return newStreak;
  }

  // If activity gap > 1 day, reset streak
  setCurrentStreak(1);
  setLastActivityDate(today);
  await persistStudentData({ 
    currentStreak: 1, 
    lastActivityDate: today 
  });
  return 1;
};
// Handle task completion
const handleTaskCompletion = async (taskIndex, taskTitle) => {
  // Check if task is already completed
  if (completedTasks.includes(taskIndex)) {
    // Uncomplete task
    const newCompletedTasks = completedTasks.filter(idx => idx !== taskIndex);
    setCompletedTasks(newCompletedTasks);
    
    // Log activity
    const activity = {
      type: 'task_uncompleted',
      taskIndex,
      taskTitle,
      timestamp: new Date().toISOString()
    };
    const newActivityLog = [...activityLog, activity];
    setActivityLog(newActivityLog);
    
    // Save to Firestore
    await persistStudentData({ 
      completedTasks: newCompletedTasks,
      activityLog: newActivityLog
    });
    
    return;
  }
  
  // Complete task
  const newCompletedTasks = [...completedTasks, taskIndex];
  setCompletedTasks(newCompletedTasks);
  
  // Log activity
  const activity = {
    type: 'task_completed',
    taskIndex,
    taskTitle,
    timestamp: new Date().toISOString()
  };
  const newActivityLog = [...activityLog, activity];
  setActivityLog(newActivityLog);
  
  // Update streak
  const newStreak = await updateStreak();
  
  // Save to Firestore
  await persistStudentData({ 
    completedTasks: newCompletedTasks,
    activityLog: newActivityLog
  });
  
  // Check if completed 5 tasks (milestone)
  if (newCompletedTasks.length > 0 && newCompletedTasks.length % 5 === 0) {
    console.log(`🎉 Milestone! Completed ${newCompletedTasks.length} tasks!`);
    // You can trigger achievement unlock here
  }
  
  // Check if reached 5-day streak
  if (newStreak >= 5) {
    console.log(`🔥 Amazing! ${newStreak}-day learning streak!`);
    // You can trigger streak achievement here
  }
};
// Generate AI-powered skill recommendations
const generateSkillRecommendations = async () => {
  setIsLoadingRecommendations(true);
  
  try {
    // Call secure backend endpoint
    const text = await secureGetSkillRecommendations(
      {
        name: studentProfile?.name,
        country: studentProfile?.country,
        educationalSystem: studentProfile?.educationalSystem,
        strengths: studentProfile?.strengths,
        weaknesses: studentProfile?.weaknesses
      },
      completedTasks.length,
      currentStreak,
      skills || {},
      activityLog || []
    );

    const jsonTextMatch = text.match(/\{[\s\S]*\}/);
    const jsonText = jsonTextMatch ? jsonTextMatch[0] : text;

    const parsed = JSON.parse(jsonText);
    
    if (parsed.recommendations && Array.isArray(parsed.recommendations)) {
      setSkillRecommendations(parsed.recommendations);
      
      // Save to Firestore
      await persistStudentData({ 
        skillRecommendations: parsed.recommendations,
        lastRecommendationDate: new Date().toISOString()
      });
    }
    
  } catch (err) {
    console.error('Skill recommendations error:', err);
    setSkillRecommendations([]);
  } finally {
    setIsLoadingRecommendations(false);
  }
};
// ADD THESE: Community functions
const loadUserCommunityStats = async () => {
  // Load stats
  const stats = await getUserStats(user.uid);
  setUserCommunityStats(stats);
  console.log('📊 User stats loaded:', stats); // Debug log

};

const loadLeaderboard = async () => {
  const leaders = await getLeaderboard();
  setLeaderboard(leaders);
};

const loadCommunityPosts = async () => {
  setCommunityLoading(true);
  setCommunityError('');
  
  try {
    const filters = {
      category: selectedCategory === 'All' ? null : selectedCategory,
      type: selectedPostType,
      sortBy,
      unanswered: sortBy === 'unanswered',
      limit: 20
    };
    
    const fetchedPosts = await getPosts(filters);
    setCommunityPosts(fetchedPosts);
  } catch (err) {
    setCommunityError('Failed to load posts. Please try again.');
    console.error(err);
  } finally {
    setCommunityLoading(false);
  }
};

const handleSearchPosts = async (e) => {
  e.preventDefault();
  if (!searchTerm.trim()) {
    loadCommunityPosts();
    return;
  }
  
  setCommunityLoading(true);
  const results = await searchPosts(searchTerm);
  setCommunityPosts(results);
  setCommunityLoading(false);
};

const handleCreatePost = async (e) => {
  e.preventDefault();
  
  if (!newPost.title.trim() || !newPost.content.trim()) {
    setCommunityError('Please fill in all required fields');
    return;
  }
  
  setCommunityLoading(true);
  setCommunityError('');
  
  try {
    const postData = {
      ...newPost,
      tags: newPost.tags.split(',').map(tag => tag.trim()).filter(Boolean)
    };
    
    const result = await createPost(postData, user.uid, studentProfile?.name || 'Anonymous', studentProfile);
    
    if (result.success) {
      setCommunitySuccess('Post created successfully! 🎉');
      setNewPost({
        type: 'question',
        category: 'Mathematics',
        title: '',
        content: '',
        tags: ''
      });
      setCommunityView('feed');
      loadCommunityPosts();
      loadUserCommunityStats();
      
      setTimeout(() => setCommunitySuccess(''), 3000);
    } else {
      setCommunityError(result.error || 'Failed to create post');
    }
  } catch (err) {
    setCommunityError('Failed to create post. Please try again.');
    console.error(err);
  } finally {
    setCommunityLoading(false);
  }
};

const handleViewPost = async (postId) => {
  setCommunityLoading(true);
  setCommunityView('post');
  
  try {
    await incrementViews(postId);
    const data = await getPostWithReplies(postId);
    
    if (data) {
      setSelectedPost(data.post);
      setPostReplies(data.replies);
    }
  } catch (err) {
    setCommunityError('Failed to load post');
    console.error(err);
  } finally {
    setCommunityLoading(false);
  }
};

const handleReply = async (e) => {
  e.preventDefault();
  
  if (!replyContent.trim()) {
    setCommunityError('Please enter a reply');
    return;
  }
  
  setCommunityLoading(true);
  setCommunityError('');
  
  try {
    const replyData = { content: replyContent };
    const result = await createReply(replyData, selectedPost.id, user.uid, studentProfile?.name || 'Anonymous');
    
    if (result.success) {
      setCommunitySuccess('Reply posted! 💬');
      setReplyContent('');
      
      const data = await getPostWithReplies(selectedPost.id);
      if (data) {
        setSelectedPost(data.post);
        setPostReplies(data.replies);
      }
      
      loadUserCommunityStats();
      setTimeout(() => setCommunitySuccess(''), 3000);
    } else {
      setCommunityError(result.error || 'Failed to post reply');
    }
  } catch (err) {
    setCommunityError('Failed to post reply. Please try again.');
    console.error(err);
  } finally {
    setCommunityLoading(false);
  }
};

const handleVotePost = async (postId, voteType) => {
  await votePost(postId, user.uid, voteType);
  
  if (communityView === 'feed') {
    loadCommunityPosts();
  } else if (communityView === 'post') {
    const data = await getPostWithReplies(postId);
    if (data) {
      setSelectedPost(data.post);
      setPostReplies(data.replies);
    }
  }
};

const handleVoteReply = async (replyId) => {
  await voteReply(replyId, user.uid);
  const data = await getPostWithReplies(selectedPost.id);
  if (data) {
    setPostReplies(data.replies);
  }
};

const handleMarkBestAnswer = async (replyId) => {
  const result = await markBestAnswer(selectedPost.id, replyId, selectedPost.authorId, user.uid);
  
  if (result.success) {
    setCommunitySuccess('Best answer marked! 🏆');
    const data = await getPostWithReplies(selectedPost.id);
    if (data) {
      setSelectedPost(data.post);
      setPostReplies(data.replies);
    }
    setTimeout(() => setCommunitySuccess(''), 3000);
  } else {
    setCommunityError(result.error || 'Failed to mark best answer');
  }
};

const handleFlag = async (contentId, contentType) => {
  const reason = prompt('Please provide a reason for flagging this content:');
  if (!reason) return;
  
  const result = await flagContent(contentId, contentType, user.uid, reason);
  if (result.success) {
    setCommunitySuccess('Content flagged for review. Thank you! 🛡️');
    setTimeout(() => setCommunitySuccess(''), 3000);
  } else {
    setCommunityError('Failed to flag content');
  }
};

const formatTimestamp = (timestamp) => {
  if (!timestamp) return 'Just now';
  
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
};

const getPostTypeIcon = (type) => {
  const typeObj = POST_TYPES.find(t => t.value === type);
  return typeObj ? typeObj.icon : '📚';
};
// ADD THIS: View user profile
const handleViewProfile = async (userId, userName) => {
  setCommunityLoading(true);
  
  try {
    const profile = await getUserProfile(userId);
    
    if (profile) {
      setViewingProfile({
        userId,
        userName: userName || profile.name || 'Anonymous',
        ...profile
      });
      setProfileModalOpen(true);
    } else {
      setCommunityError('Failed to load profile');
    }
  } catch (err) {
    setCommunityError('Failed to load profile');
    console.error(err);
  } finally {
    setCommunityLoading(false);
  }
};
// ADD THIS: Force create stats on first visit
const ensureStatsExist = async () => {
  try {
    const statsRef = doc(db, 'userCommunityStats', user.uid);
    const statsSnap = await getDoc(statsRef);
    
    if (!statsSnap.exists()) {
      // Create new stats
      await setDoc(statsRef, {
        userId: user.uid,
        postsCreated: 0,
        repliesGiven: 0,
        helpfulReplies: 0,
        reputationPoints: 0,
        badges: [],
        joinedAt: serverTimestamp()
      });
      console.log('✅ Stats initialized');
    }
  } catch (error) {
    console.error('Stats init error:', error);
  }
};
const auth = getAuth();
const currentUser = auth.currentUser;


// Manual sync trigger
const handleManualSync = async () => {
  if (!isOnline) {
    alert('Cannot sync while offline. Please check your connection.');
    return;
  }

  setIsSyncing(true);
  const result = await forceSyncNow(user.uid);
  
  if (result.success) {
    alert(`Sync complete! ${result.processed} items synced.`);
  } else {
    alert('Sync failed. Please try again.');
  }
  
  // Update sync status
  const newStatus = await getSyncStatus();
  setSyncStatus(newStatus);
  setIsSyncing(false);
};

  // ---------------------------
  // Render UI (kept existing tabs as-is; added controls for AI features)
  // ---------------------------
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
                <span className="text-2xl">🎓</span>

 {/* Subscription Modal */}
<SubscriptionModal
  isOpen={showSubscriptionModal}
  onClose={() => {
    setShowSubscriptionModal(false);
    setLimitReachedMessage('');
  }}
  currentTier={subscriptionTier}
  usageSummary={usageSummary}
  userCountry={studentProfile?.country}
  userId={user.uid}
  onUpgrade={handleUpgrade}
/>

{/* Limit Reached Message */}
{limitReachedMessage && (
  <div className="fixed bottom-4 right-4 bg-orange-100 border-2 border-orange-400 text-orange-800 px-6 py-4 rounded-lg shadow-lg max-w-md">
    <div className="flex items-start">
      <span className="text-2xl mr-3">⚠️</span>
      <div>
        <p className="font-semibold mb-1">Limit Reached</p>
        <p className="text-sm">{limitReachedMessage}</p>
      </div>
    </div>
  </div>
)}

              </div>
              <div>
                <h1 className="text-2xl font-bold">Student Dashboard</h1>
                <p className="text-green-100 text-sm">{user?.email}</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {/* ADD THIS: Online/Offline indicator */}
        <div className={`flex items-center space-x-2 px-3 py-1 rounded-full ${
          isOnline ? 'bg-green-500/20' : 'bg-red-500/40'
        }`}>
          <div className={`w-2 h-2 rounded-full ${
            isOnline ? 'bg-green-200' : 'bg-red-300'
          } ${isOnline ? 'animate-pulse' : ''}`}></div>
          <span className="text-sm font-medium">
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>

         {/* Subscription Status */}
       <button
      onClick={() => setShowSubscriptionModal(true)}
  className={`px-4 py-2 rounded-lg font-medium transition ${
    subscriptionTier === SUBSCRIPTION_TIERS.PREMIUM
      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
      : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
  }`}
>
  {subscriptionTier === SUBSCRIPTION_TIERS.PREMIUM ? '👑 Premium' : '✨ Upgrade'}
</button>

        {/* ADD THIS: Sync status and button */}
  {syncStatus.hasPendingOperations && (
    <div className="bg-yellow-500/20 px-3 py-1 rounded-full">
      <span className="text-sm font-medium text-yellow-100">
        {syncStatus.message}
      </span>
    </div>
  )}

  {isOnline && (
    <button
      onClick={handleManualSync}
      disabled={isSyncing}
      className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition disabled:opacity-50"
    >
      {isSyncing ? '🔄 Syncing...' : '🔄 Sync'}
    </button>
  )}
  <button onClick={onLogout} className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition">
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4">
          <nav className="flex space-x-1 overflow-x-auto">
            {[
              { id: 'overview', label: 'Overview', icon: '📊' },
              { id: 'profile', label: 'Profile', icon: '👤' },
              { id: 'tasks', label: 'Tasks', icon: '📝' },
              { id: 'tutor', label: 'AI Tutor', icon: '🤖' },
              { id: 'skills', label: 'Skills', icon: '📈' },
              { id: 'achievements', label: 'Achievements', icon: '🏆' },
              { id: 'community', label: 'Community', icon: '👥' },
              { id: 'content', label: 'Offline Content', icon: '📚' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 font-medium transition whitespace-nowrap ${
                  activeTab === tab.id 
                    ? 'border-b-2 border-green-600 text-green-600' 
                    : 'text-gray-600 hover:text-green-600'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {/* Overview (unchanged) */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <h2 className="text-3xl font-bold text-gray-800">
              Welcome back, {studentProfile?.name || 'Student'}!
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-500">
                <div className="text-sm font-semibold text-gray-600 mb-1">Country</div>
                <div className="text-xl font-bold text-gray-800">{studentProfile?.country || 'Not specified'}</div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-purple-500">
                <div className="text-sm font-semibold text-gray-600 mb-1">Educational System</div>
                <div className="text-xl font-bold text-gray-800">{studentProfile?.educationalSystem || 'Not specified'}</div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-500">
                <div className="text-sm font-semibold text-gray-600 mb-1">Member Since</div>
                <div className="text-xl font-bold text-gray-800">
                  {studentProfile?.createdAt ? new Date(studentProfile.createdAt).toLocaleDateString() : 'Unknown'}
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-md">
              <div className="flex items-center space-x-3 mb-3">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <div className="text-sm font-semibold text-gray-600">Email Address</div>
              </div>
              <div className="text-lg font-medium text-gray-800 ml-9">{user?.email}</div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-md">
                <h3 className="text-xl font-bold mb-4 flex items-center text-green-700">
                  <span className="text-2xl mr-2">💪</span>
                  My Strengths
                </h3>
                <div className="text-gray-700 bg-green-50 p-4 rounded-lg border border-green-200 min-h-[100px]">
                  {studentProfile?.strengths || 'Not specified'}
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-md">
                <h3 className="text-xl font-bold mb-4 flex items-center text-blue-700">
                  <span className="text-2xl mr-2">🎯</span>
                  Areas for Improvement
                </h3>
                <div className="text-gray-700 bg-blue-50 p-4 rounded-lg border border-blue-200 min-h-[100px]">
                  {studentProfile?.weaknesses || 'Not specified'}
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-6 rounded-xl shadow-md border border-purple-200">
              <h3 className="text-xl font-bold mb-4 text-purple-800">Account Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-semibold text-gray-600 mb-1">Account Role</div>
                  <div className="text-lg font-medium text-gray-800 capitalize">{studentProfile?.role || 'Student'}</div>
                </div>
                {/* Usage Summary */}
{usageSummary && usageSummary.tier === 'free' && (
  <div className="bg-gradient-to-r from-orange-50 to-red-50 p-6 rounded-xl border-2 border-orange-200">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-xl font-bold text-gray-800">Your Usage (Free Tier)</h3>
      <button
        onClick={() => setShowSubscriptionModal(true)}
        className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-2 rounded-lg font-semibold hover:from-purple-700 hover:to-pink-700 transition"
      >
        ✨ Upgrade to Premium
      </button>
    </div>
    
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {Object.entries(usageSummary.features).map(([key, data]) => (
        <div key={key} className="bg-white p-3 rounded-lg border border-orange-200">
          <div className="text-xs font-semibold text-gray-600 mb-1">
            {key === 'aiTutorQueries' ? '🤖 AI Tutor' :
             key === 'taskGeneration' ? '📝 Tasks' :
             key === 'skillsAnalysis' ? '📈 Skills' :
             key === 'learningPaths' ? '🎯 Paths' :
             '🏆 Achievements'}
          </div>
          <div className="text-lg font-bold text-orange-600 mb-1">
            {data.used}/{data.limit}
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className={`h-1.5 rounded-full ${
                data.remaining === 0 ? 'bg-red-500' :
                data.remaining <= data.limit * 0.2 ? 'bg-orange-500' :
                'bg-green-500'
              }`}
              style={{ width: `${(data.used / data.limit) * 100}%` }}
            ></div>
          </div>
          <div className="text-xs text-gray-500 mt-1 capitalize">{data.period}</div>
        </div>
      ))}
    </div>
  </div>
)}<div>
  <div className="text-sm font-semibold text-gray-600 mb-1">Registration Date</div>
                  <div className="text-lg font-medium text-gray-800">
                    {studentProfile?.createdAt ? new Date(studentProfile.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    }) : 'Unknown'}
                  </div>
                  </div>

              </div>
            </div>
          </div>
          )}

        {/* Profile (unchanged editing UI) */}
        {activeTab === 'profile' && (
          <div className="max-w-3xl mx-auto">
            <div className="bg-white rounded-xl shadow-lg p-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-gray-800">My Profile</h2>
                {!isEditing && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition"
                  >
                    Edit Profile
                  </button>
                )}
              </div>

              {updateMessage && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
                  {updateMessage}
                </div>
              )}

              {updateError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
                  {updateError}
                </div>
              )}

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Country</label>
                  {isEditing ? (
                    <select
                      value={editedProfile.country}
                      onChange={(e) => setEditedProfile({...editedProfile, country: e.target.value})}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="">Select country</option>
                      {AFRICAN_COUNTRIES.map(country => (
                        <option key={country} value={country}>{country}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-lg text-gray-800 bg-gray-50 p-3 rounded-lg">{studentProfile?.country}</div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Educational System</label>
                  {isEditing ? (
                    <select
                      value={editedProfile.educationalSystem}
                      onChange={(e) => setEditedProfile({...editedProfile, educationalSystem: e.target.value})}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="">Select educational system</option>
                      {EDUCATIONAL_SYSTEMS.map(system => (
                        <option key={system} value={system}>{system}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-lg text-gray-800 bg-gray-50 p-3 rounded-lg">{studentProfile?.educationalSystem}</div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">My Strengths</label>
                  {isEditing ? (
                    <textarea
                      value={editedProfile.strengths}
                      onChange={(e) => setEditedProfile({...editedProfile, strengths: e.target.value})}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                      rows="4"
                    />
                  ) : (
                    <div className="text-lg text-gray-800 bg-green-50 p-4 rounded-lg border border-green-200">{studentProfile?.strengths}</div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Areas for Improvement</label>
                  {isEditing ? (
                    <textarea
                      value={editedProfile.weaknesses}
                      onChange={(e) => setEditedProfile({...editedProfile, weaknesses: e.target.value})}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                      rows="4"
                    />
                  ) : (
                    <div className="text-lg text-gray-800 bg-blue-50 p-4 rounded-lg border border-blue-200">{studentProfile?.weaknesses}</div>
                  )}
                </div>

                {isEditing && (
                  <div className="flex space-x-4">
                    <button
                      onClick={handleProfileUpdate}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-semibold transition"
                    >
                      Save Changes
                    </button>
                    <button
                      onClick={() => {
                        setIsEditing(false);
                        setEditedProfile({
                          country: studentProfile?.country || '',
                          educationalSystem: studentProfile?.educationalSystem || '',
                          strengths: studentProfile?.strengths || '',
                          weaknesses: studentProfile?.weaknesses || ''
                        });
                        setUpdateError('');
                      }}
                      className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 py-3 rounded-lg font-semibold transition"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {/* Tasks Tab - enhanced with completion tracking */}
    {activeTab === 'tasks' && (
  <div className="max-w-3xl mx-auto">
    <div className="bg-white rounded-xl shadow-lg p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold text-gray-800">Tasks & Assignments</h2>
        <div className="flex items-center space-x-3">
          <button
            onClick={generateTasks}
            disabled={aiLoadingTasks}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition disabled:opacity-50"
          >
            {aiLoadingTasks ? '⏳ Generating...' : '✨ Generate Tasks (AI)'}
          </button>
        </div>
      </div>

      {/* Progress Summary */}
      {tasks.length > 0 && (
        <div className="mb-6 bg-gradient-to-r from-green-50 to-blue-50 p-4 rounded-lg border border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-600">Progress</div>
              <div className="text-2xl font-bold text-green-700">
                {completedTasks.length} / {tasks.length} completed
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-gray-600">Current Streak</div>
              <div className="text-2xl font-bold text-orange-600 flex items-center justify-end">
                🔥 {currentStreak} {currentStreak === 1 ? 'day' : 'days'}
              </div>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-2 bg-green-500 rounded-full transition-all duration-500"
              style={{ width: `${(completedTasks.length / tasks.length) * 100}%` }}
            ></div>
          </div>
          
          {/* Streak Progress */}
          {currentStreak > 0 && currentStreak < 5 && (
            <div className="mt-2 text-xs text-gray-600">
              🎯 {5 - currentStreak} more {5 - currentStreak === 1 ? 'day' : 'days'} to unlock 5-day streak achievement!
            </div>
          )}
          
          {currentStreak >= 5 && (
            <div className="mt-2 text-xs text-green-700 font-semibold">
              🏆 Amazing! You've unlocked the 5-day streak achievement!
            </div>
          )}
        </div>
      )}

      {aiErrorTasks && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {aiErrorTasks}
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="text-center p-12 text-gray-600">
          <div className="text-6xl mb-4">📝</div>
          <p className="text-lg mb-2">No tasks yet</p>
          <p className="text-sm">Click "Generate Tasks (AI)" to create tailored tasks based on your profile.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map((t, idx) => {
            const isCompleted = completedTasks.includes(idx);
            
            return (
              <div 
                key={idx} 
                className={`p-4 rounded-lg border transition-all ${
                  isCompleted 
                    ? 'bg-green-50 border-green-300' 
                    : 'bg-gray-50 border-gray-200 hover:border-green-300'
                }`}
              >
                <div className="flex items-start space-x-3">
                  {/* Checkbox */}
                  <button
                    onClick={() => handleTaskCompletion(idx, t.title)}
                    className="flex-shrink-0 mt-1"
                  >
                    <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${
                      isCompleted 
                        ? 'bg-green-500 border-green-500' 
                        : 'bg-white border-gray-300 hover:border-green-500'
                    }`}>
                      {isCompleted && (
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </button>

                  {/* Task Content */}
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className={`text-lg font-semibold ${
                        isCompleted ? 'text-green-700 line-through' : 'text-gray-800'
                      }`}>
                        {t.title || `Task ${idx + 1}`}
                      </h3>
                      <div className="flex items-center space-x-2">
                        <span className={`text-xs px-2 py-1 rounded font-medium ${
                          t.difficulty === 'Easy' ? 'bg-green-100 text-green-700' :
                          t.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {t.difficulty || 'Medium'}
                        </span>
                      </div>
                    </div>
                    
                    <p className={`text-gray-700 ${isCompleted ? 'opacity-60' : ''}`}>
                      {t.description}
                    </p>
                    
                    {t.estimatedMinutes && (
                      <div className="mt-2 text-sm text-gray-500 flex items-center">
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Est: {t.estimatedMinutes} minutes
                      </div>
                    )}
                    {/* Answer Section - Toggle to reveal */}
{t.answer && (
  <details className="mt-3 bg-blue-50 border border-blue-200 rounded-lg overflow-hidden">
    <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition">
      📝 View Answer/Solution
    </summary>
    <div className="px-3 py-3 text-sm text-gray-700 border-t border-blue-200 whitespace-pre-wrap">
      {t.answer}
    </div>
  </details>
)}
{isCompleted && (
                      <div className="mt-2 text-xs text-green-600 font-medium flex items-center">
                        <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Completed! Great work! 🎉
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Completion Celebration */}
      {tasks.length > 0 && completedTasks.length === tasks.length && (
        <div className="mt-6 bg-gradient-to-r from-yellow-50 to-orange-50 p-6 rounded-lg border-2 border-yellow-300">
          <div className="text-center">
            <div className="text-5xl mb-2">🎉</div>
            <h3 className="text-2xl font-bold text-orange-700 mb-2">
              All Tasks Completed!
            </h3>
            <p className="text-gray-700 mb-4">
              Amazing work! You've completed all your tasks. Ready for more?
            </p>
            <button
              onClick={generateTasks}
              className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded-lg font-semibold transition"
            >
              Generate New Tasks
            </button>
          </div>
        </div>
      )}
    </div>
  </div>
)}
{/* Tutor Tab (unchanged) */}
        {activeTab === 'tutor' && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-xl shadow-lg overflow-hidden h-[600px] flex flex-col">
              <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-6 text-white">
                <h2 className="text-2xl font-bold flex items-center">
                  <span className="text-3xl mr-3">🤖</span>
                  Your Personal AI Tutor
                </h2>
                <p className="text-purple-100 mt-1">Personalized for {studentProfile?.educationalSystem} in {studentProfile?.country}</p>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] p-4 rounded-2xl ${
                      msg.role === 'user' 
                        ? 'bg-green-600 text-white' 
                        : 'bg-white text-gray-800 shadow-md'
                    }`}>
                      {msg.role === 'assistant' && <div className="text-2xl mb-2">🤖</div>}
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-white p-4 rounded-2xl shadow-md">
                      <div className="flex space-x-2">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 bg-white border-t">
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={userMessage}
                    onChange={(e) => setUserMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Ask your tutor a question..."
                    className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-purple-500 outline-none"
                  />
                  <button
                    onClick={sendMessageToAI}
                    disabled={isTyping || !userMessage.trim()}
                    className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-3 rounded-xl font-semibold hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Skills Tab - enhanced */}
        {activeTab === 'skills' && (
      <div className="max-w-4xl mx-auto">
    <div className="bg-white rounded-xl shadow-lg p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold text-gray-800">Skills Progress</h2>
        <div className="flex items-center space-x-3">
          <button
            onClick={analyzeSkills}
            disabled={aiLoadingSkills}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition disabled:opacity-50"
          >
            {aiLoadingSkills ? '⏳ Analyzing...' : '🔍 Analyze Skills (AI)'}
          </button>
        </div>
      </div>

      {aiErrorSkills && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {aiErrorSkills}
        </div>
      )}

      {learningError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {learningError}
        </div>
      )}

      {(!skills || ((!skills.academic || Object.keys(skills.academic).length === 0) && (!skills.technology || Object.keys(skills.technology).length === 0))) ? (
        <div className="text-center p-12 text-gray-600">
          <div className="text-6xl mb-4">📊</div>
          <p className="text-lg mb-2">No skill data yet</p>
          <p className="text-sm">Click "Analyze Skills (AI)" to estimate your skill levels based on your profile.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* ACADEMIC SKILLS SECTION */}
          {skills.academic && Object.keys(skills.academic).length > 0 && (
            <div>
              <div className="flex items-center mb-4">
                <span className="text-2xl mr-3">📚</span>
                <h3 className="text-2xl font-bold text-gray-800">Academic Skills</h3>
              </div>
              <div className="space-y-4">
                {Object.entries(skills.academic).map(([skill, score]) => (
                  <div key={skill} className="bg-gradient-to-r from-blue-50 to-purple-50 p-5 rounded-lg border border-blue-200">
                    <div className="flex justify-between items-center mb-2">
                      <div className="font-semibold text-gray-800 text-lg">{skill}</div>
                      <div className="text-sm font-bold text-gray-600">{score}%</div>
                    </div>
                    <div className="h-3 bg-gray-200 rounded-full overflow-hidden mb-3">
                      <div 
                        style={{ width: `${Math.max(0, Math.min(100, Number(score || 0)))}%` }} 
                        className={`h-3 rounded-full transition-all duration-500 ${
                          score >= 80 ? 'bg-green-500' : 
                          score >= 60 ? 'bg-blue-500' : 
                          score >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                      ></div>
                    </div>

                    {/* HYBRID BUTTONS */}
                    <div className="flex space-x-2">
                      <button
                        onClick={() => generateSkillLearningPath(skill, score, 'academic')}
                        disabled={isLoadingLearning && activeLearningSkill === skill}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg text-sm transition disabled:opacity-50 font-medium"
                      >
                        {isLoadingLearning && activeLearningSkill === skill ? '⏳ Loading...' : '📚 Get Learning Plan'}
                      </button>
                      
                      <button
                        onClick={() => startSkillTutoring(skill, score, 'academic')}
                        className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg text-sm transition font-medium"
                      >
                        🤖 Ask AI Tutor
                      </button>
                    </div>

                    {/* LEARNING PATH DISPLAY */}
                    {activeLearningSkill === skill && learningContent[skill] && (
                      <div className="mt-4 bg-white p-4 rounded-lg border-2 border-blue-500">
                        <h4 className="font-bold text-lg text-blue-800 mb-3 flex items-center">
                          <span className="mr-2">🎯</span>
                          Your Personalized Learning Path
                        </h4>

                        {/* Learning Steps */}
                        <div className="mb-4">
                          <h5 className="font-semibold text-gray-700 mb-2">📋 Learning Steps:</h5>
                          <div className="space-y-2">
                            {learningContent[skill].learningSteps?.map((step, idx) => (
                              <div key={idx} className="bg-blue-50 p-3 rounded border border-blue-200">
                                <div className="flex items-start">
                                  <span className="font-bold text-blue-600 mr-2">{step.step}.</span>
                                  <div className="flex-1">
                                    <div className="font-semibold text-gray-800">{step.title}</div>
                                    <div className="text-sm text-gray-600 mt-1">{step.description}</div>
                                    <div className="flex items-center mt-2 text-xs text-gray-500">
                                      <span className="mr-3">⏱️ {step.estimatedDays} days</span>
                                      {step.offline && <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded">📴 Offline OK</span>}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Practice Exercises */}
                        {learningContent[skill].practiceExercises && (
                          <div className="mb-4">
                            <h5 className="font-semibold text-gray-700 mb-2">💪 Practice Exercises:</h5>
                            <div className="space-y-2">
                              {learningContent[skill].practiceExercises.map((ex, idx) => (
                                <div key={idx} className="bg-purple-50 p-3 rounded border border-purple-200">
                                  <div className="font-semibold text-gray-800">{ex.title}</div>
                                  <div className="text-sm text-gray-600 mt-1">{ex.description}</div>
                                  <div className="flex items-center mt-2 text-xs text-gray-500">
                                    <span className={`px-2 py-0.5 rounded mr-2 ${
                                      ex.difficulty === 'Easy' ? 'bg-green-100 text-green-700' :
                                      ex.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                                      'bg-red-100 text-red-700'
                                    }`}>{ex.difficulty}</span>
                                    <span>⏱️ {ex.estimatedTime}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Quick Tips */}
                        {learningContent[skill].quickTips && (
                          <div className="mb-4">
                            <h5 className="font-semibold text-gray-700 mb-2">💡 Quick Tips:</h5>
                            <ul className="space-y-1">
                              {learningContent[skill].quickTips.map((tip, idx) => (
                                <li key={idx} className="text-sm text-gray-700 bg-yellow-50 p-2 rounded border border-yellow-200">
                                  • {tip}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Free Resources */}
                        {learningContent[skill].freeResources && (
                          <div className="mb-4">
                            <h5 className="font-semibold text-gray-700 mb-2">🔗 Free Resources:</h5>
                            <div className="space-y-2">
                              {learningContent[skill].freeResources.map((res, idx) => (
                                <div key={idx} className="bg-gray-50 p-3 rounded border border-gray-200">
                                  <div className="flex items-center justify-between">
                                    <div className="font-semibold text-gray-800">{res.name}</div>
                                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">{res.type}</span>
                                  </div>
                                  <div className="text-sm text-gray-600 mt-1">{res.description}</div>
                                  {res.url && res.url !== 'Available offline' && (
                                    <a href={res.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                                      🔗 Open Resource
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Milestones */}
                        {learningContent[skill].milestones && (
                          <div>
                            <h5 className="font-semibold text-gray-700 mb-2">🏆 Milestones:</h5>
                            <div className="grid grid-cols-2 gap-2">
                              {learningContent[skill].milestones.map((milestone, idx) => (
                                <div key={idx} className="bg-green-50 p-2 rounded border border-green-200">
                                  <div className="text-xs font-bold text-green-700">{milestone.progress}% Complete</div>
                                  <div className="text-xs text-gray-600 mt-1">{milestone.achievement}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded text-sm text-purple-800">
                          💡 <strong>Need help?</strong> Click "Ask AI Tutor" above to get personalized answers to your questions!
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TECHNOLOGY SKILLS SECTION */}
          {skills.technology && Object.keys(skills.technology).length > 0 && (
            <div>
              <div className="flex items-center mb-4">
                <span className="text-2xl mr-3">💻</span>
                <h3 className="text-2xl font-bold text-gray-800">Technology Skills</h3>
                <span className="ml-3 bg-green-100 text-green-800 text-xs px-3 py-1 rounded-full font-semibold">
                  Career Ready
                </span>
              </div>
              <div className="space-y-4">
                {Object.entries(skills.technology).map(([skill, score]) => (
                  <div key={skill} className="bg-gradient-to-r from-green-50 to-emerald-50 p-5 rounded-lg border border-green-200">
                    <div className="flex justify-between items-center mb-2">
                      <div className="font-semibold text-gray-800 text-lg flex items-center">
                        <span className="mr-2">{getTechSkillIcon(skill)}</span>
                        {skill}
                      </div>
                      <div className="text-sm font-bold text-gray-600">{score}%</div>
                    </div>
                    <div className="h-3 bg-gray-200 rounded-full overflow-hidden mb-2">
                      <div 
                        style={{ width: `${Math.max(0, Math.min(100, Number(score || 0)))}%` }} 
                        className={`h-3 rounded-full transition-all duration-500 ${
                          score >= 80 ? 'bg-emerald-500' : 
                          score >= 60 ? 'bg-green-500' : 
                          score >= 40 ? 'bg-yellow-500' : 'bg-orange-500'
                        }`}
                      ></div>
                    </div>
                    
                    {/* Career Relevance */}
                    <div className="mb-3 text-xs text-gray-600 flex items-center bg-white p-2 rounded border border-green-200">
                      <span className="mr-2">🎯</span>
                      {getTechSkillRelevance(skill)}
                    </div>

                    {/* HYBRID BUTTONS */}
                    <div className="flex space-x-2">
                      <button
                        onClick={() => generateSkillLearningPath(skill, score, 'technology')}
                        disabled={isLoadingLearning && activeLearningSkill === skill}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg text-sm transition disabled:opacity-50 font-medium"
                      >
                        {isLoadingLearning && activeLearningSkill === skill ? '⏳ Loading...' : '💻 Get Tech Learning Plan'}
                      </button>
                      
                      <button
                        onClick={() => startSkillTutoring(skill, score, 'technology')}
                        className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg text-sm transition font-medium"
                      >
                        🤖 Ask AI Tutor
                      </button>
                    </div>

                    {/* LEARNING PATH DISPLAY FOR TECH SKILLS */}
                    {activeLearningSkill === skill && learningContent[skill] && (
                      <div className="mt-4 bg-white p-4 rounded-lg border-2 border-green-500">
                        <h4 className="font-bold text-lg text-green-800 mb-3 flex items-center">
                          <span className="mr-2">🎯</span>
                          Your Tech Learning Roadmap
                        </h4>

                        {/* Learning Steps */}
                        <div className="mb-4">
                          <h5 className="font-semibold text-gray-700 mb-2">📋 Learning Steps:</h5>
                          <div className="space-y-2">
                            {learningContent[skill].learningSteps?.map((step, idx) => (
                              <div key={idx} className="bg-green-50 p-3 rounded border border-green-200">
                                <div className="flex items-start">
                                  <span className="font-bold text-green-600 mr-2">{step.step}.</span>
                                  <div className="flex-1">
                                    <div className="font-semibold text-gray-800">{step.title}</div>
                                    <div className="text-sm text-gray-600 mt-1">{step.description}</div>
                                    {step.resources && (
                                      <div className="text-xs text-gray-500 mt-2 bg-white p-2 rounded border border-gray-200">
                                        🔧 <strong>Tools:</strong> {step.resources}
                                      </div>
                                    )}
                                    <div className="flex items-center mt-2 text-xs text-gray-500">
                                      <span className="mr-3">⏱️ {step.estimatedDays} days</span>
                                      {step.offline && <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded">📴 Offline OK</span>}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Practice Exercises */}
                        {learningContent[skill].practiceExercises && (
                          <div className="mb-4">
                            <h5 className="font-semibold text-gray-700 mb-2">💪 Hands-On Projects:</h5>
                            <div className="space-y-2">
                              {learningContent[skill].practiceExercises.map((ex, idx) => (
                                <div key={idx} className="bg-emerald-50 p-3 rounded border border-emerald-200">
                                  <div className="font-semibold text-gray-800">{ex.title}</div>
                                  <div className="text-sm text-gray-600 mt-1">{ex.description}</div>
                                  <div className="flex items-center mt-2 text-xs text-gray-500">
                                    <span className={`px-2 py-0.5 rounded mr-2 ${
                                      ex.difficulty === 'Easy' ? 'bg-green-100 text-green-700' :
                                      ex.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                                      'bg-red-100 text-red-700'
                                    }`}>{ex.difficulty}</span>
                                    <span className="mr-2">⏱️ {ex.estimatedTime}</span>
                                    {ex.toolsNeeded && <span>🔧 {ex.toolsNeeded}</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Career Opportunities (Tech Only) */}
                        {learningContent[skill].careerOpportunities && (
                          <div className="mb-4 bg-gradient-to-r from-yellow-50 to-orange-50 p-4 rounded-lg border border-yellow-200">
                            <h5 className="font-semibold text-gray-700 mb-2 flex items-center">
                              <span className="mr-2">💼</span>
                              Career Opportunities in Africa:
                            </h5>
                            <ul className="space-y-1">
                              {learningContent[skill].careerOpportunities.map((opp, idx) => (
                                <li key={idx} className="text-sm text-gray-700">
                                  ✅ {opp}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Quick Tips */}
                        {learningContent[skill].quickTips && (
                          <div className="mb-4">
                            <h5 className="font-semibold text-gray-700 mb-2">💡 Pro Tips:</h5>
                            <ul className="space-y-1">
                              {learningContent[skill].quickTips.map((tip, idx) => (
                                <li key={idx} className="text-sm text-gray-700 bg-yellow-50 p-2 rounded border border-yellow-200">
                                  • {tip}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Free Resources */}
                        {learningContent[skill].freeResources && (
                          <div className="mb-4">
                            <h5 className="font-semibold text-gray-700 mb-2">🔗 Free Learning Resources:</h5>
                            <div className="space-y-2">
                              {learningContent[skill].freeResources.map((res, idx) => (
                                <div key={idx} className="bg-gray-50 p-3 rounded border border-gray-200">
                                  <div className="flex items-center justify-between">
                                    <div className="font-semibold text-gray-800">{res.name}</div>
                                    <div className="flex items-center space-x-2">
                                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">{res.type}</span>
                                      {res.offline && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">📴 Offline</span>}
                                    </div>
                                  </div>
                                  <div className="text-sm text-gray-600 mt-1">{res.description}</div>
                                  {res.url && res.url !== 'Available offline' && (
                                    <a href={res.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                                      🔗 Open Resource
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Milestones */}
                        {learningContent[skill].milestones && (
                          <div>
                            <h5 className="font-semibold text-gray-700 mb-2">🏆 Your Learning Journey:</h5>
                            <div className="grid grid-cols-2 gap-2">
                              {learningContent[skill].milestones.map((milestone, idx) => (
                                <div key={idx} className="bg-green-50 p-2 rounded border border-green-200">
                                  <div className="text-xs font-bold text-green-700">{milestone.progress}% Complete</div>
                                  <div className="text-xs text-gray-600 mt-1">{milestone.achievement}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded text-sm text-purple-800">
                          💡 <strong>Stuck on something?</strong> Click "Ask AI Tutor" above for instant help and guidance!
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SUMMARY STATS */}
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-6 rounded-xl border border-purple-200">
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
              <span className="mr-2">📊</span>
              Skills Overview
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-lg shadow-sm">
                <div className="text-sm text-gray-600 mb-1">Academic Average</div>
                <div className="text-2xl font-bold text-blue-600">
                  {skills.academic ? Math.round(Object.values(skills.academic).reduce((a,b) => a+b, 0) / Object.values(skills.academic).length) : 0}%
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {skills.academic ? Object.keys(skills.academic).length : 0} skills tracked
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg shadow-sm">
                <div className="text-sm text-gray-600 mb-1">Tech Average</div>
                <div className="text-2xl font-bold text-green-600">
                  {skills.technology ? Math.round(Object.values(skills.technology).reduce((a,b) => a+b, 0) / Object.values(skills.technology).length) : 0}%
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {skills.technology ? Object.keys(skills.technology).length : 0} skills tracked
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg shadow-sm">
                <div className="text-sm text-gray-600 mb-1">Focus Area</div>
                <div className="text-lg font-bold text-purple-600">
                  {getFocusArea(skills)}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Recommended priority
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
)}
{/* Achievements Tab - Enhanced with Progress Tracking */}
{activeTab === 'achievements' && (
  <div className="max-w-5xl mx-auto">
    <div className="bg-white rounded-xl shadow-lg p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold text-gray-800">Achievements & Progress</h2>
        <div className="flex items-center space-x-3">
          <button
            onClick={generateSkillRecommendations}
            disabled={isLoadingRecommendations}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition disabled:opacity-50"
          >
            {isLoadingRecommendations ? '⏳ Loading...' : '🎯 Get Skill Recommendations'}
          </button>
          <button
            onClick={generateAchievements}
            disabled={aiLoadingAchievements}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition disabled:opacity-50"
          >
            {aiLoadingAchievements ? '⏳ Generating...' : '🏆 Generate Achievements'}
          </button>
        </div>
      </div>

      {/* Activity Overview Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-5 rounded-xl border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl">📝</span>
            <span className="text-xs font-semibold text-blue-600 uppercase">Tasks</span>
          </div>
          <div className="text-3xl font-bold text-blue-700">{completedTasks.length}</div>
          <div className="text-xs text-blue-600 mt-1">Completed</div>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-5 rounded-xl border border-orange-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl">🔥</span>
            <span className="text-xs font-semibold text-orange-600 uppercase">Streak</span>
          </div>
          <div className="text-3xl font-bold text-orange-700">{currentStreak}</div>
          <div className="text-xs text-orange-600 mt-1">
            {currentStreak === 1 ? 'Day' : 'Days'} Active
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-5 rounded-xl border border-purple-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl">📈</span>
            <span className="text-xs font-semibold text-purple-600 uppercase">Skills</span>
          </div>
          <div className="text-3xl font-bold text-purple-700">
            {skills.academic ? Object.keys(skills.academic).length : 0 + skills.technology ? Object.keys(skills.technology).length : 0}
          </div>
          <div className="text-xs text-purple-600 mt-1">Learning</div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 p-5 rounded-xl border border-green-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl">⚡</span>
            <span className="text-xs font-semibold text-green-600 uppercase">Activity</span>
          </div>
          <div className="text-3xl font-bold text-green-700">{activityLog.length}</div>
          <div className="text-xs text-green-600 mt-1">Total Actions</div>
        </div>
      </div>

      {/* Learning Streak Progress */}
      <div className="mb-8 bg-gradient-to-r from-orange-50 to-red-50 p-6 rounded-xl border border-orange-200">
        <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
          <span className="mr-2">🔥</span>
          Learning Streak
        </h3>
        
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-3xl font-bold text-orange-600">
              {currentStreak} {currentStreak === 1 ? 'Day' : 'Days'}
            </div>
            <div className="text-sm text-gray-600 mt-1">
              {currentStreak >= 5 
                ? '🏆 Amazing! Keep it up!' 
                : `${5 - currentStreak} more ${5 - currentStreak === 1 ? 'day' : 'days'} to reach 5-day milestone!`
              }
            </div>
          </div>
          
          {lastActivityDate && (
            <div className="text-right">
              <div className="text-xs text-gray-600">Last Active</div>
              <div className="text-sm font-semibold text-gray-800">
                {new Date(lastActivityDate).toLocaleDateString()}
              </div>
            </div>
          )}
        </div>

        {/* Streak Visual */}
        <div className="flex space-x-2">
          {[1, 2, 3, 4, 5].map(day => (
            <div 
              key={day}
              className={`flex-1 h-12 rounded-lg flex items-center justify-center font-bold text-sm transition-all ${
                currentStreak >= day 
                  ? 'bg-orange-500 text-white scale-105' 
                  : 'bg-gray-200 text-gray-400'
              }`}
            >
              {currentStreak >= day ? '🔥' : day}
            </div>
          ))}
        </div>

        {currentStreak >= 5 && (
          <div className="mt-4 bg-yellow-100 border border-yellow-300 p-3 rounded-lg text-center">
            <span className="text-2xl mr-2">🏆</span>
            <span className="font-bold text-yellow-800">Streak Achievement Unlocked!</span>
          </div>
        )}
      </div>

      {/* AI Skill Recommendations */}
      {skillRecommendations.length > 0 && (
        <div className="mb-8 bg-gradient-to-r from-purple-50 to-pink-50 p-6 rounded-xl border border-purple-200">
          <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
            <span className="mr-2">🎯</span>
            Recommended Skills for You
          </h3>
          
          <div className="space-y-4">
            {skillRecommendations.map((rec, idx) => (
              <div key={idx} className="bg-white p-4 rounded-lg border border-purple-200 hover:border-purple-400 transition">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-xl">
                      {rec.category === 'technology' ? '💻' : '📚'}
                    </span>
                    <h4 className="font-bold text-lg text-gray-800">{rec.skillName}</h4>
                    <span className={`text-xs px-2 py-1 rounded font-semibold ${
                      rec.priority === 'high' ? 'bg-red-100 text-red-700' :
                      rec.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {rec.priority} priority
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">{rec.estimatedWeeks} weeks</span>
                </div>
                
                <p className="text-sm text-gray-700 mb-2">{rec.reason}</p>
                
                {rec.prerequisites && rec.prerequisites.length > 0 && (
                  <div className="mb-2 text-xs text-gray-600">
                    <strong>Prerequisites:</strong> {rec.prerequisites.join(', ')}
                  </div>
                )}
                
                <div className="bg-blue-50 border border-blue-200 p-2 rounded text-xs text-blue-800">
                  <strong>💼 Career Benefit:</strong> {rec.careerBenefit}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity Log */}
      {activityLog.length > 0 && (
        <div className="mb-8 bg-gray-50 p-6 rounded-xl border border-gray-200">
          <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
            <span className="mr-2">📊</span>
            Recent Activity
          </h3>
          
          <div className="space-y-2">
            {activityLog.slice(-10).reverse().map((activity, idx) => (
              <div key={idx} className="bg-white p-3 rounded-lg border border-gray-200 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="text-xl">
                    {activity.type === 'task_completed' ? '✅' : 
                     activity.type === 'task_uncompleted' ? '⬜' : '📝'}
                  </span>
                  <div>
                    <div className="font-medium text-gray-800">
                      {activity.type === 'task_completed' ? 'Completed: ' : 
                       activity.type === 'task_uncompleted' ? 'Uncompleted: ' : ''}
                      {activity.taskTitle}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(activity.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {activityLog.length > 10 && (
            <div className="mt-3 text-center text-sm text-gray-600">
              Showing last 10 of {activityLog.length} activities
            </div>
          )}
        </div>
      )}

      {/* Achievements Section */}
      <div className="bg-gradient-to-r from-yellow-50 to-orange-50 p-6 rounded-xl border border-yellow-200">
        <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
          <span className="mr-2">🏆</span>
          Your Achievements
        </h3>

        {aiErrorAchievements && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {aiErrorAchievements}
          </div>
        )}

        {achievements.length === 0 ? (
          <div className="text-center p-12 text-gray-600">
            <div className="text-6xl mb-4">🏆</div>
            <p className="text-lg mb-2">No achievements generated yet</p>
            <p className="text-sm">Click "Generate Achievements" to create milestone templates based on your progress.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {achievements.map((achievement, idx) => {
              // Check if achievement is unlocked based on progress
              const isUnlocked = achievement.date || 
                                (achievement.title.toLowerCase().includes('task') && completedTasks.length >= 5) ||
                                (achievement.title.toLowerCase().includes('streak') && currentStreak >= 5);
              
              return (
                <div 
                  key={idx} 
                  className={`p-4 rounded-lg border-2 transition-all ${
                    isUnlocked 
                      ? 'bg-yellow-50 border-yellow-400 shadow-md' 
                      : 'bg-gray-50 border-gray-300 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-3xl">
                        {isUnlocked ? '🏆' : '🔒'}
                      </span>
                      <h4 className={`font-bold text-lg ${
                        isUnlocked ? 'text-yellow-800' : 'text-gray-600'
                      }`}>
                        {achievement.title}
                      </h4>
                    </div>
                    {isUnlocked && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-semibold">
                        ✓ Unlocked
                      </span>
                    )}
                  </div>
                  
                  <p className="text-sm text-gray-700 mb-2">{achievement.description}</p>
                  
                  {achievement.criteria && (
                    <div className="text-xs text-gray-600 bg-white p-2 rounded border border-gray-200">
                      <strong>How to earn:</strong> {achievement.criteria}
                    </div>
                  )}
                  
                  {achievement.date && (
                    <div className="mt-2 text-xs text-gray-500">
                      Earned on: {new Date(achievement.date).toLocaleDateString()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Motivational Message */}
      <div className="mt-6 bg-gradient-to-r from-green-50 to-blue-50 p-6 rounded-xl border border-green-200 text-center">
        <h4 className="font-bold text-lg text-gray-800 mb-2">Keep Going! 💪</h4>
        <p className="text-gray-700">
          {completedTasks.length === 0 
            ? "Start by completing your first task to begin your learning journey!"
            : completedTasks.length < 5
            ? `You're making progress! ${5 - completedTasks.length} more tasks to reach your first milestone!`
            : currentStreak < 5
            ? `Great work! Keep your streak alive for ${5 - currentStreak} more ${5 - currentStreak === 1 ? 'day' : 'days'}!`
            : "You're on fire! 🔥 Keep up the amazing work!"
          }
        </p>
      </div>
    </div>
  </div>
)}
{/* Community Tab */}
{activeTab === 'community' && (
  <div className="max-w-6xl mx-auto">
    {/* Success/Error Messages */}
    {communitySuccess && (
      <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
        {communitySuccess}
      </div>
    )}
    
    {communityError && (
      <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
        {communityError}
      </div>
    )}

    {/* FEED VIEW */}
    {communityView === 'feed' && (
      <div className="bg-white rounded-xl shadow-lg p-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-3xl font-bold text-gray-800 flex items-center">
              <span className="text-4xl mr-3">👥</span>
              Community
            </h2>
            <p className="text-gray-600 mt-1">Learn together, grow together</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => setCommunityView('leaderboard')}
              className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg transition"
            >
              🏆 Leaderboard
            </button>
            <button
              onClick={() => setCommunityView('create')}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-semibold transition"
            >
              + Create Post
            </button>
          </div>
        </div>

        {/* User Stats */}
        {userCommunityStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="text-xs text-blue-600 font-semibold mb-1">YOUR POSTS</div>
              <div className="text-2xl font-bold text-blue-700">{userCommunityStats.postsCreated || 0}</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
              <div className="text-xs text-purple-600 font-semibold mb-1">REPLIES</div>
              <div className="text-2xl font-bold text-purple-700">{userCommunityStats.repliesGiven || 0}</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <div className="text-xs text-green-600 font-semibold mb-1">HELPFUL</div>
              <div className="text-2xl font-bold text-green-700">{userCommunityStats.helpfulReplies || 0}</div>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
              <div className="text-xs text-yellow-600 font-semibold mb-1">REPUTATION</div>
              <div className="text-2xl font-bold text-yellow-700">{userCommunityStats.reputationPoints || 0}</div>
            </div>
          </div>
        )}

        {/* Badges */}
        {userCommunityStats && userCommunityStats.badges && userCommunityStats.badges.length > 0 && (
          <div className="mb-6 bg-gradient-to-r from-yellow-50 to-orange-50 p-4 rounded-lg border border-yellow-200">
            <div className="text-sm font-semibold text-gray-700 mb-2">Your Badges:</div>
            <div className="flex flex-wrap gap-2">
              {userCommunityStats.badges.map(badgeId => {
                const badge = BADGES[badgeId];
                return badge ? (
                  <span key={badgeId} className="bg-white px-3 py-1 rounded-full text-sm font-medium border border-yellow-300">
                    {badge.icon} {badge.name}
                  </span>
                ) : null;
              })}
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="mb-6 space-y-4">
          {/* Search Bar */}
          <form onSubmit={handleSearchPosts} className="flex space-x-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search posts..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              type="submit"
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition"
            >
              🔍 Search
            </button>
          </form>

          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {COMMUNITY_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            {/* Type Filter */}
            <select
              value={selectedPostType}
              onChange={(e) => setSelectedPostType(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {POST_TYPES.map(type => (
                <option key={type.value} value={type.value}>
                  {type.icon} {type.label}
                </option>
              ))}
            </select>

            {/* Sort Filter */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="recent">Recent</option>
              <option value="popular">Popular</option>
              <option value="unanswered">Unanswered</option>
            </select>
          </div>
        </div>

        {/* Posts List */}
        {communityLoading ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">⏳</div>
            <p className="text-gray-600">Loading posts...</p>
          </div>
        ) : communityPosts.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📭</div>
            <p className="text-lg text-gray-600 mb-2">No posts yet</p>
            <p className="text-sm text-gray-500">Be the first to start a discussion!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {communityPosts.map(post => (
              <div
                key={post.id}
                onClick={() => handleViewPost(post.id)}
                className="border border-gray-200 rounded-lg p-5 hover:border-green-300 hover:shadow-md transition cursor-pointer"
              >
                <div className="flex items-start space-x-4">
                  {/* Vote Section */}
                  <div className="flex flex-col items-center space-y-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleVotePost(post.id, 'upvote');
                      }}
                      className={`p-1 rounded ${
                        post.upvotedBy?.includes(user.uid)
                          ? 'text-green-600'
                          : 'text-gray-400 hover:text-green-600'
                      }`}
                    >
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                      </svg>
                    </button>
                    <span className="font-bold text-lg text-gray-700">
                      {(post.upvotes || 0) - (post.downvotes || 0)}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleVotePost(post.id, 'downvote');
                      }}
                      className={`p-1 rounded ${
                        post.downvotedBy?.includes(user.uid)
                          ? 'text-red-600'
                          : 'text-gray-400 hover:text-red-600'
                      }`}
                    >
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.105-1.79l-.05-.025A4 4 0 0011.055 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" />
                      </svg>
                    </button>
                  </div>

                  {/* Post Content */}
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-2xl">{getPostTypeIcon(post.type)}</span>
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-semibold">
                          {post.category}
                        </span>
                        {post.isAnswered && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-semibold flex items-center">
                            ✓ Answered
                          </span>
                        )}
                      </div>
                    </div>

                    <h3 className="text-lg font-bold text-gray-800 mb-2 hover:text-green-600">
                      {post.title}
                    </h3>

                    <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                      {post.content}
                    </p>

                    {/* Tags */}
                    {post.tags && post.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {post.tags.map((tag, idx) => (
                          <span key={idx} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Meta Info */}
                    <div className="flex items-center text-xs text-gray-500 space-x-4">
                      <span
                      className="flex items-center">
                 <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
     </svg>
        <button
     onClick={(e) => {
      e.stopPropagation();
      handleViewProfile(post.authorId, post.authorName);
    }}
    className="text-green-600 hover:text-green-700 font-medium hover:underline"
  >
    {post.authorName}
  </button>
  <span className="ml-1">• {post.authorCountry}</span> 

                      </span>
                      <span className="flex items-center">
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        {post.replyCount || 0} replies
                      </span>
                      <span className="flex items-center">
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        {post.views || 0} views
                      </span>
                      <span>{formatTimestamp(post.createdAt)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )}

    {/* CREATE POST VIEW */}
    {communityView === 'create' && (
      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Create a Post</h2>
          <button
            onClick={() => setCommunityView('feed')}
            className="text-gray-600 hover:text-gray-800"
          >
            ← Back to Feed
          </button>
        </div>

        <form onSubmit={handleCreatePost} className="space-y-6">
          {/* Post Type */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Post Type</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {POST_TYPES.filter(t => t.value !== 'all').map(type => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setNewPost({...newPost, type: type.value})}
                  className={`p-3 rounded-lg border-2 transition ${
                    newPost.type === type.value
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-green-300'
                  }`}
                >
                  <div className="text-2xl mb-1">{type.icon}</div>
                  <div className="text-sm font-medium">{type.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Category</label>
            <select
              value={newPost.category}
              onChange={(e) => setNewPost({...newPost, category: e.target.value})}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {COMMUNITY_CATEGORIES.filter(c => c !== 'All').map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newPost.title}
              onChange={(e) => setNewPost({...newPost, title: e.target.value})}
              placeholder="Enter a clear, descriptive title..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              required
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Content <span className="text-red-500">*</span>
            </label>
            <textarea
              value={newPost.content}
              onChange={(e) => setNewPost({...newPost, content: e.target.value})}
              placeholder="Provide details, context, or your thoughts..."
              rows="8"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              required
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={newPost.tags}
              onChange={(e) => setNewPost({...newPost, tags: e.target.value})}
              placeholder="e.g., algebra, trigonometry, grade-10"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <p className="text-xs text-gray-500 mt-1">Add relevant tags to help others find your post</p>
          </div>

          {/* Community Guidelines */}
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
            <h4 className="font-semibold text-blue-800 mb-2 flex items-center">
              <span className="mr-2">📋</span>
              Community Guidelines
            </h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Be respectful and supportive</li>
              <li>• Don't ask for exam answers or promote cheating</li>
              <li>• Share knowledge, not personal information</li>
              <li>• Report inappropriate content</li>
            </ul>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={communityLoading}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-semibold transition disabled:opacity-50"
          >
            {communityLoading ? '⏳ Posting...' : '📤 Post to Community'}
          </button>
        </form>
      </div>
    )}

    {/* POST DETAIL VIEW */}
    {communityView === 'post' && selectedPost && (
      <div className="space-y-6">
        {/* Back Button */}
        <button
          onClick={() => {
            setCommunityView('feed');
            setSelectedPost(null);
            setPostReplies([]);
          }}
          className="text-gray-600 hover:text-gray-800 font-medium"
        >
          ← Back to Feed
        </button>

        {/* Post Card */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="flex items-start space-x-6">
            {/* Vote Section */}
            <div className="flex flex-col items-center space-y-2">
              <button
                onClick={() => handleVotePost(selectedPost.id, 'upvote')}
                className={`p-2 rounded-lg transition ${
                  selectedPost.upvotedBy?.includes(user.uid)
                    ? 'bg-green-100 text-green-600'
                    : 'bg-gray-100 text-gray-400 hover:bg-green-50 hover:text-green-600'
                }`}
              >
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                </svg>
              </button>
              <span className="font-bold text-2xl text-gray-700">
                {(selectedPost.upvotes || 0) - (selectedPost.downvotes || 0)}
              </span>
              <button
                onClick={() => handleVotePost(selectedPost.id, 'downvote')}
                className={`p-2 rounded-lg transition ${
                  selectedPost.downvotedBy?.includes(user.uid)
                    ? 'bg-red-100 text-red-600'
                    : 'bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-600'
                }`}
              >
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.105-1.79l-.05-.025A4 4 0 0011.055 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" />
                </svg>
              </button>
            </div>

            {/* Post Content */}
            <div className="flex-1">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-2 flex-wrap">
                  <span className="text-3xl">{getPostTypeIcon(selectedPost.type)}</span>
                  <span className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-semibold">
                    {selectedPost.category}
                  </span>
                  {selectedPost.isAnswered && (
                    <span className="text-sm bg-green-100 text-green-700 px-3 py-1 rounded-full font-semibold flex items-center">
                      ✓ Answered
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleFlag(selectedPost.id, 'post')}
                  className="text-gray-400 hover:text-red-600 text-sm"
                  title="Flag inappropriate content"
                >
                  🚩 Flag
                </button>
              </div>

              {/* Title */}
              <h1 className="text-3xl font-bold text-gray-800 mb-4">
                {selectedPost.title}
              </h1>

              {/* Content */}
              <div className="prose max-w-none mb-6">
                <p className="text-gray-700 whitespace-pre-wrap">{selectedPost.content}</p>
              </div>

              {/* Tags */}
              {selectedPost.tags && selectedPost.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6">
                  {selectedPost.tags.map((tag, idx) => (
                    <span key={idx} className="text-sm bg-gray-100 text-gray-600 px-3 py-1 rounded-full">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Author Info */}
              <div className="flex items-center justify-between pt-6 border-t border-gray-200">
                <button
  onClick={() => handleViewProfile(selectedPost.authorId, selectedPost.authorName)}
  className="flex items-center space-x-3 hover:bg-gray-50 p-2 rounded-lg transition"
>
  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
    <span className="text-lg">👤</span>
  </div>
  <div className="text-left">
    <div className="font-semibold text-green-600 hover:text-green-700">
      {selectedPost.authorName}
    </div>
    <div className="text-sm text-gray-500">
      {selectedPost.authorCountry} • {selectedPost.authorEducationalSystem}
    </div>
  </div>
</button>
                
                <div className="text-sm text-gray-500 text-right">
                  <div>Posted {formatTimestamp(selectedPost.createdAt)}</div>
                  <div>{selectedPost.views || 0} views</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Replies Section */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h3 className="text-2xl font-bold text-gray-800 mb-6">
            {postReplies.length} {postReplies.length === 1 ? 'Reply' : 'Replies'}
          </h3>

          {/* Reply Form */}
          <form onSubmit={handleReply} className="mb-8">
            <textarea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="Share your answer or thoughts..."
              rows="4"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none mb-3"
            />
            <button
              type="submit"
              disabled={communityLoading}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-semibold transition disabled:opacity-50"
            >
              {communityLoading ? '⏳ Posting...' : '💬 Post Reply'}
            </button>
          </form>

          {/* Replies List */}
          <div className="space-y-6">
            {postReplies.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-2">💭</div>
                <p>No replies yet. Be the first to respond!</p>
              </div>
            ) : (
              postReplies.map(reply => (
                <div
                  key={reply.id}
                  className={`border rounded-lg p-6 ${
                    reply.isBestAnswer
                      ? 'border-2 border-green-500 bg-green-50'
                      : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start space-x-4">
                    {/* Vote Section */}
                    <div className="flex flex-col items-center space-y-1">
                      <button
                        onClick={() => handleVoteReply(reply.id)}
                        className={`p-1 rounded ${
                          reply.upvotedBy?.includes(user.uid)
                            ? 'text-green-600'
                            : 'text-gray-400 hover:text-green-600'
                        }`}
                      >
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                        </svg>
                      </button>
                      <span className="font-bold text-lg text-gray-700">{reply.upvotes || 0}</span>
                    </div>

                    {/* Reply Content */}
                    <div className="flex-1">
                      {/* Best Answer Badge */}
                      {reply.isBestAnswer && (
                        <div className="mb-3 flex items-center space-x-2">
                          <span className="bg-green-600 text-white text-sm px-3 py-1 rounded-full font-semibold">
                            ✓ Best Answer
                          </span>
                        </div>
                      )}

                      {/* Reply Text */}
                      <p className="text-gray-700 mb-4 whitespace-pre-wrap">{reply.content}</p>

                      {/* Reply Footer */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3 text-sm text-gray-500">
  <button
    onClick={() => handleViewProfile(reply.authorId, reply.authorName)}
    className="font-medium text-green-600 hover:text-green-700 hover:underline"
  >
    {reply.authorName}
  </button>
  <span>•</span>
  <span>{formatTimestamp(reply.createdAt)}</span>
</div>

                        <div className="flex items-center space-x-3">
                          {/* Mark as Best Answer (only for question author) */}
                          {selectedPost.type === 'question' &&
                            selectedPost.authorId === user.uid &&
                            !selectedPost.isAnswered &&
                            !reply.isBestAnswer && (
                            <button
                              onClick={() => handleMarkBestAnswer(reply.id)}
                              className="text-sm text-green-600 hover:text-green-700 font-medium"
                            >
                              ✓ Mark as Best Answer
                            </button>
                          )}

                          {/* Flag Button */}
                          <button
                            onClick={() => handleFlag(reply.id, 'reply')}
                            className="text-sm text-gray-400 hover:text-red-600"
                            title="Flag inappropriate content"
                          >
                            🚩
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    )}

    {/* LEADERBOARD VIEW */}
    {communityView === 'leaderboard' && (
      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-3xl font-bold text-gray-800 flex items-center">
              <span className="text-4xl mr-3">🏆</span>
              Community Leaderboard
            </h2>
            <p className="text-gray-600 mt-1">Top contributors this period</p>
          </div>
          <button
            onClick={() => setCommunityView('feed')}
            className="text-gray-600 hover:text-gray-800 font-medium"
          >
            ← Back to Feed
          </button>
        </div>

        {/* Your Ranking */}
        {userCommunityStats && (
          <div className="mb-8 bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-xl border-2 border-blue-200">
            <h3 className="font-bold text-lg text-gray-800 mb-4">Your Stats</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-gray-600">Reputation</div>
                <div className="text-2xl font-bold text-blue-700">{userCommunityStats.reputationPoints || 0}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Posts</div>
                <div className="text-2xl font-bold text-purple-700">{userCommunityStats.postsCreated || 0}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Replies</div>
                <div className="text-2xl font-bold text-green-700">{userCommunityStats.repliesGiven || 0}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Helpful</div>
                <div className="text-2xl font-bold text-yellow-700">{userCommunityStats.helpfulReplies || 0}</div>
              </div>
            </div>

            {/* Badges */}
            {userCommunityStats.badges && userCommunityStats.badges.length > 0 && (
              <div className="mt-4">
                <div className="text-sm text-gray-600 mb-2">Your Badges:</div>
                <div className="flex flex-wrap gap-2">
                  {userCommunityStats.badges.map(badgeId => {
                    const badge = BADGES[badgeId];
                    return badge ? (
                      <span key={badgeId} className="bg-white px-3 py-1 rounded-full text-sm font-medium border-2 border-yellow-300">
                        {badge.icon} {badge.name}
                      </span>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Top Contributors */}
        <div className="space-y-4">
          {leaderboard.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <div className="text-4xl mb-2">📊</div>
              <p>No leaderboard data yet</p>
            </div>
          ) : (
            leaderboard.map((leader, index) => (
              <div
                key={`${leader.userId}-${index}`}
                className={`flex items-center space-x-4 p-5 rounded-xl border-2 transition ${
                  index === 0
                    ? 'border-yellow-400 bg-gradient-to-r from-yellow-50 to-orange-50'
                    : index === 1
                    ? 'border-gray-300 bg-gradient-to-r from-gray-50 to-gray-100'
                    : index === 2
                    ? 'border-orange-300 bg-gradient-to-r from-orange-50 to-yellow-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                {/* Rank */}
                <div className="flex-shrink-0">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl ${
                      index === 0
                        ? 'bg-yellow-500 text-white'
                        : index === 1
                        ? 'bg-gray-400 text-white'
                        : index === 2
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                  </div>
                </div>

                {/* User Info */}
                <div className="flex-1">
                  <div className="font-bold text-gray-800">
                    {leader.userId === user.uid ? 'You' : `User ${leader.userId.slice(0, 8)}`}
                  </div>
                  <div className="text-sm text-gray-600">
                    {leader.postsCreated || 0} posts • {leader.repliesGiven || 0} replies • {leader.helpfulReplies || 0} helpful
                  </div>
                </div>

                {/* Reputation Points */}
                <div className="text-right">
                  <div className="text-2xl font-bold text-yellow-600">{leader.reputationPoints || 0}</div>
                  <div className="text-xs text-gray-500">reputation</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    )}
    {/* PROFILE MODAL */}
{profileModalOpen && viewingProfile && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      {/* Modal Header */}
      <div className="sticky top-0 bg-gradient-to-r from-green-600 to-emerald-600 text-white p-6 rounded-t-xl">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold mb-1">{viewingProfile.userName}'s Profile</h2>
            <p className="text-green-100 text-sm">
              {viewingProfile.country || 'Unknown Country'} • {viewingProfile.educationalSystem || 'Unknown System'}
            </p>
          </div>
          <button
            onClick={() => {
              setProfileModalOpen(false);
              setViewingProfile(null);
            }}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Modal Content */}
      <div className="p-6 space-y-6">
        {/* Community Stats */}
        <div>
          <h3 className="text-lg font-bold text-gray-800 mb-3">Community Contributions</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 text-center">
              <div className="text-2xl font-bold text-blue-700">
                {viewingProfile.communityStats?.postsCreated || 0}
              </div>
              <div className="text-xs text-blue-600 mt-1">Posts</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200 text-center">
              <div className="text-2xl font-bold text-purple-700">
                {viewingProfile.communityStats?.repliesGiven || 0}
              </div>
              <div className="text-xs text-purple-600 mt-1">Replies</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg border border-green-200 text-center">
              <div className="text-2xl font-bold text-green-700">
                {viewingProfile.communityStats?.helpfulReplies || 0}
              </div>
              <div className="text-xs text-green-600 mt-1">Helpful</div>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 text-center">
              <div className="text-2xl font-bold text-yellow-700">
                {viewingProfile.communityStats?.reputationPoints || 0}
              </div>
              <div className="text-xs text-yellow-600 mt-1">Reputation</div>
            </div>
          </div>
        </div>

        {/* Badges */}
        {viewingProfile.communityStats?.badges && viewingProfile.communityStats.badges.length > 0 && (
          <div>
            <h3 className="text-lg font-bold text-gray-800 mb-3">Badges Earned</h3>
            <div className="flex flex-wrap gap-2">
              {viewingProfile.communityStats.badges.map(badgeId => {
                const badge = BADGES[badgeId];
                return badge ? (
                  <div key={badgeId} className="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-300 px-4 py-2 rounded-lg">
                    <span className="text-2xl mr-2">{badge.icon}</span>
                    <span className="font-semibold text-gray-800">{badge.name}</span>
                  </div>
                ) : null;
              })}
            </div>
          </div>
        )}

        {/* Academic Info */}
        <div>
          <h3 className="text-lg font-bold text-gray-800 mb-3">Academic Background</h3>
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-3">
            <div>
              <div className="text-sm font-semibold text-gray-600">Country</div>
              <div className="text-gray-800">{viewingProfile.country || 'Not specified'}</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-600">Educational System</div>
              <div className="text-gray-800">{viewingProfile.educationalSystem || 'Not specified'}</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-600">Strengths</div>
              <div className="text-gray-800">{viewingProfile.strengths || 'Not specified'}</div>
            </div>
          </div>
        </div>

        {/* Member Since */}
        {viewingProfile.createdAt && (
          <div className="text-center text-sm text-gray-500 pt-4 border-t border-gray-200">
            Member since {new Date(viewingProfile.createdAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </div>
        )}
      </div>
    </div>
  </div>
)}
 </div>
)}
{/* Offline Content - NOW FUNCTIONAL */}
{/* Offline Content - ENHANCED */}
{activeTab === 'content' && (
  <div className="max-w-4xl mx-auto">
    <div className="bg-white rounded-xl shadow-lg p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold text-gray-800 flex items-center">
          <span className="text-4xl mr-3">📚</span>
          Offline Content
        </h2>
        <div className="flex items-center space-x-3">
          <div className={`px-4 py-2 rounded-lg ${isOnline ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
            {isOnline ? '🌐 Online' : '📴 Offline Mode'}
          </div>
          {/* Debug button to check cached data */}
          <button
            onClick={async () => {
              const data = await loadAllOfflineData(user.uid);
              console.log('📦 Cached data:', data);
              alert(`Cached: ${data.tasks.length} tasks, ${Object.keys(data.skills).length} skills, ${data.learningPaths.length} learning paths, ${data.chatMessages.length} chats`);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition text-sm"
          >
            🔍 Check Cache
          </button>
        </div>
      </div>

      {/* Storage Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <div className="text-sm font-semibold text-blue-600 mb-1">Tasks</div>
          <div className="text-2xl font-bold text-blue-800">{tasks.length}</div>
          <div className="text-xs text-blue-600 mt-1">With answers</div>
        </div>

        <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
          <div className="text-sm font-semibold text-purple-600 mb-1">Skills</div>
          <div className="text-2xl font-bold text-purple-800">
            {(() => {
              let count = 0;
              if (skills.academic) count += Object.keys(skills.academic).length;
              if (skills.technology) count += Object.keys(skills.technology).length;
              return count;
            })()}
          </div>
          <div className="text-xs text-purple-600 mt-1">Tracked</div>
        </div>

        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <div className="text-sm font-semibold text-green-600 mb-1">Learning Plans</div>
          <div className="text-2xl font-bold text-green-800">
            {Object.keys(learningContent).length}
          </div>
          <div className="text-xs text-green-600 mt-1">Generated</div>
        </div>

        <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
          <div className="text-sm font-semibold text-orange-600 mb-1">Chat History</div>
          <div className="text-2xl font-bold text-orange-800">{chatMessages.length}</div>
          <div className="text-xs text-orange-600 mt-1">Messages</div>
        </div>
      </div>

      {/* Sync Status */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-xl border border-blue-200 mb-8">
        <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
          <span className="mr-2">🔄</span>
          Sync Status
        </h3>
        
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-700 font-medium">Connection:</span>
            <span className={`font-semibold ${isOnline ? 'text-green-600' : 'text-gray-600'}`}>
              {isOnline ? '✅ Connected' : '📴 Offline'}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-700 font-medium">Pending Changes:</span>
            <span className={`font-semibold ${syncStatus.hasPendingOperations ? 'text-yellow-600' : 'text-green-600'}`}>
              {syncStatus.pendingCount > 0 ? `${syncStatus.pendingCount} pending` : '✅ All synced'}
            </span>
          </div>
        </div>
      </div>

      {/* Detailed Offline Content */}
      <div className="space-y-6">
        <h3 className="text-xl font-bold text-gray-800 flex items-center">
          <span className="mr-2">💾</span>
          Available Offline
        </h3>

        {/* 1. Tasks with Answers */}
        <details open className="bg-gray-50 p-6 rounded-lg border border-gray-200">
          <summary className="font-semibold text-gray-800 mb-3 flex items-center cursor-pointer">
            <span className="mr-2">📝</span>
            Tasks & Answers ({tasks.length})
          </summary>
          {tasks.length > 0 ? (
            <div className="mt-4 space-y-3">
              {tasks.map((task, idx) => (
                <div key={idx} className="bg-white p-4 rounded border border-gray-200">
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-medium text-gray-800">{task.title}</div>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                      {task.difficulty}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{task.description}</p>
                  {task.answer && (
                    <details className="mt-2 bg-blue-50 border border-blue-200 rounded p-2">
                      <summary className="text-sm font-semibold text-blue-700 cursor-pointer">
                        View Answer
                      </summary>
                      <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
                        {task.answer}
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600 text-sm mt-2">No tasks cached. Generate tasks while online.</p>
          )}
        </details>
        {/* 2. Learning Plans (Academic + Tech) - FULL CONTENT */}
<details open className="bg-gray-50 p-6 rounded-lg border border-gray-200">
  <summary className="font-semibold text-gray-800 mb-3 flex items-center cursor-pointer">
    <span className="mr-2">🎯</span>
    Learning Plans ({Object.keys(learningContent).length})
  </summary>
  {Object.keys(learningContent).length > 0 ? (
    <div className="mt-4 space-y-6">
      {Object.entries(learningContent).map(([skillName, content]) => (
        <details key={skillName} className="bg-white rounded-lg border-2 border-blue-200">
          <summary className="font-bold text-gray-800 p-4 cursor-pointer hover:bg-blue-50 rounded-t-lg flex items-center justify-between">
            <span>📚 {skillName}</span>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
              Click to expand
            </span>
          </summary>
          
          <div className="p-4 bg-blue-50 space-y-4">
            {/* Learning Steps */}
            {content.learningSteps && content.learningSteps.length > 0 && (
              <div>
                <h5 className="font-semibold text-gray-700 mb-2 flex items-center">
                  📋 Learning Steps ({content.learningSteps.length})
                </h5>
                <div className="space-y-2">
                  {content.learningSteps.map((step, idx) => (
                    <details key={idx} className="bg-white p-3 rounded border border-blue-200">
                      <summary className="cursor-pointer font-medium text-gray-800">
                        <span className="text-blue-600 font-bold">{step.step}.</span> {step.title}
                      </summary>
                      <div className="mt-2 pl-6 space-y-2">
                        <p className="text-sm text-gray-700">{step.description}</p>
                        {step.resources && (
                          <div className="text-xs bg-gray-50 p-2 rounded">
                            <strong>🔧 Tools:</strong> {step.resources}
                          </div>
                        )}
                        <div className="flex items-center text-xs text-gray-500 space-x-3">
                          <span>⏱️ {step.estimatedDays} days</span>
                          {step.offline && <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded">📴 Offline OK</span>}
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}

            {/* Practice Exercises */}
            {content.practiceExercises && content.practiceExercises.length > 0 && (
              <div>
                <h5 className="font-semibold text-gray-700 mb-2 flex items-center">
                  💪 Practice Exercises ({content.practiceExercises.length})
                </h5>
                <div className="space-y-2">
                  {content.practiceExercises.map((ex, idx) => (
                    <div key={idx} className="bg-white p-3 rounded border border-purple-200">
                      <div className="font-semibold text-gray-800">{ex.title}</div>
                      <p className="text-sm text-gray-600 mt-1">{ex.description}</p>
                      <div className="flex items-center mt-2 text-xs text-gray-500 space-x-2">
                        <span className={`px-2 py-0.5 rounded ${
                          ex.difficulty === 'Easy' ? 'bg-green-100 text-green-700' :
                          ex.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>{ex.difficulty}</span>
                        <span>⏱️ {ex.estimatedTime}</span>
                        {ex.toolsNeeded && <span>🔧 {ex.toolsNeeded}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Tips */}
            {content.quickTips && content.quickTips.length > 0 && (
              <div>
                <h5 className="font-semibold text-gray-700 mb-2">💡 Quick Tips</h5>
                <ul className="space-y-1">
                  {content.quickTips.map((tip, idx) => (
                    <li key={idx} className="text-sm text-gray-700 bg-yellow-50 p-2 rounded border border-yellow-200">
                      • {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Free Resources */}
            {content.freeResources && content.freeResources.length > 0 && (
              <div>
                <h5 className="font-semibold text-gray-700 mb-2">
                  🔗 Free Resources ({content.freeResources.length})
                </h5>
                <div className="space-y-2">
                  {content.freeResources.map((res, idx) => (
                    <div key={idx} className="bg-white p-3 rounded border border-gray-200">
                      <div className="flex items-center justify-between mb-1">
                        <div className="font-semibold text-gray-800">{res.name}</div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">{res.type}</span>
                          {res.offline && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">📴 Offline</span>}
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 mb-1">{res.description}</p>
                      {res.url && res.url !== 'Available offline' && (
                        <a 
                          href={res.url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-xs text-blue-600 hover:underline inline-block"
                        >
                          🔗 Open Resource
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Career Opportunities (for tech skills) */}
            {content.careerOpportunities && content.careerOpportunities.length > 0 && (
              <div className="bg-gradient-to-r from-yellow-50 to-orange-50 p-4 rounded-lg border border-yellow-200">
                <h5 className="font-semibold text-gray-700 mb-2 flex items-center">
                  <span className="mr-2">💼</span>
                  Career Opportunities
                </h5>
                <ul className="space-y-1">
                  {content.careerOpportunities.map((opp, idx) => (
                    <li key={idx} className="text-sm text-gray-700">
                      ✅ {opp}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Milestones */}
            {content.milestones && content.milestones.length > 0 && (
              <div>
                <h5 className="font-semibold text-gray-700 mb-2">🏆 Learning Milestones</h5>
                <div className="grid grid-cols-2 gap-2">
                  {content.milestones.map((milestone, idx) => (
                    <div key={idx} className="bg-green-50 p-2 rounded border border-green-200">
                      <div className="text-xs font-bold text-green-700">{milestone.progress}% Complete</div>
                      <div className="text-xs text-gray-600 mt-1">{milestone.achievement}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Offline Note */}
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
              ℹ️ <strong>Offline Access:</strong> All this content is stored locally and accessible without internet!
            </div>
          </div>
        </details>
      ))}
    </div>
  ) : (
    <p className="text-gray-600 text-sm mt-2">No learning plans cached. Generate learning plans while online.</p>
  )}
</details>
{/* 3. AI Tutor Chat History */}
<details open className="bg-gray-50 p-6 rounded-lg border border-gray-200">
  <summary className="font-semibold text-gray-800 mb-3 flex items-center cursor-pointer">
    <span className="mr-2">💬</span>
    AI Tutor Conversations ({chatMessages.length} messages)
  </summary>
  {chatMessages.length > 1 ? (
    <div className="mt-4 space-y-3">
      {chatMessages.map((msg, idx) => (
        <details 
          key={idx} 
          className={`rounded-lg border-2 ${
            msg.role === 'user' 
              ? 'border-green-200 bg-green-50' 
              : 'border-blue-200 bg-blue-50'
          }`}
        >
          <summary className="cursor-pointer p-3 font-medium text-gray-800 hover:bg-white/50 rounded-t-lg">
            <span className="mr-2">{msg.role === 'user' ? '👤' : '🤖'}</span>
            {msg.role === 'user' ? 'You' : 'AI Tutor'} - {msg.content.substring(0, 80)}...
          </summary>
          <div className={`p-4 border-t-2 ${
            msg.role === 'user' ? 'border-green-200' : 'border-blue-200'
          }`}>
            <div className="text-sm text-gray-700 whitespace-pre-wrap bg-white p-3 rounded border border-gray-200">
              {msg.content}
            </div>
          </div>
        </details>
      ))}
      {chatMessages.length > 20 && (
        <p className="text-xs text-center text-gray-500 pt-2">
          Showing all {chatMessages.length} messages
        </p>
      )}
    </div>
  ) : (
    <p className="text-gray-600 text-sm mt-2">No chat history yet. Start chatting with your AI tutor!</p>
  )}
</details>
        

        {/* 4. Skills Data */}
        <details className="bg-gray-50 p-6 rounded-lg border border-gray-200">
  <summary className="font-semibold text-gray-800 mb-3 flex items-center justify-between cursor-pointer hover:text-green-600 transition">
    <div className="flex items-center">
      <span className="mr-2">📈</span>
      Skills Assessment ({(() => {
        let count = 0;
        if (skills.academic) count += Object.keys(skills.academic).length;
        if (skills.technology) count += Object.keys(skills.technology).length;
        return count;
      })()})
    </div>
    <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-medium">
      Click to expand
    </span>
  </summary>
  <div className="mt-4 space-y-4">
    {/* Academic Skills */}
    {skills.academic && Object.keys(skills.academic).length > 0 && (
      <details open className="bg-white rounded-lg border-2 border-blue-200 p-4">
        <summary className="cursor-pointer font-semibold text-blue-700 mb-3 hover:text-blue-800 flex items-center justify-between">
          <span>📚 Academic Skills ({Object.keys(skills.academic).length})</span>
          <span className="text-xs bg-blue-50 px-2 py-1 rounded">Expand/Collapse</span>
        </summary>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
          {Object.entries(skills.academic).map(([skill, score]) => (
            <div key={skill} className="bg-blue-50 p-3 rounded-lg border border-blue-200 hover:shadow-md transition">
              <div className="text-sm font-medium text-gray-800 mb-1">{skill}</div>
              <div className="flex items-center justify-between">
                <div className="text-lg font-bold text-blue-600">{score}%</div>
                <div className="h-2 flex-1 bg-gray-200 rounded-full overflow-hidden ml-2">
                  <div 
                    style={{ width: `${score}%` }}
                    className={`h-2 rounded-full transition-all ${
                      score >= 80 ? 'bg-green-500' : 
                      score >= 60 ? 'bg-blue-500' : 
                      score >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                  ></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </details>
    )}
    
    {/* Technology Skills */}
    {skills.technology && Object.keys(skills.technology).length > 0 && (
      <details open className="bg-white rounded-lg border-2 border-green-200 p-4">
        <summary className="cursor-pointer font-semibold text-green-700 mb-3 hover:text-green-800 flex items-center justify-between">
          <span>💻 Technology Skills ({Object.keys(skills.technology).length})</span>
          <span className="text-xs bg-green-50 px-2 py-1 rounded">Expand/Collapse</span>
        </summary>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
          {Object.entries(skills.technology).map(([skill, score]) => (
            <div key={skill} className="bg-green-50 p-3 rounded-lg border border-green-200 hover:shadow-md transition">
              <div className="text-sm font-medium text-gray-800 mb-1 flex items-center">
                <span className="mr-1">{getTechSkillIcon(skill)}</span>
                <span>{skill}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-lg font-bold text-green-600">{score}%</div>
                <div className="h-2 flex-1 bg-gray-200 rounded-full overflow-hidden ml-2">
                  <div 
                    style={{ width: `${score}%` }}
                    className={`h-2 rounded-full transition-all ${
                      score >= 80 ? 'bg-emerald-500' : 
                      score >= 60 ? 'bg-green-500' : 
                      score >= 40 ? 'bg-yellow-500' : 'bg-orange-500'
                    }`}
                  ></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </details>
    )}
    
    {(!skills.academic && !skills.technology) && (
      <p className="text-gray-600 text-sm">No skills data cached. Analyze skills while online.</p>
    )}

    {/* Skills Summary */}
    {(skills.academic || skills.technology) && (
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-lg border border-purple-200 mt-4">
        <h4 className="font-semibold text-gray-800 mb-2">📊 Skills Summary</h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-white p-2 rounded">
            <span className="text-gray-600">Academic Average:</span>
            <span className="font-bold text-blue-700 ml-2">
              {skills.academic ? Math.round(Object.values(skills.academic).reduce((a,b) => a+b, 0) / Object.values(skills.academic).length) : 0}%
            </span>
          </div>
          <div className="bg-white p-2 rounded">
            <span className="text-gray-600">Tech Average:</span>
            <span className="font-bold text-green-700 ml-2">
              {skills.technology ? Math.round(Object.values(skills.technology).reduce((a,b) => a+b, 0) / Object.values(skills.technology).length) : 0}%
            </span>
          </div>
        </div>
      </div>
    )}
  </div>
</details>
        {/* 5. Profile Data */}
        <details className="bg-gray-50 p-6 rounded-lg border border-gray-200">
  <summary className="font-semibold text-gray-800 mb-3 flex items-center justify-between cursor-pointer hover:text-green-600 transition">
    <div className="flex items-center">
      <span className="mr-2">👤</span>
      Profile Information
    </div>
    <span className="text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded-full font-medium">
      Click to expand
    </span>
  </summary>
  <div className="mt-4 space-y-4">
    {/* Basic Info */}
    <details open className="bg-white rounded-lg border-2 border-gray-200 p-4">
      <summary className="cursor-pointer font-semibold text-gray-700 mb-3 hover:text-gray-800 flex items-center justify-between">
        <span>📋 Basic Information</span>
        <span className="text-xs bg-gray-50 px-2 py-1 rounded">Expand/Collapse</span>
      </summary>
      <div className="space-y-3 mt-3">
        <div className="flex items-center p-2 bg-gray-50 rounded border border-gray-200">
          <span className="text-xs font-semibold text-gray-600 w-32">Name:</span>
          <span className="text-sm text-gray-800 font-medium">{studentProfile?.name || 'N/A'}</span>
        </div>
        <div className="flex items-center p-2 bg-gray-50 rounded border border-gray-200">
          <span className="text-xs font-semibold text-gray-600 w-32">Email:</span>
          <span className="text-sm text-gray-800">{user?.email || 'N/A'}</span>
        </div>
        <div className="flex items-center p-2 bg-gray-50 rounded border border-gray-200">
          <span className="text-xs font-semibold text-gray-600 w-32">Country:</span>
          <span className="text-sm text-gray-800 flex items-center">
            <span className="mr-2">🌍</span>
            {studentProfile?.country || 'N/A'}
          </span>
        </div>
        <div className="flex items-center p-2 bg-gray-50 rounded border border-gray-200">
          <span className="text-xs font-semibold text-gray-600 w-32">System:</span>
          <span className="text-sm text-gray-800 flex items-center">
            <span className="mr-2">🎓</span>
            {studentProfile?.educationalSystem || 'N/A'}
          </span>
        </div>
      </div>
    </details>

    {/* Academic Profile */}
    <details open className="bg-white rounded-lg border-2 border-green-200 p-4">
      <summary className="cursor-pointer font-semibold text-green-700 mb-3 hover:text-green-800 flex items-center justify-between">
        <span>💪 Strengths & Areas for Growth</span>
        <span className="text-xs bg-green-50 px-2 py-1 rounded">Expand/Collapse</span>
      </summary>
      <div className="space-y-3 mt-3">
        <div>
          <div className="text-xs font-semibold text-gray-600 mb-2 flex items-center">
            <span className="mr-1">✅</span>
            Strengths:
          </div>
          <div className="text-sm text-gray-800 bg-green-50 p-3 rounded-lg border border-green-200">
            {studentProfile?.strengths || 'Not specified'}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-gray-600 mb-2 flex items-center">
            <span className="mr-1">🎯</span>
            Areas for Improvement:
          </div>
          <div className="text-sm text-gray-800 bg-blue-50 p-3 rounded-lg border border-blue-200">
            {studentProfile?.weaknesses || 'Not specified'}
          </div>
        </div>
      </div>
    </details>

    {/* Account Info */}
    <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg border border-blue-200">
      <h4 className="font-semibold text-gray-800 mb-2 flex items-center">
        <span className="mr-2">📅</span>
        Account Details
      </h4>
      <div className="text-sm text-gray-700">
        <span className="font-medium">Member since:</span>
        <span className="ml-2">
          {studentProfile?.createdAt 
            ? new Date(studentProfile.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })
            : 'Unknown'}
        </span>
      </div>
    </div>
  </div>
</details>

       
      </div>

      {/* Info Box */}
      <div className="mt-8 bg-gradient-to-r from-blue-50 to-green-50 border-2 border-blue-200 p-6 rounded-lg">
        <h4 className="font-semibold text-blue-800 mb-3 flex items-center">
          <span className="mr-2">💡</span>
          Offline Mode Features
        </h4>
        <div className="grid md:grid-cols-2 gap-4">
          <ul className="text-sm text-blue-700 space-y-2">
            <li className="flex items-start">
              <span className="mr-2">✅</span>
              <span><strong>Tasks with Solutions:</strong> All generated tasks include step-by-step answers</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">✅</span>
              <span><strong>Learning Plans:</strong> Complete skill development roadmaps with exercises</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">✅</span>
              <span><strong>Chat History:</strong> Your entire AI tutor conversation saved locally</span>
            </li>
          </ul>
          <ul className="text-sm text-blue-700 space-y-2">
            <li className="flex items-start">
              <span className="mr-2">✅</span>
              <span><strong>Skills Data:</strong> Academic and technology skill assessments</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">✅</span>
              <span><strong>Profile Access:</strong> View your complete profile anytime</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">✅</span>
              <span><strong>Auto-Sync:</strong> Changes sync automatically when you reconnect</span>
            </li>
          </ul>
        </div>
        
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
          <p className="text-sm text-yellow-800">
            <strong>📴 Note:</strong> AI features (generating new tasks, skills analysis, creating learning plans) 
            require an internet connection. However, all previously generated content remains accessible offline.
          </p>
        </div>
      </div>

      {/* Storage Management */}
      <div className="mt-6 bg-gray-50 p-6 rounded-lg border border-gray-200">
        <h4 className="font-semibold text-gray-800 mb-3 flex items-center">
          <span className="mr-2">🗄️</span>
          Storage Management
        </h4>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-700 mb-1">
              Your offline data is stored securely in your browser's local storage.
            </p>
            <p className="text-xs text-gray-500">
              Last updated: {new Date().toLocaleString()}
            </p>
          </div>
          <button
  onClick={async () => {
    const stats = await getCacheStats(user.uid);
    console.log('📦 Cache statistics:', stats);
    
    if (stats) {
      alert(`
📦 Cached Data Summary:

📝 Tasks: ${stats.tasks.count} (${stats.tasks.withAnswers} with answers)
📈 Skills: ${stats.skills.total} (${stats.skills.academic} academic, ${stats.skills.technology} tech)
🎯 Learning Plans: ${stats.learningPaths.count}
💬 Chat Messages: ${stats.chatMessages.count}
🏆 Achievements: ${stats.achievements.count}
👤 Profile: ${stats.profile.cached ? 'Cached' : 'Not cached'}

Last updated: ${new Date(stats.lastUpdated).toLocaleString()}
      `.trim());
    } else {
      alert('Failed to load cache statistics');
    }
  }}
  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition text-sm"
>
  🔍 Check Cache
</button>

          
        </div>
      </div>
    </div>
  </div>
)}
</main>
    </div>
  );
}


























































































// import { useState, useEffect } from 'react';
// import { doc, updateDoc,getDoc, setDoc,serverTimestamp } from 'firebase/firestore';
// import { db } from '../utils/firebase';
// import { getAuth } from 'firebase/auth';


// // Add this import at the top with your other imports
// import { initDB } from '../utils/offlineStorage';
// import { useOnlineStatus } from '../utils/useOnlineStatus';
// import { 
//   saveTasksWithSync, 
//   saveSkillsWithSync, 
//   saveAchievementsWithSync,
//   saveChatMessagesWithSync,
 
//   processSyncQueue,
//   getSyncStatus,
//   forceSyncNow
// } from '../utils/syncManager';
// // ADD THIS with your other imports
// // REPLACE your offlineStorage imports with these
// import { 
//   saveProfile,               // ✅ For profile
//   saveTasksWithAnswers,      // ✅ For tasks
//   saveSkills,                // ✅ For skills
//   saveAchievements,          // ✅ For achievements
//   saveChatMessages,          // ✅ For chat
//   saveLearningPath,          // ✅ For learning paths
//   loadAllCachedData,         // ✅ Load all data
//   getCacheStats,
//   nukeDatabase // ✅ ADD THIS  
//               // ✅ For cache stats
// } from '../utils/offlineStorage';
// import {
//   getUserStats,
//   getLeaderboard,
//   getPosts,
//   createPost,
//   createReply,
//   votePost,
//   voteReply,
//   markBestAnswer,
//   flagContent,
//   getPostWithReplies,
//   searchPosts,
//   incrementViews,
//   getUserProfile,
//   BADGES
// } from '../utils/communityService';
// // ADD THESE IMPORTS after your existing imports
// import SubscriptionModal from '../components/SubscriptionModal';
// import { 
//   canUseFeature, 
//   trackFeatureUsage, 
//   getUserSubscription, 
//   getUsageSummary,
//   upgradeToPremium,
//   FEATURE_TYPES 
// } from '../utils/usageTracking';
// import { SUBSCRIPTION_TIERS } from '../utils/subscriptionLimits';




// // African countries list (unchanged)
// const AFRICAN_COUNTRIES = [
//   'Algeria', 'Angola', 'Benin', 'Botswana', 'Burkina Faso', 'Burundi', 'Cameroon', 'Cape Verde',
//   'Central African Republic', 'Chad', 'Comoros', 'Congo', 'Democratic Republic of the Congo',
//   'Djibouti', 'Egypt', 'Equatorial Guinea', 'Eritrea', 'Eswatini', 'Ethiopia', 'Gabon', 'Gambia',
//   'Ghana', 'Guinea', 'Guinea-Bissau', 'Ivory Coast', 'Kenya', 'Lesotho', 'Liberia', 'Libya',
//   'Madagascar', 'Malawi', 'Mali', 'Mauritania', 'Mauritius', 'Morocco', 'Mozambique', 'Namibia',
//   'Niger', 'Nigeria', 'Rwanda', 'Sao Tome and Principe', 'Senegal', 'Seychelles', 'Sierra Leone',
//   'Somalia', 'South Africa', 'South Sudan', 'Sudan', 'Tanzania', 'Togo', 'Tunisia', 'Uganda',
//   'Zambia', 'Zimbabwe'
// ];

// // African education systems (unchanged)
// const EDUCATIONAL_SYSTEMS = [
//   '8-4-4 System (Kenya)',
//   'CBC - Competency Based Curriculum (Kenya)',
//   'IGCSE - International General Certificate of Secondary Education',
//   'IB - International Baccalaureate',
//   'A-Levels - Advanced Level',
//   'WAEC - West African Examinations Council',
//   'NECO - National Examinations Council (Nigeria)',
//   'Matric - National Senior Certificate (South Africa)',
//   'WASSCE - West African Senior School Certificate Examination',
//   'Baccalauréat (North African French System)',
//   'Thanaweya Amma (Egypt)',
//   'UCE - Uganda Certificate of Education',
//   'UNEB - Uganda National Examinations Board',
//   'ZIMSEC - Zimbabwe School Examinations Council',
//   'Cambridge International',
//   'American Curriculum',
//   'British Curriculum',
//   'French Baccalauréat',
//   'National Curriculum'
// ];
// // ADD THESE: Community constants
// const COMMUNITY_CATEGORIES = [
//   'All',
//   'Mathematics',
//   'Science',
//   'Technology',
//   'Languages',
//   'History',
//   'Career Advice',
//   'Study Tips',
//   'Exam Prep',
//   'Other'
// ];

// const POST_TYPES = [
//   { value: 'all', label: 'All Posts', icon: '📚' },
//   { value: 'question', label: 'Questions', icon: '❓' },
//   { value: 'discussion', label: 'Discussions', icon: '💬' },
//   { value: 'resource', label: 'Resources', icon: '📖' },
//   { value: 'idea', label: 'Ideas', icon: '💡' }
// ];

// export default function StudentDashboard({ user, studentProfile, onLogout }) {
//   const [activeTab, setActiveTab] = useState('overview');
//   const [isEditing, setIsEditing] = useState(false);
//   const [editedProfile, setEditedProfile] = useState({
//     country: studentProfile?.country || '',
//     educationalSystem: studentProfile?.educationalSystem || '',
//     strengths: studentProfile?.strengths || '',
//     weaknesses: studentProfile?.weaknesses || ''
//   });
//   const [updateMessage, setUpdateMessage] = useState('');
//   const [updateError, setUpdateError] = useState('');
//   // ADD THIS: Online/Offline detection
//   const isOnline = useOnlineStatus();
//   // / ADD THESE: Sync management state
// const [syncStatus, setSyncStatus] = useState({ 
//   hasPendingOperations: false, 
//   pendingCount: 0,
//   message: 'All changes synced'
// });
// const [isSyncing, setIsSyncing] = useState(false);
// // ADD THESE: Community state
// const [communityView, setCommunityView] = useState('feed'); // feed, post, create, leaderboard
// const [communityPosts, setCommunityPosts] = useState([]);
// const [selectedPost, setSelectedPost] = useState(null);
// const [postReplies, setPostReplies] = useState([]);
// const [userCommunityStats, setUserCommunityStats] = useState(null);
// const [leaderboard, setLeaderboard] = useState([]);
// const [selectedCategory, setSelectedCategory] = useState('All');
// const [selectedPostType, setSelectedPostType] = useState('all');
// const [sortBy, setSortBy] = useState('recent');
// const [searchTerm, setSearchTerm] = useState('');
// const [newPost, setNewPost] = useState({
//   type: 'question',
//   category: 'Mathematics',
//   title: '',
//   content: '',
//   tags: ''
// });
// const [replyContent, setReplyContent] = useState('');
// const [communityLoading, setCommunityLoading] = useState(false);
// const [communityError, setCommunityError] = useState('');
// const [communitySuccess, setCommunitySuccess] = useState('');
// // ADD THESE: Profile viewing
// const [viewingProfile, setViewingProfile] = useState(null);
// const [profileModalOpen, setProfileModalOpen] = useState(false);
// // ADD THESE STATE VARIABLES after your existing state declarations
// const [subscriptionTier, setSubscriptionTier] = useState(SUBSCRIPTION_TIERS.FREE);
// const [usageSummary, setUsageSummary] = useState(null);
// const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
// const [limitReachedMessage, setLimitReachedMessage] = useState('');

//   // / Add this useEffect to initialize IndexedDB when component mounts
// useEffect(() => {
//   const setupOfflineDB = async () => {
//     try {
//       // await nukeDatabase();
//       await initDB();
//       console.log('✅ IndexedDB initialized successfully');
//     } catch (error) {
//       console.error('❌ IndexedDB initialization failed:', error);
//     }
//   };
  
//   setupOfflineDB();
// }, []); // Empty dependency array = runs once on mount
// // Auto-sync when connection is restored
// useEffect(() => {
//   const handleSync = async () => {
//     if (isOnline && !isSyncing) {
//       console.log('🌐 Connection restored, checking for pending sync...');
      
//       // Check sync status
//       const status = await getSyncStatus();
//       setSyncStatus(status);
      
//       // If there are pending operations, sync them
//       if (status.hasPendingOperations) {
//         setIsSyncing(true);
//         const result = await processSyncQueue(user.uid);
        
//         if (result.success) {
//           console.log(`✅ Auto-sync completed: ${result.processed} items synced`);
//         }
        
//         // Update sync status after sync
//         const newStatus = await getSyncStatus();
//         setSyncStatus(newStatus);
//         setIsSyncing(false);
//       }
//     }
//   };

//   handleSync();
// }, [isOnline, user.uid]); // Run when online status changes
// // Listen for service worker updates
// useEffect(() => {
//   const handleUpdate = (event) => {
//     const shouldUpdate = window.confirm(
//       'A new version is available! Reload to update?'
//     );
    
//     if (shouldUpdate) {
//       window.location.reload();
//     }
//   };

//   window.addEventListener('serviceWorkerUpdate', handleUpdate);

//   return () => {
//     window.removeEventListener('serviceWorkerUpdate', handleUpdate);
//   };
// }, []);
// // ADD THIS: Load community data when tab is active
// useEffect(() => {
//   if (activeTab === 'community') {
//     ensureStatsExist().then(() => {
//       loadUserCommunityStats();
//       loadLeaderboard();
//       if (communityView === 'feed') {
//         loadCommunityPosts();
//       }
//     });
//   }
// }, [activeTab, communityView, selectedCategory, selectedPostType, sortBy]);
// // ADD THIS: Load offline data on mount
// useEffect(() => {
//   const loadCachedData = async () => {
//     if (!isOnline) {
//       console.log('📴 Offline mode - loading cached data...');
      
//       const cachedData = await loadAllCachedData(user.uid);
      
//       if (cachedData.tasks.length > 0) {
//         setTasks(cachedData.tasks);
//         console.log(`✅ Loaded ${cachedData.tasks.length} cached tasks`);
//       }
      
//       if (Object.keys(cachedData.skills).length > 0) {
//         setSkills(cachedData.skills);
//         console.log('✅ Loaded cached skills');
//       }
      
//       if (cachedData.achievements.length > 0) {
//         setAchievements(cachedData.achievements);
//         console.log(`✅ Loaded ${cachedData.achievements.length} cached achievements`);
//       }
      
//       if (cachedData.chatMessages.length > 0) {
//         setChatMessages(cachedData.chatMessages);
//         console.log(`✅ Loaded ${cachedData.chatMessages.length} cached chat messages`);
//       }
      
//       if (cachedData.learningPaths.length > 0) {
//         const pathsObj = {};
//         cachedData.learningPaths.forEach(path => {
//           pathsObj[path.skill] = path.content.content;
//         });
//         setLearningContent(pathsObj);
//         console.log(`✅ Loaded ${cachedData.learningPaths.length} cached learning paths`);
//       }
      
//       console.log('✅ All cached data loaded successfully');
//     }
//   };
  
//   loadCachedData();
// }, [isOnline, user.uid]);
// // ADD THIS: Cache profile on component mount
// useEffect(() => {
//   const cacheInitialProfile = async () => {
//     if (studentProfile) {
//       await saveProfile(user.uid, {
//         name: studentProfile.name,
//         email: user.email,
//         country: studentProfile.country,
//         educationalSystem: studentProfile.educationalSystem,
//         strengths: studentProfile.strengths,
//         weaknesses: studentProfile.weaknesses,
//         createdAt: studentProfile.createdAt
//       });
//       console.log('✅ Initial profile cached');
//     }
//   };
  
//   cacheInitialProfile();
// }, [studentProfile, user]);
// // ADD THIS useEffect after your existing useEffects
// useEffect(() => {
//   const loadSubscription = async () => {
//     const subscription = await getUserSubscription(user.uid);
//     if (subscription) {
//       setSubscriptionTier(subscription.tier);
//     }
    
//     const summary = await getUsageSummary(user.uid);
//     setUsageSummary(summary);
//   };
  
//   loadSubscription();
  
//   // Refresh every 5 minutes
//   const interval = setInterval(loadSubscription, 5 * 60 * 1000);
//   return () => clearInterval(interval);
// }, [user.uid]);


//   // --- AI Tutor state (updated to include full student profile) ---
// const [chatMessages, setChatMessages] = useState([
//   {
//     role: 'assistant',
//     content: `Hello ${studentProfile?.name || 'there'}! 👋 
// I'm your personal AI tutor, and I've reviewed your learning profile.

// Here's what I know about you:
// - 🌍 Country: ${studentProfile?.country || 'N/A'}
// - 🎓 Educational System: ${studentProfile?.educationalSystem || 'N/A'}
// - 💪 Strengths: ${studentProfile?.strengths || 'Not specified'}
// - 🧩 Weaknesses: ${studentProfile?.weaknesses || 'Not specified'}
// - 🗣️ Language Proficiency: ${studentProfile?.languageProficiency || 'Not specified'}

// I'm here to help you strengthen your skills, overcome your challenges, and make learning more enjoyable. 
// How would you like to begin today?`
//   }
// ]);
// const [userMessage, setUserMessage] = useState('');
// const [isTyping, setIsTyping] = useState(false);

//   // // AI Tutor state (unchanged)
//   // const [chatMessages, setChatMessages] = useState([
//   //   { 
//   //     role: 'assistant', 
//   //     content: `Hello ${studentProfile?.name || 'there'}! I'm your personal AI tutor, and I've reviewed your profile. I understand you're studying ${studentProfile?.educationalSystem || 'your curriculum'} in ${studentProfile?.country || 'your country'}. I'm here to help you strengthen your skills and improve in areas where you'd like to grow. How can I assist you today?`
//   //   }
//   // ]);
//   // const [userMessage, setUserMessage] = useState('');
//   // const [isTyping, setIsTyping] = useState(false);

//   // New: Tasks / Skills / Achievements state
//   const [tasks, setTasks] = useState(studentProfile?.tasks || []); // array of { title, description, difficulty }
//   const [skills, setSkills] = useState(studentProfile?.skills || {}); // object { skillName: score }
//   const [achievements, setAchievements] = useState(studentProfile?.achievements || []); // array of { title, description, date }

//   // Loading / error states for AI features
//   const [aiLoadingTasks, setAiLoadingTasks] = useState(false);
//   const [aiErrorTasks, setAiErrorTasks] = useState('');

//   const [aiLoadingSkills, setAiLoadingSkills] = useState(false);
//   const [aiErrorSkills, setAiErrorSkills] = useState('');

//   const [aiLoadingAchievements, setAiLoadingAchievements] = useState(false);
//   const [aiErrorAchievements, setAiErrorAchievements] = useState('');
//   const [activeLearningSkill, setActiveLearningSkill] = useState(null);
//   const [learningContent, setLearningContent] = useState({});
//   const [isLoadingLearning, setIsLoadingLearning] = useState(false);
//   const [learningError, setLearningError] = useState('');
//   const [skillCategory, setSkillCategory] = useState(''); // 'academic' or 'technology'
//   // Progress tracking state
// const [completedTasks, setCompletedTasks] = useState(studentProfile?.completedTasks || []);
// const [activityLog, setActivityLog] = useState(studentProfile?.activityLog || []);
// const [currentStreak, setCurrentStreak] = useState(studentProfile?.currentStreak || 0);
// const [lastActivityDate, setLastActivityDate] = useState(studentProfile?.lastActivityDate || null);
// const [skillRecommendations, setSkillRecommendations] = useState([]);
// const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);

//   // Helper to persist to Firestore safely (saves into 'students' doc, merges)
//   const persistStudentData = async (payload) => {
//     try {
//       const studentRef = doc(db, 'students', user.uid);
//       // use setDoc with merge semantics to avoid overwrite
//       await setDoc(studentRef, payload, { merge: true });
//       // Also update the base users doc for convenience (optional)
//       const usersRef = doc(db, 'users', user.uid);
//       await setDoc(usersRef, { updatedAt: new Date().toISOString() }, { merge: true });
//       return true;
//     } catch (err) {
//       console.error('Persist error:', err);
//       return false;
//     }
//   };

//   // Profile update (unchanged except using setDoc/updateDoc)
//   const handleProfileUpdate = async () => {
//     if (!editedProfile.country || !editedProfile.educationalSystem || !editedProfile.strengths || !editedProfile.weaknesses) {
//       setUpdateError('Please fill in all fields');
//       return;
//     }

//     try {
//       // update users doc and students doc so both reflect latest profile
//       const usersRef = doc(db, 'users', user.uid);
//       const studentRef = doc(db, 'students', user.uid);

//       await setDoc(usersRef, {
//         country: editedProfile.country,
//         educationalSystem: editedProfile.educationalSystem,
//         strengths: editedProfile.strengths,
//         weaknesses: editedProfile.weaknesses
//       }, { merge: true });

//       await setDoc(studentRef, {
//         country: editedProfile.country,
//         educationalSystem: editedProfile.educationalSystem,
//         strengths: editedProfile.strengths,
//         weaknesses: editedProfile.weaknesses
//       }, { merge: true });

//       setUpdateMessage('Profile updated successfully!');
//       setUpdateError('');
//       setIsEditing(false);
//       // ADD THIS: Cache profile offline
//     await saveProfile(user.uid, {
//       name: studentProfile?.name,
//       email: user.email,
//       country: editedProfile.country,
//       educationalSystem: editedProfile.educationalSystem,
//       strengths: editedProfile.strengths,
//       weaknesses: editedProfile.weaknesses
//     });
//     console.log('✅ Profile cached offline');

//     setTimeout(() => setUpdateMessage(''), 3000);


//       // update local state copies
//       // (Note: parent may re-fetch, but we update local copies to be immediate)
//       // setTasks(prev => prev);
//       // setSkills(prev => prev);
//       // setAchievements(prev => prev);

//       // setTimeout(() => setUpdateMessage(''), 3000);
//     } catch (error) {
//       console.error('Profile update error:', error);
//       setUpdateError('Failed to update profile. Please try again.');
//       setUpdateMessage('');
//     }
//   };
// // ADD THIS FUNCTION before your generateTasks function
// const checkFeatureLimit = async (featureType, featureName) => {
//   const check = await canUseFeature(user.uid, featureType);
  
//   if (!check.allowed) {
//     setLimitReachedMessage(
//       `⚠️ ${featureName} limit reached! You've used all your ${check.reason}. Upgrade to Premium for unlimited access.`
//     );
//     setShowSubscriptionModal(true);
//     return false;
//   }
  
//   // Clear any previous messages
//   setLimitReachedMessage('');
//   return true;
// }

//   // 1) Generate tasks based on student strengths/weaknesses
//   const generateTasks = async () => {
//   // Check limit first
//   const canProceed = await checkFeatureLimit(
//     FEATURE_TYPES.TASK_GENERATION, 
//     'Task Generation'
//   );
  
//   if (!canProceed) return;

//   setAiErrorTasks('');
//   setAiLoadingTasks(true);

//   try {
//     // Call backend API
//     const response = await fetch('https://edu-bridge-ai-project-3.onrender.com/api/student/generate-tasks', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ 
//         studentProfile: {
//           name: studentProfile?.name,
//           country: studentProfile?.country,
//           educationalSystem: studentProfile?.educationalSystem,
//           strengths: studentProfile?.strengths,
//           weaknesses: studentProfile?.weaknesses
//         }
//       })
//     });

//     if (!response.ok) {
//       throw new Error('Failed to generate tasks');
//     }

//     const data = await response.json();
//     const text = data.content;

//     // Try to extract JSON
//     const jsonTextMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
//     const jsonText = jsonTextMatch ? jsonTextMatch[0] : text;

//     const parsed = JSON.parse(jsonText);
//     const generatedTasks = Array.isArray(parsed) ? parsed : [];
//     // Track usage AFTER successful generation
//     await trackFeatureUsage(user.uid, FEATURE_TYPES.TASK_GENERATION);
    
//     // Refresh usage summary
//     const summary = await getUsageSummary(user.uid);
//     setUsageSummary(summary);


//     // Save to Firestore
//     const ok = await persistStudentData({ tasks: generatedTasks });
//     if (!ok) throw new Error('Failed to persist tasks to Firestore');

//     setTasks(generatedTasks);
    
//     // Cache tasks offline
//     await saveTasksWithAnswers(user.uid, generatedTasks);
//     console.log('✅ Tasks cached offline');

//   } catch (err) {
//     console.error('generateTasks error:', err);
//     setAiErrorTasks(`Failed to generate tasks: ${err.message || err}`);
//   } finally {
//     setAiLoadingTasks(false);
//   }
// };
// // 2) Analyze and score skills based on profile
// const analyzeSkills = async () => {
//   // Check limit first
//   const canProceed = await checkFeatureLimit(
//     FEATURE_TYPES.SKILLS_ANALYSIS, 
//     'Skills Analysis'
//   );
  
//   if (!canProceed) return;

//   setAiErrorSkills('');
//   setAiLoadingSkills(true);

//   try {
//     // Call backend API
//     const response = await fetch('https://edu-bridge-ai-project-3.onrender.com/api/student/analyze-skills', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ 
//         studentProfile: {
//           name: studentProfile?.name,
//           country: studentProfile?.country,
//           educationalSystem: studentProfile?.educationalSystem,
//           strengths: studentProfile?.strengths,
//           weaknesses: studentProfile?.weaknesses
//         }
//       })
//     });

//     if (!response.ok) {
//       throw new Error('Failed to analyze skills');
//     }

//     const data = await response.json();
//     const text = data.content;

//     const jsonTextMatch = text.match(/\{[\s\S]*\}/);
//     const jsonText = jsonTextMatch ? jsonTextMatch[0] : text;

//     const parsed = JSON.parse(jsonText);
//     // Track usage AFTER successful analysis
//     await trackFeatureUsage(user.uid, FEATURE_TYPES.SKILLS_ANALYSIS);
    
//     // Refresh usage summary
//     const summary = await getUsageSummary(user.uid);
//     setUsageSummary(summary);

//     // Persist to firestore
//     const ok = await persistStudentData({ skills: parsed });
//     if (!ok) throw new Error('Failed to persist skills to Firestore');

//     setSkills(parsed);
    
//     // Cache skills offline
//     await saveSkills(user.uid, parsed);
//     console.log('✅ Skills cached offline');

//   } catch (err) {
//     console.error('analyzeSkills error:', err);
//     setAiErrorSkills(`Failed to analyze skills: ${err.message || err}`);
//   } finally {
//     setAiLoadingSkills(false);
//   }
// };

//   // 3) Generate achievements based on tasks/skills (milestones)
//   const generateAchievements = async () => {
//   // Check limit first
//   const canProceed = await checkFeatureLimit(
//     FEATURE_TYPES.ACHIEVEMENTS,
//      'Achievements'
//   );
  
//   if (!canProceed) return;

//   setAiErrorAchievements('');
//   setAiLoadingAchievements(true);

//   try {
//     // Call backend API
//     const response = await fetch('https://edu-bridge-ai-project-3.onrender.com/api/student/generate-achievements', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ 
//         studentProfile: {
//           name: studentProfile?.name,
//           country: studentProfile?.country,
//           educationalSystem: studentProfile?.educationalSystem,
//           strengths: studentProfile?.strengths,
//           weaknesses: studentProfile?.weaknesses
//         },
//         tasks: tasks || [],
//         skills: skills || {}
//       })
//     });
//     // Track usage AFTER successful generation
//     await trackFeatureUsage(user.uid, FEATURE_TYPES.ACHIEVEMENTS);
    
//     // Refresh usage summary
//     const summary = await getUsageSummary(user.uid);
//     setUsageSummary(summary);
//  if (!response.ok) {
//       throw new Error('Failed to generate achievements');
//     }

//     const data = await response.json();
//     const text = data.content;

//     const jsonTextMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
//     const jsonText = jsonTextMatch ? jsonTextMatch[0] : text;

//     const parsed = JSON.parse(jsonText);
//     const generatedAchievements = Array.isArray(parsed) ? parsed : [];

//     const ok = await persistStudentData({ achievements: generatedAchievements });
//     if (!ok) throw new Error('Failed to persist achievements to Firestore');

//     setAchievements(generatedAchievements);
    
//     // Cache achievements offline
//     await saveAchievements(user.uid, generatedAchievements);
//     console.log('✅ Achievements cached offline');

//   } catch (err) {
//     console.error('generateAchievements error:', err);
//     setAiErrorAchievements(`Failed to generate achievements: ${err.message || err}`);
//   } finally {
//     setAiLoadingAchievements(false);
//   }
// };
// // ADD THIS new function after your generateAchievements function:
// const handleUpgrade = async (paymentDetails) => {
//   const result = await upgradeToPremium(user.uid, paymentDetails);
  
//   if (result.success) {
//     setSubscriptionTier(SUBSCRIPTION_TIERS.PREMIUM);
//     const summary = await getUsageSummary(user.uid);
//     setUsageSummary(summary);
//   } else {
//     throw new Error(result.error);
//   }
// };

//   // Generate personalized learning path for a skill (GUIDE mode)
// const generateSkillLearningPath = async (skillName, currentScore, category) => {
//   // Check limit first
//   const canProceed = await checkFeatureLimit(
//      FEATURE_TYPES.LEARNING_PATHS, 
//     'Learning Paths'
//   );
//   if (!canProceed) return;

//   setLearningError('');
//   setIsLoadingLearning(true);
//   setActiveLearningSkill(skillName);
//   setSkillCategory(category);

//   try {
//     // Call backend API
//     const response = await fetch('https://edu-bridge-ai-project-3.onrender.com/api/student/generate-learning-path', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ 
//         studentProfile: {
//           name: studentProfile?.name,
//           country: studentProfile?.country,
//           educationalSystem: studentProfile?.educationalSystem,
//           strengths: studentProfile?.strengths,
//           weaknesses: studentProfile?.weaknesses
//         },
//         skillName,
//         currentScore,
//         category
//       })
//     });
//     // Track usage AFTER successful generation
//     await trackFeatureUsage(user.uid, FEATURE_TYPES.LEARNING_PATHS);
    
//     // Refresh usage summary
//     const summary = await getUsageSummary(user.uid);
//     setUsageSummary(summary);
//     if (!response.ok) {
//       throw new Error('Failed to generate learning path');
//     }

//     const data = await response.json();
//     const text = data.content;

//     const jsonTextMatch = text.match(/\{[\s\S]*\}/);
//     const jsonText = jsonTextMatch ? jsonTextMatch[0] : text;

//     const parsed = JSON.parse(jsonText);
    
//     // Store in state with skill name as key
//     setLearningContent(prev => ({
//       ...prev,
//       [skillName]: parsed
//     }));
    
//     // Persist learning data
//     await persistStudentData({ 
//       learningPaths: { 
//         [skillName]: {
//           category,
//           startedAt: new Date().toISOString(),
//           currentScore,
//           content: parsed
//         }
//       } 
//     });
    
//     // Cache learning path offline
//     await saveLearningPath(user.uid, skillName, {
//       category,
//       startedAt: new Date().toISOString(),
//       currentScore,
//       content: parsed
//     });
//     console.log(`✅ Learning path for ${skillName} cached offline`);
    
//   } catch (err) {
//     console.error('Learning path generation error:', err);
//     setLearningError(`Failed to generate learning path: ${err.message}`);
//   } finally {
//     setIsLoadingLearning(false);
//   }
// };

// // Start AI tutoring for a skill (TEACHER mode)
// const startSkillTutoring = (skillName, currentScore, category) => {
//   const isTechSkill = category === 'technology';
  
//   // Create a focused tutoring message
//   const tutorMessage = {
//     role: 'assistant',
//     content: `Great! I'll help you improve your ${skillName} skill from ${currentScore}% to mastery. 🎯

// Your Profile:
// - Current Level: ${currentScore}%
// - Country: ${studentProfile?.country}
// - Education: ${studentProfile?.educationalSystem}

// ${isTechSkill ? `
// Since this is a technology skill, I'll focus on:
// ✅ Mobile-friendly learning (you can practice on your phone)
// ✅ Free resources available in ${studentProfile?.country}
// ✅ Practical projects you can build
// ✅ Career opportunities in African tech
// ` : `
// Since this is an academic skill, I'll focus on:
// ✅ ${studentProfile?.educationalSystem} curriculum alignment
// ✅ Local examples from ${studentProfile?.country}
// ✅ Practice exercises you can do offline
// ✅ Exam preparation strategies
// `}

// Let's start! What would you like to know first?
// - What are the basics of ${skillName}?
// - What's the best way to start learning?
// - Can you give me practice exercises?
// - What resources should I use?

// Ask me anything! 🚀`
//   };
  
//   // Add to chat and switch to tutor tab
//   setChatMessages(prev => [...prev, tutorMessage]);
//   setActiveTab('tutor');
  
//   // Optionally scroll to bottom of chat
//   setTimeout(() => {
//     const chatContainer = document.querySelector('.overflow-y-auto');
//     if (chatContainer) {
//       chatContainer.scrollTop = chatContainer.scrollHeight;
//     }
//   }, 100);
// };



//   // AI Tutor chat (unchanged logic but using same getGenerativeModel)
//  const sendMessageToAI = async () => {
//   if (!userMessage.trim()) return;
//   // Check limit first
//   const canProceed = await checkFeatureLimit(
//     FEATURE_TYPES.AI_TUTOR, 
//     'AI Tutor'
//   );
  
//   if (!canProceed) return;
//   const newUserMessage = { role: 'user', content: userMessage };
//   setChatMessages(prev => [...prev, newUserMessage]);
//   setUserMessage('');
//   setIsTyping(true);

//   try {
//     // Call backend API
//     const response = await fetch('https://edu-bridge-ai-project-3.onrender.com/api/student/tutor-chat', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ 
//         studentProfile: {
//           name: studentProfile?.name,
//           country: studentProfile?.country,
//           educationalSystem: studentProfile?.educationalSystem,
//           strengths: studentProfile?.strengths,
//           weaknesses: studentProfile?.weaknesses
//         },
//         userMessage
//       })
//     });

//     if (!response.ok) {
//       throw new Error('Failed to get tutor response');
//     }

//     const data = await response.json();
//     const text = data.content;

//     const updatedMessages = [...chatMessages, newUserMessage, { role: 'assistant', content: text }];
//     setChatMessages(updatedMessages);

//     // Track usage AFTER successful response
//     await trackFeatureUsage(user.uid, FEATURE_TYPES.AI_TUTOR);
//     // Refresh usage summary
//     const summary = await getUsageSummary(user.uid);
//     setUsageSummary(summary);
    
//     // Cache chat messages offline
//     await saveChatMessages(user.uid, updatedMessages);
//     console.log('✅ Chat messages cached offline');

//   } catch (error) {
//     console.error('AI Error:', error);
//     let msg = 'I apologize, but I encountered an error.';
//     msg += ` ${error.message || 'Unknown error.'}`;
//     setChatMessages(prev => [...prev, { role: 'assistant', content: msg }]);
//   } finally {
//     setIsTyping(false);
//   }
// };
// // Add this function after sendMessageToAI
// const handleKeyPress = (e) => {
//   if (e.key === 'Enter' && !e.shiftKey) {
//     e.preventDefault();
//     sendMessageToAI();
//   }
// };


// const getTechSkillRelevance = (skillName) => {
//   const relevance = {
//     'Digital Literacy': 'Essential for all modern jobs',
//     'Mobile Computing': 'High demand in Africa',
//     'Internet Research': 'Critical for self-learning',
//     'Basic Coding': 'Tech career gateway',
//     'Python Programming': 'Most in-demand language',
//     'JavaScript': 'Web development essential',
//     'Data Entry & Spreadsheets': 'Remote work ready',
//     'Excel Skills': 'Business skill essential',
//     'Social Media Management': 'Growing freelance market',
//     'Graphic Design Basics': 'Creative economy skill',
//     'Video Editing': 'Content creation boom',
//     'Web Browsing': 'Information access',
//     'Email & Communication': 'Professional communication',
//     'Cloud Storage': 'Modern workplace essential',
//     'Cybersecurity Basics': 'Digital safety',
//     'Word Processing': 'Office work essential',
//     'Presentation Skills': 'Career advancement',
//     'HTML/CSS': 'Web design foundation',
//     'Database Basics': 'Data management skill'
//   };
//   return relevance[skillName] || 'Valuable digital skill';
// };

// const getFocusArea = (skills) => {
//   if (!skills || (!skills.academic && !skills.technology)) return 'N/A';
  
//   const academicAvg = skills.academic 
//     ? Object.values(skills.academic).reduce((a,b) => a+b, 0) / Object.values(skills.academic).length 
//     : 0;
//   const techAvg = skills.technology 
//     ? Object.values(skills.technology).reduce((a,b) => a+b, 0) / Object.values(skills.technology).length 
//     : 0;
  
//   if (academicAvg < 50 && techAvg < 50) return 'Both Areas';
//   if (academicAvg < techAvg - 10) return 'Academic Skills';
//   if (techAvg < academicAvg - 10) return 'Tech Skills';
//   return 'Balanced';
// };
// // Add this function after getTechSkillRelevance function

// const getTechSkillIcon = (skillName) => {
//   const icons = {
//     'Digital Literacy': '💻',
//     'Mobile Computing': '📱',
//     'Internet Research': '🔍',
//     'Basic Coding': '👨‍💻',
//     'Python Programming': '🐍',
//     'JavaScript': '⚡',
//     'Data Entry & Spreadsheets': '📊',
//     'Excel Skills': '📈',
//     'Social Media Management': '📱',
//     'Graphic Design Basics': '🎨',
//     'Video Editing': '🎬',
//     'Web Browsing': '🌐',
//     'Email & Communication': '📧',
//     'Cloud Storage': '☁️',
//     'Cybersecurity Basics': '🔒',
//     'Word Processing': '📝',
//     'Presentation Skills': '📊',
//     'HTML/CSS': '🌐',
//     'Database Basics': '🗄️',
//     'App Development': '📱',
//     'Web Development': '🌐',
//     'Data Analysis': '📊',
//     'Machine Learning': '🤖',
//     'API Integration': '🔌',
//     'Version Control': '🔀',
//     'Testing & Debugging': '🐛',
//     'UI/UX Design': '🎨'
//   };
//   return icons[skillName] || '💻'; // Default icon
// };
// // Calculate and update learning streak
// const updateStreak = async () => {
//   const today = new Date().toDateString();
  
//   // If no last activity, this is day 1
//   if (!lastActivityDate) {
//     setCurrentStreak(1);
//     setLastActivityDate(today);
//     await persistStudentData({ 
//       currentStreak: 1, 
//       lastActivityDate: today 
//     });
//     return 1;
//   }

//   const lastDate = new Date(lastActivityDate).toDateString();
//   const yesterday = new Date(Date.now() - 86400000).toDateString(); // 24 hours ago

//   // If activity today, don't update
//   if (lastDate === today) {
//     return currentStreak;
//   }

//   // If activity was yesterday, increment streak
//   if (lastDate === yesterday) {
//     const newStreak = currentStreak + 1;
//     setCurrentStreak(newStreak);
//     setLastActivityDate(today);
//     await persistStudentData({ 
//       currentStreak: newStreak, 
//       lastActivityDate: today 
//     });
//     return newStreak;
//   }

//   // If activity gap > 1 day, reset streak
//   setCurrentStreak(1);
//   setLastActivityDate(today);
//   await persistStudentData({ 
//     currentStreak: 1, 
//     lastActivityDate: today 
//   });
//   return 1;
// };
// // Handle task completion
// const handleTaskCompletion = async (taskIndex, taskTitle) => {
//   // Check if task is already completed
//   if (completedTasks.includes(taskIndex)) {
//     // Uncomplete task
//     const newCompletedTasks = completedTasks.filter(idx => idx !== taskIndex);
//     setCompletedTasks(newCompletedTasks);
    
//     // Log activity
//     const activity = {
//       type: 'task_uncompleted',
//       taskIndex,
//       taskTitle,
//       timestamp: new Date().toISOString()
//     };
//     const newActivityLog = [...activityLog, activity];
//     setActivityLog(newActivityLog);
    
//     // Save to Firestore
//     await persistStudentData({ 
//       completedTasks: newCompletedTasks,
//       activityLog: newActivityLog
//     });
    
//     return;
//   }
  
//   // Complete task
//   const newCompletedTasks = [...completedTasks, taskIndex];
//   setCompletedTasks(newCompletedTasks);
  
//   // Log activity
//   const activity = {
//     type: 'task_completed',
//     taskIndex,
//     taskTitle,
//     timestamp: new Date().toISOString()
//   };
//   const newActivityLog = [...activityLog, activity];
//   setActivityLog(newActivityLog);
  
//   // Update streak
//   const newStreak = await updateStreak();
  
//   // Save to Firestore
//   await persistStudentData({ 
//     completedTasks: newCompletedTasks,
//     activityLog: newActivityLog
//   });
  
//   // Check if completed 5 tasks (milestone)
//   if (newCompletedTasks.length > 0 && newCompletedTasks.length % 5 === 0) {
//     console.log(`🎉 Milestone! Completed ${newCompletedTasks.length} tasks!`);
//     // You can trigger achievement unlock here
//   }
  
//   // Check if reached 5-day streak
//   if (newStreak >= 5) {
//     console.log(`🔥 Amazing! ${newStreak}-day learning streak!`);
//     // You can trigger streak achievement here
//   }
// };
// // Generate AI-powered skill recommendations
// const generateSkillRecommendations = async () => {
//   setIsLoadingRecommendations(true);
  
//   try {
//     // Call backend API
//     const response = await fetch('https://edu-bridge-ai-project-3.onrender.com/api/student/skill-recommendations', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ 
//         studentProfile: {
//           name: studentProfile?.name,
//           country: studentProfile?.country,
//           educationalSystem: studentProfile?.educationalSystem,
//           strengths: studentProfile?.strengths,
//           weaknesses: studentProfile?.weaknesses
//         },
//         completedTasksCount: completedTasks.length,
//         currentStreak,
//         skills: skills || {},
//         activityLog: activityLog || []
//       })
//     });

//     if (!response.ok) {
//       throw new Error('Failed to generate recommendations');
//     }

//     const data = await response.json();
//     const text = data.content;

//     const jsonTextMatch = text.match(/\{[\s\S]*\}/);
//     const jsonText = jsonTextMatch ? jsonTextMatch[0] : text;

//     const parsed = JSON.parse(jsonText);
    
//     if (parsed.recommendations && Array.isArray(parsed.recommendations)) {
//       setSkillRecommendations(parsed.recommendations);
      
//       // Save to Firestore
//       await persistStudentData({ 
//         skillRecommendations: parsed.recommendations,
//         lastRecommendationDate: new Date().toISOString()
//       });
//     }
    
//   } catch (err) {
//     console.error('Skill recommendations error:', err);
//     setSkillRecommendations([]);
//   } finally {
//     setIsLoadingRecommendations(false);
//   }
// };
// // ADD THESE: Community functions
// const loadUserCommunityStats = async () => {
//   // Load stats
//   const stats = await getUserStats(user.uid);
//   setUserCommunityStats(stats);
//   console.log('📊 User stats loaded:', stats); // Debug log

// };

// const loadLeaderboard = async () => {
//   const leaders = await getLeaderboard();
//   setLeaderboard(leaders);
// };

// const loadCommunityPosts = async () => {
//   setCommunityLoading(true);
//   setCommunityError('');
  
//   try {
//     const filters = {
//       category: selectedCategory === 'All' ? null : selectedCategory,
//       type: selectedPostType,
//       sortBy,
//       unanswered: sortBy === 'unanswered',
//       limit: 20
//     };
    
//     const fetchedPosts = await getPosts(filters);
//     setCommunityPosts(fetchedPosts);
//   } catch (err) {
//     setCommunityError('Failed to load posts. Please try again.');
//     console.error(err);
//   } finally {
//     setCommunityLoading(false);
//   }
// };

// const handleSearchPosts = async (e) => {
//   e.preventDefault();
//   if (!searchTerm.trim()) {
//     loadCommunityPosts();
//     return;
//   }
  
//   setCommunityLoading(true);
//   const results = await searchPosts(searchTerm);
//   setCommunityPosts(results);
//   setCommunityLoading(false);
// };

// const handleCreatePost = async (e) => {
//   e.preventDefault();
  
//   if (!newPost.title.trim() || !newPost.content.trim()) {
//     setCommunityError('Please fill in all required fields');
//     return;
//   }
  
//   setCommunityLoading(true);
//   setCommunityError('');
  
//   try {
//     const postData = {
//       ...newPost,
//       tags: newPost.tags.split(',').map(tag => tag.trim()).filter(Boolean)
//     };
    
//     const result = await createPost(postData, user.uid, studentProfile?.name || 'Anonymous', studentProfile);
    
//     if (result.success) {
//       setCommunitySuccess('Post created successfully! 🎉');
//       setNewPost({
//         type: 'question',
//         category: 'Mathematics',
//         title: '',
//         content: '',
//         tags: ''
//       });
//       setCommunityView('feed');
//       loadCommunityPosts();
//       loadUserCommunityStats();
      
//       setTimeout(() => setCommunitySuccess(''), 3000);
//     } else {
//       setCommunityError(result.error || 'Failed to create post');
//     }
//   } catch (err) {
//     setCommunityError('Failed to create post. Please try again.');
//     console.error(err);
//   } finally {
//     setCommunityLoading(false);
//   }
// };

// const handleViewPost = async (postId) => {
//   setCommunityLoading(true);
//   setCommunityView('post');
  
//   try {
//     await incrementViews(postId);
//     const data = await getPostWithReplies(postId);
    
//     if (data) {
//       setSelectedPost(data.post);
//       setPostReplies(data.replies);
//     }
//   } catch (err) {
//     setCommunityError('Failed to load post');
//     console.error(err);
//   } finally {
//     setCommunityLoading(false);
//   }
// };

// const handleReply = async (e) => {
//   e.preventDefault();
  
//   if (!replyContent.trim()) {
//     setCommunityError('Please enter a reply');
//     return;
//   }
  
//   setCommunityLoading(true);
//   setCommunityError('');
  
//   try {
//     const replyData = { content: replyContent };
//     const result = await createReply(replyData, selectedPost.id, user.uid, studentProfile?.name || 'Anonymous');
    
//     if (result.success) {
//       setCommunitySuccess('Reply posted! 💬');
//       setReplyContent('');
      
//       const data = await getPostWithReplies(selectedPost.id);
//       if (data) {
//         setSelectedPost(data.post);
//         setPostReplies(data.replies);
//       }
      
//       loadUserCommunityStats();
//       setTimeout(() => setCommunitySuccess(''), 3000);
//     } else {
//       setCommunityError(result.error || 'Failed to post reply');
//     }
//   } catch (err) {
//     setCommunityError('Failed to post reply. Please try again.');
//     console.error(err);
//   } finally {
//     setCommunityLoading(false);
//   }
// };

// const handleVotePost = async (postId, voteType) => {
//   await votePost(postId, user.uid, voteType);
  
//   if (communityView === 'feed') {
//     loadCommunityPosts();
//   } else if (communityView === 'post') {
//     const data = await getPostWithReplies(postId);
//     if (data) {
//       setSelectedPost(data.post);
//       setPostReplies(data.replies);
//     }
//   }
// };

// const handleVoteReply = async (replyId) => {
//   await voteReply(replyId, user.uid);
//   const data = await getPostWithReplies(selectedPost.id);
//   if (data) {
//     setPostReplies(data.replies);
//   }
// };

// const handleMarkBestAnswer = async (replyId) => {
//   const result = await markBestAnswer(selectedPost.id, replyId, selectedPost.authorId, user.uid);
  
//   if (result.success) {
//     setCommunitySuccess('Best answer marked! 🏆');
//     const data = await getPostWithReplies(selectedPost.id);
//     if (data) {
//       setSelectedPost(data.post);
//       setPostReplies(data.replies);
//     }
//     setTimeout(() => setCommunitySuccess(''), 3000);
//   } else {
//     setCommunityError(result.error || 'Failed to mark best answer');
//   }
// };

// const handleFlag = async (contentId, contentType) => {
//   const reason = prompt('Please provide a reason for flagging this content:');
//   if (!reason) return;
  
//   const result = await flagContent(contentId, contentType, user.uid, reason);
//   if (result.success) {
//     setCommunitySuccess('Content flagged for review. Thank you! 🛡️');
//     setTimeout(() => setCommunitySuccess(''), 3000);
//   } else {
//     setCommunityError('Failed to flag content');
//   }
// };

// const formatTimestamp = (timestamp) => {
//   if (!timestamp) return 'Just now';
  
//   const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
//   const now = new Date();
//   const diffMs = now - date;
//   const diffMins = Math.floor(diffMs / 60000);
//   const diffHours = Math.floor(diffMs / 3600000);
//   const diffDays = Math.floor(diffMs / 86400000);
  
//   if (diffMins < 1) return 'Just now';
//   if (diffMins < 60) return `${diffMins}m ago`;
//   if (diffHours < 24) return `${diffHours}h ago`;
//   if (diffDays < 7) return `${diffDays}d ago`;
  
//   return date.toLocaleDateString();
// };

// const getPostTypeIcon = (type) => {
//   const typeObj = POST_TYPES.find(t => t.value === type);
//   return typeObj ? typeObj.icon : '📚';
// };
// // ADD THIS: View user profile
// const handleViewProfile = async (userId, userName) => {
//   setCommunityLoading(true);
  
//   try {
//     const profile = await getUserProfile(userId);
    
//     if (profile) {
//       setViewingProfile({
//         userId,
//         userName: userName || profile.name || 'Anonymous',
//         ...profile
//       });
//       setProfileModalOpen(true);
//     } else {
//       setCommunityError('Failed to load profile');
//     }
//   } catch (err) {
//     setCommunityError('Failed to load profile');
//     console.error(err);
//   } finally {
//     setCommunityLoading(false);
//   }
// };
// // ADD THIS: Force create stats on first visit
// const ensureStatsExist = async () => {
//   try {
//     const statsRef = doc(db, 'userCommunityStats', user.uid);
//     const statsSnap = await getDoc(statsRef);
    
//     if (!statsSnap.exists()) {
//       // Create new stats
//       await setDoc(statsRef, {
//         userId: user.uid,
//         postsCreated: 0,
//         repliesGiven: 0,
//         helpfulReplies: 0,
//         reputationPoints: 0,
//         badges: [],
//         joinedAt: serverTimestamp()
//       });
//       console.log('✅ Stats initialized');
//     }
//   } catch (error) {
//     console.error('Stats init error:', error);
//   }
// };
// const auth = getAuth();
// const currentUser = auth.currentUser;


// // Manual sync trigger
// const handleManualSync = async () => {
//   if (!isOnline) {
//     alert('Cannot sync while offline. Please check your connection.');
//     return;
//   }

//   setIsSyncing(true);
//   const result = await forceSyncNow(user.uid);
  
//   if (result.success) {
//     alert(`Sync complete! ${result.processed} items synced.`);
//   } else {
//     alert('Sync failed. Please try again.');
//   }
  
//   // Update sync status
//   const newStatus = await getSyncStatus();
//   setSyncStatus(newStatus);
//   setIsSyncing(false);
// };

//   // ---------------------------
//   // Render UI (kept existing tabs as-is; added controls for AI features)
//   // ---------------------------
//   return (
//     <div className="min-h-screen bg-gray-50">
//       {/* Header */}
//       <header className="bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-lg">
//         <div className="container mx-auto px-4 py-4">
//           <div className="flex items-center justify-between">
//             <div className="flex items-center space-x-4">
//               <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
//                 <span className="text-2xl">🎓</span>

//  {/* Subscription Modal */}
// <SubscriptionModal
//   isOpen={showSubscriptionModal}
//   onClose={() => {
//     setShowSubscriptionModal(false);
//     setLimitReachedMessage('');
//   }}
//   currentTier={subscriptionTier}
//   usageSummary={usageSummary}
//   userCountry={studentProfile?.country}
//   userId={user.uid}
//   onUpgrade={handleUpgrade}
// />

// {/* Limit Reached Message */}
// {limitReachedMessage && (
//   <div className="fixed bottom-4 right-4 bg-orange-100 border-2 border-orange-400 text-orange-800 px-6 py-4 rounded-lg shadow-lg max-w-md">
//     <div className="flex items-start">
//       <span className="text-2xl mr-3">⚠️</span>
//       <div>
//         <p className="font-semibold mb-1">Limit Reached</p>
//         <p className="text-sm">{limitReachedMessage}</p>
//       </div>
//     </div>
//   </div>
// )}

//               </div>
//               <div>
//                 <h1 className="text-2xl font-bold">Student Dashboard</h1>
//                 <p className="text-green-100 text-sm">{user?.email}</p>
//               </div>
//             </div>
//             <div className="flex items-center space-x-4">
//               {/* ADD THIS: Online/Offline indicator */}
//         <div className={`flex items-center space-x-2 px-3 py-1 rounded-full ${
//           isOnline ? 'bg-green-500/20' : 'bg-red-500/40'
//         }`}>
//           <div className={`w-2 h-2 rounded-full ${
//             isOnline ? 'bg-green-200' : 'bg-red-300'
//           } ${isOnline ? 'animate-pulse' : ''}`}></div>
//           <span className="text-sm font-medium">
//             {isOnline ? 'Online' : 'Offline'}
//           </span>
//         </div>

//          {/* Subscription Status */}
//        <button
//       onClick={() => setShowSubscriptionModal(true)}
//   className={`px-4 py-2 rounded-lg font-medium transition ${
//     subscriptionTier === SUBSCRIPTION_TIERS.PREMIUM
//       ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
//       : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
//   }`}
// >
//   {subscriptionTier === SUBSCRIPTION_TIERS.PREMIUM ? '👑 Premium' : '✨ Upgrade'}
// </button>

//         {/* ADD THIS: Sync status and button */}
//   {syncStatus.hasPendingOperations && (
//     <div className="bg-yellow-500/20 px-3 py-1 rounded-full">
//       <span className="text-sm font-medium text-yellow-100">
//         {syncStatus.message}
//       </span>
//     </div>
//   )}

//   {isOnline && (
//     <button
//       onClick={handleManualSync}
//       disabled={isSyncing}
//       className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition disabled:opacity-50"
//     >
//       {isSyncing ? '🔄 Syncing...' : '🔄 Sync'}
//     </button>
//   )}
//   <button onClick={onLogout} className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition">
//                 Sign Out
//               </button>
//             </div>
//           </div>
//         </div>
//       </header>

//       {/* Navigation Tabs */}
//       <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
//         <div className="container mx-auto px-4">
//           <nav className="flex space-x-1 overflow-x-auto">
//             {[
//               { id: 'overview', label: 'Overview', icon: '📊' },
//               { id: 'profile', label: 'Profile', icon: '👤' },
//               { id: 'tasks', label: 'Tasks', icon: '📝' },
//               { id: 'tutor', label: 'AI Tutor', icon: '🤖' },
//               { id: 'skills', label: 'Skills', icon: '📈' },
//               { id: 'achievements', label: 'Achievements', icon: '🏆' },
//               { id: 'community', label: 'Community', icon: '👥' },
//               { id: 'content', label: 'Offline Content', icon: '📚' }
//             ].map(tab => (
//               <button
//                 key={tab.id}
//                 onClick={() => setActiveTab(tab.id)}
//                 className={`px-4 py-3 font-medium transition whitespace-nowrap ${
//                   activeTab === tab.id 
//                     ? 'border-b-2 border-green-600 text-green-600' 
//                     : 'text-gray-600 hover:text-green-600'
//                 }`}
//               >
//                 <span className="mr-2">{tab.icon}</span>
//                 {tab.label}
//               </button>
//             ))}
//           </nav>
//         </div>
//       </div>

//       {/* Main Content */}
//       <main className="container mx-auto px-4 py-6">
//         {/* Overview (unchanged) */}
//         {activeTab === 'overview' && (
//           <div className="space-y-6">
//             <h2 className="text-3xl font-bold text-gray-800">
//               Welcome back, {studentProfile?.name || 'Student'}!
//             </h2>

//             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
//               <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-500">
//                 <div className="text-sm font-semibold text-gray-600 mb-1">Country</div>
//                 <div className="text-xl font-bold text-gray-800">{studentProfile?.country || 'Not specified'}</div>
//               </div>

//               <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-purple-500">
//                 <div className="text-sm font-semibold text-gray-600 mb-1">Educational System</div>
//                 <div className="text-xl font-bold text-gray-800">{studentProfile?.educationalSystem || 'Not specified'}</div>
//               </div>

//               <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-500">
//                 <div className="text-sm font-semibold text-gray-600 mb-1">Member Since</div>
//                 <div className="text-xl font-bold text-gray-800">
//                   {studentProfile?.createdAt ? new Date(studentProfile.createdAt).toLocaleDateString() : 'Unknown'}
//                 </div>
//               </div>
//             </div>

//             <div className="bg-white p-6 rounded-xl shadow-md">
//               <div className="flex items-center space-x-3 mb-3">
//                 <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
//                 </svg>
//                 <div className="text-sm font-semibold text-gray-600">Email Address</div>
//               </div>
//               <div className="text-lg font-medium text-gray-800 ml-9">{user?.email}</div>
//             </div>

//             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
//               <div className="bg-white p-6 rounded-xl shadow-md">
//                 <h3 className="text-xl font-bold mb-4 flex items-center text-green-700">
//                   <span className="text-2xl mr-2">💪</span>
//                   My Strengths
//                 </h3>
//                 <div className="text-gray-700 bg-green-50 p-4 rounded-lg border border-green-200 min-h-[100px]">
//                   {studentProfile?.strengths || 'Not specified'}
//                 </div>
//               </div>

//               <div className="bg-white p-6 rounded-xl shadow-md">
//                 <h3 className="text-xl font-bold mb-4 flex items-center text-blue-700">
//                   <span className="text-2xl mr-2">🎯</span>
//                   Areas for Improvement
//                 </h3>
//                 <div className="text-gray-700 bg-blue-50 p-4 rounded-lg border border-blue-200 min-h-[100px]">
//                   {studentProfile?.weaknesses || 'Not specified'}
//                 </div>
//               </div>
//             </div>

//             <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-6 rounded-xl shadow-md border border-purple-200">
//               <h3 className="text-xl font-bold mb-4 text-purple-800">Account Information</h3>
//               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//                 <div>
//                   <div className="text-sm font-semibold text-gray-600 mb-1">Account Role</div>
//                   <div className="text-lg font-medium text-gray-800 capitalize">{studentProfile?.role || 'Student'}</div>
//                 </div>
//                 {/* Usage Summary */}
// {usageSummary && usageSummary.tier === 'free' && (
//   <div className="bg-gradient-to-r from-orange-50 to-red-50 p-6 rounded-xl border-2 border-orange-200">
//     <div className="flex items-center justify-between mb-4">
//       <h3 className="text-xl font-bold text-gray-800">Your Usage (Free Tier)</h3>
//       <button
//         onClick={() => setShowSubscriptionModal(true)}
//         className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-2 rounded-lg font-semibold hover:from-purple-700 hover:to-pink-700 transition"
//       >
//         ✨ Upgrade to Premium
//       </button>
//     </div>
    
//     <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
//       {Object.entries(usageSummary.features).map(([key, data]) => (
//         <div key={key} className="bg-white p-3 rounded-lg border border-orange-200">
//           <div className="text-xs font-semibold text-gray-600 mb-1">
//             {key === 'aiTutorQueries' ? '🤖 AI Tutor' :
//              key === 'taskGeneration' ? '📝 Tasks' :
//              key === 'skillsAnalysis' ? '📈 Skills' :
//              key === 'learningPaths' ? '🎯 Paths' :
//              '🏆 Achievements'}
//           </div>
//           <div className="text-lg font-bold text-orange-600 mb-1">
//             {data.used}/{data.limit}
//           </div>
//           <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
//             <div 
//               className={`h-1.5 rounded-full ${
//                 data.remaining === 0 ? 'bg-red-500' :
//                 data.remaining <= data.limit * 0.2 ? 'bg-orange-500' :
//                 'bg-green-500'
//               }`}
//               style={{ width: `${(data.used / data.limit) * 100}%` }}
//             ></div>
//           </div>
//           <div className="text-xs text-gray-500 mt-1 capitalize">{data.period}</div>
//         </div>
//       ))}
//     </div>
//   </div>
// )}<div>
//   <div className="text-sm font-semibold text-gray-600 mb-1">Registration Date</div>
//                   <div className="text-lg font-medium text-gray-800">
//                     {studentProfile?.createdAt ? new Date(studentProfile.createdAt).toLocaleDateString('en-US', {
//                       year: 'numeric',
//                       month: 'long',
//                       day: 'numeric'
//                     }) : 'Unknown'}
//                   </div>
//                   </div>

//               </div>
//             </div>
//           </div>
//           )}

//         {/* Profile (unchanged editing UI) */}
//         {activeTab === 'profile' && (
//           <div className="max-w-3xl mx-auto">
//             <div className="bg-white rounded-xl shadow-lg p-8">
//               <div className="flex justify-between items-center mb-6">
//                 <h2 className="text-3xl font-bold text-gray-800">My Profile</h2>
//                 {!isEditing && (
//                   <button
//                     onClick={() => setIsEditing(true)}
//                     className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition"
//                   >
//                     Edit Profile
//                   </button>
//                 )}
//               </div>

//               {updateMessage && (
//                 <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
//                   {updateMessage}
//                 </div>
//               )}

//               {updateError && (
//                 <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
//                   {updateError}
//                 </div>
//               )}

//               <div className="space-y-6">
//                 <div>
//                   <label className="block text-sm font-semibold text-gray-700 mb-2">Country</label>
//                   {isEditing ? (
//                     <select
//                       value={editedProfile.country}
//                       onChange={(e) => setEditedProfile({...editedProfile, country: e.target.value})}
//                       className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
//                     >
//                       <option value="">Select country</option>
//                       {AFRICAN_COUNTRIES.map(country => (
//                         <option key={country} value={country}>{country}</option>
//                       ))}
//                     </select>
//                   ) : (
//                     <div className="text-lg text-gray-800 bg-gray-50 p-3 rounded-lg">{studentProfile?.country}</div>
//                   )}
//                 </div>

//                 <div>
//                   <label className="block text-sm font-semibold text-gray-700 mb-2">Educational System</label>
//                   {isEditing ? (
//                     <select
//                       value={editedProfile.educationalSystem}
//                       onChange={(e) => setEditedProfile({...editedProfile, educationalSystem: e.target.value})}
//                       className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
//                     >
//                       <option value="">Select educational system</option>
//                       {EDUCATIONAL_SYSTEMS.map(system => (
//                         <option key={system} value={system}>{system}</option>
//                       ))}
//                     </select>
//                   ) : (
//                     <div className="text-lg text-gray-800 bg-gray-50 p-3 rounded-lg">{studentProfile?.educationalSystem}</div>
//                   )}
//                 </div>

//                 <div>
//                   <label className="block text-sm font-semibold text-gray-700 mb-2">My Strengths</label>
//                   {isEditing ? (
//                     <textarea
//                       value={editedProfile.strengths}
//                       onChange={(e) => setEditedProfile({...editedProfile, strengths: e.target.value})}
//                       className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
//                       rows="4"
//                     />
//                   ) : (
//                     <div className="text-lg text-gray-800 bg-green-50 p-4 rounded-lg border border-green-200">{studentProfile?.strengths}</div>
//                   )}
//                 </div>

//                 <div>
//                   <label className="block text-sm font-semibold text-gray-700 mb-2">Areas for Improvement</label>
//                   {isEditing ? (
//                     <textarea
//                       value={editedProfile.weaknesses}
//                       onChange={(e) => setEditedProfile({...editedProfile, weaknesses: e.target.value})}
//                       className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
//                       rows="4"
//                     />
//                   ) : (
//                     <div className="text-lg text-gray-800 bg-blue-50 p-4 rounded-lg border border-blue-200">{studentProfile?.weaknesses}</div>
//                   )}
//                 </div>

//                 {isEditing && (
//                   <div className="flex space-x-4">
//                     <button
//                       onClick={handleProfileUpdate}
//                       className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-semibold transition"
//                     >
//                       Save Changes
//                     </button>
//                     <button
//                       onClick={() => {
//                         setIsEditing(false);
//                         setEditedProfile({
//                           country: studentProfile?.country || '',
//                           educationalSystem: studentProfile?.educationalSystem || '',
//                           strengths: studentProfile?.strengths || '',
//                           weaknesses: studentProfile?.weaknesses || ''
//                         });
//                         setUpdateError('');
//                       }}
//                       className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 py-3 rounded-lg font-semibold transition"
//                     >
//                       Cancel
//                     </button>
//                   </div>
//                 )}
//               </div>
//             </div>
//           </div>
//         )}
//         {/* Tasks Tab - enhanced with completion tracking */}
//     {activeTab === 'tasks' && (
//   <div className="max-w-3xl mx-auto">
//     <div className="bg-white rounded-xl shadow-lg p-8">
//       <div className="flex items-center justify-between mb-6">
//         <h2 className="text-3xl font-bold text-gray-800">Tasks & Assignments</h2>
//         <div className="flex items-center space-x-3">
//           <button
//             onClick={generateTasks}
//             disabled={aiLoadingTasks}
//             className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition disabled:opacity-50"
//           >
//             {aiLoadingTasks ? '⏳ Generating...' : '✨ Generate Tasks (AI)'}
//           </button>
//         </div>
//       </div>

//       {/* Progress Summary */}
//       {tasks.length > 0 && (
//         <div className="mb-6 bg-gradient-to-r from-green-50 to-blue-50 p-4 rounded-lg border border-green-200">
//           <div className="flex items-center justify-between">
//             <div>
//               <div className="text-sm font-semibold text-gray-600">Progress</div>
//               <div className="text-2xl font-bold text-green-700">
//                 {completedTasks.length} / {tasks.length} completed
//               </div>
//             </div>
//             <div className="text-right">
//               <div className="text-sm font-semibold text-gray-600">Current Streak</div>
//               <div className="text-2xl font-bold text-orange-600 flex items-center justify-end">
//                 🔥 {currentStreak} {currentStreak === 1 ? 'day' : 'days'}
//               </div>
//             </div>
//           </div>
          
//           {/* Progress Bar */}
//           <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
//             <div 
//               className="h-2 bg-green-500 rounded-full transition-all duration-500"
//               style={{ width: `${(completedTasks.length / tasks.length) * 100}%` }}
//             ></div>
//           </div>
          
//           {/* Streak Progress */}
//           {currentStreak > 0 && currentStreak < 5 && (
//             <div className="mt-2 text-xs text-gray-600">
//               🎯 {5 - currentStreak} more {5 - currentStreak === 1 ? 'day' : 'days'} to unlock 5-day streak achievement!
//             </div>
//           )}
          
//           {currentStreak >= 5 && (
//             <div className="mt-2 text-xs text-green-700 font-semibold">
//               🏆 Amazing! You've unlocked the 5-day streak achievement!
//             </div>
//           )}
//         </div>
//       )}

//       {aiErrorTasks && (
//         <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
//           {aiErrorTasks}
//         </div>
//       )}

//       {tasks.length === 0 ? (
//         <div className="text-center p-12 text-gray-600">
//           <div className="text-6xl mb-4">📝</div>
//           <p className="text-lg mb-2">No tasks yet</p>
//           <p className="text-sm">Click "Generate Tasks (AI)" to create tailored tasks based on your profile.</p>
//         </div>
//       ) : (
//         <div className="space-y-4">
//           {tasks.map((t, idx) => {
//             const isCompleted = completedTasks.includes(idx);
            
//             return (
//               <div 
//                 key={idx} 
//                 className={`p-4 rounded-lg border transition-all ${
//                   isCompleted 
//                     ? 'bg-green-50 border-green-300' 
//                     : 'bg-gray-50 border-gray-200 hover:border-green-300'
//                 }`}
//               >
//                 <div className="flex items-start space-x-3">
//                   {/* Checkbox */}
//                   <button
//                     onClick={() => handleTaskCompletion(idx, t.title)}
//                     className="flex-shrink-0 mt-1"
//                   >
//                     <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${
//                       isCompleted 
//                         ? 'bg-green-500 border-green-500' 
//                         : 'bg-white border-gray-300 hover:border-green-500'
//                     }`}>
//                       {isCompleted && (
//                         <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
//                         </svg>
//                       )}
//                     </div>
//                   </button>

//                   {/* Task Content */}
//                   <div className="flex-1">
//                     <div className="flex justify-between items-start mb-2">
//                       <h3 className={`text-lg font-semibold ${
//                         isCompleted ? 'text-green-700 line-through' : 'text-gray-800'
//                       }`}>
//                         {t.title || `Task ${idx + 1}`}
//                       </h3>
//                       <div className="flex items-center space-x-2">
//                         <span className={`text-xs px-2 py-1 rounded font-medium ${
//                           t.difficulty === 'Easy' ? 'bg-green-100 text-green-700' :
//                           t.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
//                           'bg-red-100 text-red-700'
//                         }`}>
//                           {t.difficulty || 'Medium'}
//                         </span>
//                       </div>
//                     </div>
                    
//                     <p className={`text-gray-700 ${isCompleted ? 'opacity-60' : ''}`}>
//                       {t.description}
//                     </p>
                    
//                     {t.estimatedMinutes && (
//                       <div className="mt-2 text-sm text-gray-500 flex items-center">
//                         <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
//                         </svg>
//                         Est: {t.estimatedMinutes} minutes
//                       </div>
//                     )}
//                     {/* Answer Section - Toggle to reveal */}
// {t.answer && (
//   <details className="mt-3 bg-blue-50 border border-blue-200 rounded-lg overflow-hidden">
//     <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition">
//       📝 View Answer/Solution
//     </summary>
//     <div className="px-3 py-3 text-sm text-gray-700 border-t border-blue-200 whitespace-pre-wrap">
//       {t.answer}
//     </div>
//   </details>
// )}
// {isCompleted && (
//                       <div className="mt-2 text-xs text-green-600 font-medium flex items-center">
//                         <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
//                           <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
//                         </svg>
//                         Completed! Great work! 🎉
//                       </div>
//                     )}
//                   </div>
//                 </div>
//               </div>
//             );
//           })}
//         </div>
//       )}

//       {/* Completion Celebration */}
//       {tasks.length > 0 && completedTasks.length === tasks.length && (
//         <div className="mt-6 bg-gradient-to-r from-yellow-50 to-orange-50 p-6 rounded-lg border-2 border-yellow-300">
//           <div className="text-center">
//             <div className="text-5xl mb-2">🎉</div>
//             <h3 className="text-2xl font-bold text-orange-700 mb-2">
//               All Tasks Completed!
//             </h3>
//             <p className="text-gray-700 mb-4">
//               Amazing work! You've completed all your tasks. Ready for more?
//             </p>
//             <button
//               onClick={generateTasks}
//               className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded-lg font-semibold transition"
//             >
//               Generate New Tasks
//             </button>
//           </div>
//         </div>
//       )}
//     </div>
//   </div>
// )}
// {/* Tutor Tab (unchanged) */}
//         {activeTab === 'tutor' && (
//           <div className="max-w-4xl mx-auto">
//             <div className="bg-white rounded-xl shadow-lg overflow-hidden h-[600px] flex flex-col">
//               <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-6 text-white">
//                 <h2 className="text-2xl font-bold flex items-center">
//                   <span className="text-3xl mr-3">🤖</span>
//                   Your Personal AI Tutor
//                 </h2>
//                 <p className="text-purple-100 mt-1">Personalized for {studentProfile?.educationalSystem} in {studentProfile?.country}</p>
//               </div>

//               <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
//                 {chatMessages.map((msg, idx) => (
//                   <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
//                     <div className={`max-w-[80%] p-4 rounded-2xl ${
//                       msg.role === 'user' 
//                         ? 'bg-green-600 text-white' 
//                         : 'bg-white text-gray-800 shadow-md'
//                     }`}>
//                       {msg.role === 'assistant' && <div className="text-2xl mb-2">🤖</div>}
//                       <div className="whitespace-pre-wrap">{msg.content}</div>
//                     </div>
//                   </div>
//                 ))}
//                 {isTyping && (
//                   <div className="flex justify-start">
//                     <div className="bg-white p-4 rounded-2xl shadow-md">
//                       <div className="flex space-x-2">
//                         <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
//                         <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
//                         <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
//                       </div>
//                     </div>
//                   </div>
//                 )}
//               </div>

//               <div className="p-4 bg-white border-t">
//                 <div className="flex space-x-2">
//                   <input
//                     type="text"
//                     value={userMessage}
//                     onChange={(e) => setUserMessage(e.target.value)}
//                     onKeyPress={handleKeyPress}
//                     placeholder="Ask your tutor a question..."
//                     className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-purple-500 outline-none"
//                   />
//                   <button
//                     onClick={sendMessageToAI}
//                     disabled={isTyping || !userMessage.trim()}
//                     className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-3 rounded-xl font-semibold hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
//                   >
//                     Send
//                   </button>
//                 </div>
//               </div>
//             </div>
//           </div>
//         )}
//         {/* Skills Tab - enhanced */}
//         {activeTab === 'skills' && (
//       <div className="max-w-4xl mx-auto">
//     <div className="bg-white rounded-xl shadow-lg p-8">
//       <div className="flex items-center justify-between mb-6">
//         <h2 className="text-3xl font-bold text-gray-800">Skills Progress</h2>
//         <div className="flex items-center space-x-3">
//           <button
//             onClick={analyzeSkills}
//             disabled={aiLoadingSkills}
//             className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition disabled:opacity-50"
//           >
//             {aiLoadingSkills ? '⏳ Analyzing...' : '🔍 Analyze Skills (AI)'}
//           </button>
//         </div>
//       </div>

//       {aiErrorSkills && (
//         <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
//           {aiErrorSkills}
//         </div>
//       )}

//       {learningError && (
//         <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
//           {learningError}
//         </div>
//       )}

//       {(!skills || ((!skills.academic || Object.keys(skills.academic).length === 0) && (!skills.technology || Object.keys(skills.technology).length === 0))) ? (
//         <div className="text-center p-12 text-gray-600">
//           <div className="text-6xl mb-4">📊</div>
//           <p className="text-lg mb-2">No skill data yet</p>
//           <p className="text-sm">Click "Analyze Skills (AI)" to estimate your skill levels based on your profile.</p>
//         </div>
//       ) : (
//         <div className="space-y-8">
//           {/* ACADEMIC SKILLS SECTION */}
//           {skills.academic && Object.keys(skills.academic).length > 0 && (
//             <div>
//               <div className="flex items-center mb-4">
//                 <span className="text-2xl mr-3">📚</span>
//                 <h3 className="text-2xl font-bold text-gray-800">Academic Skills</h3>
//               </div>
//               <div className="space-y-4">
//                 {Object.entries(skills.academic).map(([skill, score]) => (
//                   <div key={skill} className="bg-gradient-to-r from-blue-50 to-purple-50 p-5 rounded-lg border border-blue-200">
//                     <div className="flex justify-between items-center mb-2">
//                       <div className="font-semibold text-gray-800 text-lg">{skill}</div>
//                       <div className="text-sm font-bold text-gray-600">{score}%</div>
//                     </div>
//                     <div className="h-3 bg-gray-200 rounded-full overflow-hidden mb-3">
//                       <div 
//                         style={{ width: `${Math.max(0, Math.min(100, Number(score || 0)))}%` }} 
//                         className={`h-3 rounded-full transition-all duration-500 ${
//                           score >= 80 ? 'bg-green-500' : 
//                           score >= 60 ? 'bg-blue-500' : 
//                           score >= 40 ? 'bg-yellow-500' : 'bg-red-500'
//                         }`}
//                       ></div>
//                     </div>

//                     {/* HYBRID BUTTONS */}
//                     <div className="flex space-x-2">
//                       <button
//                         onClick={() => generateSkillLearningPath(skill, score, 'academic')}
//                         disabled={isLoadingLearning && activeLearningSkill === skill}
//                         className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg text-sm transition disabled:opacity-50 font-medium"
//                       >
//                         {isLoadingLearning && activeLearningSkill === skill ? '⏳ Loading...' : '📚 Get Learning Plan'}
//                       </button>
                      
//                       <button
//                         onClick={() => startSkillTutoring(skill, score, 'academic')}
//                         className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg text-sm transition font-medium"
//                       >
//                         🤖 Ask AI Tutor
//                       </button>
//                     </div>

//                     {/* LEARNING PATH DISPLAY */}
//                     {activeLearningSkill === skill && learningContent[skill] && (
//                       <div className="mt-4 bg-white p-4 rounded-lg border-2 border-blue-500">
//                         <h4 className="font-bold text-lg text-blue-800 mb-3 flex items-center">
//                           <span className="mr-2">🎯</span>
//                           Your Personalized Learning Path
//                         </h4>

//                         {/* Learning Steps */}
//                         <div className="mb-4">
//                           <h5 className="font-semibold text-gray-700 mb-2">📋 Learning Steps:</h5>
//                           <div className="space-y-2">
//                             {learningContent[skill].learningSteps?.map((step, idx) => (
//                               <div key={idx} className="bg-blue-50 p-3 rounded border border-blue-200">
//                                 <div className="flex items-start">
//                                   <span className="font-bold text-blue-600 mr-2">{step.step}.</span>
//                                   <div className="flex-1">
//                                     <div className="font-semibold text-gray-800">{step.title}</div>
//                                     <div className="text-sm text-gray-600 mt-1">{step.description}</div>
//                                     <div className="flex items-center mt-2 text-xs text-gray-500">
//                                       <span className="mr-3">⏱️ {step.estimatedDays} days</span>
//                                       {step.offline && <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded">📴 Offline OK</span>}
//                                     </div>
//                                   </div>
//                                 </div>
//                               </div>
//                             ))}
//                           </div>
//                         </div>

//                         {/* Practice Exercises */}
//                         {learningContent[skill].practiceExercises && (
//                           <div className="mb-4">
//                             <h5 className="font-semibold text-gray-700 mb-2">💪 Practice Exercises:</h5>
//                             <div className="space-y-2">
//                               {learningContent[skill].practiceExercises.map((ex, idx) => (
//                                 <div key={idx} className="bg-purple-50 p-3 rounded border border-purple-200">
//                                   <div className="font-semibold text-gray-800">{ex.title}</div>
//                                   <div className="text-sm text-gray-600 mt-1">{ex.description}</div>
//                                   <div className="flex items-center mt-2 text-xs text-gray-500">
//                                     <span className={`px-2 py-0.5 rounded mr-2 ${
//                                       ex.difficulty === 'Easy' ? 'bg-green-100 text-green-700' :
//                                       ex.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
//                                       'bg-red-100 text-red-700'
//                                     }`}>{ex.difficulty}</span>
//                                     <span>⏱️ {ex.estimatedTime}</span>
//                                   </div>
//                                 </div>
//                               ))}
//                             </div>
//                           </div>
//                         )}

//                         {/* Quick Tips */}
//                         {learningContent[skill].quickTips && (
//                           <div className="mb-4">
//                             <h5 className="font-semibold text-gray-700 mb-2">💡 Quick Tips:</h5>
//                             <ul className="space-y-1">
//                               {learningContent[skill].quickTips.map((tip, idx) => (
//                                 <li key={idx} className="text-sm text-gray-700 bg-yellow-50 p-2 rounded border border-yellow-200">
//                                   • {tip}
//                                 </li>
//                               ))}
//                             </ul>
//                           </div>
//                         )}

//                         {/* Free Resources */}
//                         {learningContent[skill].freeResources && (
//                           <div className="mb-4">
//                             <h5 className="font-semibold text-gray-700 mb-2">🔗 Free Resources:</h5>
//                             <div className="space-y-2">
//                               {learningContent[skill].freeResources.map((res, idx) => (
//                                 <div key={idx} className="bg-gray-50 p-3 rounded border border-gray-200">
//                                   <div className="flex items-center justify-between">
//                                     <div className="font-semibold text-gray-800">{res.name}</div>
//                                     <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">{res.type}</span>
//                                   </div>
//                                   <div className="text-sm text-gray-600 mt-1">{res.description}</div>
//                                   {res.url && res.url !== 'Available offline' && (
//                                     <a href={res.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mt-1 inline-block">
//                                       🔗 Open Resource
//                                     </a>
//                                   )}
//                                 </div>
//                               ))}
//                             </div>
//                           </div>
//                         )}

//                         {/* Milestones */}
//                         {learningContent[skill].milestones && (
//                           <div>
//                             <h5 className="font-semibold text-gray-700 mb-2">🏆 Milestones:</h5>
//                             <div className="grid grid-cols-2 gap-2">
//                               {learningContent[skill].milestones.map((milestone, idx) => (
//                                 <div key={idx} className="bg-green-50 p-2 rounded border border-green-200">
//                                   <div className="text-xs font-bold text-green-700">{milestone.progress}% Complete</div>
//                                   <div className="text-xs text-gray-600 mt-1">{milestone.achievement}</div>
//                                 </div>
//                               ))}
//                             </div>
//                           </div>
//                         )}

//                         <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded text-sm text-purple-800">
//                           💡 <strong>Need help?</strong> Click "Ask AI Tutor" above to get personalized answers to your questions!
//                         </div>
//                       </div>
//                     )}
//                   </div>
//                 ))}
//               </div>
//             </div>
//           )}

//           {/* TECHNOLOGY SKILLS SECTION */}
//           {skills.technology && Object.keys(skills.technology).length > 0 && (
//             <div>
//               <div className="flex items-center mb-4">
//                 <span className="text-2xl mr-3">💻</span>
//                 <h3 className="text-2xl font-bold text-gray-800">Technology Skills</h3>
//                 <span className="ml-3 bg-green-100 text-green-800 text-xs px-3 py-1 rounded-full font-semibold">
//                   Career Ready
//                 </span>
//               </div>
//               <div className="space-y-4">
//                 {Object.entries(skills.technology).map(([skill, score]) => (
//                   <div key={skill} className="bg-gradient-to-r from-green-50 to-emerald-50 p-5 rounded-lg border border-green-200">
//                     <div className="flex justify-between items-center mb-2">
//                       <div className="font-semibold text-gray-800 text-lg flex items-center">
//                         <span className="mr-2">{getTechSkillIcon(skill)}</span>
//                         {skill}
//                       </div>
//                       <div className="text-sm font-bold text-gray-600">{score}%</div>
//                     </div>
//                     <div className="h-3 bg-gray-200 rounded-full overflow-hidden mb-2">
//                       <div 
//                         style={{ width: `${Math.max(0, Math.min(100, Number(score || 0)))}%` }} 
//                         className={`h-3 rounded-full transition-all duration-500 ${
//                           score >= 80 ? 'bg-emerald-500' : 
//                           score >= 60 ? 'bg-green-500' : 
//                           score >= 40 ? 'bg-yellow-500' : 'bg-orange-500'
//                         }`}
//                       ></div>
//                     </div>
                    
//                     {/* Career Relevance */}
//                     <div className="mb-3 text-xs text-gray-600 flex items-center bg-white p-2 rounded border border-green-200">
//                       <span className="mr-2">🎯</span>
//                       {getTechSkillRelevance(skill)}
//                     </div>

//                     {/* HYBRID BUTTONS */}
//                     <div className="flex space-x-2">
//                       <button
//                         onClick={() => generateSkillLearningPath(skill, score, 'technology')}
//                         disabled={isLoadingLearning && activeLearningSkill === skill}
//                         className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg text-sm transition disabled:opacity-50 font-medium"
//                       >
//                         {isLoadingLearning && activeLearningSkill === skill ? '⏳ Loading...' : '💻 Get Tech Learning Plan'}
//                       </button>
                      
//                       <button
//                         onClick={() => startSkillTutoring(skill, score, 'technology')}
//                         className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg text-sm transition font-medium"
//                       >
//                         🤖 Ask AI Tutor
//                       </button>
//                     </div>

//                     {/* LEARNING PATH DISPLAY FOR TECH SKILLS */}
//                     {activeLearningSkill === skill && learningContent[skill] && (
//                       <div className="mt-4 bg-white p-4 rounded-lg border-2 border-green-500">
//                         <h4 className="font-bold text-lg text-green-800 mb-3 flex items-center">
//                           <span className="mr-2">🎯</span>
//                           Your Tech Learning Roadmap
//                         </h4>

//                         {/* Learning Steps */}
//                         <div className="mb-4">
//                           <h5 className="font-semibold text-gray-700 mb-2">📋 Learning Steps:</h5>
//                           <div className="space-y-2">
//                             {learningContent[skill].learningSteps?.map((step, idx) => (
//                               <div key={idx} className="bg-green-50 p-3 rounded border border-green-200">
//                                 <div className="flex items-start">
//                                   <span className="font-bold text-green-600 mr-2">{step.step}.</span>
//                                   <div className="flex-1">
//                                     <div className="font-semibold text-gray-800">{step.title}</div>
//                                     <div className="text-sm text-gray-600 mt-1">{step.description}</div>
//                                     {step.resources && (
//                                       <div className="text-xs text-gray-500 mt-2 bg-white p-2 rounded border border-gray-200">
//                                         🔧 <strong>Tools:</strong> {step.resources}
//                                       </div>
//                                     )}
//                                     <div className="flex items-center mt-2 text-xs text-gray-500">
//                                       <span className="mr-3">⏱️ {step.estimatedDays} days</span>
//                                       {step.offline && <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded">📴 Offline OK</span>}
//                                     </div>
//                                   </div>
//                                 </div>
//                               </div>
//                             ))}
//                           </div>
//                         </div>

//                         {/* Practice Exercises */}
//                         {learningContent[skill].practiceExercises && (
//                           <div className="mb-4">
//                             <h5 className="font-semibold text-gray-700 mb-2">💪 Hands-On Projects:</h5>
//                             <div className="space-y-2">
//                               {learningContent[skill].practiceExercises.map((ex, idx) => (
//                                 <div key={idx} className="bg-emerald-50 p-3 rounded border border-emerald-200">
//                                   <div className="font-semibold text-gray-800">{ex.title}</div>
//                                   <div className="text-sm text-gray-600 mt-1">{ex.description}</div>
//                                   <div className="flex items-center mt-2 text-xs text-gray-500">
//                                     <span className={`px-2 py-0.5 rounded mr-2 ${
//                                       ex.difficulty === 'Easy' ? 'bg-green-100 text-green-700' :
//                                       ex.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
//                                       'bg-red-100 text-red-700'
//                                     }`}>{ex.difficulty}</span>
//                                     <span className="mr-2">⏱️ {ex.estimatedTime}</span>
//                                     {ex.toolsNeeded && <span>🔧 {ex.toolsNeeded}</span>}
//                                   </div>
//                                 </div>
//                               ))}
//                             </div>
//                           </div>
//                         )}

//                         {/* Career Opportunities (Tech Only) */}
//                         {learningContent[skill].careerOpportunities && (
//                           <div className="mb-4 bg-gradient-to-r from-yellow-50 to-orange-50 p-4 rounded-lg border border-yellow-200">
//                             <h5 className="font-semibold text-gray-700 mb-2 flex items-center">
//                               <span className="mr-2">💼</span>
//                               Career Opportunities in Africa:
//                             </h5>
//                             <ul className="space-y-1">
//                               {learningContent[skill].careerOpportunities.map((opp, idx) => (
//                                 <li key={idx} className="text-sm text-gray-700">
//                                   ✅ {opp}
//                                 </li>
//                               ))}
//                             </ul>
//                           </div>
//                         )}

//                         {/* Quick Tips */}
//                         {learningContent[skill].quickTips && (
//                           <div className="mb-4">
//                             <h5 className="font-semibold text-gray-700 mb-2">💡 Pro Tips:</h5>
//                             <ul className="space-y-1">
//                               {learningContent[skill].quickTips.map((tip, idx) => (
//                                 <li key={idx} className="text-sm text-gray-700 bg-yellow-50 p-2 rounded border border-yellow-200">
//                                   • {tip}
//                                 </li>
//                               ))}
//                             </ul>
//                           </div>
//                         )}

//                         {/* Free Resources */}
//                         {learningContent[skill].freeResources && (
//                           <div className="mb-4">
//                             <h5 className="font-semibold text-gray-700 mb-2">🔗 Free Learning Resources:</h5>
//                             <div className="space-y-2">
//                               {learningContent[skill].freeResources.map((res, idx) => (
//                                 <div key={idx} className="bg-gray-50 p-3 rounded border border-gray-200">
//                                   <div className="flex items-center justify-between">
//                                     <div className="font-semibold text-gray-800">{res.name}</div>
//                                     <div className="flex items-center space-x-2">
//                                       <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">{res.type}</span>
//                                       {res.offline && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">📴 Offline</span>}
//                                     </div>
//                                   </div>
//                                   <div className="text-sm text-gray-600 mt-1">{res.description}</div>
//                                   {res.url && res.url !== 'Available offline' && (
//                                     <a href={res.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mt-1 inline-block">
//                                       🔗 Open Resource
//                                     </a>
//                                   )}
//                                 </div>
//                               ))}
//                             </div>
//                           </div>
//                         )}

//                         {/* Milestones */}
//                         {learningContent[skill].milestones && (
//                           <div>
//                             <h5 className="font-semibold text-gray-700 mb-2">🏆 Your Learning Journey:</h5>
//                             <div className="grid grid-cols-2 gap-2">
//                               {learningContent[skill].milestones.map((milestone, idx) => (
//                                 <div key={idx} className="bg-green-50 p-2 rounded border border-green-200">
//                                   <div className="text-xs font-bold text-green-700">{milestone.progress}% Complete</div>
//                                   <div className="text-xs text-gray-600 mt-1">{milestone.achievement}</div>
//                                 </div>
//                               ))}
//                             </div>
//                           </div>
//                         )}

//                         <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded text-sm text-purple-800">
//                           💡 <strong>Stuck on something?</strong> Click "Ask AI Tutor" above for instant help and guidance!
//                         </div>
//                       </div>
//                     )}
//                   </div>
//                 ))}
//               </div>
//             </div>
//           )}

//           {/* SUMMARY STATS */}
//           <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-6 rounded-xl border border-purple-200">
//             <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
//               <span className="mr-2">📊</span>
//               Skills Overview
//             </h3>
//             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
//               <div className="bg-white p-4 rounded-lg shadow-sm">
//                 <div className="text-sm text-gray-600 mb-1">Academic Average</div>
//                 <div className="text-2xl font-bold text-blue-600">
//                   {skills.academic ? Math.round(Object.values(skills.academic).reduce((a,b) => a+b, 0) / Object.values(skills.academic).length) : 0}%
//                 </div>
//                 <div className="text-xs text-gray-500 mt-1">
//                   {skills.academic ? Object.keys(skills.academic).length : 0} skills tracked
//                 </div>
//               </div>
//               <div className="bg-white p-4 rounded-lg shadow-sm">
//                 <div className="text-sm text-gray-600 mb-1">Tech Average</div>
//                 <div className="text-2xl font-bold text-green-600">
//                   {skills.technology ? Math.round(Object.values(skills.technology).reduce((a,b) => a+b, 0) / Object.values(skills.technology).length) : 0}%
//                 </div>
//                 <div className="text-xs text-gray-500 mt-1">
//                   {skills.technology ? Object.keys(skills.technology).length : 0} skills tracked
//                 </div>
//               </div>
//               <div className="bg-white p-4 rounded-lg shadow-sm">
//                 <div className="text-sm text-gray-600 mb-1">Focus Area</div>
//                 <div className="text-lg font-bold text-purple-600">
//                   {getFocusArea(skills)}
//                 </div>
//                 <div className="text-xs text-gray-500 mt-1">
//                   Recommended priority
//                 </div>
//               </div>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   </div>
// )}
// {/* Achievements Tab - Enhanced with Progress Tracking */}
// {activeTab === 'achievements' && (
//   <div className="max-w-5xl mx-auto">
//     <div className="bg-white rounded-xl shadow-lg p-8">
//       <div className="flex items-center justify-between mb-6">
//         <h2 className="text-3xl font-bold text-gray-800">Achievements & Progress</h2>
//         <div className="flex items-center space-x-3">
//           <button
//             onClick={generateSkillRecommendations}
//             disabled={isLoadingRecommendations}
//             className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition disabled:opacity-50"
//           >
//             {isLoadingRecommendations ? '⏳ Loading...' : '🎯 Get Skill Recommendations'}
//           </button>
//           <button
//             onClick={generateAchievements}
//             disabled={aiLoadingAchievements}
//             className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition disabled:opacity-50"
//           >
//             {aiLoadingAchievements ? '⏳ Generating...' : '🏆 Generate Achievements'}
//           </button>
//         </div>
//       </div>

//       {/* Activity Overview Dashboard */}
//       <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
//         <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-5 rounded-xl border border-blue-200">
//           <div className="flex items-center justify-between mb-2">
//             <span className="text-2xl">📝</span>
//             <span className="text-xs font-semibold text-blue-600 uppercase">Tasks</span>
//           </div>
//           <div className="text-3xl font-bold text-blue-700">{completedTasks.length}</div>
//           <div className="text-xs text-blue-600 mt-1">Completed</div>
//         </div>

//         <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-5 rounded-xl border border-orange-200">
//           <div className="flex items-center justify-between mb-2">
//             <span className="text-2xl">🔥</span>
//             <span className="text-xs font-semibold text-orange-600 uppercase">Streak</span>
//           </div>
//           <div className="text-3xl font-bold text-orange-700">{currentStreak}</div>
//           <div className="text-xs text-orange-600 mt-1">
//             {currentStreak === 1 ? 'Day' : 'Days'} Active
//           </div>
//         </div>

//         <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-5 rounded-xl border border-purple-200">
//           <div className="flex items-center justify-between mb-2">
//             <span className="text-2xl">📈</span>
//             <span className="text-xs font-semibold text-purple-600 uppercase">Skills</span>
//           </div>
//           <div className="text-3xl font-bold text-purple-700">
//             {skills.academic ? Object.keys(skills.academic).length : 0 + skills.technology ? Object.keys(skills.technology).length : 0}
//           </div>
//           <div className="text-xs text-purple-600 mt-1">Learning</div>
//         </div>

//         <div className="bg-gradient-to-br from-green-50 to-green-100 p-5 rounded-xl border border-green-200">
//           <div className="flex items-center justify-between mb-2">
//             <span className="text-2xl">⚡</span>
//             <span className="text-xs font-semibold text-green-600 uppercase">Activity</span>
//           </div>
//           <div className="text-3xl font-bold text-green-700">{activityLog.length}</div>
//           <div className="text-xs text-green-600 mt-1">Total Actions</div>
//         </div>
//       </div>

//       {/* Learning Streak Progress */}
//       <div className="mb-8 bg-gradient-to-r from-orange-50 to-red-50 p-6 rounded-xl border border-orange-200">
//         <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
//           <span className="mr-2">🔥</span>
//           Learning Streak
//         </h3>
        
//         <div className="flex items-center justify-between mb-3">
//           <div>
//             <div className="text-3xl font-bold text-orange-600">
//               {currentStreak} {currentStreak === 1 ? 'Day' : 'Days'}
//             </div>
//             <div className="text-sm text-gray-600 mt-1">
//               {currentStreak >= 5 
//                 ? '🏆 Amazing! Keep it up!' 
//                 : `${5 - currentStreak} more ${5 - currentStreak === 1 ? 'day' : 'days'} to reach 5-day milestone!`
//               }
//             </div>
//           </div>
          
//           {lastActivityDate && (
//             <div className="text-right">
//               <div className="text-xs text-gray-600">Last Active</div>
//               <div className="text-sm font-semibold text-gray-800">
//                 {new Date(lastActivityDate).toLocaleDateString()}
//               </div>
//             </div>
//           )}
//         </div>

//         {/* Streak Visual */}
//         <div className="flex space-x-2">
//           {[1, 2, 3, 4, 5].map(day => (
//             <div 
//               key={day}
//               className={`flex-1 h-12 rounded-lg flex items-center justify-center font-bold text-sm transition-all ${
//                 currentStreak >= day 
//                   ? 'bg-orange-500 text-white scale-105' 
//                   : 'bg-gray-200 text-gray-400'
//               }`}
//             >
//               {currentStreak >= day ? '🔥' : day}
//             </div>
//           ))}
//         </div>

//         {currentStreak >= 5 && (
//           <div className="mt-4 bg-yellow-100 border border-yellow-300 p-3 rounded-lg text-center">
//             <span className="text-2xl mr-2">🏆</span>
//             <span className="font-bold text-yellow-800">Streak Achievement Unlocked!</span>
//           </div>
//         )}
//       </div>

//       {/* AI Skill Recommendations */}
//       {skillRecommendations.length > 0 && (
//         <div className="mb-8 bg-gradient-to-r from-purple-50 to-pink-50 p-6 rounded-xl border border-purple-200">
//           <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
//             <span className="mr-2">🎯</span>
//             Recommended Skills for You
//           </h3>
          
//           <div className="space-y-4">
//             {skillRecommendations.map((rec, idx) => (
//               <div key={idx} className="bg-white p-4 rounded-lg border border-purple-200 hover:border-purple-400 transition">
//                 <div className="flex items-start justify-between mb-2">
//                   <div className="flex items-center space-x-2">
//                     <span className="text-xl">
//                       {rec.category === 'technology' ? '💻' : '📚'}
//                     </span>
//                     <h4 className="font-bold text-lg text-gray-800">{rec.skillName}</h4>
//                     <span className={`text-xs px-2 py-1 rounded font-semibold ${
//                       rec.priority === 'high' ? 'bg-red-100 text-red-700' :
//                       rec.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
//                       'bg-green-100 text-green-700'
//                     }`}>
//                       {rec.priority} priority
//                     </span>
//                   </div>
//                   <span className="text-xs text-gray-500">{rec.estimatedWeeks} weeks</span>
//                 </div>
                
//                 <p className="text-sm text-gray-700 mb-2">{rec.reason}</p>
                
//                 {rec.prerequisites && rec.prerequisites.length > 0 && (
//                   <div className="mb-2 text-xs text-gray-600">
//                     <strong>Prerequisites:</strong> {rec.prerequisites.join(', ')}
//                   </div>
//                 )}
                
//                 <div className="bg-blue-50 border border-blue-200 p-2 rounded text-xs text-blue-800">
//                   <strong>💼 Career Benefit:</strong> {rec.careerBenefit}
//                 </div>
//               </div>
//             ))}
//           </div>
//         </div>
//       )}

//       {/* Recent Activity Log */}
//       {activityLog.length > 0 && (
//         <div className="mb-8 bg-gray-50 p-6 rounded-xl border border-gray-200">
//           <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
//             <span className="mr-2">📊</span>
//             Recent Activity
//           </h3>
          
//           <div className="space-y-2">
//             {activityLog.slice(-10).reverse().map((activity, idx) => (
//               <div key={idx} className="bg-white p-3 rounded-lg border border-gray-200 flex items-center justify-between">
//                 <div className="flex items-center space-x-3">
//                   <span className="text-xl">
//                     {activity.type === 'task_completed' ? '✅' : 
//                      activity.type === 'task_uncompleted' ? '⬜' : '📝'}
//                   </span>
//                   <div>
//                     <div className="font-medium text-gray-800">
//                       {activity.type === 'task_completed' ? 'Completed: ' : 
//                        activity.type === 'task_uncompleted' ? 'Uncompleted: ' : ''}
//                       {activity.taskTitle}
//                     </div>
//                     <div className="text-xs text-gray-500">
//                       {new Date(activity.timestamp).toLocaleString()}
//                     </div>
//                   </div>
//                 </div>
//               </div>
//             ))}
//           </div>
          
//           {activityLog.length > 10 && (
//             <div className="mt-3 text-center text-sm text-gray-600">
//               Showing last 10 of {activityLog.length} activities
//             </div>
//           )}
//         </div>
//       )}

//       {/* Achievements Section */}
//       <div className="bg-gradient-to-r from-yellow-50 to-orange-50 p-6 rounded-xl border border-yellow-200">
//         <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
//           <span className="mr-2">🏆</span>
//           Your Achievements
//         </h3>

//         {aiErrorAchievements && (
//           <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
//             {aiErrorAchievements}
//           </div>
//         )}

//         {achievements.length === 0 ? (
//           <div className="text-center p-12 text-gray-600">
//             <div className="text-6xl mb-4">🏆</div>
//             <p className="text-lg mb-2">No achievements generated yet</p>
//             <p className="text-sm">Click "Generate Achievements" to create milestone templates based on your progress.</p>
//           </div>
//         ) : (
//           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//             {achievements.map((achievement, idx) => {
//               // Check if achievement is unlocked based on progress
//               const isUnlocked = achievement.date || 
//                                 (achievement.title.toLowerCase().includes('task') && completedTasks.length >= 5) ||
//                                 (achievement.title.toLowerCase().includes('streak') && currentStreak >= 5);
              
//               return (
//                 <div 
//                   key={idx} 
//                   className={`p-4 rounded-lg border-2 transition-all ${
//                     isUnlocked 
//                       ? 'bg-yellow-50 border-yellow-400 shadow-md' 
//                       : 'bg-gray-50 border-gray-300 opacity-60'
//                   }`}
//                 >
//                   <div className="flex items-start justify-between mb-2">
//                     <div className="flex items-center space-x-2">
//                       <span className="text-3xl">
//                         {isUnlocked ? '🏆' : '🔒'}
//                       </span>
//                       <h4 className={`font-bold text-lg ${
//                         isUnlocked ? 'text-yellow-800' : 'text-gray-600'
//                       }`}>
//                         {achievement.title}
//                       </h4>
//                     </div>
//                     {isUnlocked && (
//                       <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-semibold">
//                         ✓ Unlocked
//                       </span>
//                     )}
//                   </div>
                  
//                   <p className="text-sm text-gray-700 mb-2">{achievement.description}</p>
                  
//                   {achievement.criteria && (
//                     <div className="text-xs text-gray-600 bg-white p-2 rounded border border-gray-200">
//                       <strong>How to earn:</strong> {achievement.criteria}
//                     </div>
//                   )}
                  
//                   {achievement.date && (
//                     <div className="mt-2 text-xs text-gray-500">
//                       Earned on: {new Date(achievement.date).toLocaleDateString()}
//                     </div>
//                   )}
//                 </div>
//               );
//             })}
//           </div>
//         )}
//       </div>

//       {/* Motivational Message */}
//       <div className="mt-6 bg-gradient-to-r from-green-50 to-blue-50 p-6 rounded-xl border border-green-200 text-center">
//         <h4 className="font-bold text-lg text-gray-800 mb-2">Keep Going! 💪</h4>
//         <p className="text-gray-700">
//           {completedTasks.length === 0 
//             ? "Start by completing your first task to begin your learning journey!"
//             : completedTasks.length < 5
//             ? `You're making progress! ${5 - completedTasks.length} more tasks to reach your first milestone!`
//             : currentStreak < 5
//             ? `Great work! Keep your streak alive for ${5 - currentStreak} more ${5 - currentStreak === 1 ? 'day' : 'days'}!`
//             : "You're on fire! 🔥 Keep up the amazing work!"
//           }
//         </p>
//       </div>
//     </div>
//   </div>
// )}
// {/* Community Tab */}
// {activeTab === 'community' && (
//   <div className="max-w-6xl mx-auto">
//     {/* Success/Error Messages */}
//     {communitySuccess && (
//       <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
//         {communitySuccess}
//       </div>
//     )}
    
//     {communityError && (
//       <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
//         {communityError}
//       </div>
//     )}

//     {/* FEED VIEW */}
//     {communityView === 'feed' && (
//       <div className="bg-white rounded-xl shadow-lg p-8">
//         {/* Header */}
//         <div className="flex justify-between items-center mb-6">
//           <div>
//             <h2 className="text-3xl font-bold text-gray-800 flex items-center">
//               <span className="text-4xl mr-3">👥</span>
//               Community
//             </h2>
//             <p className="text-gray-600 mt-1">Learn together, grow together</p>
//           </div>
//           <div className="flex space-x-3">
//             <button
//               onClick={() => setCommunityView('leaderboard')}
//               className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg transition"
//             >
//               🏆 Leaderboard
//             </button>
//             <button
//               onClick={() => setCommunityView('create')}
//               className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-semibold transition"
//             >
//               + Create Post
//             </button>
//           </div>
//         </div>

//         {/* User Stats */}
//         {userCommunityStats && (
//           <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
//             <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
//               <div className="text-xs text-blue-600 font-semibold mb-1">YOUR POSTS</div>
//               <div className="text-2xl font-bold text-blue-700">{userCommunityStats.postsCreated || 0}</div>
//             </div>
//             <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
//               <div className="text-xs text-purple-600 font-semibold mb-1">REPLIES</div>
//               <div className="text-2xl font-bold text-purple-700">{userCommunityStats.repliesGiven || 0}</div>
//             </div>
//             <div className="bg-green-50 p-4 rounded-lg border border-green-200">
//               <div className="text-xs text-green-600 font-semibold mb-1">HELPFUL</div>
//               <div className="text-2xl font-bold text-green-700">{userCommunityStats.helpfulReplies || 0}</div>
//             </div>
//             <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
//               <div className="text-xs text-yellow-600 font-semibold mb-1">REPUTATION</div>
//               <div className="text-2xl font-bold text-yellow-700">{userCommunityStats.reputationPoints || 0}</div>
//             </div>
//           </div>
//         )}

//         {/* Badges */}
//         {userCommunityStats && userCommunityStats.badges && userCommunityStats.badges.length > 0 && (
//           <div className="mb-6 bg-gradient-to-r from-yellow-50 to-orange-50 p-4 rounded-lg border border-yellow-200">
//             <div className="text-sm font-semibold text-gray-700 mb-2">Your Badges:</div>
//             <div className="flex flex-wrap gap-2">
//               {userCommunityStats.badges.map(badgeId => {
//                 const badge = BADGES[badgeId];
//                 return badge ? (
//                   <span key={badgeId} className="bg-white px-3 py-1 rounded-full text-sm font-medium border border-yellow-300">
//                     {badge.icon} {badge.name}
//                   </span>
//                 ) : null;
//               })}
//             </div>
//           </div>
//         )}

//         {/* Search and Filters */}
//         <div className="mb-6 space-y-4">
//           {/* Search Bar */}
//           <form onSubmit={handleSearchPosts} className="flex space-x-2">
//             <input
//               type="text"
//               value={searchTerm}
//               onChange={(e) => setSearchTerm(e.target.value)}
//               placeholder="Search posts..."
//               className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
//             />
//             <button
//               type="submit"
//               className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition"
//             >
//               🔍 Search
//             </button>
//           </form>

//           {/* Filters */}
//           <div className="flex flex-wrap gap-3">
//             {/* Category Filter */}
//             <select
//               value={selectedCategory}
//               onChange={(e) => setSelectedCategory(e.target.value)}
//               className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
//             >
//               {COMMUNITY_CATEGORIES.map(cat => (
//                 <option key={cat} value={cat}>{cat}</option>
//               ))}
//             </select>

//             {/* Type Filter */}
//             <select
//               value={selectedPostType}
//               onChange={(e) => setSelectedPostType(e.target.value)}
//               className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
//             >
//               {POST_TYPES.map(type => (
//                 <option key={type.value} value={type.value}>
//                   {type.icon} {type.label}
//                 </option>
//               ))}
//             </select>

//             {/* Sort Filter */}
//             <select
//               value={sortBy}
//               onChange={(e) => setSortBy(e.target.value)}
//               className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
//             >
//               <option value="recent">Recent</option>
//               <option value="popular">Popular</option>
//               <option value="unanswered">Unanswered</option>
//             </select>
//           </div>
//         </div>

//         {/* Posts List */}
//         {communityLoading ? (
//           <div className="text-center py-12">
//             <div className="text-4xl mb-4">⏳</div>
//             <p className="text-gray-600">Loading posts...</p>
//           </div>
//         ) : communityPosts.length === 0 ? (
//           <div className="text-center py-12">
//             <div className="text-6xl mb-4">📭</div>
//             <p className="text-lg text-gray-600 mb-2">No posts yet</p>
//             <p className="text-sm text-gray-500">Be the first to start a discussion!</p>
//           </div>
//         ) : (
//           <div className="space-y-4">
//             {communityPosts.map(post => (
//               <div
//                 key={post.id}
//                 onClick={() => handleViewPost(post.id)}
//                 className="border border-gray-200 rounded-lg p-5 hover:border-green-300 hover:shadow-md transition cursor-pointer"
//               >
//                 <div className="flex items-start space-x-4">
//                   {/* Vote Section */}
//                   <div className="flex flex-col items-center space-y-1">
//                     <button
//                       onClick={(e) => {
//                         e.stopPropagation();
//                         handleVotePost(post.id, 'upvote');
//                       }}
//                       className={`p-1 rounded ${
//                         post.upvotedBy?.includes(user.uid)
//                           ? 'text-green-600'
//                           : 'text-gray-400 hover:text-green-600'
//                       }`}
//                     >
//                       <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
//                         <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
//                       </svg>
//                     </button>
//                     <span className="font-bold text-lg text-gray-700">
//                       {(post.upvotes || 0) - (post.downvotes || 0)}
//                     </span>
//                     <button
//                       onClick={(e) => {
//                         e.stopPropagation();
//                         handleVotePost(post.id, 'downvote');
//                       }}
//                       className={`p-1 rounded ${
//                         post.downvotedBy?.includes(user.uid)
//                           ? 'text-red-600'
//                           : 'text-gray-400 hover:text-red-600'
//                       }`}
//                     >
//                       <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
//                         <path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.105-1.79l-.05-.025A4 4 0 0011.055 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" />
//                       </svg>
//                     </button>
//                   </div>

//                   {/* Post Content */}
//                   <div className="flex-1">
//                     <div className="flex items-start justify-between mb-2">
//                       <div className="flex items-center space-x-2">
//                         <span className="text-2xl">{getPostTypeIcon(post.type)}</span>
//                         <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-semibold">
//                           {post.category}
//                         </span>
//                         {post.isAnswered && (
//                           <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-semibold flex items-center">
//                             ✓ Answered
//                           </span>
//                         )}
//                       </div>
//                     </div>

//                     <h3 className="text-lg font-bold text-gray-800 mb-2 hover:text-green-600">
//                       {post.title}
//                     </h3>

//                     <p className="text-gray-600 text-sm mb-3 line-clamp-2">
//                       {post.content}
//                     </p>

//                     {/* Tags */}
//                     {post.tags && post.tags.length > 0 && (
//                       <div className="flex flex-wrap gap-2 mb-3">
//                         {post.tags.map((tag, idx) => (
//                           <span key={idx} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
//                             #{tag}
//                           </span>
//                         ))}
//                       </div>
//                     )}

//                     {/* Meta Info */}
//                     <div className="flex items-center text-xs text-gray-500 space-x-4">
//                       <span
//                       className="flex items-center">
//                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
//      </svg>
//         <button
//      onClick={(e) => {
//       e.stopPropagation();
//       handleViewProfile(post.authorId, post.authorName);
//     }}
//     className="text-green-600 hover:text-green-700 font-medium hover:underline"
//   >
//     {post.authorName}
//   </button>
//   <span className="ml-1">• {post.authorCountry}</span> 

//                       </span>
//                       <span className="flex items-center">
//                         <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
//                         </svg>
//                         {post.replyCount || 0} replies
//                       </span>
//                       <span className="flex items-center">
//                         <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
//                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
//                         </svg>
//                         {post.views || 0} views
//                       </span>
//                       <span>{formatTimestamp(post.createdAt)}</span>
//                     </div>
//                   </div>
//                 </div>
//               </div>
//             ))}
//           </div>
//         )}
//       </div>
//     )}

//     {/* CREATE POST VIEW */}
//     {communityView === 'create' && (
//       <div className="bg-white rounded-xl shadow-lg p-8">
//         <div className="flex items-center justify-between mb-6">
//           <h2 className="text-2xl font-bold text-gray-800">Create a Post</h2>
//           <button
//             onClick={() => setCommunityView('feed')}
//             className="text-gray-600 hover:text-gray-800"
//           >
//             ← Back to Feed
//           </button>
//         </div>

//         <form onSubmit={handleCreatePost} className="space-y-6">
//           {/* Post Type */}
//           <div>
//             <label className="block text-sm font-semibold text-gray-700 mb-2">Post Type</label>
//             <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
//               {POST_TYPES.filter(t => t.value !== 'all').map(type => (
//                 <button
//                   key={type.value}
//                   type="button"
//                   onClick={() => setNewPost({...newPost, type: type.value})}
//                   className={`p-3 rounded-lg border-2 transition ${
//                     newPost.type === type.value
//                       ? 'border-green-500 bg-green-50'
//                       : 'border-gray-200 hover:border-green-300'
//                   }`}
//                 >
//                   <div className="text-2xl mb-1">{type.icon}</div>
//                   <div className="text-sm font-medium">{type.label}</div>
//                 </button>
//               ))}
//             </div>
//           </div>

//           {/* Category */}
//           <div>
//             <label className="block text-sm font-semibold text-gray-700 mb-2">Category</label>
//             <select
//               value={newPost.category}
//               onChange={(e) => setNewPost({...newPost, category: e.target.value})}
//               className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
//             >
//               {COMMUNITY_CATEGORIES.filter(c => c !== 'All').map(cat => (
//                 <option key={cat} value={cat}>{cat}</option>
//               ))}
//             </select>
//           </div>

//           {/* Title */}
//           <div>
//             <label className="block text-sm font-semibold text-gray-700 mb-2">
//               Title <span className="text-red-500">*</span>
//             </label>
//             <input
//               type="text"
//               value={newPost.title}
//               onChange={(e) => setNewPost({...newPost, title: e.target.value})}
//               placeholder="Enter a clear, descriptive title..."
//               className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
//               required
//             />
//           </div>

//           {/* Content */}
//           <div>
//             <label className="block text-sm font-semibold text-gray-700 mb-2">
//               Content <span className="text-red-500">*</span>
//             </label>
//             <textarea
//               value={newPost.content}
//               onChange={(e) => setNewPost({...newPost, content: e.target.value})}
//               placeholder="Provide details, context, or your thoughts..."
//               rows="8"
//               className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
//               required
//             />
//           </div>

//           {/* Tags */}
//           <div>
//             <label className="block text-sm font-semibold text-gray-700 mb-2">
//               Tags (comma-separated)
//             </label>
//             <input
//               type="text"
//               value={newPost.tags}
//               onChange={(e) => setNewPost({...newPost, tags: e.target.value})}
//               placeholder="e.g., algebra, trigonometry, grade-10"
//               className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
//             />
//             <p className="text-xs text-gray-500 mt-1">Add relevant tags to help others find your post</p>
//           </div>

//           {/* Community Guidelines */}
//           <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
//             <h4 className="font-semibold text-blue-800 mb-2 flex items-center">
//               <span className="mr-2">📋</span>
//               Community Guidelines
//             </h4>
//             <ul className="text-sm text-blue-700 space-y-1">
//               <li>• Be respectful and supportive</li>
//               <li>• Don't ask for exam answers or promote cheating</li>
//               <li>• Share knowledge, not personal information</li>
//               <li>• Report inappropriate content</li>
//             </ul>
//           </div>

//           {/* Submit Button */}
//           <button
//             type="submit"
//             disabled={communityLoading}
//             className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-semibold transition disabled:opacity-50"
//           >
//             {communityLoading ? '⏳ Posting...' : '📤 Post to Community'}
//           </button>
//         </form>
//       </div>
//     )}

//     {/* POST DETAIL VIEW */}
//     {communityView === 'post' && selectedPost && (
//       <div className="space-y-6">
//         {/* Back Button */}
//         <button
//           onClick={() => {
//             setCommunityView('feed');
//             setSelectedPost(null);
//             setPostReplies([]);
//           }}
//           className="text-gray-600 hover:text-gray-800 font-medium"
//         >
//           ← Back to Feed
//         </button>

//         {/* Post Card */}
//         <div className="bg-white rounded-xl shadow-lg p-8">
//           <div className="flex items-start space-x-6">
//             {/* Vote Section */}
//             <div className="flex flex-col items-center space-y-2">
//               <button
//                 onClick={() => handleVotePost(selectedPost.id, 'upvote')}
//                 className={`p-2 rounded-lg transition ${
//                   selectedPost.upvotedBy?.includes(user.uid)
//                     ? 'bg-green-100 text-green-600'
//                     : 'bg-gray-100 text-gray-400 hover:bg-green-50 hover:text-green-600'
//                 }`}
//               >
//                 <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
//                   <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
//                 </svg>
//               </button>
//               <span className="font-bold text-2xl text-gray-700">
//                 {(selectedPost.upvotes || 0) - (selectedPost.downvotes || 0)}
//               </span>
//               <button
//                 onClick={() => handleVotePost(selectedPost.id, 'downvote')}
//                 className={`p-2 rounded-lg transition ${
//                   selectedPost.downvotedBy?.includes(user.uid)
//                     ? 'bg-red-100 text-red-600'
//                     : 'bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-600'
//                 }`}
//               >
//                 <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
//                   <path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.105-1.79l-.05-.025A4 4 0 0011.055 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" />
//                 </svg>
//               </button>
//             </div>

//             {/* Post Content */}
//             <div className="flex-1">
//               {/* Header */}
//               <div className="flex items-start justify-between mb-4">
//                 <div className="flex items-center space-x-2 flex-wrap">
//                   <span className="text-3xl">{getPostTypeIcon(selectedPost.type)}</span>
//                   <span className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-semibold">
//                     {selectedPost.category}
//                   </span>
//                   {selectedPost.isAnswered && (
//                     <span className="text-sm bg-green-100 text-green-700 px-3 py-1 rounded-full font-semibold flex items-center">
//                       ✓ Answered
//                     </span>
//                   )}
//                 </div>
//                 <button
//                   onClick={() => handleFlag(selectedPost.id, 'post')}
//                   className="text-gray-400 hover:text-red-600 text-sm"
//                   title="Flag inappropriate content"
//                 >
//                   🚩 Flag
//                 </button>
//               </div>

//               {/* Title */}
//               <h1 className="text-3xl font-bold text-gray-800 mb-4">
//                 {selectedPost.title}
//               </h1>

//               {/* Content */}
//               <div className="prose max-w-none mb-6">
//                 <p className="text-gray-700 whitespace-pre-wrap">{selectedPost.content}</p>
//               </div>

//               {/* Tags */}
//               {selectedPost.tags && selectedPost.tags.length > 0 && (
//                 <div className="flex flex-wrap gap-2 mb-6">
//                   {selectedPost.tags.map((tag, idx) => (
//                     <span key={idx} className="text-sm bg-gray-100 text-gray-600 px-3 py-1 rounded-full">
//                       #{tag}
//                     </span>
//                   ))}
//                 </div>
//               )}

//               {/* Author Info */}
//               <div className="flex items-center justify-between pt-6 border-t border-gray-200">
//                 <button
//   onClick={() => handleViewProfile(selectedPost.authorId, selectedPost.authorName)}
//   className="flex items-center space-x-3 hover:bg-gray-50 p-2 rounded-lg transition"
// >
//   <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
//     <span className="text-lg">👤</span>
//   </div>
//   <div className="text-left">
//     <div className="font-semibold text-green-600 hover:text-green-700">
//       {selectedPost.authorName}
//     </div>
//     <div className="text-sm text-gray-500">
//       {selectedPost.authorCountry} • {selectedPost.authorEducationalSystem}
//     </div>
//   </div>
// </button>
                
//                 <div className="text-sm text-gray-500 text-right">
//                   <div>Posted {formatTimestamp(selectedPost.createdAt)}</div>
//                   <div>{selectedPost.views || 0} views</div>
//                 </div>
//               </div>
//             </div>
//           </div>
//         </div>

//         {/* Replies Section */}
//         <div className="bg-white rounded-xl shadow-lg p-8">
//           <h3 className="text-2xl font-bold text-gray-800 mb-6">
//             {postReplies.length} {postReplies.length === 1 ? 'Reply' : 'Replies'}
//           </h3>

//           {/* Reply Form */}
//           <form onSubmit={handleReply} className="mb-8">
//             <textarea
//               value={replyContent}
//               onChange={(e) => setReplyContent(e.target.value)}
//               placeholder="Share your answer or thoughts..."
//               rows="4"
//               className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none mb-3"
//             />
//             <button
//               type="submit"
//               disabled={communityLoading}
//               className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-semibold transition disabled:opacity-50"
//             >
//               {communityLoading ? '⏳ Posting...' : '💬 Post Reply'}
//             </button>
//           </form>

//           {/* Replies List */}
//           <div className="space-y-6">
//             {postReplies.length === 0 ? (
//               <div className="text-center py-8 text-gray-500">
//                 <div className="text-4xl mb-2">💭</div>
//                 <p>No replies yet. Be the first to respond!</p>
//               </div>
//             ) : (
//               postReplies.map(reply => (
//                 <div
//                   key={reply.id}
//                   className={`border rounded-lg p-6 ${
//                     reply.isBestAnswer
//                       ? 'border-2 border-green-500 bg-green-50'
//                       : 'border-gray-200'
//                   }`}
//                 >
//                   <div className="flex items-start space-x-4">
//                     {/* Vote Section */}
//                     <div className="flex flex-col items-center space-y-1">
//                       <button
//                         onClick={() => handleVoteReply(reply.id)}
//                         className={`p-1 rounded ${
//                           reply.upvotedBy?.includes(user.uid)
//                             ? 'text-green-600'
//                             : 'text-gray-400 hover:text-green-600'
//                         }`}
//                       >
//                         <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
//                           <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
//                         </svg>
//                       </button>
//                       <span className="font-bold text-lg text-gray-700">{reply.upvotes || 0}</span>
//                     </div>

//                     {/* Reply Content */}
//                     <div className="flex-1">
//                       {/* Best Answer Badge */}
//                       {reply.isBestAnswer && (
//                         <div className="mb-3 flex items-center space-x-2">
//                           <span className="bg-green-600 text-white text-sm px-3 py-1 rounded-full font-semibold">
//                             ✓ Best Answer
//                           </span>
//                         </div>
//                       )}

//                       {/* Reply Text */}
//                       <p className="text-gray-700 mb-4 whitespace-pre-wrap">{reply.content}</p>

//                       {/* Reply Footer */}
//                       <div className="flex items-center justify-between">
//                         <div className="flex items-center space-x-3 text-sm text-gray-500">
//   <button
//     onClick={() => handleViewProfile(reply.authorId, reply.authorName)}
//     className="font-medium text-green-600 hover:text-green-700 hover:underline"
//   >
//     {reply.authorName}
//   </button>
//   <span>•</span>
//   <span>{formatTimestamp(reply.createdAt)}</span>
// </div>

//                         <div className="flex items-center space-x-3">
//                           {/* Mark as Best Answer (only for question author) */}
//                           {selectedPost.type === 'question' &&
//                             selectedPost.authorId === user.uid &&
//                             !selectedPost.isAnswered &&
//                             !reply.isBestAnswer && (
//                             <button
//                               onClick={() => handleMarkBestAnswer(reply.id)}
//                               className="text-sm text-green-600 hover:text-green-700 font-medium"
//                             >
//                               ✓ Mark as Best Answer
//                             </button>
//                           )}

//                           {/* Flag Button */}
//                           <button
//                             onClick={() => handleFlag(reply.id, 'reply')}
//                             className="text-sm text-gray-400 hover:text-red-600"
//                             title="Flag inappropriate content"
//                           >
//                             🚩
//                           </button>
//                         </div>
//                       </div>
//                     </div>
//                   </div>
//                 </div>
//               ))
//             )}
//           </div>
//         </div>
//       </div>
//     )}

//     {/* LEADERBOARD VIEW */}
//     {communityView === 'leaderboard' && (
//       <div className="bg-white rounded-xl shadow-lg p-8">
//         <div className="flex items-center justify-between mb-6">
//           <div>
//             <h2 className="text-3xl font-bold text-gray-800 flex items-center">
//               <span className="text-4xl mr-3">🏆</span>
//               Community Leaderboard
//             </h2>
//             <p className="text-gray-600 mt-1">Top contributors this period</p>
//           </div>
//           <button
//             onClick={() => setCommunityView('feed')}
//             className="text-gray-600 hover:text-gray-800 font-medium"
//           >
//             ← Back to Feed
//           </button>
//         </div>

//         {/* Your Ranking */}
//         {userCommunityStats && (
//           <div className="mb-8 bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-xl border-2 border-blue-200">
//             <h3 className="font-bold text-lg text-gray-800 mb-4">Your Stats</h3>
//             <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
//               <div>
//                 <div className="text-sm text-gray-600">Reputation</div>
//                 <div className="text-2xl font-bold text-blue-700">{userCommunityStats.reputationPoints || 0}</div>
//               </div>
//               <div>
//                 <div className="text-sm text-gray-600">Posts</div>
//                 <div className="text-2xl font-bold text-purple-700">{userCommunityStats.postsCreated || 0}</div>
//               </div>
//               <div>
//                 <div className="text-sm text-gray-600">Replies</div>
//                 <div className="text-2xl font-bold text-green-700">{userCommunityStats.repliesGiven || 0}</div>
//               </div>
//               <div>
//                 <div className="text-sm text-gray-600">Helpful</div>
//                 <div className="text-2xl font-bold text-yellow-700">{userCommunityStats.helpfulReplies || 0}</div>
//               </div>
//             </div>

//             {/* Badges */}
//             {userCommunityStats.badges && userCommunityStats.badges.length > 0 && (
//               <div className="mt-4">
//                 <div className="text-sm text-gray-600 mb-2">Your Badges:</div>
//                 <div className="flex flex-wrap gap-2">
//                   {userCommunityStats.badges.map(badgeId => {
//                     const badge = BADGES[badgeId];
//                     return badge ? (
//                       <span key={badgeId} className="bg-white px-3 py-1 rounded-full text-sm font-medium border-2 border-yellow-300">
//                         {badge.icon} {badge.name}
//                       </span>
//                     ) : null;
//                   })}
//                 </div>
//               </div>
//             )}
//           </div>
//         )}

//         {/* Top Contributors */}
//         <div className="space-y-4">
//           {leaderboard.length === 0 ? (
//             <div className="text-center py-12 text-gray-500">
//               <div className="text-4xl mb-2">📊</div>
//               <p>No leaderboard data yet</p>
//             </div>
//           ) : (
//             leaderboard.map((leader, index) => (
//               <div
//                 key={`${leader.userId}-${index}`}
//                 className={`flex items-center space-x-4 p-5 rounded-xl border-2 transition ${
//                   index === 0
//                     ? 'border-yellow-400 bg-gradient-to-r from-yellow-50 to-orange-50'
//                     : index === 1
//                     ? 'border-gray-300 bg-gradient-to-r from-gray-50 to-gray-100'
//                     : index === 2
//                     ? 'border-orange-300 bg-gradient-to-r from-orange-50 to-yellow-50'
//                     : 'border-gray-200 bg-white'
//                 }`}
//               >
//                 {/* Rank */}
//                 <div className="flex-shrink-0">
//                   <div
//                     className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl ${
//                       index === 0
//                         ? 'bg-yellow-500 text-white'
//                         : index === 1
//                         ? 'bg-gray-400 text-white'
//                         : index === 2
//                         ? 'bg-orange-500 text-white'
//                         : 'bg-gray-200 text-gray-700'
//                     }`}
//                   >
//                     {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
//                   </div>
//                 </div>

//                 {/* User Info */}
//                 <div className="flex-1">
//                   <div className="font-bold text-gray-800">
//                     {leader.userId === user.uid ? 'You' : `User ${leader.userId.slice(0, 8)}`}
//                   </div>
//                   <div className="text-sm text-gray-600">
//                     {leader.postsCreated || 0} posts • {leader.repliesGiven || 0} replies • {leader.helpfulReplies || 0} helpful
//                   </div>
//                 </div>

//                 {/* Reputation Points */}
//                 <div className="text-right">
//                   <div className="text-2xl font-bold text-yellow-600">{leader.reputationPoints || 0}</div>
//                   <div className="text-xs text-gray-500">reputation</div>
//                 </div>
//               </div>
//             ))
//           )}
//         </div>
//       </div>
//     )}
//     {/* PROFILE MODAL */}
// {profileModalOpen && viewingProfile && (
//   <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
//     <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
//       {/* Modal Header */}
//       <div className="sticky top-0 bg-gradient-to-r from-green-600 to-emerald-600 text-white p-6 rounded-t-xl">
//         <div className="flex justify-between items-start">
//           <div>
//             <h2 className="text-2xl font-bold mb-1">{viewingProfile.userName}'s Profile</h2>
//             <p className="text-green-100 text-sm">
//               {viewingProfile.country || 'Unknown Country'} • {viewingProfile.educationalSystem || 'Unknown System'}
//             </p>
//           </div>
//           <button
//             onClick={() => {
//               setProfileModalOpen(false);
//               setViewingProfile(null);
//             }}
//             className="text-white hover:bg-white/20 p-2 rounded-lg transition"
//           >
//             ✕
//           </button>
//         </div>
//       </div>

//       {/* Modal Content */}
//       <div className="p-6 space-y-6">
//         {/* Community Stats */}
//         <div>
//           <h3 className="text-lg font-bold text-gray-800 mb-3">Community Contributions</h3>
//           <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
//             <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 text-center">
//               <div className="text-2xl font-bold text-blue-700">
//                 {viewingProfile.communityStats?.postsCreated || 0}
//               </div>
//               <div className="text-xs text-blue-600 mt-1">Posts</div>
//             </div>
//             <div className="bg-purple-50 p-4 rounded-lg border border-purple-200 text-center">
//               <div className="text-2xl font-bold text-purple-700">
//                 {viewingProfile.communityStats?.repliesGiven || 0}
//               </div>
//               <div className="text-xs text-purple-600 mt-1">Replies</div>
//             </div>
//             <div className="bg-green-50 p-4 rounded-lg border border-green-200 text-center">
//               <div className="text-2xl font-bold text-green-700">
//                 {viewingProfile.communityStats?.helpfulReplies || 0}
//               </div>
//               <div className="text-xs text-green-600 mt-1">Helpful</div>
//             </div>
//             <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 text-center">
//               <div className="text-2xl font-bold text-yellow-700">
//                 {viewingProfile.communityStats?.reputationPoints || 0}
//               </div>
//               <div className="text-xs text-yellow-600 mt-1">Reputation</div>
//             </div>
//           </div>
//         </div>

//         {/* Badges */}
//         {viewingProfile.communityStats?.badges && viewingProfile.communityStats.badges.length > 0 && (
//           <div>
//             <h3 className="text-lg font-bold text-gray-800 mb-3">Badges Earned</h3>
//             <div className="flex flex-wrap gap-2">
//               {viewingProfile.communityStats.badges.map(badgeId => {
//                 const badge = BADGES[badgeId];
//                 return badge ? (
//                   <div key={badgeId} className="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-300 px-4 py-2 rounded-lg">
//                     <span className="text-2xl mr-2">{badge.icon}</span>
//                     <span className="font-semibold text-gray-800">{badge.name}</span>
//                   </div>
//                 ) : null;
//               })}
//             </div>
//           </div>
//         )}

//         {/* Academic Info */}
//         <div>
//           <h3 className="text-lg font-bold text-gray-800 mb-3">Academic Background</h3>
//           <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-3">
//             <div>
//               <div className="text-sm font-semibold text-gray-600">Country</div>
//               <div className="text-gray-800">{viewingProfile.country || 'Not specified'}</div>
//             </div>
//             <div>
//               <div className="text-sm font-semibold text-gray-600">Educational System</div>
//               <div className="text-gray-800">{viewingProfile.educationalSystem || 'Not specified'}</div>
//             </div>
//             <div>
//               <div className="text-sm font-semibold text-gray-600">Strengths</div>
//               <div className="text-gray-800">{viewingProfile.strengths || 'Not specified'}</div>
//             </div>
//           </div>
//         </div>

//         {/* Member Since */}
//         {viewingProfile.createdAt && (
//           <div className="text-center text-sm text-gray-500 pt-4 border-t border-gray-200">
//             Member since {new Date(viewingProfile.createdAt).toLocaleDateString('en-US', {
//               year: 'numeric',
//               month: 'long',
//               day: 'numeric'
//             })}
//           </div>
//         )}
//       </div>
//     </div>
//   </div>
// )}
//  </div>
// )}
// {/* Offline Content - NOW FUNCTIONAL */}
// {/* Offline Content - ENHANCED */}
// {activeTab === 'content' && (
//   <div className="max-w-4xl mx-auto">
//     <div className="bg-white rounded-xl shadow-lg p-8">
//       <div className="flex items-center justify-between mb-6">
//         <h2 className="text-3xl font-bold text-gray-800 flex items-center">
//           <span className="text-4xl mr-3">📚</span>
//           Offline Content
//         </h2>
//         <div className="flex items-center space-x-3">
//           <div className={`px-4 py-2 rounded-lg ${isOnline ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
//             {isOnline ? '🌐 Online' : '📴 Offline Mode'}
//           </div>
//           {/* Debug button to check cached data */}
//           <button
//             onClick={async () => {
//               const data = await loadAllOfflineData(user.uid);
//               console.log('📦 Cached data:', data);
//               alert(`Cached: ${data.tasks.length} tasks, ${Object.keys(data.skills).length} skills, ${data.learningPaths.length} learning paths, ${data.chatMessages.length} chats`);
//             }}
//             className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition text-sm"
//           >
//             🔍 Check Cache
//           </button>
//         </div>
//       </div>

//       {/* Storage Summary */}
//       <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
//         <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
//           <div className="text-sm font-semibold text-blue-600 mb-1">Tasks</div>
//           <div className="text-2xl font-bold text-blue-800">{tasks.length}</div>
//           <div className="text-xs text-blue-600 mt-1">With answers</div>
//         </div>

//         <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
//           <div className="text-sm font-semibold text-purple-600 mb-1">Skills</div>
//           <div className="text-2xl font-bold text-purple-800">
//             {(() => {
//               let count = 0;
//               if (skills.academic) count += Object.keys(skills.academic).length;
//               if (skills.technology) count += Object.keys(skills.technology).length;
//               return count;
//             })()}
//           </div>
//           <div className="text-xs text-purple-600 mt-1">Tracked</div>
//         </div>

//         <div className="bg-green-50 p-4 rounded-lg border border-green-200">
//           <div className="text-sm font-semibold text-green-600 mb-1">Learning Plans</div>
//           <div className="text-2xl font-bold text-green-800">
//             {Object.keys(learningContent).length}
//           </div>
//           <div className="text-xs text-green-600 mt-1">Generated</div>
//         </div>

//         <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
//           <div className="text-sm font-semibold text-orange-600 mb-1">Chat History</div>
//           <div className="text-2xl font-bold text-orange-800">{chatMessages.length}</div>
//           <div className="text-xs text-orange-600 mt-1">Messages</div>
//         </div>
//       </div>

//       {/* Sync Status */}
//       <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-xl border border-blue-200 mb-8">
//         <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
//           <span className="mr-2">🔄</span>
//           Sync Status
//         </h3>
        
//         <div className="space-y-3">
//           <div className="flex justify-between items-center">
//             <span className="text-gray-700 font-medium">Connection:</span>
//             <span className={`font-semibold ${isOnline ? 'text-green-600' : 'text-gray-600'}`}>
//               {isOnline ? '✅ Connected' : '📴 Offline'}
//             </span>
//           </div>

//           <div className="flex justify-between items-center">
//             <span className="text-gray-700 font-medium">Pending Changes:</span>
//             <span className={`font-semibold ${syncStatus.hasPendingOperations ? 'text-yellow-600' : 'text-green-600'}`}>
//               {syncStatus.pendingCount > 0 ? `${syncStatus.pendingCount} pending` : '✅ All synced'}
//             </span>
//           </div>
//         </div>
//       </div>

//       {/* Detailed Offline Content */}
//       <div className="space-y-6">
//         <h3 className="text-xl font-bold text-gray-800 flex items-center">
//           <span className="mr-2">💾</span>
//           Available Offline
//         </h3>

//         {/* 1. Tasks with Answers */}
//         <details open className="bg-gray-50 p-6 rounded-lg border border-gray-200">
//           <summary className="font-semibold text-gray-800 mb-3 flex items-center cursor-pointer">
//             <span className="mr-2">📝</span>
//             Tasks & Answers ({tasks.length})
//           </summary>
//           {tasks.length > 0 ? (
//             <div className="mt-4 space-y-3">
//               {tasks.map((task, idx) => (
//                 <div key={idx} className="bg-white p-4 rounded border border-gray-200">
//                   <div className="flex justify-between items-start mb-2">
//                     <div className="font-medium text-gray-800">{task.title}</div>
//                     <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
//                       {task.difficulty}
//                     </span>
//                   </div>
//                   <p className="text-sm text-gray-600 mb-2">{task.description}</p>
//                   {task.answer && (
//                     <details className="mt-2 bg-blue-50 border border-blue-200 rounded p-2">
//                       <summary className="text-sm font-semibold text-blue-700 cursor-pointer">
//                         View Answer
//                       </summary>
//                       <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
//                         {task.answer}
//                       </div>
//                     </details>
//                   )}
//                 </div>
//               ))}
//             </div>
//           ) : (
//             <p className="text-gray-600 text-sm mt-2">No tasks cached. Generate tasks while online.</p>
//           )}
//         </details>
//         {/* 2. Learning Plans (Academic + Tech) - FULL CONTENT */}
// <details open className="bg-gray-50 p-6 rounded-lg border border-gray-200">
//   <summary className="font-semibold text-gray-800 mb-3 flex items-center cursor-pointer">
//     <span className="mr-2">🎯</span>
//     Learning Plans ({Object.keys(learningContent).length})
//   </summary>
//   {Object.keys(learningContent).length > 0 ? (
//     <div className="mt-4 space-y-6">
//       {Object.entries(learningContent).map(([skillName, content]) => (
//         <details key={skillName} className="bg-white rounded-lg border-2 border-blue-200">
//           <summary className="font-bold text-gray-800 p-4 cursor-pointer hover:bg-blue-50 rounded-t-lg flex items-center justify-between">
//             <span>📚 {skillName}</span>
//             <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
//               Click to expand
//             </span>
//           </summary>
          
//           <div className="p-4 bg-blue-50 space-y-4">
//             {/* Learning Steps */}
//             {content.learningSteps && content.learningSteps.length > 0 && (
//               <div>
//                 <h5 className="font-semibold text-gray-700 mb-2 flex items-center">
//                   📋 Learning Steps ({content.learningSteps.length})
//                 </h5>
//                 <div className="space-y-2">
//                   {content.learningSteps.map((step, idx) => (
//                     <details key={idx} className="bg-white p-3 rounded border border-blue-200">
//                       <summary className="cursor-pointer font-medium text-gray-800">
//                         <span className="text-blue-600 font-bold">{step.step}.</span> {step.title}
//                       </summary>
//                       <div className="mt-2 pl-6 space-y-2">
//                         <p className="text-sm text-gray-700">{step.description}</p>
//                         {step.resources && (
//                           <div className="text-xs bg-gray-50 p-2 rounded">
//                             <strong>🔧 Tools:</strong> {step.resources}
//                           </div>
//                         )}
//                         <div className="flex items-center text-xs text-gray-500 space-x-3">
//                           <span>⏱️ {step.estimatedDays} days</span>
//                           {step.offline && <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded">📴 Offline OK</span>}
//                         </div>
//                       </div>
//                     </details>
//                   ))}
//                 </div>
//               </div>
//             )}

//             {/* Practice Exercises */}
//             {content.practiceExercises && content.practiceExercises.length > 0 && (
//               <div>
//                 <h5 className="font-semibold text-gray-700 mb-2 flex items-center">
//                   💪 Practice Exercises ({content.practiceExercises.length})
//                 </h5>
//                 <div className="space-y-2">
//                   {content.practiceExercises.map((ex, idx) => (
//                     <div key={idx} className="bg-white p-3 rounded border border-purple-200">
//                       <div className="font-semibold text-gray-800">{ex.title}</div>
//                       <p className="text-sm text-gray-600 mt-1">{ex.description}</p>
//                       <div className="flex items-center mt-2 text-xs text-gray-500 space-x-2">
//                         <span className={`px-2 py-0.5 rounded ${
//                           ex.difficulty === 'Easy' ? 'bg-green-100 text-green-700' :
//                           ex.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
//                           'bg-red-100 text-red-700'
//                         }`}>{ex.difficulty}</span>
//                         <span>⏱️ {ex.estimatedTime}</span>
//                         {ex.toolsNeeded && <span>🔧 {ex.toolsNeeded}</span>}
//                       </div>
//                     </div>
//                   ))}
//                 </div>
//               </div>
//             )}

//             {/* Quick Tips */}
//             {content.quickTips && content.quickTips.length > 0 && (
//               <div>
//                 <h5 className="font-semibold text-gray-700 mb-2">💡 Quick Tips</h5>
//                 <ul className="space-y-1">
//                   {content.quickTips.map((tip, idx) => (
//                     <li key={idx} className="text-sm text-gray-700 bg-yellow-50 p-2 rounded border border-yellow-200">
//                       • {tip}
//                     </li>
//                   ))}
//                 </ul>
//               </div>
//             )}

//             {/* Free Resources */}
//             {content.freeResources && content.freeResources.length > 0 && (
//               <div>
//                 <h5 className="font-semibold text-gray-700 mb-2">
//                   🔗 Free Resources ({content.freeResources.length})
//                 </h5>
//                 <div className="space-y-2">
//                   {content.freeResources.map((res, idx) => (
//                     <div key={idx} className="bg-white p-3 rounded border border-gray-200">
//                       <div className="flex items-center justify-between mb-1">
//                         <div className="font-semibold text-gray-800">{res.name}</div>
//                         <div className="flex items-center space-x-2">
//                           <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">{res.type}</span>
//                           {res.offline && <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">📴 Offline</span>}
//                         </div>
//                       </div>
//                       <p className="text-sm text-gray-600 mb-1">{res.description}</p>
//                       {res.url && res.url !== 'Available offline' && (
//                         <a 
//                           href={res.url} 
//                           target="_blank" 
//                           rel="noopener noreferrer" 
//                           className="text-xs text-blue-600 hover:underline inline-block"
//                         >
//                           🔗 Open Resource
//                         </a>
//                       )}
//                     </div>
//                   ))}
//                 </div>
//               </div>
//             )}

//             {/* Career Opportunities (for tech skills) */}
//             {content.careerOpportunities && content.careerOpportunities.length > 0 && (
//               <div className="bg-gradient-to-r from-yellow-50 to-orange-50 p-4 rounded-lg border border-yellow-200">
//                 <h5 className="font-semibold text-gray-700 mb-2 flex items-center">
//                   <span className="mr-2">💼</span>
//                   Career Opportunities
//                 </h5>
//                 <ul className="space-y-1">
//                   {content.careerOpportunities.map((opp, idx) => (
//                     <li key={idx} className="text-sm text-gray-700">
//                       ✅ {opp}
//                     </li>
//                   ))}
//                 </ul>
//               </div>
//             )}

//             {/* Milestones */}
//             {content.milestones && content.milestones.length > 0 && (
//               <div>
//                 <h5 className="font-semibold text-gray-700 mb-2">🏆 Learning Milestones</h5>
//                 <div className="grid grid-cols-2 gap-2">
//                   {content.milestones.map((milestone, idx) => (
//                     <div key={idx} className="bg-green-50 p-2 rounded border border-green-200">
//                       <div className="text-xs font-bold text-green-700">{milestone.progress}% Complete</div>
//                       <div className="text-xs text-gray-600 mt-1">{milestone.achievement}</div>
//                     </div>
//                   ))}
//                 </div>
//               </div>
//             )}

//             {/* Offline Note */}
//             <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
//               ℹ️ <strong>Offline Access:</strong> All this content is stored locally and accessible without internet!
//             </div>
//           </div>
//         </details>
//       ))}
//     </div>
//   ) : (
//     <p className="text-gray-600 text-sm mt-2">No learning plans cached. Generate learning plans while online.</p>
//   )}
// </details>
// {/* 3. AI Tutor Chat History */}
// <details open className="bg-gray-50 p-6 rounded-lg border border-gray-200">
//   <summary className="font-semibold text-gray-800 mb-3 flex items-center cursor-pointer">
//     <span className="mr-2">💬</span>
//     AI Tutor Conversations ({chatMessages.length} messages)
//   </summary>
//   {chatMessages.length > 1 ? (
//     <div className="mt-4 space-y-3">
//       {chatMessages.map((msg, idx) => (
//         <details 
//           key={idx} 
//           className={`rounded-lg border-2 ${
//             msg.role === 'user' 
//               ? 'border-green-200 bg-green-50' 
//               : 'border-blue-200 bg-blue-50'
//           }`}
//         >
//           <summary className="cursor-pointer p-3 font-medium text-gray-800 hover:bg-white/50 rounded-t-lg">
//             <span className="mr-2">{msg.role === 'user' ? '👤' : '🤖'}</span>
//             {msg.role === 'user' ? 'You' : 'AI Tutor'} - {msg.content.substring(0, 80)}...
//           </summary>
//           <div className={`p-4 border-t-2 ${
//             msg.role === 'user' ? 'border-green-200' : 'border-blue-200'
//           }`}>
//             <div className="text-sm text-gray-700 whitespace-pre-wrap bg-white p-3 rounded border border-gray-200">
//               {msg.content}
//             </div>
//           </div>
//         </details>
//       ))}
//       {chatMessages.length > 20 && (
//         <p className="text-xs text-center text-gray-500 pt-2">
//           Showing all {chatMessages.length} messages
//         </p>
//       )}
//     </div>
//   ) : (
//     <p className="text-gray-600 text-sm mt-2">No chat history yet. Start chatting with your AI tutor!</p>
//   )}
// </details>
        

//         {/* 4. Skills Data */}
//         <details className="bg-gray-50 p-6 rounded-lg border border-gray-200">
//   <summary className="font-semibold text-gray-800 mb-3 flex items-center justify-between cursor-pointer hover:text-green-600 transition">
//     <div className="flex items-center">
//       <span className="mr-2">📈</span>
//       Skills Assessment ({(() => {
//         let count = 0;
//         if (skills.academic) count += Object.keys(skills.academic).length;
//         if (skills.technology) count += Object.keys(skills.technology).length;
//         return count;
//       })()})
//     </div>
//     <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-medium">
//       Click to expand
//     </span>
//   </summary>
//   <div className="mt-4 space-y-4">
//     {/* Academic Skills */}
//     {skills.academic && Object.keys(skills.academic).length > 0 && (
//       <details open className="bg-white rounded-lg border-2 border-blue-200 p-4">
//         <summary className="cursor-pointer font-semibold text-blue-700 mb-3 hover:text-blue-800 flex items-center justify-between">
//           <span>📚 Academic Skills ({Object.keys(skills.academic).length})</span>
//           <span className="text-xs bg-blue-50 px-2 py-1 rounded">Expand/Collapse</span>
//         </summary>
//         <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
//           {Object.entries(skills.academic).map(([skill, score]) => (
//             <div key={skill} className="bg-blue-50 p-3 rounded-lg border border-blue-200 hover:shadow-md transition">
//               <div className="text-sm font-medium text-gray-800 mb-1">{skill}</div>
//               <div className="flex items-center justify-between">
//                 <div className="text-lg font-bold text-blue-600">{score}%</div>
//                 <div className="h-2 flex-1 bg-gray-200 rounded-full overflow-hidden ml-2">
//                   <div 
//                     style={{ width: `${score}%` }}
//                     className={`h-2 rounded-full transition-all ${
//                       score >= 80 ? 'bg-green-500' : 
//                       score >= 60 ? 'bg-blue-500' : 
//                       score >= 40 ? 'bg-yellow-500' : 'bg-red-500'
//                     }`}
//                   ></div>
//                 </div>
//               </div>
//             </div>
//           ))}
//         </div>
//       </details>
//     )}
    
//     {/* Technology Skills */}
//     {skills.technology && Object.keys(skills.technology).length > 0 && (
//       <details open className="bg-white rounded-lg border-2 border-green-200 p-4">
//         <summary className="cursor-pointer font-semibold text-green-700 mb-3 hover:text-green-800 flex items-center justify-between">
//           <span>💻 Technology Skills ({Object.keys(skills.technology).length})</span>
//           <span className="text-xs bg-green-50 px-2 py-1 rounded">Expand/Collapse</span>
//         </summary>
//         <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
//           {Object.entries(skills.technology).map(([skill, score]) => (
//             <div key={skill} className="bg-green-50 p-3 rounded-lg border border-green-200 hover:shadow-md transition">
//               <div className="text-sm font-medium text-gray-800 mb-1 flex items-center">
//                 <span className="mr-1">{getTechSkillIcon(skill)}</span>
//                 <span>{skill}</span>
//               </div>
//               <div className="flex items-center justify-between">
//                 <div className="text-lg font-bold text-green-600">{score}%</div>
//                 <div className="h-2 flex-1 bg-gray-200 rounded-full overflow-hidden ml-2">
//                   <div 
//                     style={{ width: `${score}%` }}
//                     className={`h-2 rounded-full transition-all ${
//                       score >= 80 ? 'bg-emerald-500' : 
//                       score >= 60 ? 'bg-green-500' : 
//                       score >= 40 ? 'bg-yellow-500' : 'bg-orange-500'
//                     }`}
//                   ></div>
//                 </div>
//               </div>
//             </div>
//           ))}
//         </div>
//       </details>
//     )}
    
//     {(!skills.academic && !skills.technology) && (
//       <p className="text-gray-600 text-sm">No skills data cached. Analyze skills while online.</p>
//     )}

//     {/* Skills Summary */}
//     {(skills.academic || skills.technology) && (
//       <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-lg border border-purple-200 mt-4">
//         <h4 className="font-semibold text-gray-800 mb-2">📊 Skills Summary</h4>
//         <div className="grid grid-cols-2 gap-3 text-sm">
//           <div className="bg-white p-2 rounded">
//             <span className="text-gray-600">Academic Average:</span>
//             <span className="font-bold text-blue-700 ml-2">
//               {skills.academic ? Math.round(Object.values(skills.academic).reduce((a,b) => a+b, 0) / Object.values(skills.academic).length) : 0}%
//             </span>
//           </div>
//           <div className="bg-white p-2 rounded">
//             <span className="text-gray-600">Tech Average:</span>
//             <span className="font-bold text-green-700 ml-2">
//               {skills.technology ? Math.round(Object.values(skills.technology).reduce((a,b) => a+b, 0) / Object.values(skills.technology).length) : 0}%
//             </span>
//           </div>
//         </div>
//       </div>
//     )}
//   </div>
// </details>
//         {/* 5. Profile Data */}
//         <details className="bg-gray-50 p-6 rounded-lg border border-gray-200">
//   <summary className="font-semibold text-gray-800 mb-3 flex items-center justify-between cursor-pointer hover:text-green-600 transition">
//     <div className="flex items-center">
//       <span className="mr-2">👤</span>
//       Profile Information
//     </div>
//     <span className="text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded-full font-medium">
//       Click to expand
//     </span>
//   </summary>
//   <div className="mt-4 space-y-4">
//     {/* Basic Info */}
//     <details open className="bg-white rounded-lg border-2 border-gray-200 p-4">
//       <summary className="cursor-pointer font-semibold text-gray-700 mb-3 hover:text-gray-800 flex items-center justify-between">
//         <span>📋 Basic Information</span>
//         <span className="text-xs bg-gray-50 px-2 py-1 rounded">Expand/Collapse</span>
//       </summary>
//       <div className="space-y-3 mt-3">
//         <div className="flex items-center p-2 bg-gray-50 rounded border border-gray-200">
//           <span className="text-xs font-semibold text-gray-600 w-32">Name:</span>
//           <span className="text-sm text-gray-800 font-medium">{studentProfile?.name || 'N/A'}</span>
//         </div>
//         <div className="flex items-center p-2 bg-gray-50 rounded border border-gray-200">
//           <span className="text-xs font-semibold text-gray-600 w-32">Email:</span>
//           <span className="text-sm text-gray-800">{user?.email || 'N/A'}</span>
//         </div>
//         <div className="flex items-center p-2 bg-gray-50 rounded border border-gray-200">
//           <span className="text-xs font-semibold text-gray-600 w-32">Country:</span>
//           <span className="text-sm text-gray-800 flex items-center">
//             <span className="mr-2">🌍</span>
//             {studentProfile?.country || 'N/A'}
//           </span>
//         </div>
//         <div className="flex items-center p-2 bg-gray-50 rounded border border-gray-200">
//           <span className="text-xs font-semibold text-gray-600 w-32">System:</span>
//           <span className="text-sm text-gray-800 flex items-center">
//             <span className="mr-2">🎓</span>
//             {studentProfile?.educationalSystem || 'N/A'}
//           </span>
//         </div>
//       </div>
//     </details>

//     {/* Academic Profile */}
//     <details open className="bg-white rounded-lg border-2 border-green-200 p-4">
//       <summary className="cursor-pointer font-semibold text-green-700 mb-3 hover:text-green-800 flex items-center justify-between">
//         <span>💪 Strengths & Areas for Growth</span>
//         <span className="text-xs bg-green-50 px-2 py-1 rounded">Expand/Collapse</span>
//       </summary>
//       <div className="space-y-3 mt-3">
//         <div>
//           <div className="text-xs font-semibold text-gray-600 mb-2 flex items-center">
//             <span className="mr-1">✅</span>
//             Strengths:
//           </div>
//           <div className="text-sm text-gray-800 bg-green-50 p-3 rounded-lg border border-green-200">
//             {studentProfile?.strengths || 'Not specified'}
//           </div>
//         </div>
//         <div>
//           <div className="text-xs font-semibold text-gray-600 mb-2 flex items-center">
//             <span className="mr-1">🎯</span>
//             Areas for Improvement:
//           </div>
//           <div className="text-sm text-gray-800 bg-blue-50 p-3 rounded-lg border border-blue-200">
//             {studentProfile?.weaknesses || 'Not specified'}
//           </div>
//         </div>
//       </div>
//     </details>

//     {/* Account Info */}
//     <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg border border-blue-200">
//       <h4 className="font-semibold text-gray-800 mb-2 flex items-center">
//         <span className="mr-2">📅</span>
//         Account Details
//       </h4>
//       <div className="text-sm text-gray-700">
//         <span className="font-medium">Member since:</span>
//         <span className="ml-2">
//           {studentProfile?.createdAt 
//             ? new Date(studentProfile.createdAt).toLocaleDateString('en-US', {
//                 year: 'numeric',
//                 month: 'long',
//                 day: 'numeric'
//               })
//             : 'Unknown'}
//         </span>
//       </div>
//     </div>
//   </div>
// </details>

       
//       </div>

//       {/* Info Box */}
//       <div className="mt-8 bg-gradient-to-r from-blue-50 to-green-50 border-2 border-blue-200 p-6 rounded-lg">
//         <h4 className="font-semibold text-blue-800 mb-3 flex items-center">
//           <span className="mr-2">💡</span>
//           Offline Mode Features
//         </h4>
//         <div className="grid md:grid-cols-2 gap-4">
//           <ul className="text-sm text-blue-700 space-y-2">
//             <li className="flex items-start">
//               <span className="mr-2">✅</span>
//               <span><strong>Tasks with Solutions:</strong> All generated tasks include step-by-step answers</span>
//             </li>
//             <li className="flex items-start">
//               <span className="mr-2">✅</span>
//               <span><strong>Learning Plans:</strong> Complete skill development roadmaps with exercises</span>
//             </li>
//             <li className="flex items-start">
//               <span className="mr-2">✅</span>
//               <span><strong>Chat History:</strong> Your entire AI tutor conversation saved locally</span>
//             </li>
//           </ul>
//           <ul className="text-sm text-blue-700 space-y-2">
//             <li className="flex items-start">
//               <span className="mr-2">✅</span>
//               <span><strong>Skills Data:</strong> Academic and technology skill assessments</span>
//             </li>
//             <li className="flex items-start">
//               <span className="mr-2">✅</span>
//               <span><strong>Profile Access:</strong> View your complete profile anytime</span>
//             </li>
//             <li className="flex items-start">
//               <span className="mr-2">✅</span>
//               <span><strong>Auto-Sync:</strong> Changes sync automatically when you reconnect</span>
//             </li>
//           </ul>
//         </div>
        
//         <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
//           <p className="text-sm text-yellow-800">
//             <strong>📴 Note:</strong> AI features (generating new tasks, skills analysis, creating learning plans) 
//             require an internet connection. However, all previously generated content remains accessible offline.
//           </p>
//         </div>
//       </div>

//       {/* Storage Management */}
//       <div className="mt-6 bg-gray-50 p-6 rounded-lg border border-gray-200">
//         <h4 className="font-semibold text-gray-800 mb-3 flex items-center">
//           <span className="mr-2">🗄️</span>
//           Storage Management
//         </h4>
//         <div className="flex items-center justify-between">
//           <div>
//             <p className="text-sm text-gray-700 mb-1">
//               Your offline data is stored securely in your browser's local storage.
//             </p>
//             <p className="text-xs text-gray-500">
//               Last updated: {new Date().toLocaleString()}
//             </p>
//           </div>
//           <button
//   onClick={async () => {
//     const stats = await getCacheStats(user.uid);
//     console.log('📦 Cache statistics:', stats);
    
//     if (stats) {
//       alert(`
// 📦 Cached Data Summary:

// 📝 Tasks: ${stats.tasks.count} (${stats.tasks.withAnswers} with answers)
// 📈 Skills: ${stats.skills.total} (${stats.skills.academic} academic, ${stats.skills.technology} tech)
// 🎯 Learning Plans: ${stats.learningPaths.count}
// 💬 Chat Messages: ${stats.chatMessages.count}
// 🏆 Achievements: ${stats.achievements.count}
// 👤 Profile: ${stats.profile.cached ? 'Cached' : 'Not cached'}

// Last updated: ${new Date(stats.lastUpdated).toLocaleString()}
//       `.trim());
//     } else {
//       alert('Failed to load cache statistics');
//     }
//   }}
//   className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition text-sm"
// >
//   🔍 Check Cache
// </button>

          
//         </div>
//       </div>
//     </div>
//   </div>
// )}
// </main>
//     </div>
//   );
// }





































































