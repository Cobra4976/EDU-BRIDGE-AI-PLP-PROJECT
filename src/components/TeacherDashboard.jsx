import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { cacheAIResponse, getCachedAIResponses, clearOldCache } from "../utils/pwaHelpers";
import { 
  hasFeatureAccess, 
  canMakeAIQuery, 
  incrementQueryCount,
  getDaysRemaining,
  isSubscriptionExpired,
  getSubscriptionDisplayInfo,
  TIERS,
  STATUS
} from "../utils/subscriptionHelpers";
import {
  POST_TYPES,
  createCommunityPost,
  subscribeToCommunityPosts,
  toggleLikePost,
  addComment,
  subscribeToComments,
  flagPost,
  formatPostTime
} from "../utils/communityHelpers";
import {
  generateInviteCode,
  removeTeacherFromSchool,
  getSchoolDetails,
  getSchoolStats,
  copyInviteLink
} from "../utils/schoolManagementHelpers";
/**
 * TeacherDashboard - with full offline PWA support
 *
 * Props:
 *  - user: Firebase user object (required)
 *  - teacherProfile: optional pre-fetched profile object (from App.jsx)
 *  - onLogout: optional callback to sign the user out
 */
export default function TeacherDashboard({ user, teacherProfile: initialProfile = null, onLogout }) {
  const [teacherProfile, setTeacherProfile] = useState(
    initialProfile || {
      name: "",
      country: "",
      educationalSystem: "",
      subjectArea: "",
      gradeLevel: "",
      contactInfo: "",
    }
  );

  const [loadingProfile, setLoadingProfile] = useState(!initialProfile);
  const [profileError, setProfileError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  const [profileData, setProfileData] = useState({
    name: initialProfile?.name || "",
    email: user?.email || "",
    country: initialProfile?.country || "",
    educationalSystem: initialProfile?.educationalSystem || "",
    subjectArea: initialProfile?.subjectArea || "",
    gradeLevel: initialProfile?.gradeLevel || "",
    contactInfo: initialProfile?.contactInfo || "",
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  // AI assistant state
  const [aiResponse, setAiResponse] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");

  // Offline cache state
  const [cachedResponses, setCachedResponses] = useState([]);
  const [selectedCachedResponse, setSelectedCachedResponse] = useState(null);

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Install prompt state
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallButton, setShowInstallButton] = useState(false);

  

  const educationalSystems = {
    "Kenya": ["CBC (Competency-Based Curriculum)", "8-4-4 System (Legacy)"],
    "Nigeria": ["6-3-3-4 System", "Universal Basic Education (UBE)"],
    "South Africa": ["CAPS (Curriculum and Assessment Policy)", "National Senior Certificate (NSC)"],
    "Ghana": ["Basic Education Certificate Examination (BECE)", "West African Senior School Certificate (WASSCE)"],
    "Tanzania": ["Primary Education (7 years)", "O-Level & A-Level System"],
    "Uganda": ["Primary Leaving Examination (PLE)", "Uganda Certificate of Education (UCE)"],
    "Rwanda": ["Competency-Based Curriculum", "Rwanda Education Board System"],
    "Ethiopia": ["General Education (Grades 1-12)", "Ethiopian General Secondary Education Certificate"]
  };

  const curriculumKnowledge = {
    "CBC (Competency-Based Curriculum)": {
      structure: "2-6-3-3-3: 2 years Pre-Primary, 6 years Primary, 3 years Junior Secondary, 3 years Senior Secondary, 3 years University",
      keyFeatures: [
        "Competency-based assessment focusing on skills mastery",
        "Continuous Assessment Tests (CATs) throughout the term",
        "Formative and summative assessments",
        "Learning pathways: Academic track and Technical/Vocational track",
        "Integration of values, life skills, and citizenship education",
        "Project-based learning and portfolio assessment"
      ],
      assessmentTypes: ["Formative Assessment (ongoing)", "Summative Assessment (end of term)", "Portfolio Assessment", "Project-Based Assessment"],
      gradeStructure: "Pre-Primary 1-2, Primary Grades 1-6, Junior Secondary Grades 7-9, Senior Secondary Grades 10-12"
    },
    "8-4-4 System (Legacy)": {
      structure: "8 years Primary, 4 years Secondary, 4 years University",
      keyFeatures: [
        "KCPE (Kenya Certificate of Primary Education) at end of primary",
        "KCSE (Kenya Certificate of Secondary Education) at end of secondary",
        "Exam-focused curriculum",
        "Streaming based on performance"
      ],
      assessmentTypes: ["Continuous Assessment Tests", "Mock Exams", "National Examinations (KCPE, KCSE)"],
      gradeStructure: "Standard 1-8, Form 1-4"
    },
    "6-3-3-4 System": {
      structure: "6 years Primary, 3 years Junior Secondary (JSS), 3 years Senior Secondary (SSS), 4 years University",
      keyFeatures: [
        "Basic Education Certificate Examination (BECE) after JSS",
        "WAEC/NECO examinations after SSS",
        "Continuous Assessment (CA) worth 40% of final grade",
        "Terminal examinations worth 60%",
        "Emphasis on technical and vocational subjects",
        "Subject combinations for science, arts, and commercial tracks"
      ],
      assessmentTypes: ["Continuous Assessment (CA) 40%", "Terminal Examination 60%", "Practical Assessments"],
      gradeStructure: "Primary 1-6, JSS 1-3, SSS 1-3"
    },
    "Universal Basic Education (UBE)": {
      structure: "9 years basic education (6 Primary + 3 JSS), 3 years SSS",
      keyFeatures: [
        "Free and compulsory basic education",
        "Skills acquisition and entrepreneurship",
        "Continuous assessment system",
        "Basic Education Certificate Examination"
      ],
      assessmentTypes: ["School-Based Assessment", "National Common Entrance", "BECE"],
      gradeStructure: "Basic 1-9, Senior Secondary 1-3"
    },
    "CAPS (Curriculum and Assessment Policy)": {
      structure: "Grade R-12 system with three phases",
      keyFeatures: [
        "National Senior Certificate (NSC) at Grade 12",
        "School-Based Assessment (SBA) worth 25%",
        "Final examinations worth 75%",
        "Common Assessment Tasks (CATs)",
        "Annual National Assessments (ANA)",
        "Subject choice streams: Sciences, Commerce, Arts"
      ],
      assessmentTypes: ["SBA 25%", "Final Examination 75%", "Portfolio Assessment", "Practical Assessment Tasks (PATs)"],
      gradeStructure: "Foundation Phase (R-3), Intermediate Phase (4-6), Senior Phase (7-9), FET Phase (10-12)"
    }
  };

  const tabContexts = {
    "ai-assistant": "Assist with lesson planning, teaching strategies, and educational queries specific to African curricula",
    "student-progress": "Analyze student progress, suggest interventions for struggling learners within the context of African classrooms",
    "assignments": "Help create curriculum-aligned assignments, rubrics, and assessment strategies",
    "community": "Connect teachers with professional networks and development opportunities in their country",
    "offline": "Access offline features and manage cached content for use without internet connection"
  };
 // Subscription state
  const [queryCheck, setQueryCheck] = useState({ canQuery: true, remaining: -1, message: '' });
  const [showUpgradeModal, setShowUpgradeModal] = useState(false); 
// Community state
const [communityPosts, setCommunityPosts] = useState([]);
const [showCreatePost, setShowCreatePost] = useState(false);
const [newPost, setNewPost] = useState({
  type: POST_TYPES.DISCUSSION,
  title: '',
  content: '',
  resourceLink: '',
  tags: []
});
const [communityFilters, setCommunityFilters] = useState({
  country: '',
  subject: '',
  postType: ''
});
const [selectedPost, setSelectedPost] = useState(null);
const [postComments, setPostComments] = useState([]);
const [newComment, setNewComment] = useState('');
const [isSubmittingPost, setIsSubmittingPost] = useState(false);
// Trial activation state
const [isActivatingTrial, setIsActivatingTrial] = useState(false);
const [schoolData, setSchoolData] = useState(null);
const [schoolTeachers, setSchoolTeachers] = useState([]);
const [schoolStats, setSchoolStats] = useState(null);
const [inviteLink, setInviteLink] = useState('');
const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);
const [isLoadingSchool, setIsLoadingSchool] = useState(false);

// Subscribe to community posts
useEffect(() => {
  if (activeTab === 'community') {
    const unsubscribe = subscribeToCommunityPosts(communityFilters, (posts) => {
      setCommunityPosts(posts);
    });
    
    return () => unsubscribe();
  }
}, [activeTab, communityFilters]);

// Subscribe to comments when a post is selected
useEffect(() => {
  if (selectedPost) {
    const unsubscribe = subscribeToComments(selectedPost.id, (comments) => {
      setPostComments(comments);
    });
    
    return () => unsubscribe();
  }
}, [selectedPost]);
  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      
    };
    const handleOffline = () => {
      setIsOnline(false);
      
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load cached responses on mount and when switching to offline tab
  useEffect(() => {
    if (activeTab === 'offline') {
      loadCachedResponses();
      clearOldCache(); // Clean up old cache
    }
  }, [activeTab]);

  // Setup install prompt
  useEffect(() => {
    let deferredPrompt;

    const handleBeforeInstall = (e) => {
      e.preventDefault();
      deferredPrompt = e;
      setInstallPrompt(deferredPrompt);
      setShowInstallButton(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const loadCachedResponses = () => {
    const cached = getCachedAIResponses();
    setCachedResponses(cached);
  };

  const handleInstallClick = async () => {
    if (!installPrompt) return;

    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    
    if (outcome === 'accepted') {
      
      setShowInstallButton(false);
    }
    
    setInstallPrompt(null);
  };

  useEffect(() => {
    if (initialProfile) {
      setTeacherProfile(initialProfile);
      setProfileData((prev) => ({
        ...prev,
        name: initialProfile.name || "",
        country: initialProfile.country || "",
        educationalSystem: initialProfile.educationalSystem || "",
        subjectArea: initialProfile.subjectArea || "",
        gradeLevel: initialProfile.gradeLevel || "",
        contactInfo: initialProfile.contactInfo || "",
      }));
      setLoadingProfile(false);
    }
  }, [initialProfile]);

  useEffect(() => {
    let cancelled = false;
    async function fetchProfile() {
      if (!user?.uid) return;
      if (initialProfile) return;
      setLoadingProfile(true);
      setProfileError("");
      try {
        const teacherRef = doc(db, "teachers", user.uid);
        const snap = await getDoc(teacherRef);
        if (!cancelled) {
          if (snap.exists()) {
            const data = snap.data();
            setTeacherProfile(data);
            setProfileData((prev) => ({
              ...prev,
              name: data.name || "",
              email: user?.email || prev.email,
              country: data.country || "",
              educationalSystem: data.educationalSystem || "",
              subjectArea: data.subjectArea || "",
              gradeLevel: data.gradeLevel || "",
              contactInfo: data.contactInfo || "",
            }));
          } else {
            setProfileError("⚠️ Profile not found. Complete your profile form first.");
          }
        }
      } catch (err) {
        console.error("Error fetching teacher profile:", err);
        if (!cancelled) setProfileError("Failed to load profile.");
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    }
    fetchProfile();
    return () => { cancelled = true; };
  }, [user, initialProfile]);
  // Check if subscription expired
  useEffect(() => {
    if (teacherProfile.subscriptionExpiry && teacherProfile.subscriptionStatus !== STATUS.EXPIRED) {
      const expired = isSubscriptionExpired(teacherProfile.subscriptionExpiry);
      if (expired && (teacherProfile.subscriptionStatus === STATUS.TRIAL || teacherProfile.subscriptionStatus === STATUS.ACTIVE)) {
        // Subscription expired - would normally update in Firestore here
        // For now, just update local state
        
      }
    }
  }, [teacherProfile]);


  const handleChange = (e) => {
    const { name, value } = e.target;
    setProfileData((p) => ({ ...p, [name]: value }));
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    setSaveMessage("");
    try {
      if (!user?.uid) throw new Error("User not authenticated.");
      const teacherRef = doc(db, "teachers", user.uid);

      const updatedProfile = {
        ...profileData,
        email: profileData.email || user?.email || "",
        updatedAt: new Date().toISOString(),
        // Initialize subscription fields if they don't exist
      subscriptionTier: profileData.subscriptionTier || TIERS.FREE,
      subscriptionStatus: STATUS.ACTIVE,
      subscriptionExpiry: profileData.subscriptionExpiry || null,
      trialUsed: profileData.trialUsed || false,
      dailyQueryCount: profileData.dailyQueryCount || 0,
      lastQueryDate: profileData.lastQueryDate || "",
      timezone: profileData.timezone || "Africa/Nairobi",
     
      };

      await setDoc(teacherRef, updatedProfile, { merge: true });

      setTeacherProfile(updatedProfile);
      setSaveMessage("✅ Profile updated successfully!");
    } catch (err) {
      console.error("Error updating profile:", err);
      setSaveMessage("❌ Failed to update profile. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };
const generateAIResponse = async (prompt, contextType) => {
  if (!prompt || !prompt.trim()) {
    alert("Please enter a question or request.");
    return;
  }

  // Check if user can make a query (subscription + daily limit check)
  const checkResult = await canMakeAIQuery(
    user.uid, 
    teacherProfile.subscriptionTier || TIERS.FREE,
    teacherProfile.subscriptionStatus || STATUS.ACTIVE
  );
  
  if (!checkResult.canQuery) {
    setShowUpgradeModal(true);
    alert(checkResult.message);
    return;
  }

  setAiLoading(true);
  setAiResponse("");

  const curriculumDetails = curriculumKnowledge[teacherProfile.educationalSystem] || {};
  const contextDescription = tabContexts[contextType] || "";

  const systemPrompt = `You are EduBridge AI — an expert teaching assistant built to empower African educators and support SDG 4 (Quality Education).

TEACHER PROFILE:
- Name: ${teacherProfile.name}
- Country: ${teacherProfile.country}
- Educational System: ${teacherProfile.educationalSystem}
- Subject Area: ${teacherProfile.subjectArea}
- Grade Level: ${teacherProfile.gradeLevel}

CURRICULUM CONTEXT FOR ${teacherProfile.educationalSystem}:
- Structure: ${curriculumDetails.structure || "Standard curriculum"}
- Key Features: ${curriculumDetails.keyFeatures?.join("; ") || "Standard features"}
- Assessment Types: ${curriculumDetails.assessmentTypes?.join(", ") || "Various assessments"}
- Grade Structure: ${curriculumDetails.gradeStructure || "Standard grades"}

CURRENT TASK CONTEXT: ${contextDescription}

IMPORTANT GUIDELINES:
1. Provide SPECIFIC, ACTIONABLE advice tailored to ${teacherProfile.country}'s educational context
2. Use locally relevant examples (e.g., market mathematics, agricultural scenarios, local landmarks)
3. Consider resource limitations common in African schools (large class sizes 40-60 students, limited technology)
4. Suggest low-tech alternatives and creative solutions using available materials
5. Incorporate culturally appropriate teaching methods (storytelling, oral traditions, communal learning)
6. Align all suggestions with the ${teacherProfile.educationalSystem} curriculum requirements
7. Address multilingual classroom challenges when relevant
8. Provide practical strategies that work with minimal resources
9. Include assessment methods appropriate to the curriculum system
10. Consider parent/community involvement strategies common in African contexts
11. FORMAT YOUR RESPONSES IN CLEAR, SCANNABLE STRUCTURE:
   - Use short paragraphs (2-3 sentences max)
   - Break information into bullet points and numbered lists
   - Use subheadings to organize different sections
   - Prioritize actionable items in list format
   - Keep explanations concise and direct



Your responses should be well-structured with bullet points, short paragraphs, and clear sections for easy scanning.`;

  const userPrompt = `${prompt}

Please provide comprehensive guidance considering:
- I teach ${teacherProfile.subjectArea} to ${teacherProfile.gradeLevel} students
- My school follows the ${teacherProfile.educationalSystem}
- I'm in ${teacherProfile.country}
- Context: ${contextDescription}`;

  try {
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
    
    const response = await fetch(`${BACKEND_URL}/api/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt, userPrompt, maxTokens: 4096 })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || `API Error: ${response.status}`);
    }

    const data = await response.json();
    const aiMessage = data.content?.[0]?.text || data.response || "No response received from Gemini.";
    setAiResponse(aiMessage);

    // Increment query count for free tier
    await incrementQueryCount(
      user.uid, 
      teacherProfile.subscriptionTier || TIERS.FREE
    );
    
    // Update query check display
    const newCheck = await canMakeAIQuery(
      user.uid, 
      teacherProfile.subscriptionTier || TIERS.FREE,
      teacherProfile.subscriptionStatus || STATUS.ACTIVE
    );
    setQueryCheck(newCheck);

    // Cache the response for offline access
    const cacheKey = `${contextType}-${Date.now()}`;
    const cacheData = {
      prompt: prompt,
      response: aiMessage,
      context: contextType,
      profile: {
        country: teacherProfile.country,
        system: teacherProfile.educationalSystem,
        subject: teacherProfile.subjectArea,
        grade: teacherProfile.gradeLevel
      }
    };
    
    cacheAIResponse(cacheKey, cacheData);
    
  } catch (err) {
    console.error("Claude API Error:", err);
    setAiResponse(`⚠️ Error: ${err.message}`);
  } finally {
    setAiLoading(false);
  }
};
  

// Load query check when accessing AI tabs
  useEffect(() => {
    if (['ai-assistant', 'student-progress', 'assignments'].includes(activeTab)) {
      canMakeAIQuery(
        user?.uid, 
        teacherProfile.subscriptionTier || TIERS.FREE,
        teacherProfile.subscriptionStatus || STATUS.ACTIVE
      ).then(setQueryCheck);
    }
  }, [activeTab, user, teacherProfile]);
 // Add this useEffect to load school data when admin views the tab 
useEffect(() => {
  if (activeTab === 'school-management' && 
      teacherProfile.schoolRole === 'admin' && 
      teacherProfile.schoolId) {
    loadSchoolData();
  }
}, [activeTab, teacherProfile.schoolRole, teacherProfile.schoolId]); // ✅ Watch these specific fields


const loadSchoolData = async () => {
  
  
  setIsLoadingSchool(true);
  
  try {
    // ✅ Get fresh profile from Firestore first
    const teacherRef = doc(db, "teachers", user.uid);
    const snap = await getDoc(teacherRef);
    
    if (!snap.exists()) {
      console.error('❌ Teacher profile not found');
      setIsLoadingSchool(false);
      return;
    }
    
    const freshProfile = snap.data();
    
    console.log('📊 Fresh profile data:', {
      schoolId: freshProfile.schoolId,
      schoolRole: freshProfile.schoolRole
    });
    
    if (!freshProfile.schoolId) {
      console.error('❌ No schoolId in profile');
      setIsLoadingSchool(false);
      return;
    }
    
    // ✅ Use fresh profile data for API call
    const result = await getSchoolDetails(freshProfile.schoolId, user.uid);
    
    if (result.success) {
      setSchoolData(result.school);
      setSchoolTeachers(result.teachers);
      
      // Load stats
      const statsResult = await getSchoolStats(freshProfile.schoolId);
      if (statsResult.success) {
        setSchoolStats(statsResult.stats);
      }
      
      console.log('✅ School data loaded successfully');
    } else {
      console.error('❌ Failed to load school:', result.error);
      alert('Failed to load school data: ' + result.error);
    }
  } catch (error) {
    console.error('❌ Error loading school:', error);
    alert('Error loading school: ' + error.message);
  } finally {
    setIsLoadingSchool(false);
  }
};


const handleGenerateInvite = async () => {
  setIsGeneratingInvite(true);
  try {
    const result = await generateInviteCode(user.uid);
    
    if (result.success) {
      setInviteLink(result.inviteLink);
      alert('✅ Invite link generated! Copy it to share with teachers.');
    } else {
      alert('❌ Failed to generate invite: ' + result.error);
    }
  } catch (error) {
    console.error('Error generating invite:', error);
    alert('❌ Error: ' + error.message);
  } finally {
    setIsGeneratingInvite(false);
  }
};

const handleCopyInviteLink = async () => {
  const success = await copyInviteLink(inviteLink);
  if (success) {
    alert('✅ Invite link copied to clipboard!');
  } else {
    alert('❌ Failed to copy. Please copy manually.');
  }
};

const handleRemoveTeacher = async (teacherId, teacherName) => {
  if (!confirm(`Remove ${teacherName} from your school license?\n\nThey will be downgraded to free tier immediately.`)) {
    return;
  }

  try {
    const result = await removeTeacherFromSchool(user.uid, teacherId);
    
    if (result.success) {
      alert(`✅ ${teacherName} removed from school`);
      // Reload school data
      await loadSchoolData();
    } else {
      alert('❌ Failed to remove teacher: ' + result.error);
    }
  } catch (error) {
    console.error('Error removing teacher:', error);
    alert('❌ Error: ' + error.message);
  }
};

  const handleLogout = async () => {
    if (onLogout) {
      setIsLoggingOut(true);
      try {
        await onLogout();
      } catch (err) {
        console.error("Logout callback error:", err);
        alert("Failed to logout. Please try again.");
      } finally {
        setIsLoggingOut(false);
      }
    } else {
      console.warn("onLogout callback not provided. Provide a function that calls signOut(auth).");
    }
  };

  const primaryBg = "bg-[#2e7d32] hover:bg-[#43a047] text-white";

  if (loadingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#2e7d32] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-gray-800">Loading profile...</div>
        </div>
      </div>
    );
  }

  if (profileError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-6">
        <div className="w-full max-w-lg bg-white border border-green-100 p-8 rounded-xl shadow">
          <h2 className="text-2xl font-semibold mb-4 text-[#2e7d32]">Profile missing</h2>
          <p className="text-sm text-gray-700 mb-4">{profileError}</p>
          <p className="text-sm text-gray-600 mb-6">
            If you just signed up, return to the app and complete your profile form so this dashboard can load your data.
          </p>
          <div className="flex gap-3">
            <button onClick={() => window.location.reload()} className="px-4 py-2 rounded bg-[#2e7d32] text-white">Reload</button>
            <button onClick={() => { if (onLogout) onLogout(); }} className="px-4 py-2 rounded border border-green-300 text-[#2e7d32]">Sign Out</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <nav className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row justify-between items-center shadow-sm gap-3 sm:gap-0">
        <div className="flex items-center gap-3">
          <div className="text-2xl font-bold text-[#2e7d32]">🌍 EduBridge Africa</div>
          <div className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
            Powered by Edubridge AI
          </div>
          {!isOnline && (
            <div className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full font-medium">
              📡 Offline Mode
            </div>
          )}
        </div>
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
         className={`px-4 sm:px-6 py-2 rounded-lg font-medium transition text-sm sm:text-base ${isLoggingOut ? "bg-gray-400 cursor-not-allowed text-white" : primaryBg}`} 
        >
          {isLoggingOut ? 'Signing out...' : 'Sign Out'}
        </button>
      </nav>

      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-3 sm:px-6">
          <nav className="flex space-x-1 overflow-x-auto scrollbar-hide pb-2">
            {[
              { id: "overview", label: "Overview", icon: "📊" },
              { id: "profile", label: "Profile", icon: "👤" },
              { id: "ai-assistant", label: "AI Assistant", icon: "🤖" },
              { id: "student-progress", label: "Student Progress", icon: "📈" },
              { id: "assignments", label: "Assignments", icon: "📝" },
              { id: "community", label: "Teacher Community", icon: "👥" },
              { id: "offline", label: "Offline", icon: "📡" },
              { id: "subscription", label: "Subscription", icon: "💳" },
              { id: "school-management", label: "School Management", icon: "🏫" }
              // // Add School Management tab conditionally
              //  ...(teacherProfile?.schoolRole === 'admin' ? [
              //  { id: "school-management", label: "School Management", icon: "🏫" }
              //   ] : [])
  ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setAiResponse("");
                  setAiPrompt("");
                  setSelectedCachedResponse(null);
                }}
                className={`px-4 py-3 font-medium transition whitespace-nowrap text-sm ${activeTab === tab.id ? "border-b-2 border-[#2e7d32] text-[#2e7d32]" : "text-gray-600 hover:text-[#2e7d32]" }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
        {activeTab === "overview" && (
          <div className="space-y-6">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-800">Welcome back, {teacherProfile?.name || "Teacher"}!</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
              {[
                { label: "Country", value: teacherProfile?.country, icon: "🌍" },
                { label: "Educational System", value: teacherProfile?.educationalSystem, icon: "📚" },
                { label: "Subject Area", value: teacherProfile?.subjectArea, icon: "📖" },
                { label: "Grade Level", value: teacherProfile?.gradeLevel, icon: "🎓" },
              ].map((item, idx) => (
                <div key={idx} className="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-500 hover:shadow-lg transition">
                  <div className="text-3xl mb-2">{item.icon}</div>
                  <div className="text-sm font-semibold text-gray-600 mb-2">{item.label}</div>
                  <div className="text-lg font-bold text-gray-800">{item.value || "Not specified"}</div>
                </div>
              ))}
            </div>

            <div className="bg-gradient-to-r from-green-50 to-white border-l-4 border-green-300 p-6 rounded-lg">
              <h3 className="font-bold text-[#2e7d32] mb-2">💡 About This Dashboard</h3>
              <p className="text-gray-800 mb-3">
                This dashboard is powered by Edubridge AI with deep, contextual knowledge of African educational systems:
              </p>
              <ul className="list-disc list-inside text-gray-800 space-y-1 text-sm">
                <li>CBC (Kenya), 6-3-3-4 (Nigeria), CAPS (South Africa), and more</li>
                <li>Curriculum-specific lesson planning and assessment strategies</li>
                <li>Culturally relevant teaching methods for African contexts</li>
                <li>Solutions for large class sizes and resource-limited environments</li>
                <li>Works offline with PWA support for uninterrupted access</li>
              </ul>
            </div>

            {showInstallButton && (
              <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-lg">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-blue-800 mb-2">📲 Install EduBridge App</h3>
                    <p className="text-sm text-blue-800 mb-3">
                      Install EduBridge on your device for faster access and offline capabilities!
                    </p>
                  </div>
                  <button
                    onClick={handleInstallClick}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition whitespace-nowrap"
                  >
                    Install Now
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "profile" && (
          <div className="max-w-3xl mx-auto bg-white p-8 rounded-xl shadow-lg">
            <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">👤 Edit Profile</h2>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
                <input type="email" name="email" value={profileData.email || ""} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#2e7d32] outline-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Country</label>
                <select name="country" value={profileData.country} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#2e7d32] outline-none">
                  <option value="">Select Country</option>
                  {Object.keys(educationalSystems).map(country => (
                    <option key={country} value={country}>{country}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Educational System</label>
                <select name="educationalSystem" value={profileData.educationalSystem} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#2e7d32] outline-none">
                  <option value="">Select System</option>
                  {profileData.country && educationalSystems[profileData.country]?.map(system => (
                    <option key={system} value={system}>{system}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Subject Area</label>
                <input type="text" name="subjectArea" value={profileData.subjectArea} onChange={handleChange}
                  placeholder="e.g., Mathematics, English, Science"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#2e7d32] outline-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Grade Level</label>
                <input type="text" name="gradeLevel" value={profileData.gradeLevel} onChange={handleChange}
                  placeholder="e.g., Grade 7, Form 3, JSS 2"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#2e7d32] outline-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Teacher Name</label>
                <input type="text" name="name" value={profileData.name} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#2e7d32] outline-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Contact Info</label>
                <textarea name="contactInfo" value={profileData.contactInfo} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#2e7d32] outline-none min-h-[100px]" />
              </div>

              <button onClick={handleSaveProfile} disabled={isSaving}
                className={`w-full mt-4 py-3 rounded-lg font-medium text-white ${isSaving ? "bg-gray-400" : "bg-[#2e7d32] hover:bg-[#43a047]"} transition`}>
                {isSaving ? "Saving..." : "Save Changes"}
              </button>

              {saveMessage && (
                <p className={`mt-4 text-center font-medium ${saveMessage.startsWith("✅") ? "text-green-600" : "text-red-600"}`}>
                  {saveMessage}
                </p>
              )}
            </div>
          </div>
         )}
         {activeTab === "ai-assistant" && (
    <div className="max-w-4xl mx-auto bg-white p-4 sm:p-8 rounded-xl shadow-lg">
    <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
      🤖 AI Teaching Assistant
    </h2>

    <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded mb-6">
      <p className="text-sm text-green-800">
        <strong>Your Context:</strong> {teacherProfile.subjectArea} teacher • {teacherProfile.gradeLevel} • {teacherProfile.country} • {teacherProfile.educationalSystem}
      </p>
      {queryCheck.remaining >= 0 && (
        <p className="text-sm text-green-800 mt-2">
          <strong>Queries remaining today:</strong> {queryCheck.remaining}
        </p>
      )}
      {queryCheck.remaining === -1 && (
        <p className="text-sm text-green-800 mt-2">
          <strong>✨ Unlimited queries</strong> (Teacher Pro)
        </p>
      )}
    </div>

    <textarea
      placeholder="Ask Edubridge AI about lesson planning... Example: 'Create a lesson plan for teaching fractions' or 'How do I support struggling learners?'"
      value={aiPrompt}
      onChange={(e) => setAiPrompt(e.target.value)}
      className="w-full border border-gray-300 rounded-lg px-3 sm:px-4 py-2 sm:py-3 mb-4 focus:ring-2 focus:ring-[#2e7d32] outline-none min-h-[100px] sm:min-h-[120px] text-sm sm:text-base text-gray-700"   
      />

    <button 
      onClick={() => generateAIResponse(aiPrompt, 'ai-assistant')} 
      disabled={aiLoading || !isOnline}
     className="bg-[#2e7d32] hover:bg-[#43a047] text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-medium transition text-sm sm:text-base"
    >
      {!isOnline ? "🔌 Offline - AI Unavailable" : aiLoading ? "🤔 EduBridge is thinking..." : "✨ Ask Edubridge AI"}
    </button>

    {!isOnline && (
      <div className="mt-4 p-4 bg-orange-50 border-l-4 border-orange-500 rounded text-sm text-orange-800">
        ⚠️ You're currently offline. AI features require an internet connection. Check the Offline tab for cached content.
      </div>
    )}

    {queryCheck.remaining === 0 && (
      <div className="mt-4 p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded text-sm text-yellow-800">
        <p className="font-semibold mb-2">Daily limit reached!</p>
        <p className="mb-3">You've used all 10 free queries today. Upgrade to Teacher Pro for unlimited access!</p>
        <button
          onClick={() => setActiveTab('subscription')}
          className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
        >
          Upgrade to Pro - $2/month
        </button>
      </div>
    )}

    {aiResponse && (
      <div className="bg-gray-50 border border-gray-200 p-6 rounded-lg mt-6 text-gray-800">
        <div className="flex items-start gap-3 mb-4">
          <div className="text-2xl">🤖</div>
          <div className="font-semibold text-green-700">Edubridge AI's Response:</div>
        </div>
        <div className="prose prose-sm max-w-none whitespace-pre-wrap leading-relaxed">
          {aiResponse}
        </div>
      </div>
    )}

    {!aiResponse && !aiLoading && isOnline && (
      <div className="mt-6 p-4 bg-green-50 rounded-lg text-sm text-green-800">
        <strong>💡 Tips for better results:</strong>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>Be specific about your needs (e.g., topic, learning objectives)</li>
          <li>Mention any constraints (time, resources, class size)</li>
          <li>Ask for examples or step-by-step guidance</li>
        </ul>
      </div>
    )}
  </div>
)}
 {activeTab === "student-progress" && (
          <>
            {hasFeatureAccess(
              teacherProfile.subscriptionTier || TIERS.FREE,
              teacherProfile.subscriptionStatus || STATUS.ACTIVE,
              'student-progress'
            ) ? (
              <div className="max-w-4xl mx-auto bg-white p-4 sm:p-8 rounded-xl shadow-lg">
                {/* Existing student-progress content */}
                <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                  📈 Student Progress Monitor
                </h2>

                <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded mb-6">
                  <p className="text-sm text-green-800">
                    <strong>Your Context:</strong> {teacherProfile.subjectArea} teacher • {teacherProfile.gradeLevel} • {teacherProfile.country} • {teacherProfile.educationalSystem}
                  </p>
                </div>

                <textarea
                  placeholder="Ask Edubridge AI about student progress... Example: 'How do I track student improvement over time?' or 'Suggest interventions for struggling learners'"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 sm:px-4 py-2 sm:py-3 mb-4 focus:ring-2 focus:ring-[#2e7d32] outline-none min-h-[100px] sm:min-h-[120px] text-sm sm:text-base text-gray-700" />

                {queryCheck.remaining >= 0 && (
                  <div className="mb-4 text-sm text-gray-600">
                    {queryCheck.message}
                  </div>
                )}

                <button onClick={() => generateAIResponse(aiPrompt, 'student-progress')} disabled={aiLoading || !isOnline}
                 className="bg-[#2e7d32] hover:bg-[#43a047] text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-medium transition text-sm sm:text-base">
                  {!isOnline ? "🔌 Offline - AI Unavailable" : aiLoading ? "🤔 EduBridge is thinking..." : "✨ Ask Edubridge AI"}
                </button>

                {!isOnline && (
                  <div className="mt-4 p-4 bg-orange-50 border-l-4 border-orange-500 rounded text-sm text-orange-800">
                    ⚠️ You're currently offline. AI features require an internet connection. Check the Offline tab for cached content.
                  </div>
                )}

                {aiResponse && (
                  <div className="bg-gray-50 border border-gray-200 p-6 rounded-lg mt-6 text-gray-800">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="text-2xl">🤖</div>
                      <div className="font-semibold text-green-700">Edubridge AI'S Response:</div>
                    </div>
                    <div className="prose prose-sm max-w-none whitespace-pre-wrap leading-relaxed">
                      {aiResponse}
                    </div>
                  </div>
                )}

                {!aiResponse && !aiLoading && isOnline && (
                  <div className="mt-6 p-4 bg-green-50 rounded-lg text-sm text-green-800">
                    <strong>💡 Tips for better results:</strong>
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>Be specific about your needs (e.g., topic, learning objectives)</li>
                      <li>Mention any constraints (time, resources, class size)</li>
                      <li>Ask for examples or step-by-step guidance</li>
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="max-w-4xl mx-auto bg-white p-8 rounded-xl shadow-lg">
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">🔒</div>
                  <h2 className="text-2xl font-bold text-gray-800 mb-4">Student Progress Monitor</h2>
                  <p className="text-gray-600 mb-6">
                    Upgrade to <strong>Teacher Pro</strong> to unlock advanced student progress tracking and AI-powered interventions.
                  </p>
                  <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-lg max-w-md mx-auto mb-6">
                    <h3 className="font-bold text-blue-800 mb-2">Teacher Pro Benefits:</h3>
                    <ul className="text-left text-sm text-blue-800 space-y-2">
                      <li>✓ Unlimited AI queries</li>
                      <li>✓ Advanced student progress tracking</li>
                      <li>✓ AI-powered assignment creation</li>
                      <li>✓ Priority support</li>
                    </ul>
                  </div>
                  <button
                    onClick={() => setActiveTab('subscription')}
                    className="bg-[#2e7d32] hover:bg-[#43a047] text-white px-8 py-3 rounded-lg font-medium transition"
                  >
                    Upgrade to Teacher Pro - $2/month
                  </button>
                  <p className="text-sm text-gray-500 mt-4">
                    🎁 7-day free trial available!
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === "assignments" && (
          <>
            {hasFeatureAccess(
              teacherProfile.subscriptionTier || TIERS.FREE,
              teacherProfile.subscriptionStatus || STATUS.ACTIVE,
              'assignments'
            ) ? (
              <div className="max-w-4xl mx-auto bg-white p-4 sm:p-8 rounded-xl shadow-lg">
                {/* Existing assignments content */}
                <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                  📝 Assignment Manager
                </h2>

                <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded mb-6">
                  <p className="text-sm text-green-800">
                    <strong>Your Context:</strong> {teacherProfile.subjectArea} teacher • {teacherProfile.gradeLevel} • {teacherProfile.country} • {teacherProfile.educationalSystem}
                  </p>
                </div>

                <textarea
                  placeholder="Ask Edubridge AI about assignments... Example: 'Create a rubric for a science project' or 'Design a math worksheet on fractions'"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 sm:px-4 py-2 sm:py-3 mb-4 focus:ring-2 focus:ring-[#2e7d32] outline-none min-h-[100px] sm:min-h-[120px] text-sm sm:text-base text-gray-700"                />

                {queryCheck.remaining >= 0 && (
                  <div className="mb-4 text-sm text-gray-600">
                    {queryCheck.message}
                  </div>
                )}

                <button onClick={() => generateAIResponse(aiPrompt, 'assignments')} disabled={aiLoading || !isOnline}
                 className="bg-[#2e7d32] hover:bg-[#43a047] text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-medium transition text-sm sm:text-base"> 
                  {!isOnline ? "🔌 Offline - AI Unavailable" : aiLoading ? "🤔 EduBridge is thinking..." : "✨ Ask Edubridge AI"}
                </button>

                {!isOnline && (
                  <div className="mt-4 p-4 bg-orange-50 border-l-4 border-orange-500 rounded text-sm text-orange-800">
                    ⚠️ You're currently offline. AI features require an internet connection. Check the Offline tab for cached content.
                  </div>
                )}

                {aiResponse && (
                  <div className="bg-gray-50 border border-gray-200 p-6 rounded-lg mt-6 text-gray-800">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="text-2xl">🤖</div>
                      <div className="font-semibold text-green-700">Edubridge AI'S Response:</div>
                    </div>
                    <div className="prose prose-sm max-w-none whitespace-pre-wrap leading-relaxed">
                      {aiResponse}
                    </div>
                  </div>
                )}

                {!aiResponse && !aiLoading && isOnline && (
                  <div className="mt-6 p-4 bg-green-50 rounded-lg text-sm text-green-800">
                    <strong>💡 Tips for better results:</strong>
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>Be specific about your needs (e.g., topic, learning objectives)</li>
                      <li>Mention any constraints (time, resources, class size)</li>
                      <li>Ask for examples or step-by-step guidance</li>
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="max-w-4xl mx-auto bg-white p-8 rounded-xl shadow-lg">
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">🔒</div>
                  <h2 className="text-2xl font-bold text-gray-800 mb-4">Assignment Manager</h2>
                  <p className="text-gray-600 mb-6">
                    Upgrade to <strong>Teacher Pro</strong> to unlock AI-powered assignment creation, rubrics, and assessment tools.
                  </p>
                  <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-lg max-w-md mx-auto mb-6">
                    <h3 className="font-bold text-blue-800 mb-2">Teacher Pro Benefits:</h3>
                    <ul className="text-left text-sm text-blue-800 space-y-2">
                      <li>✓ Unlimited AI queries</li>
                      <li>✓ Advanced student progress tracking</li>
                      <li>✓ AI-powered assignment creation</li>
                      <li>✓ Priority support</li>
                    </ul>
                  </div>
                  <button
                    onClick={() => setActiveTab('subscription')}
                    className="bg-[#2e7d32] hover:bg-[#43a047] text-white px-8 py-3 rounded-lg font-medium transition"
                  >
                    Upgrade to Teacher Pro - $2/month
                  </button>
                  <p className="text-sm text-gray-500 mt-4">
                    🎁 7-day free trial available!
                  </p>
                </div>
              </div>
            )}
          </>
        )}
        {activeTab === "community" && (
  <div className="max-w-5xl mx-auto">
    <div className="bg-white p-6 rounded-xl shadow-lg mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-800">👥 Teacher Community</h2>
        <button
          onClick={() => setShowCreatePost(!showCreatePost)}
          className="bg-[#2e7d32] hover:bg-[#43a047] text-white px-4 py-2 rounded-lg font-medium transition"
        >
          {showCreatePost ? '✕ Cancel' : '✏️ Create Post'}
        </button>
      </div>

      <p className="text-gray-600 text-sm mb-4">
        Connect with fellow teachers across East Africa. Share ideas, resources, and support each other!
      </p>
      {/* OFFLINE WARNING - ADD THIS */}
      {!isOnline && (
        <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded mb-4">
          <p className="text-sm text-orange-800 font-semibold">
            📡 You're viewing cached posts from your last online session
          </p>
          <p className="text-xs text-orange-700 mt-1">
            New posts and comments won't appear until you're back online. You cannot create posts or comment while offline.
          </p>
        </div>
      )}


      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3 mb-6">
        <select
          value={communityFilters.postType}
          onChange={(e) => setCommunityFilters(prev => ({ ...prev, postType: e.target.value }))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#2e7d32] outline-none"
        >
          <option value="">All Post Types</option>
          <option value={POST_TYPES.QUESTION}>Questions</option>
          <option value={POST_TYPES.RESOURCE}>Resources</option>
          <option value={POST_TYPES.DISCUSSION}>Discussions</option>
          <option value={POST_TYPES.SUCCESS_STORY}>Success Stories</option>
        </select>

        <select
          value={communityFilters.country}
          onChange={(e) => setCommunityFilters(prev => ({ ...prev, country: e.target.value }))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#2e7d32] outline-none"
        >
          <option value="">All Countries</option>
          {Object.keys(educationalSystems).map(country => (
            <option key={country} value={country}>{country}</option>
          ))}
        </select>

        <select
          value={communityFilters.subject}
          onChange={(e) => setCommunityFilters(prev => ({ ...prev, subject: e.target.value }))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#2e7d32] outline-none"
        >
          <option value="">All Subjects</option>
          <option value="Mathematics">Mathematics</option>
          <option value="English">English</option>
          <option value="Science">Science</option>
          <option value="Social Studies">Social Studies</option>
          <option value="Languages">Languages</option>
          <option value="Arts">Arts</option>
          <option value="Other">Other</option>
        </select>
      </div>

      {/* Create Post Form */}
      {showCreatePost && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
          <h3 className="font-bold text-gray-800 mb-4">Create New Post</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Post Type</label>
              <select
                value={newPost.type}
                onChange={(e) => setNewPost(prev => ({ ...prev, type: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#2e7d32] outline-none"
              >
                <option value={POST_TYPES.DISCUSSION}>💬 Discussion</option>
                <option value={POST_TYPES.QUESTION}>❓ Question</option>
                <option value={POST_TYPES.RESOURCE}>📚 Resource</option>
                <option value={POST_TYPES.SUCCESS_STORY}>⭐ Success Story</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Title</label>
              <input
                type="text"
                value={newPost.title}
                onChange={(e) => setNewPost(prev => ({ ...prev, title: e.target.value }))}
                placeholder="What's on your mind?"
                maxLength={150}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#2e7d32] outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Content</label>
              <textarea
                value={newPost.content}
                onChange={(e) => setNewPost(prev => ({ ...prev, content: e.target.value }))}
                placeholder="Share your thoughts, ask questions, or provide details..."
                rows={5}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#2e7d32] outline-none"
              />
            </div>

            {newPost.type === POST_TYPES.RESOURCE && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Resource Link (Google Drive / Dropbox)
                </label>
                <input
                  type="url"
                  value={newPost.resourceLink}
                  onChange={(e) => setNewPost(prev => ({ ...prev, resourceLink: e.target.value }))}
                  placeholder="https://drive.google.com/... or https://dropbox.com/..."
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#2e7d32] outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Share a link to your lesson plan, worksheet, or teaching resource
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={async () => {
                  if (!newPost.title.trim() || !newPost.content.trim()) {
                    alert('Please provide a title and content');
                    return;
                  }

                  setIsSubmittingPost(true);
                  const result = await createCommunityPost({
                    userId: user.uid,
                    authorName: teacherProfile.name,
                    authorCountry: teacherProfile.country,
                    authorSubject: teacherProfile.subjectArea,
                    authorGrade: teacherProfile.gradeLevel,
                    authorSystem: teacherProfile.educationalSystem,
                    postType: newPost.type,
                    title: newPost.title,
                    content: newPost.content,
                    resourceLink: newPost.resourceLink || null,
                    tags: []
                  });

                  setIsSubmittingPost(false);

                  if (result.success) {
                    setNewPost({
                      type: POST_TYPES.DISCUSSION,
                      title: '',
                      content: '',
                      resourceLink: '',
                      tags: []
                    });
                    setShowCreatePost(false);
                    alert('Post created successfully!');
                  } else {
                    alert(result.message);
                  }
                }}
                disabled={isSubmittingPost}
                className="bg-[#2e7d32] hover:bg-[#43a047] text-white px-6 py-2 rounded-lg font-medium transition disabled:bg-gray-400"
              >
                {isSubmittingPost ? 'Posting...' : 'Post to Community'}
              </button>
              <button
                onClick={() => {
                  setShowCreatePost(false);
                  setNewPost({
                    type: POST_TYPES.DISCUSSION,
                    title: '',
                    content: '',
                    resourceLink: '',
                    tags: []
                  });
                }}
                className="border border-gray-300 px-6 py-2 rounded-lg font-medium hover:bg-gray-50 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

    {/* Community Feed */}
    <div className="space-y-4">
      {communityPosts.length === 0 ? (
        <div className="bg-white p-12 rounded-xl shadow text-center">
          <div className="text-6xl mb-4">🌍</div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">No posts yet</h3>
          <p className="text-gray-600 mb-4">
            Be the first to share something with the community!
          </p>
          <button
            onClick={() => setShowCreatePost(true)}
           className="bg-[#2e7d32] hover:bg-[#43a047] text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-medium transition text-sm sm:text-base" 
          >
            Create First Post
          </button>
        </div>
      ) : (
        communityPosts.map((post) => (
          <div key={post.id} className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition">
            {/* Post Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#2e7d32] rounded-full flex items-center justify-center text-white font-bold">
                  {post.authorName?.charAt(0)?.toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-gray-800">{post.authorName}</p>
                  <p className="text-xs text-gray-500">
                    {post.authorSubject} • {post.authorGrade} • {post.authorCountry}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className={`text-xs px-2 py-1 rounded-full ${
                  post.postType === POST_TYPES.QUESTION ? 'bg-blue-100 text-blue-700' :
                  post.postType === POST_TYPES.RESOURCE ? 'bg-green-100 text-green-700' :
                  post.postType === POST_TYPES.SUCCESS_STORY ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {post.postType === POST_TYPES.QUESTION ? '❓ Question' :
                   post.postType === POST_TYPES.RESOURCE ? '📚 Resource' :
                   post.postType === POST_TYPES.SUCCESS_STORY ? '⭐ Success Story' :
                   '💬 Discussion'}
                </span>
                <p className="text-xs text-gray-400 mt-1">{formatPostTime(post.createdAt)}</p>
              </div>
            </div>

            {/* Post Content */}
            <h3 className="font-bold text-gray-900 mb-2">{post.title}</h3>
            <p className="text-gray-700 text-sm mb-3 whitespace-pre-wrap">{post.content}</p>

            {/* Resource Link */}
            {post.resourceLink && (
              <a
                href={post.resourceLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-[#2e7d32] hover:text-[#43a047] font-medium mb-3"
              >
                <span>🔗</span>
                View Resource
              </a>
            )}

            {/* Post Actions */}
            <div className="flex items-center gap-4 pt-3 border-t border-gray-200">
              <button
              onClick={async () => {
                if (!isOnline) {
                  alert('Cannot like posts while offline');
               return;
              }
              await toggleLikePost(post.id, user.uid);
              }}
               disabled={!isOnline}
               className={`flex items-center gap-1 text-sm font-medium transition ${
                !isOnline 
               ? 'text-gray-400 cursor-not-allowed'
             : post.likedBy?.includes(user.uid) 
             ? 'text-red-600' 
             : 'text-gray-600 hover:text-red-600'
               }`}
>
             <span>{post.likedBy?.includes(user.uid) ? '❤️' : '🤍'}</span>
             <span>{post.likesCount || 0}</span>
               
            </button>

              <button
                onClick={() => setSelectedPost(post)}
                className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-[#2e7d32] transition"
              >
                <span>💬</span>
                <span>{post.commentsCount || 0} Comments</span>
              </button>

              <button
                onClick={async () => {
                  if (confirm('Flag this post as inappropriate?')) {
                    await flagPost(post.id, user.uid);
                    alert('Post flagged. Thank you for keeping our community safe!');
                  }
                }}
                className="flex items-center gap-1 text-sm font-medium text-gray-400 hover:text-red-600 transition ml-auto"
              >
                <span>🚩</span>
                <span>Flag</span>
              </button>
            </div>
          </div>
        ))
      )}
    </div>

    {/* Comments Modal */}
    {selectedPost && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Modal Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900 text-lg">Comments</h3>
              <button
                onClick={() => {
                  setSelectedPost(null);
                  setNewComment('');
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Original Post */}
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-[#2e7d32] rounded-full flex items-center justify-center text-white font-bold">
                {selectedPost.authorName?.charAt(0)?.toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-gray-800">{selectedPost.authorName}</p>
                <p className="text-xs text-gray-500">{formatPostTime(selectedPost.createdAt)}</p>
              </div>
            </div>
            <h3 className="font-bold text-gray-900 mb-2">{selectedPost.title}</h3>
            <p className="text-gray-700 text-sm">{selectedPost.content}</p>
          </div>

          {/* Comments List */}
          <div className="p-6 space-y-4">
            {postComments.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">No comments yet. Be the first to comment!</p>
            ) : (
              postComments.map((comment) => (
                <div key={comment.id} className="flex gap-3">
                  <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {comment.authorName?.charAt(0)?.toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800 text-sm">{comment.authorName}</p>
                    <p className="text-gray-700 text-sm mt-1">{comment.content}</p>
                    <p className="text-xs text-gray-400 mt-1">{formatPostTime(comment.createdAt)}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Add Comment */}
          <div className="sticky bottom-0 bg-white border-t border-gray-200 p-6">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Write a comment..."
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#2e7d32] outline-none mb-3"
            />
            <button
              onClick={async () => {
                if (!newComment.trim()) {
                  alert('Please write a comment');
                  return;
                }

                const result = await addComment(
                  selectedPost.id,
                  user.uid,
                  teacherProfile.name,
                  newComment
                );

                if (result.success) {
                  setNewComment('');
                } else {
                  alert(result.message);
                }
              }}
              className="bg-[#2e7d32] hover:bg-[#43a047] text-white px-6 py-2 rounded-lg font-medium transition"
            >
              Post Comment
            </button>
          </div>
        </div>
      </div>
    )}
  </div>
)}{activeTab === "offline" && (
          <div className="max-w-4xl mx-auto bg-white p-8 rounded-xl shadow-lg">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
              📡 Offline Mode
            </h2>

            <div className={`border-l-4 p-4 rounded mb-6 ${isOnline ? 'bg-green-50 border-green-500' : 'bg-orange-50 border-orange-500'}`}>
              <p className="text-sm font-semibold mb-2">
                {isOnline ? '✅ Currently Online' : '📡 Currently Offline'}
              </p>
              <p className="text-sm">
                {isOnline 
                  ? 'All features are available. Your profile and AI responses are being cached automatically.' 
                  : 'Limited features available. You can access cached AI responses below.'}
              </p>
            </div>

            <div className="space-y-6">
              <div className="bg-white border border-gray-200 p-6 rounded-lg">
                <h3 className="font-bold text-gray-800 mb-3">📱 PWA Features</h3>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li className="flex items-start gap-2">
                    <span className="text-green-600">✓</span>
                    <span>Install EduBridge as a mobile app for quick access</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-600">✓</span>
                    <span>View your profile and basic information offline</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-600">✓</span>
                    <span>Access cached curriculum information</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-600">✓</span>
                    <span>Browse previously generated AI responses offline</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-orange-600">⚠</span>
                    <span>New AI queries require internet connection</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-orange-600">⚠</span>
                    <span>Profile updates will sync when connection is restored</span>
                  </li>
                </ul>
              </div>

              {showInstallButton && (
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                  <h3 className="font-bold text-blue-800 mb-2">📲 Install as App</h3>
                  <p className="text-sm text-blue-800 mb-3">
                    Install EduBridge on your device for faster access and better offline capabilities:
                  </p>
                  <button
                    onClick={handleInstallClick}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition"
                  >
                    Install Now
                  </button>
                </div>
              )}

              {!showInstallButton && (
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                  <h3 className="font-bold text-blue-800 mb-2">📲 Manual Installation</h3>
                  <p className="text-sm text-blue-800 mb-3">
                    Install EduBridge on your device:
                  </p>
                  <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                    <li>On mobile: Tap the share button and select "Add to Home Screen"</li>
                    <li>On desktop: Look for the install icon in your browser's address bar</li>
                  </ul>
                </div>
              )}

              <div className="bg-white border border-gray-200 p-6 rounded-lg">
                <h3 className="font-bold text-gray-800 mb-3">💾 Your Cached Profile</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600 font-semibold">Name:</p>
                    <p className="text-gray-800">{teacherProfile.name || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 font-semibold">Country:</p>
                    <p className="text-gray-800">{teacherProfile.country || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 font-semibold">Educational System:</p>
                    <p className="text-gray-800">{teacherProfile.educationalSystem || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 font-semibold">Subject Area:</p>
                    <p className="text-gray-800">{teacherProfile.subjectArea || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 font-semibold">Grade Level:</p>
                    <p className="text-gray-800">{teacherProfile.gradeLevel || 'Not set'}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 p-6 rounded-lg">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-800">📚 Cached AI Responses ({cachedResponses.length})</h3>
                  <button
                    onClick={loadCachedResponses}
                    className="text-sm text-[#2e7d32] hover:text-[#43a047] font-medium"
                  >
                    🔄 Refresh
                  </button>
                </div>
                
                {cachedResponses.length === 0 ? (
                  <p className="text-sm text-gray-600">
                    No cached responses yet. Use the AI Assistant while online to generate and cache responses for offline access.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {cachedResponses.map((item, idx) => (
                      <div key={idx} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-semibold text-[#2e7d32] uppercase">
                                {item.data.context?.replace('-', ' ') || 'General'}
                              </span>
                              <span className="text-xs text-gray-500">
                                {new Date(item.timestamp).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 line-clamp-2">
                              <strong>Q:</strong> {item.data.prompt}
                            </p>
                          </div>
                          <button
                            onClick={() => setSelectedCachedResponse(item)}
                            className="ml-3 text-xs bg-[#2e7d32] text-white px-3 py-1 rounded hover:bg-[#43a047] transition whitespace-nowrap"
                          >
                            View
                          </button>
                        </div>
                        {item.data.profile && (
                          <div className="text-xs text-gray-500 mt-2">
                            {item.data.profile.subject} • {item.data.profile.grade} • {item.data.profile.country}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedCachedResponse && (
                <div className="bg-gray-50 border border-gray-300 p-6 rounded-lg">
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="font-bold text-gray-800">📖 Cached Response Details</h3>
                    <button
                      onClick={() => setSelectedCachedResponse(null)}
                      className="text-sm text-gray-600 hover:text-gray-800"
                    >
                      ✕ Close
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-1">QUESTION:</p>
                      <p className="text-sm text-gray-800 bg-white p-3 rounded">
                        {selectedCachedResponse.data.prompt}
                      </p>
                    </div>
                    
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-1">CONTEXT:</p>
                      <p className="text-sm text-gray-700">
                        {selectedCachedResponse.data.context?.replace('-', ' ') || 'General'} • 
                        {selectedCachedResponse.data.profile && ` ${selectedCachedResponse.data.profile.subject} • ${selectedCachedResponse.data.profile.grade}`}
                      </p>
                    </div>
                    
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-1">AI RESPONSE:</p>
                      <div className="text-sm text-gray-800 bg-white p-4 rounded whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                        {selectedCachedResponse.data.response}
                      </div>
                    </div>
                    
                    <div className="text-xs text-gray-500">
                      Cached on: {new Date(selectedCachedResponse.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-gray-50 border border-gray-200 p-6 rounded-lg">
                <h3 className="font-bold text-gray-800 mb-3">📚 Offline Curriculum Reference</h3>
                {teacherProfile.educationalSystem && curriculumKnowledge[teacherProfile.educationalSystem] ? (
                  <div className="space-y-3 text-sm">
                    <div>
                      <p className="font-semibold text-gray-700">Structure:</p>
                      <p className="text-gray-600">{curriculumKnowledge[teacherProfile.educationalSystem].structure}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-700">Grade Structure:</p>
                      <p className="text-gray-600">{curriculumKnowledge[teacherProfile.educationalSystem].gradeStructure}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-700">Assessment Types:</p>
                      <ul className="list-disc list-inside text-gray-600 mt-1">
                        {curriculumKnowledge[teacherProfile.educationalSystem].assessmentTypes.map((type, idx) => (
                          <li key={idx}>{type}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-700">Key Features:</p>
                      <ul className="list-disc list-inside text-gray-600 mt-1">
                        {curriculumKnowledge[teacherProfile.educationalSystem].keyFeatures.map((feature, idx) => (
                          <li key={idx}>{feature}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">Complete your profile to see curriculum information here.</p>
                )}
              </div>
            </div>
          </div>
        )}
        {activeTab === "subscription" && (
  <div className="max-w-4xl mx-auto">
    {/* Current Subscription Status */}
    <div className="bg-white p-6 rounded-xl shadow-lg mb-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">💳 Subscription Management</h2>
      
      {/* Current Plan Display */}
      <div className={`border-l-4 p-6 rounded-lg mb-6 ${
        (teacherProfile.subscriptionTier === TIERS.PRO || teacherProfile.subscriptionTier === TIERS.SCHOOL) &&
        (teacherProfile.subscriptionStatus === STATUS.ACTIVE || teacherProfile.subscriptionStatus === STATUS.TRIAL)
          ? 'bg-green-50 border-green-500'
          : 'bg-gray-50 border-gray-300'
      }`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              {getSubscriptionDisplayInfo(
                teacherProfile.subscriptionTier || TIERS.FREE,
                teacherProfile.subscriptionStatus || STATUS.ACTIVE
              ).tierName}
            </h3>
            <p className={`text-sm font-semibold ${
              teacherProfile.subscriptionStatus === STATUS.TRIAL ? 'text-blue-700' :
              teacherProfile.subscriptionStatus === STATUS.ACTIVE ? 'text-green-700' :
              'text-gray-600'
            }`}>
              Status: {getSubscriptionDisplayInfo(
                teacherProfile.subscriptionTier || TIERS.FREE,
                teacherProfile.subscriptionStatus || STATUS.ACTIVE
              ).statusLabel}
            </p>
          </div>
          
          {/* Trial Countdown */}
          {teacherProfile.subscriptionStatus === STATUS.TRIAL && teacherProfile.subscriptionExpiry && (
            <div className="text-right">
              <div className="bg-blue-100 text-blue-800 px-3 py-2 rounded-lg">
                <p className="text-xs font-semibold">Trial Expires In</p>
                <p className="text-2xl font-bold">
                  {getDaysRemaining(teacherProfile.subscriptionExpiry)} days
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Current Plan Features */}
        <div className="space-y-2 text-sm">
          {teacherProfile.subscriptionTier === TIERS.FREE && (
            <>
              <p className="flex items-center gap-2 text-gray-700">
                <span className="text-green-600">✓</span>
                <span>10 AI queries per day</span>
              </p>
              <p className="flex items-center gap-2 text-gray-700">
                <span className="text-green-600">✓</span>
                <span>Community access</span>
              </p>
              <p className="flex items-center gap-2 text-gray-700">
                <span className="text-green-600">✓</span>
                <span>Offline mode</span>
              </p>
              <p className="flex items-center gap-2 text-gray-400">
                <span className="text-gray-400">✗</span>
                <span>Student Progress tracking</span>
              </p>
              <p className="flex items-center gap-2 text-gray-400">
                <span className="text-gray-400">✗</span>
                <span>Assignment creation tools</span>
              </p>
            </>
          )}
          
          {(teacherProfile.subscriptionTier === TIERS.PRO || teacherProfile.subscriptionTier === TIERS.SCHOOL) && (
            <>
              <p className="flex items-center gap-2 text-gray-700">
                <span className="text-green-600">✓</span>
                <span><strong>Unlimited</strong> AI queries</span>
              </p>
              <p className="flex items-center gap-2 text-gray-700">
                <span className="text-green-600">✓</span>
                <span>Advanced Student Progress tracking</span>
              </p>
              <p className="flex items-center gap-2 text-gray-700">
                <span className="text-green-600">✓</span>
                <span>AI-powered Assignment creation</span>
              </p>
              <p className="flex items-center gap-2 text-gray-700">
                <span className="text-green-600">✓</span>
                <span>Community access</span>
              </p>
              <p className="flex items-center gap-2 text-gray-700">
                <span className="text-green-600">✓</span>
                <span>Offline mode</span>
              </p>
              <p className="flex items-center gap-2 text-gray-700">
                <span className="text-green-600">✓</span>
                <span>Priority support</span>
              </p>
            </>
          )}
        </div>
        {/* Cancel/Downgrade Button */}
        <button
    onClick={async () => {
      if (!confirm('Cancel your current subscription and return to Free tier?\n\nYou will lose access to Pro features immediately.')) {
        return;
      }
      
      try {
        const teacherRef = doc(db, "teachers", user.uid);
        await setDoc(teacherRef, {
          subscriptionTier: TIERS.FREE,
          subscriptionStatus: STATUS.ACTIVE,
          subscriptionExpiry: null,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        
        alert('✅ Subscription cancelled. You are now on the Free tier.');
        window.location.reload();
      } catch (error) {
        console.error('Error cancelling subscription:', error);
        alert('❌ Failed to cancel subscription');
      }
    }}
    className="mt-4 w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg font-medium transition"
  >
    Cancel Subscription & Return to Free
  </button>


        {/* Trial Warning */}
        {teacherProfile.subscriptionStatus === STATUS.TRIAL && 
         getDaysRemaining(teacherProfile.subscriptionExpiry) <= 3 && (
          <div className="mt-4 bg-yellow-50 border border-yellow-200 p-3 rounded-lg">
            <p className="text-sm text-yellow-800 font-semibold">
              ⚠️ Your trial expires in {getDaysRemaining(teacherProfile.subscriptionExpiry)} days
            </p>
            <p className="text-xs text-yellow-700 mt-1">
              Subscribe now to continue enjoying Pro features!
            </p>
          </div>
        )}
      </div>
    </div>

    {/* Pricing Plans -Always visible*/}
    {true && (
      <div className="bg-white p-6 rounded-xl shadow-lg mb-6">
        <h3 className="text-xl font-bold text-gray-800 mb-6 text-center">
          Upgrade Your Teaching Experience
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6">
          {/* Teacher Pro Plan */}
          <div className="border-2 border-[#2e7d32] rounded-xl p-6 relative">
            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-[#2e7d32] text-white px-4 py-1 rounded-full text-xs font-bold">
              MOST POPULAR
            </div>
            
            <h4 className="text-2xl font-bold text-gray-900 mb-2">Teacher Pro</h4>
            <div className="mb-4">
              <span className="text-4xl font-bold text-[#2e7d32]">$2</span>
              <span className="text-gray-600">/month</span>
            </div>
            
            <ul className="space-y-3 mb-6 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-1">✓</span>
                <span><strong>Unlimited</strong> AI queries</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-1">✓</span>
                <span>Advanced student progress tracking</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-1">✓</span>
                <span>AI-powered assignment creation</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-1">✓</span>
                <span>Full community access</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-1">✓</span>
                <span>Offline mode with caching</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-1">✓</span>
                <span>Priority support</span>
              </li>
            </ul>

            {teacherProfile.trialUsed ? (
              <button
  onClick={async () => {
    const phoneNumber = prompt('Enter your M-Pesa phone number (format: 254XXXXXXXXX):');
    
    if (!phoneNumber) return;
    
    // Validate phone format
    if (!/^254\d{9}$/.test(phoneNumber)) {
      alert('❌ Invalid phone number format. Use: 254XXXXXXXXX');
      return;
    }
    
    try {
      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      
      const response = await fetch(`${BACKEND_URL}/api/payment/mpesa/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: phoneNumber,
          amount: 270, // 270 KES for Teacher Pro
          userId: user.uid,
          subscriptionTier: 'pro'
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert(`✅ ${result.message}\n\nTransaction ID: ${result.transactionId}\n\nComplete the payment on your phone.`);
        
        // Poll for payment status
        const checkPaymentStatus = setInterval(async () => {
          const statusResponse = await fetch(`${BACKEND_URL}/api/payment/mpesa/status/${result.transactionId}`);
          const statusData = await statusResponse.json();
          
          if (statusData.success && statusData.transaction.status === 'completed') {
            clearInterval(checkPaymentStatus);
            alert('🎉 Payment successful! Refreshing your subscription...');
            window.location.reload();
          } else if (statusData.transaction.status === 'failed' || statusData.transaction.status === 'cancelled') {
            clearInterval(checkPaymentStatus);
            alert('❌ Payment failed. Please try again.');
          }
        }, 3000); // Check every 3 seconds
        
        // Stop checking after 2 minutes
        setTimeout(() => clearInterval(checkPaymentStatus), 120000);
        
      } else {
        alert('❌ Failed to initiate payment: ' + result.error);
      }
    } catch (error) {
      console.error('Payment error:', error);
      alert('❌ Error: ' + error.message);
    }
  }}
  className="w-full bg-[#2e7d32] hover:bg-[#43a047] text-white py-3 rounded-lg font-semibold transition"
>
  Upgrade to Pro
</button>
            ) : (
              <button
                onClick={async () => {
                  setIsActivatingTrial(true);
                  const { startFreeTrial } = await import('../utils/subscriptionHelpers');
                  const result = await startFreeTrial(user.uid);
                  
                  if (result.success) {
                    alert('🎉 7-day free trial activated!\n\nYou now have unlimited access to all Pro features.');
                    // Refresh profile
                    const teacherRef = doc(db, "teachers", user.uid);
                    const snap = await getDoc(teacherRef);
                    if (snap.exists()) {
                      setTeacherProfile(snap.data());
                    }
                  } else {
                    alert('❌ ' + result.message);
                  }
                  setIsActivatingTrial(false);
                }}
                disabled={isActivatingTrial}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-semibold transition disabled:bg-gray-400"
              >
                {isActivatingTrial ? 'Activating...' : '🎁 Start 7-Day Free Trial'}
              </button>
            )}
            
            {!teacherProfile.trialUsed && (
              <p className="text-xs text-center text-gray-500 mt-2">
                No credit card required • Cancel anytime
              </p>
            )}
          </div>

          {/* School Plan */}
          <div className="border-2 border-gray-300 rounded-xl p-6">
            <h4 className="text-2xl font-bold text-gray-900 mb-2">School License</h4>
            <div className="mb-4">
              <span className="text-4xl font-bold text-[#2e7d32]">$30</span>
              <span className="text-gray-600">/year</span>
            </div>
            <p className="text-sm text-gray-600 mb-4">For 20 teachers</p>
            
            <ul className="space-y-3 mb-6 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-1">✓</span>
                <span>All Pro features for 20 teachers</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-1">✓</span>
                <span>Admin dashboard</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-1">✓</span>
                <span>Teacher management</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-1">✓</span>
                <span>Usage analytics</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-1">✓</span>
                <span>Bulk onboarding</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-1">✓</span>
                <span>Priority support</span>
              </li>
            </ul>

            <button
  onClick={async () => {
    const phoneNumber = prompt('Enter M-Pesa phone number for school payment (format: 254XXXXXXXXX):');
    
    if (!phoneNumber) return;
    
    if (!/^254\d{9}$/.test(phoneNumber)) {
      alert('❌ Invalid phone number format. Use: 254XXXXXXXXX');
      return;
    }
    
    try {
      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      
      const response = await fetch(`${BACKEND_URL}/api/payment/mpesa/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: phoneNumber,
          amount: 4000, // 4000 KES for School License
          userId: user.uid,
          subscriptionTier: 'school'
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert(`✅ ${result.message}\n\nTransaction ID: ${result.transactionId}\n\nComplete the payment on your phone.`);
        
        const checkPaymentStatus = setInterval(async () => {
          const statusResponse = await fetch(`${BACKEND_URL}/api/payment/mpesa/status/${result.transactionId}`);
          const statusData = await statusResponse.json();
          
          if (statusData.success && statusData.transaction.status === 'completed') {
            clearInterval(checkPaymentStatus);
            alert('🎉 School license payment successful! Refreshing...');
            window.location.reload();
          } else if (statusData.transaction.status === 'failed' || statusData.transaction.status === 'cancelled') {
            clearInterval(checkPaymentStatus);
            alert('❌ Payment failed. Please try again.');
          }
        }, 3000);
        
        setTimeout(() => clearInterval(checkPaymentStatus), 120000);
        
      } else {
        alert('❌ Failed to initiate payment: ' + result.error);
      }
    } catch (error) {
      console.error('Payment error:', error);
      alert('❌ Error: ' + error.message);
    }
  }}
  className="w-full bg-gray-700 hover:bg-gray-800 text-white py-3 rounded-lg font-semibold transition"
>
  Get School License
</button>
            
            <p className="text-xs text-center text-gray-500 mt-2">
              Only $1.50 per teacher per year
            </p>
          </div>
        </div>

        {/* Value Proposition */}
        <div className="bg-gradient-to-r from-green-50 to-blue-50 border-l-4 border-[#2e7d32] p-6 rounded-lg">
          <h4 className="font-bold text-gray-900 mb-3">💡 Why Upgrade?</h4>
          <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-700">
            <div>
              <p className="font-semibold mb-2">Save Time:</p>
              <p>Generate lesson plans in minutes, not hours. Create assessments with AI assistance.</p>
            </div>
            <div>
              <p className="font-semibold mb-2">Track Progress:</p>
              <p>Monitor student performance and get AI-powered intervention suggestions.</p>
            </div>
            <div>
              <p className="font-semibold mb-2">Culturally Relevant:</p>
              <p>Get advice tailored to African curricula and classroom realities.</p>
            </div>
            <div>
              <p className="font-semibold mb-2">Works Offline:</p>
              <p>Access cached lessons and resources even without internet.</p>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* FAQ Section */}
    <div className="bg-white p-6 rounded-xl shadow-lg">
      <h3 className="text-xl font-bold text-gray-800 mb-4">Frequently Asked Questions</h3>
      
      <div className="space-y-4 text-sm">
        <div>
          <p className="font-semibold text-gray-900 mb-1">How do I pay?</p>
          <p className="text-gray-600">
            We accept M-Pesa, Airtel Money, and all major cards via IntaSend. Payments are secure and encrypted.
          </p>
        </div>
        
        <div>
          <p className="font-semibold text-gray-900 mb-1">Can I cancel anytime?</p>
          <p className="text-gray-600">
            Yes! Cancel anytime with no penalties. You'll keep access until the end of your billing period.
          </p>
        </div>
        
        <div>
          <p className="font-semibold text-gray-900 mb-1">What happens after the free trial?</p>
          <p className="text-gray-600">
            After 7 days, you'll be asked to subscribe. If you don't subscribe, you'll return to the free tier with 10 daily queries.
          </p>
        </div>
        
        <div>
          <p className="font-semibold text-gray-900 mb-1">Is my data safe?</p>
          <p className="text-gray-600">
            Absolutely. We never sell your data. All information is encrypted and stored securely on Google Firebase.
          </p>
        </div>

        <div>
          <p className="font-semibold text-gray-900 mb-1">Do you offer refunds?</p>
          <p className="text-gray-600">
            Yes! If you're not satisfied within the first 14 days, we'll refund your payment, no questions asked.
          </p>
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-gray-200 text-center">
        <p className="text-sm text-gray-600 mb-3">
          Have more questions? We're here to help!
        </p>
        <a 
          href="mailto:support@edubridge.africa" 
          className="text-[#2e7d32] hover:text-[#43a047] font-semibold"
        >
          support@edubridge.africa
        </a>
      </div>
    </div>
  </div>
)}
{activeTab === "school-management" && (
  <div className="max-w-6xl mx-auto">
<div className="bg-white p-6 rounded-xl shadow-lg mb-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">🏫 School Management</h2>
      {teacherProfile.schoolRole !== 'admin' && (
      <button
        onClick={async () => {
  if (!confirm('Grant yourself admin privileges?\n\nThis will create a new school for you to manage.')) return;
  
  try {
    // ✅ Import Timestamp correctly
    const { Timestamp } = await import('firebase/firestore');
    const teacherRef = doc(db, "teachers", user.uid);
    
    // Generate a unique school ID
    const schoolId = `school_${user.uid}_${Date.now()}`;
    
    // Create school document
    const schoolRef = doc(db, "schools", schoolId);
    await setDoc(schoolRef, {
      name: `${teacherProfile.name}'s School`,
      adminId: user.uid,
      adminName: teacherProfile.name,
      adminEmail: teacherProfile.email || user.email,
      totalSlots: 20,
      usedSlots: 1, // Admin counts as first teacher
      teacherIds: [user.uid], // ✅ ADD THIS - Initialize with admin as first teacher
      subscriptionStatus: 'inactive', // They need to purchase
      subscriptionTier: 'school',
      createdAt: Timestamp.now(), // ✅ Use Timestamp
      updatedAt: Timestamp.now()  // ✅ Use Timestamp
      
    });
    
    // Update teacher profile with admin role AND schoolId
    
    await setDoc(teacherRef, {
      schoolRole: 'admin',
      schoolId: schoolId,
      subscriptionTier: 'free', // Keep as free until they purchase school license
     updatedAt: Timestamp.now() // ✅ Use Timestamp
    }, { merge: true });
    
    // Update local state
    setTeacherProfile(prev => ({ 
      ...prev, 
      schoolRole: 'admin',
      schoolId: schoolId
    }));
    
    alert('✅ Admin privileges granted!\n\n🏫 Your school has been created.\n\nPurchase a School License to activate it.');
    
    // Load the school data
    loadSchoolData();
    
  } catch (error) {
    console.error('Error granting admin:', error);
    alert('❌ Failed to grant admin privileges: ' + error.message);
  }
}}
 className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition text-sm"
      >
        🔑 Grant Admin Access
      </button>
    )}
    {isLoadingSchool ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 border-4 border-[#2e7d32] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading school data...</p>
        </div>
      ) : schoolData ? (
        <>
          {/* School Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-blue-600 font-semibold">Total Slots</p>
              <p className="text-3xl font-bold text-blue-800">{schoolStats?.totalSlots || 20}</p>
            </div>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <p className="text-sm text-green-600 font-semibold">Active Teachers</p>
              <p className="text-3xl font-bold text-green-800">{schoolStats?.usedSlots || 0}</p>
            </div>
            
            <div className="bg-orange-50 p-4 rounded-lg">
              <p className="text-sm text-orange-600 font-semibold">Available Slots</p>
              <p className="text-3xl font-bold text-orange-800">{schoolStats?.availableSlots || 0}</p>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <p className="text-sm text-purple-600 font-semibold">Utilization</p>
              <p className="text-3xl font-bold text-purple-800">{schoolStats?.utilizationRate || 0}%</p>
            </div>
          </div>

          {/* Subscription Status */}
          <div className={`border-l-4 p-4 rounded-lg mb-6 ${
            schoolData.subscriptionStatus === 'active' 
              ? 'bg-green-50 border-green-500' 
              : 'bg-red-50 border-red-500'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">School License: {schoolData.name}</p>
                <p className="text-sm text-gray-600">
                  Status: <span className={schoolData.subscriptionStatus === 'active' ? 'text-green-700 font-bold' : 'text-red-700 font-bold'}>
                    {schoolData.subscriptionStatus.toUpperCase()}
                  </span>
                </p>
                {schoolData.subscriptionExpiry && (
                  <p className="text-sm text-gray-600 mt-1">
                    Expires: {new Date(schoolData.subscriptionExpiry).toLocaleDateString()} 
                    ({schoolStats?.daysUntilExpiry} days remaining)
                  </p>
                )}
              </div>
              
              {schoolData.subscriptionStatus !== 'active' && (
                <button
                  onClick={() => setActiveTab('subscription')}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition"
                >
                  Renew License
                </button>
              )}
            </div>
          </div>

          {/* Invite Teacher Section */}
          {schoolStats?.availableSlots > 0 && (
            <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 p-6 rounded-lg mb-6">
              <h3 className="font-bold text-gray-900 mb-3">📧 Invite Teachers</h3>
              <p className="text-sm text-gray-700 mb-4">
                Generate an invite link to add teachers to your school license. 
                Each teacher will automatically get Pro features.
              </p>
              
              <button
                onClick={handleGenerateInvite}
                disabled={isGeneratingInvite}
               className="bg-[#2e7d32] hover:bg-[#43a047] text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-medium transition text-sm sm:text-base" 
              >
                {isGeneratingInvite ? 'Generating...' : '🔗 Generate Invite Link'}
              </button>

              {inviteLink && (
                <div className="bg-white border border-gray-300 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 mb-2">Share this link with teachers:</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inviteLink}
                      readOnly
                      className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm font-mono"
                    />
                    <button
                      onClick={handleCopyInviteLink}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium transition whitespace-nowrap"
                    >
                      📋 Copy
                    </button>
                  </div>
                  <p className="text-xs text-orange-600 mt-2">
                    ⚠️ Invite link expires in 7 days
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Teacher List */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <h3 className="font-bold text-gray-900">👥 Teachers in Your School ({schoolTeachers.length})</h3>
            </div>
            
            <div className="divide-y divide-gray-200">
              {schoolTeachers.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <p className="text-4xl mb-2">🏫</p>
                  <p>No teachers yet. Generate an invite link to add teachers!</p>
                </div>
              ) : (
                schoolTeachers.map((teacher) => (
                  <div key={teacher.id} className="p-4 hover:bg-gray-50 transition">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-[#2e7d32] rounded-full flex items-center justify-center text-white font-bold text-lg">
                          {teacher.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        
                        <div>
                          <p className="font-semibold text-gray-900">
                            {teacher.name}
                            {teacher.role === 'admin' && (
                              <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-semibold">
                                ADMIN
                              </span>
                            )}
                          </p>
                          <p className="text-sm text-gray-600">{teacher.email}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {teacher.subjectArea} • {teacher.gradeLevel}
                          </p>
                        </div>
                      </div>
                      
                      {teacher.role !== 'admin' && (
                        <button
                          onClick={() => handleRemoveTeacher(teacher.id, teacher.name)}
                          className="text-red-600 hover:text-red-800 hover:bg-red-50 px-4 py-2 rounded-lg font-medium transition"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-gray-600">
          <p className="text-4xl mb-4">⚠️</p>
          <p>No school data found. Please contact support.</p>
        </div>
      )}
    </div>
  </div>
)}

 </main>
      <footer className="bg-white border-t border-gray-200 mt-12 py-6 text-center text-gray-600 text-sm">
        <p className="font-semibold">🌍 EduBridge Africa - Powered by Edubridge AI</p>
        <p className="mt-1">Supporting SDG 4: Quality Education • Curriculum-aware AI for African educators</p>
        <p className="mt-2 text-xs">PWA enabled for offline access • Using AI for contextual educational assistance</p>
      </footer>
    </div>
  );
}






































