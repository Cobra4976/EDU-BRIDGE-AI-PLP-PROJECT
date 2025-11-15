// src/components/SubscriptionModal.jsx
import { useState } from 'react';
import { 
  SUBSCRIPTION_TIERS, 
  SUBSCRIPTION_LIMITS, 
  getLocalPrice, 
  getPaymentMethodsForCountry 
} from '../utils/subscriptionLimits';
import { paymentService } from '../utils/paymentService';

export default function SubscriptionModal({ 
  isOpen, 
  onClose, 
  currentTier, 
  usageSummary, 
  userCountry,
  userId,
  onUpgrade 
}) {
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [currentTransactionId, setCurrentTransactionId] = useState(null);

  if (!isOpen) return null;

  const localPrice = getLocalPrice(userCountry);
  const paymentMethods = getPaymentMethodsForCountry(userCountry);
  const isPremium = currentTier === SUBSCRIPTION_TIERS.PREMIUM;
  
  const freeLimits = SUBSCRIPTION_LIMITS[SUBSCRIPTION_TIERS.FREE].features;
  const premiumFeatures = SUBSCRIPTION_LIMITS[SUBSCRIPTION_TIERS.PREMIUM].features;

  const handleUpgrade = async () => {
    if (!selectedPaymentMethod || !phoneNumber) {
      alert('Please select payment method and enter phone number');
      return;
    }

    // Only M-Pesa supported for now
    if (selectedPaymentMethod !== 'mpesa') {
      alert('Currently, only M-Pesa is supported. Other payment methods coming soon!');
      return;
    }

    setIsProcessing(true);
    setPaymentStatus('initiating');

    try {
      // Initiate M-Pesa payment
      const result = await paymentService.initiateMpesaPayment(
        phoneNumber,
        localPrice.amount,
        userId,
        'premium'
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      setCurrentTransactionId(result.transactionId);
      setPaymentStatus('pending');

      // Show STK push message
      alert(`📱 ${result.message}\n\nPlease check your phone and enter your M-Pesa PIN to complete payment.`);

      // Poll for payment status
      const statusResult = await paymentService.pollPaymentStatus(result.transactionId);

      if (statusResult.success) {
        setPaymentStatus('completed');
        
        // Call the upgrade handler
        await onUpgrade({
          provider: 'mpesa',
          transactionId: result.transactionId,
          mpesaReceiptNumber: statusResult.transaction.mpesaReceiptNumber,
          amount: localPrice.amount,
          currency: localPrice.currency
        });

        alert('🎉 Payment successful! Welcome to Premium!');
        
        // Close modal after short delay
        setTimeout(() => {
          onClose();
          setShowPayment(false);
          setPaymentStatus(null);
          setPhoneNumber('');
          setSelectedPaymentMethod(null);
        }, 2000);

      } else {
        setPaymentStatus('failed');
        
        let errorMessage = 'Payment failed. ';
        if (statusResult.status === 'cancelled') {
          errorMessage += 'You cancelled the payment.';
        } else if (statusResult.status === 'timeout') {
          errorMessage += 'Payment timed out. Please try again.';
        } else {
          errorMessage += 'Please try again or contact support.';
        }
        
        alert(errorMessage);
      }

    } catch (error) {
      setPaymentStatus('failed');
      alert(`Payment failed: ${error.message}`);
      console.error('Payment error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusMessage = () => {
    switch (paymentStatus) {
      case 'initiating':
        return { text: 'Initiating payment...', color: 'text-blue-600', icon: '🔄' };
      case 'pending':
        return { text: 'Waiting for payment confirmation...', color: 'text-yellow-600', icon: '⏳' };
      case 'completed':
        return { text: 'Payment successful!', color: 'text-green-600', icon: '✅' };
      case 'failed':
        return { text: 'Payment failed', color: 'text-red-600', icon: '❌' };
      default:
        return null;
    }
  };

  const statusMessage = getStatusMessage();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 rounded-t-xl">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-3xl font-bold mb-2">
                {isPremium ? '🌟 Premium Member' : '✨ Upgrade to Premium'}
              </h2>
              <p className="text-purple-100">
                {isPremium 
                  ? 'You have unlimited access to all features!' 
                  : `Only ${localPrice.display}/month - Unlock your full potential`
                }
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="text-white hover:bg-white/20 p-2 rounded-lg transition disabled:opacity-50"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Current Usage (Free users only) */}
          {!isPremium && usageSummary && (
            <div className="mb-6 bg-gradient-to-r from-orange-50 to-red-50 p-5 rounded-xl border-2 border-orange-200">
              <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                <span className="mr-2">📊</span>
                Your Current Usage (Free Tier)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(usageSummary.features).map(([key, data]) => (
                  <div key={key} className="bg-white p-4 rounded-lg border border-orange-200">
                    <div className="text-sm font-semibold text-gray-700 mb-2">
                      {key === 'aiTutorQueries' ? '🤖 AI Tutor Queries' :
                       key === 'taskGeneration' ? '📝 Task Generation' :
                       key === 'skillsAnalysis' ? '📈 Skills Analysis' :
                       key === 'learningPaths' ? '🎯 Learning Paths' :
                       '🏆 Achievements'}
                    </div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-2xl font-bold text-orange-600">
                        {data.used} / {data.limit}
                      </span>
                      <span className="text-xs text-gray-500 capitalize">{data.period}</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-2 rounded-full transition-all ${
                          data.remaining === 0 ? 'bg-red-500' :
                          data.remaining <= data.limit * 0.2 ? 'bg-orange-500' :
                          'bg-green-500'
                        }`}
                        style={{ width: `${(data.used / data.limit) * 100}%` }}
                      ></div>
                    </div>
                    {data.remaining === 0 && (
                      <p className="text-xs text-red-600 mt-2 font-semibold">
                        ⚠️ Limit reached! Upgrade for unlimited access
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Feature Comparison */}
          <div className="mb-6">
            <h3 className="text-2xl font-bold text-gray-800 mb-4 text-center">
              {isPremium ? 'Your Premium Benefits' : 'Compare Plans'}
            </h3>
            
            <div className="grid md:grid-cols-2 gap-6">
              {/* Free Tier */}
              <div className="bg-gray-50 rounded-xl p-6 border-2 border-gray-200">
                <div className="text-center mb-4">
                  <h4 className="text-2xl font-bold text-gray-800 mb-2">Free</h4>
                  <div className="text-4xl font-bold text-gray-600 mb-2">$0</div>
                  <p className="text-sm text-gray-600">Perfect for getting started</p>
                </div>
                
                <ul className="space-y-3">
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span className="text-sm text-gray-700">
                      {freeLimits.aiTutorQueries.daily} AI Tutor queries per day
                    </span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span className="text-sm text-gray-700">
                      {freeLimits.taskGeneration.weekly} task generations per week
                    </span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span className="text-sm text-gray-700">
                      {freeLimits.skillsAnalysis.weekly} skills analyses per week
                    </span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span className="text-sm text-gray-700">
                      {freeLimits.learningPaths.weekly} learning paths per week
                    </span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span className="text-sm text-gray-700">Community access</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-red-500 mr-2">✗</span>
                    <span className="text-sm text-gray-500">Detailed solutions</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-red-500 mr-2">✗</span>
                    <span className="text-sm text-gray-500">Career guidance</span>
                  </li>
                </ul>
              </div>

              {/* Premium Tier */}
              <div className={`rounded-xl p-6 border-2 ${
                isPremium 
                  ? 'bg-gradient-to-br from-purple-50 to-pink-50 border-purple-400' 
                  : 'bg-gradient-to-br from-purple-50 to-pink-50 border-purple-300'
              } relative`}>
                {!isPremium && (
                  <div className="absolute -top-3 right-4 bg-gradient-to-r from-yellow-400 to-orange-400 text-white text-xs font-bold px-3 py-1 rounded-full">
                    RECOMMENDED
                  </div>
                )}
                
                <div className="text-center mb-4">
                  <h4 className="text-2xl font-bold text-purple-800 mb-2">Premium</h4>
                  <div className="text-4xl font-bold text-purple-600 mb-2">
                    {localPrice.display}
                  </div>
                  <p className="text-sm text-purple-700">per month</p>
                </div>
                
                <ul className="space-y-3">
                  <li className="flex items-start">
                    <span className="text-purple-500 mr-2">✓</span>
                    <span className="text-sm text-gray-800 font-semibold">
                      Unlimited AI Tutor queries
                    </span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-purple-500 mr-2">✓</span>
                    <span className="text-sm text-gray-800 font-semibold">
                      Unlimited task generation
                    </span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-purple-500 mr-2">✓</span>
                    <span className="text-sm text-gray-800 font-semibold">
                      Unlimited skills analysis
                    </span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-purple-500 mr-2">✓</span>
                    <span className="text-sm text-gray-800 font-semibold">
                      Detailed step-by-step solutions
                    </span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-purple-500 mr-2">✓</span>
                    <span className="text-sm text-gray-800 font-semibold">
                      Personalized career guidance
                    </span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-purple-500 mr-2">✓</span>
                    <span className="text-sm text-gray-800 font-semibold">
                      Priority support & badges
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Payment Section (Free users only) */}
          {!isPremium && !showPayment && !paymentStatus && (
            <div className="text-center">
              <button
                onClick={() => setShowPayment(true)}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-8 py-4 rounded-xl font-bold text-lg transition transform hover:scale-105 shadow-lg"
              >
                🚀 Upgrade to Premium Now
              </button>
              <p className="text-sm text-gray-600 mt-3">
                Cancel anytime • Secure payment via M-Pesa
              </p>
            </div>
          )}

          {/* Payment Status Display */}
          {statusMessage && (
            <div className={`mb-6 p-4 rounded-xl border-2 ${
              paymentStatus === 'completed' ? 'bg-green-50 border-green-300' :
              paymentStatus === 'failed' ? 'bg-red-50 border-red-300' :
              'bg-blue-50 border-blue-300'
            }`}>
              <div className="flex items-center justify-center">
                <span className="text-3xl mr-3">{statusMessage.icon}</span>
                <span className={`text-lg font-semibold ${statusMessage.color}`}>
                  {statusMessage.text}
                </span>
              </div>
            </div>
          )}

          {/* Payment Form */}
          {!isPremium && showPayment && !paymentStatus && (
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-xl border-2 border-purple-200">
              <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                <span className="mr-2">💳</span>
                Complete Your Payment
              </h3>

              <div className="space-y-4">
                {/* Payment Method Selection */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Select Payment Method
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {paymentMethods.map(method => (
                      <button
                        key={method.id}
                        onClick={() => setSelectedPaymentMethod(method.id)}
                        disabled={method.id !== 'mpesa'} // Only M-Pesa enabled for now
                        className={`p-4 rounded-lg border-2 transition relative ${
                          selectedPaymentMethod === method.id
                            ? 'border-purple-500 bg-purple-50'
                            : method.id === 'mpesa'
                            ? 'border-gray-200 hover:border-purple-300'
                            : 'border-gray-200 opacity-50 cursor-not-allowed'
                        }`}
                      >
                        {method.id !== 'mpesa' && (
                          <div className="absolute top-1 right-1 bg-yellow-400 text-xs px-1 rounded">
                            Soon
                          </div>
                        )}
                        <div className="text-3xl mb-1">{method.icon}</div>
                        <div className="text-xs font-medium text-gray-700">{method.name}</div>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    More payment methods coming soon!
                  </p>
                </div>

                {/* Phone Number */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    M-Pesa Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="0712345678 or 254712345678"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    disabled={isProcessing}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter your M-Pesa registered phone number
                  </p>
                </div>

                {/* Amount Display */}
                <div className="bg-white p-4 rounded-lg border border-purple-200">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700">Amount to pay:</span>
                    <span className="text-2xl font-bold text-purple-600">{localPrice.display}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    You'll receive an STK push prompt on your phone
                  </p>
                </div>

                {/* Buttons */}
                <div className="flex space-x-3">
                  <button
                    onClick={handleUpgrade}
                    disabled={isProcessing || !selectedPaymentMethod || !phoneNumber}
                    className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white py-3 rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? '⏳ Processing...' : '✓ Pay with M-Pesa'}
                  </button>
                  <button
                    onClick={() => setShowPayment(false)}
                    disabled={isProcessing}
                    className="px-6 bg-gray-200 hover:bg-gray-300 text-gray-800 py-3 rounded-lg font-semibold transition disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>

                {/* Instructions */}
                <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-sm text-blue-800">
                  <strong>📝 How it works:</strong>
                  <ol className="mt-2 space-y-1 ml-4 list-decimal">
                    <li>Click "Pay with M-Pesa"</li>
                    <li>Check your phone for the STK push prompt</li>
                    <li>Enter your M-Pesa PIN to confirm</li>
                    <li>Wait for confirmation</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {/* Premium Member Badge */}
          {isPremium && (
            <div className="bg-gradient-to-r from-yellow-50 to-orange-50 p-6 rounded-xl border-2 border-yellow-300 text-center">
              <div className="text-6xl mb-3">👑</div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">
                You're a Premium Member!
              </h3>
              <p className="text-gray-700">
                Enjoy unlimited access to all features and priority support
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}