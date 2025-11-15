// server/mpesaService.js
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

class MpesaService {
  constructor() {
    this.consumerKey = process.env.MPESA_CONSUMER_KEY;
    this.consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    this.passkey = process.env.MPESA_PASSKEY;
    this.shortcode = process.env.MPESA_SHORTCODE;
    this.baseUrl = process.env.MPESA_BASE_URL;
    this.callbackUrl = process.env.MPESA_CALLBACK_URL;
    this.timeoutUrl = process.env.MPESA_TIMEOUT_URL;
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Generate OAuth access token
   */
  async getAccessToken() {
    try {
      // Return cached token if still valid
      if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        return this.accessToken;
      }

      const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
      
      const response = await axios.get(
        `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
        {
          headers: {
            Authorization: `Basic ${auth}`
          }
        }
      );

      this.accessToken = response.data.access_token;
      // Token expires in 3599 seconds, cache for 3500 seconds to be safe
      this.tokenExpiry = Date.now() + (3500 * 1000);
      
      return this.accessToken;
    } catch (error) {
      console.error('M-Pesa auth error:', error.response?.data || error.message);
      throw new Error('Failed to get M-Pesa access token');
    }
  }

  /**
   * Generate password for STK Push
   */
  generatePassword() {
    const timestamp = this.getTimestamp();
    const password = Buffer.from(`${this.shortcode}${this.passkey}${timestamp}`).toString('base64');
    return { password, timestamp };
  }

  /**
   * Get current timestamp in M-Pesa format (YYYYMMDDHHmmss)
   */
  getTimestamp() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }

  /**
   * Format phone number to M-Pesa format (254XXXXXXXXX)
   */
  formatPhoneNumber(phone) {
    // Remove any spaces, dashes, or plus signs
    phone = phone.replace(/[\s\-\+]/g, '');
    
    // If starts with 0, replace with 254
    if (phone.startsWith('0')) {
      phone = '254' + phone.substring(1);
    }
    
    // If starts with 7 or 1 (without country code), add 254
    if (phone.startsWith('7') || phone.startsWith('1')) {
      phone = '254' + phone;
    }
    
    // Ensure it starts with 254
    if (!phone.startsWith('254')) {
      throw new Error('Invalid Kenyan phone number');
    }
    
    return phone;
  }

  /**
   * Initiate STK Push (Lipa Na M-Pesa Online)
   */
  async initiateSTKPush(phoneNumber, amount, accountReference, transactionDesc) {
    try {
      const accessToken = await this.getAccessToken();
      const { password, timestamp } = this.generatePassword();
      const formattedPhone = this.formatPhoneNumber(phoneNumber);

      const requestBody = {
        BusinessShortCode: this.shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.round(amount), // Must be integer
        PartyA: formattedPhone, // Customer phone
        PartyB: this.shortcode, // Business shortcode
        PhoneNumber: formattedPhone,
        CallBackURL: this.callbackUrl,
        AccountReference: accountReference, // e.g., userId
        TransactionDesc: transactionDesc || 'Premium Subscription Payment'
      };

      console.log('Initiating STK Push:', {
        phone: formattedPhone,
        amount: requestBody.Amount,
        account: accountReference
      });

      const response = await axios.post(
        `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
        requestBody,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('STK Push initiated:', response.data);

      return {
        success: true,
        checkoutRequestId: response.data.CheckoutRequestID,
        merchantRequestId: response.data.MerchantRequestID,
        responseCode: response.data.ResponseCode,
        responseDescription: response.data.ResponseDescription,
        customerMessage: response.data.CustomerMessage
      };

    } catch (error) {
      console.error('STK Push error:', error.response?.data || error.message);
      
      return {
        success: false,
        error: error.response?.data?.errorMessage || 'Failed to initiate payment',
        details: error.response?.data
      };
    }
  }

  /**
   * Query STK Push transaction status
   */
  async querySTKPushStatus(checkoutRequestId) {
    try {
      const accessToken = await this.getAccessToken();
      const { password, timestamp } = this.generatePassword();

      const requestBody = {
        BusinessShortCode: this.shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId
      };

      const response = await axios.post(
        `${this.baseUrl}/mpesa/stkpushquery/v1/query`,
        requestBody,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        success: true,
        resultCode: response.data.ResultCode,
        resultDesc: response.data.ResultDesc,
        data: response.data
      };

    } catch (error) {
      console.error('STK Query error:', error.response?.data || error.message);
      
      return {
        success: false,
        error: error.response?.data?.errorMessage || 'Failed to query transaction',
        details: error.response?.data
      };
    }
  }

  /**
   * Process M-Pesa callback response
   */
  processCallback(callbackData) {
    try {
      const { Body } = callbackData;
      const stkCallback = Body.stkCallback;

      const result = {
        merchantRequestId: stkCallback.MerchantRequestID,
        checkoutRequestId: stkCallback.CheckoutRequestID,
        resultCode: stkCallback.ResultCode,
        resultDesc: stkCallback.ResultDesc
      };

      // ResultCode 0 means success
      if (stkCallback.ResultCode === 0) {
        const callbackMetadata = stkCallback.CallbackMetadata.Item;
        
        result.success = true;
        result.amount = callbackMetadata.find(item => item.Name === 'Amount')?.Value;
        result.mpesaReceiptNumber = callbackMetadata.find(item => item.Name === 'MpesaReceiptNumber')?.Value;
        result.transactionDate = callbackMetadata.find(item => item.Name === 'TransactionDate')?.Value;
        result.phoneNumber = callbackMetadata.find(item => item.Name === 'PhoneNumber')?.Value;
      } else {
        result.success = false;
        result.errorMessage = stkCallback.ResultDesc;
      }

      return result;

    } catch (error) {
      console.error('Callback processing error:', error);
      return {
        success: false,
        error: 'Failed to process callback'
      };
    }
  }

  /**
   * Validate transaction amount and phone number
   */
  validateTransaction(phoneNumber, amount) {
    const errors = [];

    // Validate phone number
    try {
      this.formatPhoneNumber(phoneNumber);
    } catch (error) {
      errors.push('Invalid phone number format');
    }

    // Validate amount
    if (!amount || amount <= 0) {
      errors.push('Invalid amount');
    }

    if (amount < 1) {
      errors.push('Minimum amount is KES 1');
    }

    if (amount > 150000) {
      errors.push('Maximum amount is KES 150,000');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Export a single instance
const mpesaService = new MpesaService();
export default mpesaService;