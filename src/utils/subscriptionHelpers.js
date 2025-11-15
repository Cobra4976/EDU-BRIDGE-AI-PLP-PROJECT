// src/utils/subscriptionHelpers.js

/**
 * Subscription Helper Functions
 * Manages subscription tiers, query limits, and feature access
 */

import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../utils/firebase';

// Subscription tiers
export const TIERS = {
  FREE: 'free',
  PRO: 'pro',
  SCHOOL: 'school'
};

// Subscription statuses
export const STATUS = {
  ACTIVE: 'active',
  TRIAL: 'trial',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled'
};

// Free tier limits
export const FREE_DAILY_LIMIT = 10;

/**
 * Get teacher's timezone (East Africa for now)
 * You can enhance this later to detect from browser or profile
 */
export function getTeacherTimezone() {
  // For East Africa: Kenya, Uganda, Tanzania, Rwanda
  return 'Africa/Nairobi'; // UTC+3
}

/**
 * Get current date in teacher's timezone (YYYY-MM-DD format)
 */
export function getCurrentDateInTimezone(timezone = 'Africa/Nairobi') {
  const now = new Date();
  const options = { 
    timeZone: timezone, 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit' 
  };
  const parts = new Intl.DateTimeFormat('en-US', options).formatToParts(now);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  return `${year}-${month}-${day}`;
}

/**
 * Check if user has access to a feature based on their subscription tier
 */
export function hasFeatureAccess(subscriptionTier, subscriptionStatus, feature) {
  // Features available to all tiers
  const freeFeatures = ['overview', 'profile', 'community', 'offline', 'ai-assistant'];
  
  // Features only for Pro and School tiers
  const proFeatures = ['student-progress', 'assignments'];
  
  // Check if subscription is active (including trial)
  const isActiveSubscription = 
    subscriptionStatus === STATUS.ACTIVE || 
    subscriptionStatus === STATUS.TRIAL;
  
  // Free tier gets basic features
  if (freeFeatures.includes(feature)) {
    return true;
  }
  
  // Pro features require active Pro or School subscription
  if (proFeatures.includes(feature)) {
    return (subscriptionTier === TIERS.PRO || subscriptionTier === TIERS.SCHOOL) 
           && isActiveSubscription;
  }
  
  return false;
}

/**
 * Check if user can make an AI query
 * Returns: { canQuery: boolean, remaining: number, message: string }
 */
export async function canMakeAIQuery(userId, subscriptionTier, subscriptionStatus) {
  try {
    // Pro and School tiers (including trial) get unlimited queries
    if ((subscriptionTier === TIERS.PRO || subscriptionTier === TIERS.SCHOOL) && 
        (subscriptionStatus === STATUS.ACTIVE || subscriptionStatus === STATUS.TRIAL)) {
      return { 
        canQuery: true, 
        remaining: -1, // -1 means unlimited
        message: 'Unlimited queries available' 
      };
    }
    
    // Free tier - check daily limit
    const teacherRef = doc(db, 'teachers', userId);
    const teacherSnap = await getDoc(teacherRef);
    
    if (!teacherSnap.exists()) {
      throw new Error('Teacher profile not found');
    }
    
    const data = teacherSnap.data();
    const timezone = data.timezone || getTeacherTimezone();
    const today = getCurrentDateInTimezone(timezone);
    const lastQueryDate = data.lastQueryDate || '';
    const dailyQueryCount = data.dailyQueryCount || 0;
    
    // If it's a new day, reset the counter
    if (lastQueryDate !== today) {
      return {
        canQuery: true,
        remaining: FREE_DAILY_LIMIT - 1,
        message: `${FREE_DAILY_LIMIT - 1} queries remaining today`
      };
    }
    
    // Check if limit reached
    if (dailyQueryCount >= FREE_DAILY_LIMIT) {
      return {
        canQuery: false,
        remaining: 0,
        message: 'Daily limit reached. Upgrade to Pro for unlimited queries!'
      };
    }
    
    // Can query
    const remaining = FREE_DAILY_LIMIT - dailyQueryCount - 1;
    return {
      canQuery: true,
      remaining,
      message: `${remaining} queries remaining today`
    };
    
  } catch (error) {
    console.error('Error checking query limit:', error);
    return {
      canQuery: false,
      remaining: 0,
      message: 'Error checking query limit'
    };
  }
}

/**
 * Increment query count for free tier users
 */
export async function incrementQueryCount(userId, subscriptionTier) {
  // Only track for free tier
  if (subscriptionTier !== TIERS.FREE) {
    return;
  }
  
  try {
    const teacherRef = doc(db, 'teachers', userId);
    const teacherSnap = await getDoc(teacherRef);
    
    if (!teacherSnap.exists()) {
      throw new Error('Teacher profile not found');
    }
    
    const data = teacherSnap.data();
    const timezone = data.timezone || getTeacherTimezone();
    const today = getCurrentDateInTimezone(timezone);
    const lastQueryDate = data.lastQueryDate || '';
    const dailyQueryCount = data.dailyQueryCount || 0;
    
    // If new day, reset counter
    if (lastQueryDate !== today) {
      await updateDoc(teacherRef, {
        dailyQueryCount: 1,
        lastQueryDate: today
      });
    } else {
      // Increment counter
      await updateDoc(teacherRef, {
        dailyQueryCount: dailyQueryCount + 1
      });
    }
  } catch (error) {
    console.error('Error incrementing query count:', error);
  }
}

/**
 * Check if subscription is expired
 */
export function isSubscriptionExpired(subscriptionExpiry) {
  if (!subscriptionExpiry) return true;
  const expiry = subscriptionExpiry.toDate ? subscriptionExpiry.toDate() : new Date(subscriptionExpiry);
  return expiry < new Date();
}

/**
 * Get days remaining in subscription/trial
 */
export function getDaysRemaining(subscriptionExpiry) {
  if (!subscriptionExpiry) return 0;
  const expiry = subscriptionExpiry.toDate ? subscriptionExpiry.toDate() : new Date(subscriptionExpiry);
  const now = new Date();
  const diffTime = expiry - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Initialize subscription fields for new teacher
 */
export async function initializeSubscription(userId, email) {
  try {
    const teacherRef = doc(db, 'teachers', userId);
    const timezone = getTeacherTimezone();
    
    await setDoc(teacherRef, {
      subscriptionTier: TIERS.FREE,
      subscriptionStatus: STATUS.ACTIVE,
      subscriptionExpiry: null,
      trialStartDate: null,
      trialUsed: false,
      dailyQueryCount: 0,
      lastQueryDate: '',
      timezone: timezone,
      intasendCustomerId: null,
      lastPaymentDate: null,
      schoolId: null,
      schoolRole: null,
      email: email,
      createdAt: new Date().toISOString()
    }, { merge: true });
    
    console.log('Subscription initialized for user:', userId);
  } catch (error) {
    console.error('Error initializing subscription:', error);
    throw error;
  }
}

/**
 * Start 7-day free trial
 */
export async function startFreeTrial(userId) {
  try {
    const teacherRef = doc(db, 'teachers', userId);
    const teacherSnap = await getDoc(teacherRef);
    
    if (!teacherSnap.exists()) {
      throw new Error('Teacher profile not found');
    }
    
    const data = teacherSnap.data();
    
    // Check if trial already used
    if (data.trialUsed) {
      throw new Error('Free trial already used');
    }
    
    // Set trial expiry to 7 days from now
    const trialExpiry = new Date();
    trialExpiry.setDate(trialExpiry.getDate() + 7);
    
    await updateDoc(teacherRef, {
      subscriptionTier: TIERS.PRO,
      subscriptionStatus: STATUS.TRIAL,
      subscriptionExpiry: trialExpiry.toISOString(),
      trialStartDate: new Date().toISOString(),
      trialUsed: true
    });
    
    return {
      success: true,
      message: '7-day free trial activated!',
      expiryDate: trialExpiry
    };
    
  } catch (error) {
    console.error('Error starting free trial:', error);
    return {
      success: false,
      message: error.message || 'Failed to start trial'
    };
  }
}

/**
 * Get subscription display info
 */
export function getSubscriptionDisplayInfo(tier, status) {
  const tierNames = {
    [TIERS.FREE]: 'Free',
    [TIERS.PRO]: 'Teacher Pro',
    [TIERS.SCHOOL]: 'School License'
  };
  
  const statusLabels = {
    [STATUS.ACTIVE]: 'Active',
    [STATUS.TRIAL]: 'Trial',
    [STATUS.EXPIRED]: 'Expired',
    [STATUS.CANCELLED]: 'Cancelled'
  };
  
  return {
    tierName: tierNames[tier] || 'Free',
    statusLabel: statusLabels[status] || 'Unknown',
    color: status === STATUS.ACTIVE || status === STATUS.TRIAL ? 'green' : 'gray'
  };
}