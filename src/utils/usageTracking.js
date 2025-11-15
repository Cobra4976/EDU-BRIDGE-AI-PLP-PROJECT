// src/utils/usageTracking.js
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { SUBSCRIPTION_TIERS, SUBSCRIPTION_LIMITS } from '../utils/subscriptionLimits';

// Feature types that we track
export const FEATURE_TYPES = {
  AI_TUTOR: 'aiTutorQueries',
  TASK_GENERATION: 'taskGeneration',
  SKILLS_ANALYSIS: 'skillsAnalysis',
  LEARNING_PATHS: 'learningPaths',
  ACHIEVEMENTS: 'achievements'
};

// Get user's subscription data
export const getUserSubscription = async (userId) => {
  try {
    const subscriptionRef = doc(db, 'subscriptions', userId);
    const subscriptionDoc = await getDoc(subscriptionRef);
    
    if (!subscriptionDoc.exists()) {
      // Create default free subscription
      const defaultSubscription = {
        userId,
        tier: SUBSCRIPTION_TIERS.FREE,
        status: 'active',
        createdAt: serverTimestamp(),
        usage: initializeUsage()
      };
      
      await setDoc(subscriptionRef, defaultSubscription);
      return defaultSubscription;
    }
    
    return subscriptionDoc.data();
  } catch (error) {
    console.error('Error getting subscription:', error);
    return null;
  }
};

// Initialize usage counters
const initializeUsage = () => {
  const now = new Date();
  return {
    aiTutorQueries: {
      count: 0,
      lastReset: now.toISOString(),
      resetPeriod: 'daily'
    },
    taskGeneration: {
      count: 0,
      lastReset: now.toISOString(),
      resetPeriod: 'weekly'
    },
    skillsAnalysis: {
      count: 0,
      lastReset: now.toISOString(),
      resetPeriod: 'weekly'
    },
    learningPaths: {
      count: 0,
      lastReset: now.toISOString(),
      resetPeriod: 'weekly'
    },
    achievements: {
      count: 0,
      lastReset: now.toISOString(),
      resetPeriod: 'weekly'
    }
  };
};

// Check if usage should be reset
const shouldResetUsage = (lastReset, period) => {
  const lastResetDate = new Date(lastReset);
  const now = new Date();
  
  if (period === 'daily') {
    // Reset if it's a new day
    return lastResetDate.toDateString() !== now.toDateString();
  } else if (period === 'weekly') {
    // Reset if it's been 7+ days
    const daysDiff = Math.floor((now - lastResetDate) / (1000 * 60 * 60 * 24));
    return daysDiff >= 7;
  }
  
  return false;
};

// Check if user can use a feature
export const canUseFeature = async (userId, featureType) => {
  try {
    const subscription = await getUserSubscription(userId);
    
    if (!subscription) {
      return {
        allowed: false,
        reason: 'Subscription not found',
        remaining: 0
      };
    }
    
    // Premium users have unlimited access
    if (subscription.tier === SUBSCRIPTION_TIERS.PREMIUM) {
      return {
        allowed: true,
        remaining: Infinity,
        isPremium: true
      };
    }
    
    // Check free tier limits
    const limits = SUBSCRIPTION_LIMITS[SUBSCRIPTION_TIERS.FREE].features[featureType];
    const usage = subscription.usage?.[featureType];
    
    if (!usage) {
      return {
        allowed: true,
        remaining: limits.daily || limits.weekly,
        isPremium: false
      };
    }
    
    // Check if usage should be reset
    if (shouldResetUsage(usage.lastReset, usage.resetPeriod)) {
      return {
        allowed: true,
        remaining: limits.daily || limits.weekly,
        isPremium: false,
        needsReset: true
      };
    }
    
    // Check remaining usage
    const limit = limits.daily || limits.weekly;
    const remaining = limit - usage.count;
    
    return {
      allowed: remaining > 0,
      remaining: Math.max(0, remaining),
      limit,
      isPremium: false,
      reason: remaining <= 0 ? 'Limit reached' : null
    };
  } catch (error) {
    console.error('Error checking feature access:', error);
    return {
      allowed: false,
      reason: 'Error checking access',
      remaining: 0
    };
  }
};

// Track feature usage
export const trackFeatureUsage = async (userId, featureType) => {
  try {
    const subscriptionRef = doc(db, 'subscriptions', userId);
    const subscription = await getUserSubscription(userId);
    
    if (!subscription) {
      throw new Error('Subscription not found');
    }
    
    // Premium users don't need tracking
    if (subscription.tier === SUBSCRIPTION_TIERS.PREMIUM) {
      return { success: true, isPremium: true };
    }
    
    const usage = subscription.usage?.[featureType] || {
      count: 0,
      lastReset: new Date().toISOString(),
      resetPeriod: SUBSCRIPTION_LIMITS[SUBSCRIPTION_TIERS.FREE].features[featureType].daily ? 'daily' : 'weekly'
    };
    
    // Reset if needed
    if (shouldResetUsage(usage.lastReset, usage.resetPeriod)) {
      usage.count = 0;
      usage.lastReset = new Date().toISOString();
    }
    
    // Increment usage
    usage.count += 1;
    
    // Update Firestore
    await updateDoc(subscriptionRef, {
      [`usage.${featureType}`]: usage,
      lastUsed: serverTimestamp()
    });
    
    return {
      success: true,
      newCount: usage.count,
      isPremium: false
    };
  } catch (error) {
    console.error('Error tracking usage:', error);
    return { success: false, error: error.message };
  }
};

// Get usage summary for display
export const getUsageSummary = async (userId) => {
  try {
    const subscription = await getUserSubscription(userId);
    
    if (!subscription) {
      return null;
    }
    
    if (subscription.tier === SUBSCRIPTION_TIERS.PREMIUM) {
      return {
        tier: 'premium',
        unlimited: true
      };
    }
    
    const limits = SUBSCRIPTION_LIMITS[SUBSCRIPTION_TIERS.FREE].features;
    const usage = subscription.usage || {};
    
    const summary = {};
    
    Object.keys(FEATURE_TYPES).forEach(key => {
      const featureType = FEATURE_TYPES[key];
      const limit = limits[featureType];
      const used = usage[featureType]?.count || 0;
      
      // Check if reset is needed
      if (usage[featureType] && shouldResetUsage(usage[featureType].lastReset, usage[featureType].resetPeriod)) {
        summary[featureType] = {
          used: 0,
          limit: limit.daily || limit.weekly,
          remaining: limit.daily || limit.weekly,
          period: limit.daily ? 'daily' : 'weekly',
          needsReset: true
        };
      } else {
        const maxLimit = limit.daily || limit.weekly;
        summary[featureType] = {
          used,
          limit: maxLimit,
          remaining: Math.max(0, maxLimit - used),
          period: limit.daily ? 'daily' : 'weekly'
        };
      }
    });
    
    return {
      tier: 'free',
      features: summary
    };
  } catch (error) {
    console.error('Error getting usage summary:', error);
    return null;
  }
};

// Upgrade to premium
export const upgradeToPremium = async (userId, paymentDetails) => {
  try {
    const subscriptionRef = doc(db, 'subscriptions', userId);
    
    await updateDoc(subscriptionRef, {
      tier: SUBSCRIPTION_TIERS.PREMIUM,
      status: 'active',
      upgradedAt: serverTimestamp(),
      paymentDetails: {
        provider: paymentDetails.provider,
        transactionId: paymentDetails.transactionId,
        amount: paymentDetails.amount,
        currency: paymentDetails.currency
      },
      // Keep usage history but it won't be enforced
      premiumSince: serverTimestamp()
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error upgrading subscription:', error);
    return { success: false, error: error.message };
  }
};