// src/utils/offlineStorage.js

const DB_NAME = 'StudentDashboardDB';
const DB_VERSION = 3;

// Store names
const STORES = {
  PROFILE: 'studentProfile',
  TASKS: 'tasks',
  SKILLS: 'skills',
  ACHIEVEMENTS: 'achievements',
  CHAT_MESSAGES: 'chatMessages',
  SYNC_QUEUE: 'syncQueue',
  LEARNING_PATHS: 'learningPaths'


};

/**
 * Initialize IndexedDB database
 * Creates object stores for all data types
 */
export const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('IndexedDB initialization error:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      console.log('IndexedDB initialized successfully');
      resolve(request.result);
    };

    // Create object stores on first initialization or version upgrade
    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Student Profile store
      if (!db.objectStoreNames.contains(STORES.PROFILE)) {
        db.createObjectStore(STORES.PROFILE, { keyPath: 'userId' });
      }

      // Tasks store
      if (!db.objectStoreNames.contains(STORES.TASKS)) {
        const tasksStore = db.createObjectStore(STORES.TASKS, { keyPath: 'userId' });
        tasksStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // Skills store
      if (!db.objectStoreNames.contains(STORES.SKILLS)) {
        const skillsStore = db.createObjectStore(STORES.SKILLS, { keyPath: 'userId' });
        skillsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // Achievements store
      if (!db.objectStoreNames.contains(STORES.ACHIEVEMENTS)) {
        const achievementsStore = db.createObjectStore(STORES.ACHIEVEMENTS, { keyPath: 'userId' });
        achievementsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // Chat Messages store
      if (!db.objectStoreNames.contains(STORES.CHAT_MESSAGES)) {
        const chatStore = db.createObjectStore(STORES.CHAT_MESSAGES, { keyPath: 'userId' });
        chatStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // Sync Queue store - for operations to replay when online
      if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
        syncStore.createIndex('timestamp', 'timestamp', { unique: false });
        syncStore.createIndex('status', 'status', { unique: false });
      }
      // ✅ ADD THIS: Learning Paths store
  if (!db.objectStoreNames.contains('learningPaths')) {
    const pathsStore = db.createObjectStore('learningPaths', { keyPath: 'id' });
    pathsStore.createIndex('userId', 'userId', { unique: false });
    pathsStore.createIndex('skillName', 'skillName', { unique: false });
    pathsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
    console.log('✅ Learning Paths store created');
  }
  console.log('IndexedDB object stores created');
 };
  });
};

/**
 * Get a database connection
 */
const getDB = async () => {
  return await initDB();
};

/**
 * Save data to a specific store
 * @param {string} storeName - Name of the object store
 * @param {string} userId - User ID (used as key)
 * @param {any} data - Data to save
 */
export const saveData = async (storeName, userId, data) => {
  try {
    const db = await getDB();
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);

    const dataToSave = {
      userId,
      data,
      updatedAt: new Date().toISOString()
    };

    const request = store.put(dataToSave);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log(`Data saved to ${storeName} for user ${userId}`);
        resolve(true);
      };

      request.onerror = () => {
        console.error(`Error saving to ${storeName}:`, request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('saveData error:', error);
    throw error;
  }
};

/**
 * Get data from a specific store
 * @param {string} storeName - Name of the object store
 * @param {string} userId - User ID (used as key)
 */
export const getData = async (storeName, userId) => {
  try {
    const db = await getDB();
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);

    const request = store.get(userId);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        if (request.result) {
          console.log(`Data retrieved from ${storeName} for user ${userId}`);
          resolve(request.result.data);
        } else {
          console.log(`No data found in ${storeName} for user ${userId}`);
          resolve(null);
        }
      };

      request.onerror = () => {
        console.error(`Error retrieving from ${storeName}:`, request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('getData error:', error);
    return null;
  }
};

/**
 * Delete data from a specific store
 * @param {string} storeName - Name of the object store
 * @param {string} userId - User ID (used as key)
 */
export const deleteData = async (storeName, userId) => {
  try {
    const db = await getDB();
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);

    const request = store.delete(userId);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log(`Data deleted from ${storeName} for user ${userId}`);
        resolve(true);
      };

      request.onerror = () => {
        console.error(`Error deleting from ${storeName}:`, request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('deleteData error:', error);
    throw error;
  }
};

/**
 * Add operation to sync queue (for operations that failed while offline)
 * @param {Object} operation - Operation details
 */
export const queueOperation = async (operation) => {
  try {
    const db = await getDB();
    const transaction = db.transaction([STORES.SYNC_QUEUE], 'readwrite');
    const store = transaction.objectStore(STORES.SYNC_QUEUE);

    const queueItem = {
      ...operation,
      timestamp: new Date().toISOString(),
      status: 'pending',
      retryCount: 0
    };

    const request = store.add(queueItem);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log('Operation queued for sync:', queueItem);
        resolve(request.result); // Returns the auto-generated id
      };

      request.onerror = () => {
        console.error('Error queuing operation:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('queueOperation error:', error);
    throw error;
  }
};

/**
 * Get all pending operations from sync queue
 */
export const getSyncQueue = async () => {
  try {
    const db = await getDB();
    const transaction = db.transaction([STORES.SYNC_QUEUE], 'readonly');
    const store = transaction.objectStore(STORES.SYNC_QUEUE);
    const index = store.index('status');

    const request = index.getAll('pending');

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log(`Retrieved ${request.result.length} pending operations`);
        resolve(request.result);
      };

      request.onerror = () => {
        console.error('Error retrieving sync queue:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('getSyncQueue error:', error);
    return [];
  }
};

/**
 * Update sync queue item status
 * @param {number} id - Queue item id
 * @param {string} status - New status ('pending', 'completed', 'failed')
 */
export const updateSyncQueueStatus = async (id, status) => {
  try {
    const db = await getDB();
    const transaction = db.transaction([STORES.SYNC_QUEUE], 'readwrite');
    const store = transaction.objectStore(STORES.SYNC_QUEUE);

    const getRequest = store.get(id);

    return new Promise((resolve, reject) => {
      getRequest.onsuccess = () => {
        const item = getRequest.result;
        if (item) {
          item.status = status;
          item.updatedAt = new Date().toISOString();
          if (status === 'failed') {
            item.retryCount = (item.retryCount || 0) + 1;
          }

          const updateRequest = store.put(item);
          
          updateRequest.onsuccess = () => {
            console.log(`Sync queue item ${id} status updated to ${status}`);
            resolve(true);
          };

          updateRequest.onerror = () => {
            console.error('Error updating sync queue item:', updateRequest.error);
            reject(updateRequest.error);
          };
        } else {
          resolve(false);
        }
      };

      getRequest.onerror = () => {
        console.error('Error getting sync queue item:', getRequest.error);
        reject(getRequest.error);
      };
    });
  } catch (error) {
    console.error('updateSyncQueueStatus error:', error);
    throw error;
  }
};

/**
 * Remove completed operations from sync queue
 */
export const clearCompletedFromQueue = async () => {
  try {
    const db = await getDB();
    const transaction = db.transaction([STORES.SYNC_QUEUE], 'readwrite');
    const store = transaction.objectStore(STORES.SYNC_QUEUE);
    const index = store.index('status');

    const request = index.openCursor(IDBKeyRange.only('completed'));

    return new Promise((resolve, reject) => {
      let deletedCount = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        } else {
          console.log(`Cleared ${deletedCount} completed operations from sync queue`);
          resolve(deletedCount);
        }
      };

      request.onerror = () => {
        console.error('Error clearing sync queue:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('clearCompletedFromQueue error:', error);
    throw error;
  }
};

/**
 * Get sync queue count by status
 */
export const getSyncQueueCount = async () => {
  try {
    const db = await getDB();
    const transaction = db.transaction([STORES.SYNC_QUEUE], 'readonly');
    const store = transaction.objectStore(STORES.SYNC_QUEUE);

    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const items = request.result;
        const counts = {
          pending: items.filter(i => i.status === 'pending').length,
          completed: items.filter(i => i.status === 'completed').length,
          failed: items.filter(i => i.status === 'failed').length,
          total: items.length
        };
        resolve(counts);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('getSyncQueueCount error:', error);
    return { pending: 0, completed: 0, failed: 0, total: 0 };
  }
};

/**
 * Clear all data from database (useful for logout or reset)
 */
export const clearAllData = async () => {
  try {
    const db = await getDB();
    const storeNames = Object.values(STORES);
    
    const transaction = db.transaction(storeNames, 'readwrite');
    
    const promises = storeNames.map(storeName => {
      const store = transaction.objectStore(storeName);
      return new Promise((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });

    await Promise.all(promises);
    console.log('All data cleared from IndexedDB');
    return true;
  } catch (error) {
    console.error('clearAllData error:', error);
    throw error;
  }
};

// Export store names for use in other modules
export { STORES };
// src/utils/offlineStorage.js

// ... Keep all your existing code above ...

// ============================================
// NEW: LEARNING PATHS STORE
// ============================================
/**
 * Save learning path for a specific skill
 * @param {string} userId - User ID
 * @param {string} skillName - Name of the skill
 * @param {Object} learningPath - Learning path content
 */
export const saveLearningPath = async (userId, skillName, learningPath) => {
  try {
    const db = await getDB();
    const transaction = db.transaction(['learningPaths'], 'readwrite');
    const store = transaction.objectStore('learningPaths');
    
    const pathData = {
      id: `${userId}_${skillName}`,
      userId,
      skillName,
      content: learningPath,
      updatedAt: new Date().toISOString()
    };
    
    const request = store.put(pathData);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log(`✅ Learning path saved for ${skillName}`);
        resolve(true);
      };
      request.onerror = () => {
        console.error('Error saving learning path:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('saveLearningPath error:', error);
    return false;
  }
};


/**
 * Get learning path for a specific skill
 * @param {string} userId - User ID
 * @param {string} skillName - Name of the skill
 */
export const getLearningPath = async (userId, skillName) => {
  try {
    const db = await getDB();
    
    if (!db.objectStoreNames.contains('learningPaths')) {
      console.log('learningPaths store does not exist yet');
      return null;
    }
    
    const transaction = db.transaction(['learningPaths'], 'readonly');
    const store = transaction.objectStore('learningPaths');
    const request = store.get(`${userId}_${skillName}`);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        if (request.result) {
          console.log(`Retrieved learning path for ${skillName}`);
          resolve(request.result.content);
        } else {
          // Fallback to localStorage
          const key = `learningPath_${userId}_${skillName}`;
          const stored = localStorage.getItem(key);
          if (stored) {
            console.log(`Retrieved learning path from localStorage (fallback)`);
            resolve(JSON.parse(stored));
          } else {
            resolve(null);
          }
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('getLearningPath error:', error);
    return null;
  }
};

/**
 * Get all learning paths for a user
 * @param {string} userId - User ID
 */
export const getAllLearningPaths = async (userId) => {
  try {
    const db = await getDB();
    
    if (!db.objectStoreNames.contains('learningPaths')) {
      return [];
    }
    
    const transaction = db.transaction(['learningPaths'], 'readonly');
    const store = transaction.objectStore('learningPaths');
    const index = store.index('userId');
    const request = index.getAll(userId);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log(`Retrieved ${request.result.length} learning paths`);
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('getAllLearningPaths error:', error);
    return [];
  }
};

// ============================================
// ENHANCED: Helper functions for specific data types
// ============================================

/**
 * Save tasks with answers
 */
export const saveTasksWithAnswers = async (userId, tasks) => {
  return await saveData(STORES.TASKS, userId, tasks);
};

/**
 * Get tasks with answers
 */
export const getTasksWithAnswers = async (userId) => {
  return await getData(STORES.TASKS, userId);
};

/**
 * Save chat messages
 */
export const saveChatMessages = async (userId, messages) => {
  return await saveData(STORES.CHAT_MESSAGES, userId, messages);
};

/**
 * Get chat messages
 */
export const getChatMessages = async (userId) => {
  return await getData(STORES.CHAT_MESSAGES, userId);
};

/**
 * Save skills data
 */
export const saveSkills = async (userId, skills) => {
  return await saveData(STORES.SKILLS, userId, skills);
};

/**
 * Get skills data
 */
export const getSkills = async (userId) => {
  return await getData(STORES.SKILLS, userId);
};

/**
 * Save profile data
 */
export const saveProfile = async (userId, profile) => {
  return await saveData(STORES.PROFILE, userId, profile);
};

/**
 * Get profile data
 */
export const getProfile = async (userId) => {
  return await getData(STORES.PROFILE, userId);
};

/**
 * Save achievements
 */
export const saveAchievements = async (userId, achievements) => {
  return await saveData(STORES.ACHIEVEMENTS, userId, achievements);
};

/**
 * Get achievements
 */
export const getAchievements = async (userId) => {
  return await getData(STORES.ACHIEVEMENTS, userId);
};

// ============================================
// LOAD ALL CACHED DATA AT ONCE
// ============================================

/**
 * Load all offline data for a user
 * @param {string} userId - User ID
 * @returns {Object} Object containing all cached data
 */
export const loadAllCachedData = async (userId) => {
  console.log('📦 Loading all cached data for user:', userId);
  
  try {
    const [
      tasks,
      skills,
      achievements,
      chatMessages,
      learningPaths,
      profile
    ] = await Promise.all([
      getTasksWithAnswers(userId),
      getSkills(userId),
      getAchievements(userId),
      getChatMessages(userId),
      getAllLearningPaths(userId),
      getProfile(userId)
    ]);
    
    const summary = {
      tasks: tasks || [],
      skills: skills || {},
      achievements: achievements || [],
      chatMessages: chatMessages || [],
      learningPaths: learningPaths || [],
      profile: profile || null
    };
    
    console.log('✅ Cached data summary:', {
      tasks: summary.tasks.length,
      skillCategories: Object.keys(summary.skills).length,
      achievements: summary.achievements.length,
      chatMessages: summary.chatMessages.length,
      learningPaths: summary.learningPaths.length,
      hasProfile: !!summary.profile
    });
    
    return summary;
  } catch (error) {
    console.error('❌ Error loading cached data:', error);
    return {
      tasks: [],
      skills: {},
      achievements: [],
      chatMessages: [],
      learningPaths: [],
      profile: null
    };
  }
};

// ============================================
// CLEAR ALL OFFLINE DATA (enhanced)
// ============================================

/**
 * Clear all offline data including learning paths
 */
export const clearAllOfflineData = async () => {
  try {
    await clearAllData(); // Use existing function
    
    // Also clear localStorage fallbacks
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('learningPath_')) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    console.log('✅ All offline data cleared (IndexedDB + localStorage)');
    return true;
  } catch (error) {
    console.error('❌ Error clearing offline data:', error);
    return false;
  }
};

// ============================================
// GET CACHE STATISTICS
// ============================================

/**
 * Get statistics about cached data
 * @param {string} userId - User ID
 */
export const getCacheStats = async (userId) => {
  try {
    const data = await loadAllCachedData(userId);
    
    return {
      tasks: {
        count: data.tasks.length,
        withAnswers: data.tasks.filter(t => t.answer).length
      },
      skills: {
        academic: data.skills.academic ? Object.keys(data.skills.academic).length : 0,
        technology: data.skills.technology ? Object.keys(data.skills.technology).length : 0,
        total: (data.skills.academic ? Object.keys(data.skills.academic).length : 0) +
               (data.skills.technology ? Object.keys(data.skills.technology).length : 0)
      },
      learningPaths: {
        count: data.learningPaths.length,
        skills: data.learningPaths.map(p => p.skillName)
      },
      chatMessages: {
        count: data.chatMessages.length,
        userMessages: data.chatMessages.filter(m => m.role === 'user').length,
        aiMessages: data.chatMessages.filter(m => m.role === 'assistant').length
      },
      achievements: {
        count: data.achievements.length
      },
      profile: {
        cached: !!data.profile
      },
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error('getCacheStats error:', error);
    return null;
  }
};
/**
 * ONE-TIME USE: Delete old database to force clean recreation
 */
export const nukeDatabase = () => {
  return new Promise((resolve, reject) => {
    const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
    
    deleteRequest.onsuccess = () => {
      console.log('🗑️ Old database deleted successfully');
      resolve();
    };
    
    deleteRequest.onerror = () => {
      console.error('Failed to delete database:', deleteRequest.error);
      reject(deleteRequest.error);
    };
    
    deleteRequest.onblocked = () => {
      console.warn('⚠️ Database deletion blocked. Close all tabs and try again.');
      reject(new Error('Database deletion blocked'));
    };
  });
};



