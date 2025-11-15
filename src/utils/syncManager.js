// src/utils/syncManager.js
import { doc, setDoc, updateDoc, getDoc } from 'firebase/firestore';

import { db } from '../utils/firebase';
import {
  saveData,
  getData,
  queueOperation,
  getSyncQueue,
  updateSyncQueueStatus,
  clearCompletedFromQueue,
  getSyncQueueCount,
  STORES
} from '../utils/offlineStorage';

/**
 * Sync Manager - Handles offline data persistence and synchronization
 */

/**
 * Save student data with offline support
 * If online: saves to Firebase and IndexedDB
 * If offline: saves to IndexedDB and queues for sync
 * 
 * @param {string} userId - User ID
 * @param {Object} data - Data to save
 * @param {string} storeName - IndexedDB store name
 * @param {boolean} isOnline - Current online status
 */
export const saveStudentDataWithSync = async (userId, data, storeName, isOnline) => {
  try {
    // Always save to IndexedDB first (works offline and online)
    await saveData(storeName, userId, data);
    console.log(`✅ Data saved to IndexedDB (${storeName})`);

    if (isOnline) {
      // If online, also save to Firebase
      try {
        const studentRef = doc(db, 'students', userId);
        const payload = { [storeName]: data, updatedAt: new Date().toISOString() };
        await setDoc(studentRef, payload, { merge: true });
        console.log(`✅ Data synced to Firebase (${storeName})`);
        return { success: true, synced: true };
      } catch (firebaseError) {
        console.error('Firebase save failed, queuing for sync:', firebaseError);
        // Queue the operation if Firebase fails
        await queueOperation({
          type: 'UPDATE',
          userId,
          storeName,
          data,
          collection: 'students'
        });
        return { success: true, synced: false, queued: true };
      }
    } else {
      // If offline, queue the operation
      await queueOperation({
        type: 'UPDATE',
        userId,
        storeName,
        data,
        collection: 'students'
      });
      console.log(`📴 Offline: Operation queued for sync (${storeName})`);
      return { success: true, synced: false, queued: true };
    }
  } catch (error) {
    console.error('saveStudentDataWithSync error:', error);
    throw error;
  }
};

/**
 * Load student data with offline fallback
 * Tries Firebase first, falls back to IndexedDB if offline
 * 
 * @param {string} userId - User ID
 * @param {string} storeName - IndexedDB store name
 * @param {boolean} isOnline - Current online status
 */
export const loadStudentDataWithSync = async (userId, storeName, isOnline) => {
  try {
    // Try IndexedDB first for instant load (works offline)
    const cachedData = await getData(storeName, userId);
    
    if (!isOnline) {
      // If offline, return cached data
      console.log(`📴 Offline: Loading from IndexedDB (${storeName})`);
      return { data: cachedData, source: 'cache' };
    }

    // If online, try to get fresh data from Firebase
    try {
      const studentRef = doc(db, 'students', userId);
      const snapshot = await getDoc(studentRef);
      
      if (snapshot.exists() && snapshot.data()[storeName]) {
        const freshData = snapshot.data()[storeName];
        
        // Update IndexedDB cache with fresh data
        await saveData(storeName, userId, freshData);
        console.log(`✅ Fresh data loaded from Firebase (${storeName})`);
        
        return { data: freshData, source: 'firebase' };
      } else {
        // No data in Firebase, return cached data
        console.log(`ℹ️ No Firebase data, using cache (${storeName})`);
        return { data: cachedData, source: 'cache' };
      }
    } catch (firebaseError) {
      console.warn('Firebase load failed, using cache:', firebaseError);
      return { data: cachedData, source: 'cache', error: firebaseError };
    }
  } catch (error) {
    console.error('loadStudentDataWithSync error:', error);
    return { data: null, source: 'error', error };
  }
};

/**
 * Process the sync queue - replays all pending operations
 * Call this when connection is restored
 * 
 * @param {string} userId - User ID for filtering operations
 */
export const processSyncQueue = async (userId) => {
  try {
    console.log('🔄 Starting sync process...');
    
    const queue = await getSyncQueue();
    
    if (queue.length === 0) {
      console.log('✅ Sync queue is empty, nothing to sync');
      return { success: true, processed: 0, failed: 0 };
    }

    console.log(`📋 Found ${queue.length} operations to sync`);
    
    let processed = 0;
    let failed = 0;

    for (const operation of queue) {
      // Skip operations for other users
      if (operation.userId !== userId) {
        continue;
      }

      try {
        // Replay the operation
        if (operation.type === 'UPDATE') {
          const studentRef = doc(db, operation.collection || 'students', operation.userId);
          const payload = {
            [operation.storeName]: operation.data,
            updatedAt: new Date().toISOString()
          };
          
          await setDoc(studentRef, payload, { merge: true });
          
          // Mark as completed
          await updateSyncQueueStatus(operation.id, 'completed');
          processed++;
          
          console.log(`✅ Synced: ${operation.storeName} (operation ${operation.id})`);
        }
      } catch (error) {
        console.error(`❌ Failed to sync operation ${operation.id}:`, error);
        await updateSyncQueueStatus(operation.id, 'failed');
        failed++;
      }
    }

    // Clean up completed operations
    await clearCompletedFromQueue();

    console.log(`✅ Sync complete: ${processed} synced, ${failed} failed`);
    
    return { success: true, processed, failed };
  } catch (error) {
    console.error('processSyncQueue error:', error);
    return { success: false, error };
  }
};

/**
 * Get sync status information
 * Useful for displaying sync status in UI
 */
export const getSyncStatus = async () => {
  try {
    const counts = await getSyncQueueCount();
    
    return {
      hasPendingOperations: counts.pending > 0,
      pendingCount: counts.pending,
      failedCount: counts.failed,
      totalCount: counts.total,
      message: counts.pending > 0 
        ? `${counts.pending} change${counts.pending > 1 ? 's' : ''} pending sync`
        : 'All changes synced'
    };
  } catch (error) {
    console.error('getSyncStatus error:', error);
    return {
      hasPendingOperations: false,
      pendingCount: 0,
      failedCount: 0,
      totalCount: 0,
      message: 'Unable to check sync status'
    };
  }
};

/**
 * Wrapper for profile update with offline support
 */
export const updateProfileWithSync = async (userId, profileData, isOnline) => {
  return await saveStudentDataWithSync(userId, profileData, 'profile', isOnline);
};

/**
 * Wrapper for tasks with offline support
 */
export const saveTasksWithSync = async (userId, tasks, isOnline) => {
  return await saveStudentDataWithSync(userId, tasks, STORES.TASKS, isOnline);
};

/**
 * Wrapper for skills with offline support
 */
export const saveSkillsWithSync = async (userId, skills, isOnline) => {
  return await saveStudentDataWithSync(userId, skills, STORES.SKILLS, isOnline);
};

/**
 * Wrapper for achievements with offline support
 */
export const saveAchievementsWithSync = async (userId, achievements, isOnline) => {
  return await saveStudentDataWithSync(userId, achievements, STORES.ACHIEVEMENTS, isOnline);
};

/**
 * Wrapper for chat messages with offline support
 */
export const saveChatMessagesWithSync = async (userId, messages, isOnline) => {
  return await saveStudentDataWithSync(userId, messages, STORES.CHAT_MESSAGES, isOnline);
};

/**
 * Load all student data from cache (for offline mode)
 */
export const loadAllCachedData = async (userId) => {
  try {
    const [tasks, skills, achievements, chatMessages] = await Promise.all([
      getData(STORES.TASKS, userId),
      getData(STORES.SKILLS, userId),
      getData(STORES.ACHIEVEMENTS, userId),
      getData(STORES.CHAT_MESSAGES, userId)
    ]);

    return {
      tasks: tasks || [],
      skills: skills || {},
      achievements: achievements || [],
      chatMessages: chatMessages || []
    };
  } catch (error) {
    console.error('loadAllCachedData error:', error);
    return {
      tasks: [],
      skills: {},
      achievements: [],
      chatMessages: []
    };
  }
};

/**
 * Force sync - manually trigger sync process
 * Useful for "Sync Now" button
 */
export const forceSyncNow = async (userId) => {
  console.log('🔄 Manual sync triggered');
  return await processSyncQueue(userId);
};