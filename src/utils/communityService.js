import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  orderBy, 
  limit,
  getDocs,
  getDoc,
  setDoc,
  increment,
  serverTimestamp,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../utils/firebase'
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini for content moderation
const getGenerativeModel = () => {
  const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
  return genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
};

// AI Content Moderation
export const moderateContent = async (content) => {
  try {
    const model = getGenerativeModel();
    const prompt = `
You are a content moderator for a student learning platform. Analyze this content for:
- Inappropriate language
- Bullying or harassment
- Spam or advertising
- Academic dishonesty (asking for exam answers)
- Personal information sharing

Content: "${content}"

Return JSON with:
{
  "isAppropriate": true/false,
  "reason": "brief explanation if inappropriate",
  "severity": "low|medium|high"
}

Return only JSON.
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = await response.text();
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? jsonMatch[0] : text;
    const parsed = JSON.parse(jsonText);
    
    return parsed;
  } catch (error) {
    console.error('Moderation error:', error);
    // Default to appropriate if AI fails
    return { isAppropriate: true, reason: '', severity: 'low' };
  }
};

// Create a new post
export const createPost = async (postData, userId, userName, userProfile) => {
  try {
    // Moderate content
    const moderation = await moderateContent(postData.title + ' ' + postData.content);
    
    if (!moderation.isAppropriate && moderation.severity === 'high') {
      throw new Error('Content violates community guidelines: ' + moderation.reason);
    }

    const post = {
      ...postData,
      authorId: userId,
      authorName: userName,
      authorCountry: userProfile?.country || 'Unknown',
      authorEducationalSystem: userProfile?.educationalSystem || 'Unknown',
      upvotes: 0,
      downvotes: 0,
      upvotedBy: [],
      downvotedBy: [],
      replyCount: 0,
      views: 0,
      isAnswered: false,
      bestAnswerId: null,
      flagged: moderation.severity === 'medium' ? true : false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    const docRef = await addDoc(collection(db, 'communityPosts'), post);
    
    // Update user stats
    await updateUserStats(userId, 'postsCreated', 1, 5);
    
    return { success: true, id: docRef.id };
  } catch (error) {
    console.error('Create post error:', error);
    return { success: false, error: error.message };
  }
};

// Create a reply
export const createReply = async (replyData, postId, userId, userName) => {
  try {
    // Moderate content
    const moderation = await moderateContent(replyData.content);
    
    if (!moderation.isAppropriate && moderation.severity === 'high') {
      throw new Error('Content violates community guidelines: ' + moderation.reason);
    }

    const reply = {
      ...replyData,
      postId,
      authorId: userId,
      authorName: userName,
      upvotes: 0,
      upvotedBy: [],
      isMarkedHelpful: false,
      isBestAnswer: false,
      flagged: moderation.severity === 'medium' ? true : false,
      createdAt: serverTimestamp()
    };

    const docRef = await addDoc(collection(db, 'communityReplies'), reply);
    
    // Increment reply count on post
    const postRef = doc(db, 'communityPosts', postId);
    await updateDoc(postRef, {
      replyCount: increment(1),
      updatedAt: serverTimestamp()
    });
    
    // Update user stats
    await updateUserStats(userId, 'repliesGiven', 1, 2);
    
    return { success: true, id: docRef.id };
  } catch (error) {
    console.error('Create reply error:', error);
    return { success: false, error: error.message };
  }
};

// Upvote/Downvote post
export const votePost = async (postId, userId, voteType) => {
  try {
    const postRef = doc(db, 'communityPosts', postId);
    const postSnap = await getDoc(postRef);
    
    if (!postSnap.exists()) {
      throw new Error('Post not found');
    }
    
    const post = postSnap.data();
    const upvotedBy = post.upvotedBy || [];
    const downvotedBy = post.downvotedBy || [];
    
    let updateData = {};
    
    if (voteType === 'upvote') {
      if (upvotedBy.includes(userId)) {
        // Remove upvote
        updateData = {
          upvotes: increment(-1),
          upvotedBy: upvotedBy.filter(id => id !== userId)
        };
      } else {
        // Add upvote, remove downvote if exists
        const wasDownvoted = downvotedBy.includes(userId);
        updateData = {
          upvotes: increment(1),
          upvotedBy: [...upvotedBy, userId],
          ...(wasDownvoted && {
            downvotes: increment(-1),
            downvotedBy: downvotedBy.filter(id => id !== userId)
          })
        };
        
        // Award points to post author
        if (post.authorId !== userId) {
          await updateUserStats(post.authorId, 'reputationPoints', 2, 0);
        }
      }
    } else if (voteType === 'downvote') {
      if (downvotedBy.includes(userId)) {
        // Remove downvote
        updateData = {
          downvotes: increment(-1),
          downvotedBy: downvotedBy.filter(id => id !== userId)
        };
      } else {
        // Add downvote, remove upvote if exists
        const wasUpvoted = upvotedBy.includes(userId);
        updateData = {
          downvotes: increment(1),
          downvotedBy: [...downvotedBy, userId],
          ...(wasUpvoted && {
            upvotes: increment(-1),
            upvotedBy: upvotedBy.filter(id => id !== userId)
          })
        };
      }
    }
    
    await updateDoc(postRef, updateData);
    return { success: true };
  } catch (error) {
    console.error('Vote post error:', error);
    return { success: false, error: error.message };
  }
};

// Upvote reply
export const voteReply = async (replyId, userId) => {
  try {
    const replyRef = doc(db, 'communityReplies', replyId);
    const replySnap = await getDoc(replyRef);
    
    if (!replySnap.exists()) {
      throw new Error('Reply not found');
    }
    
    const reply = replySnap.data();
    const upvotedBy = reply.upvotedBy || [];
    
    let updateData = {};
    
    if (upvotedBy.includes(userId)) {
      // Remove upvote
      updateData = {
        upvotes: increment(-1),
        upvotedBy: upvotedBy.filter(id => id !== userId)
      };
    } else {
      // Add upvote
      updateData = {
        upvotes: increment(1),
        upvotedBy: [...upvotedBy, userId]
      };
      
      // Award points to reply author
      if (reply.authorId !== userId) {
        await updateUserStats(reply.authorId, 'reputationPoints', 2, 0);
      }
    }
    
    await updateDoc(replyRef, updateData);
    return { success: true };
  } catch (error) {
    console.error('Vote reply error:', error);
    return { success: false, error: error.message };
  }
};

// Mark reply as best answer
export const markBestAnswer = async (postId, replyId, postAuthorId, userId) => {
  try {
    // Only post author can mark best answer
    if (postAuthorId !== userId) {
      throw new Error('Only the question author can mark the best answer');
    }

    const postRef = doc(db, 'communityPosts', postId);
    const replyRef = doc(db, 'communityReplies', replyId);
    
    // Get reply to find author
    const replySnap = await getDoc(replyRef);
    if (!replySnap.exists()) {
      throw new Error('Reply not found');
    }
    
    const reply = replySnap.data();
    
    // Update post
    await updateDoc(postRef, {
      isAnswered: true,
      bestAnswerId: replyId,
      updatedAt: serverTimestamp()
    });
    
    // Update reply
    await updateDoc(replyRef, {
      isBestAnswer: true,
      isMarkedHelpful: true
    });
    
    // Award bonus points to answer author
    await updateUserStats(reply.authorId, 'helpfulReplies', 1, 10);
    
    return { success: true };
  } catch (error) {
    console.error('Mark best answer error:', error);
    return { success: false, error: error.message };
  }
};

// Increment view count
export const incrementViews = async (postId) => {
  try {
    const postRef = doc(db, 'communityPosts', postId);
    await updateDoc(postRef, {
      views: increment(1)
    });
  } catch (error) {
    console.error('Increment views error:', error);
  }
};

// Flag content
export const flagContent = async (contentId, contentType, userId, reason) => {
  try {
    await addDoc(collection(db, 'contentFlags'), {
      contentId,
      contentType, // 'post' or 'reply'
      reportedBy: userId,
      reason,
      status: 'pending',
      createdAt: serverTimestamp()
    });
    
    return { success: true };
  } catch (error) {
    console.error('Flag content error:', error);
    return { success: false, error: error.message };
  }
};

// Update user community stats
// Update user community stats
export const updateUserStats = async (userId, field, incrementValue, pointsToAdd) => {
  try {
    const statsRef = doc(db, 'userCommunityStats', userId); // Use userId as doc ID
    const statsSnap = await getDoc(statsRef);
    
    if (!statsSnap.exists()) {
      // Create initial stats with userId as document ID
      await setDoc(statsRef, {
        userId,
        postsCreated: field === 'postsCreated' ? incrementValue : 0,
        repliesGiven: field === 'repliesGiven' ? incrementValue : 0,
        helpfulReplies: field === 'helpfulReplies' ? incrementValue : 0,
        reputationPoints: pointsToAdd,
        badges: [],
        joinedAt: serverTimestamp()
      });
    } else {
      // Update existing stats
      const updateData = {
        [field]: increment(incrementValue)
      };
      
      if (pointsToAdd > 0) {
        updateData.reputationPoints = increment(pointsToAdd);
      }
      
      await updateDoc(statsRef, updateData);
      
      // Check for badge unlocks
      const updatedStats = { ...statsSnap.data() };
      updatedStats[field] = (updatedStats[field] || 0) + incrementValue;
      updatedStats.reputationPoints = (updatedStats.reputationPoints || 0) + pointsToAdd;
      
      await checkAndAwardBadges(userId, updatedStats);
    }
  } catch (error) {
    console.error('Update user stats error:', error);
  }
};


// Badge system
const BADGES = {
  'first-post': { name: 'First Post', requirement: 'postsCreated', value: 1, icon: '📝' },
  'question-asker': { name: 'Question Asker', requirement: 'postsCreated', value: 5, icon: '❓' },
  'active-contributor': { name: 'Active Contributor', requirement: 'postsCreated', value: 10, icon: '✨' },
  'helper': { name: 'Helper', requirement: 'repliesGiven', value: 10, icon: '🤝' },
  'problem-solver': { name: 'Problem Solver', requirement: 'helpfulReplies', value: 5, icon: '🧩' },
  'expert': { name: 'Expert', requirement: 'helpfulReplies', value: 20, icon: '🎓' },
  'reputation-100': { name: '100 Points', requirement: 'reputationPoints', value: 100, icon: '💯' },
  'reputation-500': { name: '500 Points', requirement: 'reputationPoints', value: 500, icon: '⭐' }
};

const checkAndAwardBadges = async (userId, stats) => {
  try {
    const currentBadges = stats.badges || [];
    const newBadges = [];
    
    for (const [badgeId, badge] of Object.entries(BADGES)) {
      if (!currentBadges.includes(badgeId)) {
        if (stats[badge.requirement] >= badge.value) {
          newBadges.push(badgeId);
        }
      }
    }
    
    if (newBadges.length > 0) {
      const statsRef = doc(db, 'userCommunityStats', userId);
      await updateDoc(statsRef, {
        badges: [...currentBadges, ...newBadges]
      });
    }
  } catch (error) {
    console.error('Badge award error:', error);
  }
};

// Get user stats
// Get user stats
export const getUserStats = async (userId) => {
  try {
    const statsRef = doc(db, 'userCommunityStats', userId); // Use userId as doc ID
    const statsSnap = await getDoc(statsRef);
    
    if (!statsSnap.exists()) {
      return {
        postsCreated: 0,
        repliesGiven: 0,
        helpfulReplies: 0,
        reputationPoints: 0,
        badges: []
      };
    }
    
    return statsSnap.data();
  } catch (error) {
    console.error('Get user stats error:', error);
    return {
      postsCreated: 0,
      repliesGiven: 0,
      helpfulReplies: 0,
      reputationPoints: 0,
      badges: []
    };
  }
};


// Get posts with filters
export const getPosts = async (filters = {}) => {
  try {
    let q = collection(db, 'communityPosts');
    const constraints = [];
    
    // Apply filters
    if (filters.category && filters.category !== 'all') {
      constraints.push(where('category', '==', filters.category));
    }
    
    if (filters.type && filters.type !== 'all') {
      constraints.push(where('type', '==', filters.type));
    }
    
    if (filters.unanswered) {
      constraints.push(where('isAnswered', '==', false));
    }
    
    // Sorting
    if (filters.sortBy === 'popular') {
      constraints.push(orderBy('upvotes', 'desc'));
    } else if (filters.sortBy === 'recent') {
      constraints.push(orderBy('createdAt', 'desc'));
    } else {
      constraints.push(orderBy('createdAt', 'desc'));
    }
    
    constraints.push(limit(filters.limit || 20));
    
    q = query(q, ...constraints);
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Get posts error:', error);
    return [];
  }
};

// Get single post with replies
export const getPostWithReplies = async (postId) => {
  try {
    // Get post
    const postRef = doc(db, 'communityPosts', postId);
    const postSnap = await getDoc(postRef);
    
    if (!postSnap.exists()) {
      throw new Error('Post not found');
    }
    
    // Get replies
    const repliesQuery = query(
      collection(db, 'communityReplies'),
      where('postId', '==', postId),
      orderBy('upvotes', 'desc')
    );
    
    const repliesSnap = await getDocs(repliesQuery);
    const replies = repliesSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return {
      post: { id: postSnap.id, ...postSnap.data() },
      replies
    };
  } catch (error) {
    console.error('Get post with replies error:', error);
    return null;
  }
};

// Search posts
export const searchPosts = async (searchTerm) => {
  try {
    // Note: Firestore doesn't have full-text search
    // This is a basic implementation - for production, use Algolia or similar
    const q = query(
      collection(db, 'communityPosts'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    
    const snapshot = await getDocs(q);
    const allPosts = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Client-side filtering (not ideal for large datasets)
    return allPosts.filter(post => 
      post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      post.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      post.tags?.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  } catch (error) {
    console.error('Search posts error:', error);
    return [];
  }
};

// Get leaderboard
export const getLeaderboard = async (period = 'all') => {
  try {
    let q = query(
      collection(db, 'userCommunityStats'),
      orderBy('reputationPoints', 'desc'),
      limit(10)
    );
    
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      userId: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Get leaderboard error:', error);
    return [];
  }
};

export { BADGES };
// Get user profile for community
export const getUserProfile = async (userId) => {
  try {
    // Get from students collection
    const studentRef = doc(db, 'students', userId);
    const studentSnap = await getDoc(studentRef);
    
    if (studentSnap.exists()) {
      const studentData = studentSnap.data();
      
      // Get community stats
      const statsRef = doc(db, 'userCommunityStats', userId);
      const statsSnap = await getDoc(statsRef);
      const stats = statsSnap.exists() ? statsSnap.data() : {
        postsCreated: 0,
        repliesGiven: 0,
        helpfulReplies: 0,
        reputationPoints: 0,
        badges: []
      };
      
      return {
        ...studentData,
        communityStats: stats
      };
    }
    
    // Fallback to users collection
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      const userData = userSnap.data();
      
      // Get community stats
      const statsRef = doc(db, 'userCommunityStats', userId);
      const statsSnap = await getDoc(statsRef);
      const stats = statsSnap.exists() ? statsSnap.data() : {
        postsCreated: 0,
        repliesGiven: 0,
        helpfulReplies: 0,
        reputationPoints: 0,
        badges: []
      };
      
      return {
        ...userData,
        communityStats: stats
      };
    }
    
    return null;
  } catch (error) {
    console.error('Get user profile error:', error);
    return null;
  }
};
// MIGRATION: Call this once to fix existing stats
export const migrateUserStats = async (userId) => {
  try {
    // Try to find old stats with query
    const oldQuery = query(
      collection(db, 'userCommunityStats'),
      where('userId', '==', userId)
    );
    
    const oldSnap = await getDocs(oldQuery);
    
    if (!oldSnap.empty) {
      const oldData = oldSnap.docs[0].data();
      const oldDocId = oldSnap.docs[0].id;
      
      // Create new doc with userId as ID
      const newStatsRef = doc(db, 'userCommunityStats', userId);
      await setDoc(newStatsRef, oldData);
      
      // Delete old doc
      await deleteDoc(doc(db, 'userCommunityStats', oldDocId));
      
      console.log('✅ Stats migrated successfully');
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Migration error:', error);
    return false;
  }
};