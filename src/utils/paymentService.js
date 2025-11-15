// src/utils/paymentService.js
const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export const paymentService = {
  /**
   * Initiate M-Pesa payment
   */
  async initiateMpesaPayment(phoneNumber, amount, userId, subscriptionTier = 'premium') {
    try {
      const response = await fetch(`${API_BASE_URL}/api/payment/mpesa/initiate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phoneNumber,
          amount,
          userId,
          subscriptionTier
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Payment initiation failed');
      }

      return {
        success: true,
        transactionId: data.transactionId,
        checkoutRequestId: data.checkoutRequestId,
        message: data.message
      };

    } catch (error) {
      console.error('Payment initiation error:', error);
      return {
        success: false,
        error: error.message || 'Failed to initiate payment'
      };
    }
  },

  /**
   * Check payment status
   */
  async checkPaymentStatus(transactionId) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/payment/mpesa/status/${transactionId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Status check failed');
      }

      return {
        success: true,
        transaction: data.transaction
      };

    } catch (error) {
      console.error('Status check error:', error);
      return {
        success: false,
        error: error.message || 'Failed to check status'
      };
    }
  },

  /**
   * Poll payment status until completion or timeout
   */
  async pollPaymentStatus(transactionId, maxAttempts = 30, intervalMs = 2000) {
    let attempts = 0;

    return new Promise((resolve) => {
      const interval = setInterval(async () => {
        attempts++;

        const result = await this.checkPaymentStatus(transactionId);

        if (result.success && result.transaction) {
          const status = result.transaction.status;

          // Terminal statuses
          if (['completed', 'failed', 'cancelled', 'timeout'].includes(status)) {
            clearInterval(interval);
            resolve({
              success: status === 'completed',
              status,
              transaction: result.transaction
            });
            return;
          }
        }

        // Timeout after max attempts
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          resolve({
            success: false,
            status: 'timeout',
            error: 'Payment verification timeout'
          });
        }
      }, intervalMs);
    });
  }
};