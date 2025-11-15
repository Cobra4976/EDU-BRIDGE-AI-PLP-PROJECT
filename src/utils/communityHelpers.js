// src/utils/communityHelpers.js

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
  onSnapshot,
  increment,
  arrayUnion,
  arrayRemove,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../utils/firebase'

/**
 * Post types
 */
export const POST_TYPES = {
  QUESTION: 'question',
  RESOURCE: 'resource',
  DISCUSSION: 'discussion',
  SUCCESS_STORY: 'success-story'
};

/**
 * Create a new community post
 */
export async function createCommunityPost({
  userId,
  authorName,
  authorCountry,
  authorSubject,
  authorGrade,
  authorSystem,
  postType,
  title,
  content,
  resourceLink, // Google Drive/Dropbox link
  tags
}) {
  try {
    // Basic content moderation (simple keyword filter)
    const flagged = moderateContent(content + ' ' + title);
    
    const postData = {
      userId,
      authorName,
      authorCountry,
      authorSubject,
      authorGrade,
      authorSystem,
      postType,
      title: title.trim(),
      content: content.trim(),
      resourceLink: resourceLink ? resourceLink.trim() : null,
      tags: tags || [],
      likesCount: 0,
      commentsCount: 0,
      likedBy: [],
      flagged: flagged,
      flagCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    const docRef = await addDoc(collection(db, 'community_posts'), postData);
    
    return {
      success: true,
      postId: docRef.id,
      message: 'Post created successfully!'
    };
  } catch (error) {
    console.error('Error creating post:', error);
    return {
      success: false,
      message: 'Failed to create post. Please try again.'
    };
  }
}

/**
 * Get community posts with real-time updates
 */
export function subscribeToCommunityPosts(filters, callback) {
  let q = query(
    collection(db, 'community_posts'),
    where('flagged', '==', false), // Only show non-flagged posts
    orderBy('createdAt', 'desc'),
    limit(50)
  );

  // Apply filters
  if (filters.country) {
    q = query(
      collection(db, 'community_posts'),
      where('flagged', '==', false),
      where('authorCountry', '==', filters.country),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
  }

  if (filters.subject) {
    q = query(
      collection(db, 'community_posts'),
      where('flagged', '==', false),
      where('authorSubject', '==', filters.subject),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
  }

  if (filters.postType) {
    q = query(
      collection(db, 'community_posts'),
      where('flagged', '==', false),
      where('postType', '==', filters.postType),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
  }

  // Real-time listener
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const posts = [];
    snapshot.forEach((doc) => {
      posts.push({
        id: doc.id,
        ...doc.data()
      });
    });
    callback(posts);
  }, (error) => {
    console.error('Error fetching posts:', error);
    callback([]);
  });

  return unsubscribe;
}

/**
 * Like/Unlike a post
 */
export async function toggleLikePost(postId, userId) {
  try {
    const postRef = doc(db, 'community_posts', postId);
    const postSnap = await getDoc(postRef);
    
    if (!postSnap.exists()) {
      throw new Error('Post not found');
    }

    const likedBy = postSnap.data().likedBy || [];
    const hasLiked = likedBy.includes(userId);

    if (hasLiked) {
      // Unlike
      await updateDoc(postRef, {
        likesCount: increment(-1),
        likedBy: arrayRemove(userId)
      });
    } else {
      // Like
      await updateDoc(postRef, {
        likesCount: increment(1),
        likedBy: arrayUnion(userId)
      });
    }

    return { success: true, liked: !hasLiked };
  } catch (error) {
    console.error('Error toggling like:', error);
    return { success: false };
  }
}

/**
 * Add a comment to a post
 */
export async function addComment(postId, userId, authorName, content) {
  try {
    // Moderate comment
    const flagged = moderateContent(content);
    
    const commentData = {
      postId,
      userId,
      authorName,
      content: content.trim(),
      flagged,
      createdAt: serverTimestamp()
    };

    await addDoc(collection(db, 'community_comments'), commentData);
    
    // Increment comment count on post
    const postRef = doc(db, 'community_posts', postId);
    await updateDoc(postRef, {
      commentsCount: increment(1)
    });

    return { success: true, message: 'Comment added!' };
  } catch (error) {
    console.error('Error adding comment:', error);
    return { success: false, message: 'Failed to add comment.' };
  }
}

/**
 * Get comments for a post with real-time updates
 */
export function subscribeToComments(postId, callback) {
  const q = query(
    collection(db, 'community_comments'),
    where('postId', '==', postId),
    where('flagged', '==', false),
    orderBy('createdAt', 'asc')
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const comments = [];
    snapshot.forEach((doc) => {
      comments.push({
        id: doc.id,
        ...doc.data()
      });
    });
    callback(comments);
  }, (error) => {
    console.error('Error fetching comments:', error);
    callback([]);
  });

  return unsubscribe;
}

/**
 * Flag inappropriate content
 */
export async function flagPost(postId, userId) {
  try {
    const postRef = doc(db, 'community_posts', postId);
    await updateDoc(postRef, {
      flagCount: increment(1)
    });

    // Auto-hide if flagged by 3+ users
    const postSnap = await getDoc(postRef);
    const flagCount = postSnap.data().flagCount || 0;
    
    if (flagCount >= 3) {
      await updateDoc(postRef, {
        flagged: true
      });
    }

    return { success: true, message: 'Content flagged for review.' };
  } catch (error) {
    console.error('Error flagging post:', error);
    return { success: false };
  }
}

/**
 * Simple content moderation
 * Checks for inappropriate keywords
 */
function moderateContent(text) {
  const inappropriateWords = [
    'spam', 'scam', 'hate', 'offensive',
    // Add more keywords as needed
  ];

  const lowerText = text.toLowerCase();
  return inappropriateWords.some(word => lowerText.includes(word));
}

/**
 * Get posts by a specific teacher
 */
export async function getTeacherPosts(userId) {
  try {
    const q = query(
      collection(db, 'community_posts'),
      where('userId', '==', userId),
      where('flagged', '==', false),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const snapshot = await getDocs(q);
    const posts = [];
    snapshot.forEach((doc) => {
      posts.push({
        id: doc.id,
        ...doc.data()
      });
    });

    return posts;
  } catch (error) {
    console.error('Error fetching teacher posts:', error);
    return [];
  }
}

/**
 * Search posts by keyword
 */
export async function searchPosts(keyword) {
  try {
    // Note: Firestore doesn't support full-text search
    // This is a basic implementation - consider using Algolia for better search
    const q = query(
      collection(db, 'community_posts'),
      where('flagged', '==', false),
      orderBy('createdAt', 'desc'),
      limit(100)
    );

    const snapshot = await getDocs(q);
    const posts = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      const searchText = `${data.title} ${data.content}`.toLowerCase();
      if (searchText.includes(keyword.toLowerCase())) {
        posts.push({
          id: doc.id,
          ...data
        });
      }
    });

    return posts;
  } catch (error) {
    console.error('Error searching posts:', error);
    return [];
  }
}

/**
 * Format timestamp for display
 */
export function formatPostTime(timestamp) {
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
}