// src/utils/schoolManagementHelpers.js

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

/**
 * Generate invite code for school
 */
export async function generateInviteCode(adminUserId) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/school/generate-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminUserId })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to generate invite');
    }

    return await response.json();
  } catch (error) {
    console.error('Error generating invite:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Accept school invite
 */
export async function acceptSchoolInvite(inviteCode, teacherUserId) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/school/accept-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteCode, teacherUserId })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to accept invite');
    }

    return await response.json();
  } catch (error) {
    console.error('Error accepting invite:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Remove teacher from school
 */
export async function removeTeacherFromSchool(adminUserId, teacherUserId) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/school/remove-teacher`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminUserId, teacherUserId })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to remove teacher');
    }

    return await response.json();
  } catch (error) {
    console.error('Error removing teacher:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get school details
 */
export async function getSchoolDetails(schoolId, adminUserId) {
  try {
    const response = await fetch(
      `${BACKEND_URL}/api/school/${schoolId}?adminUserId=${adminUserId}`
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get school details');
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting school details:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get school stats
 */
export async function getSchoolStats(schoolId) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/school/${schoolId}/stats`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get school stats');
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting school stats:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Copy invite link to clipboard
 */
export function copyInviteLink(inviteLink) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(inviteLink)
      .then(() => true)
      .catch(() => false);
  }
  
  // Fallback for older browsers
  const textArea = document.createElement('textarea');
  textArea.value = inviteLink;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  document.body.appendChild(textArea);
  textArea.select();
  
  try {
    document.execCommand('copy');
    document.body.removeChild(textArea);
    return Promise.resolve(true);
  } catch (error) {
    document.body.removeChild(textArea);
    return Promise.resolve(false);
  }
}