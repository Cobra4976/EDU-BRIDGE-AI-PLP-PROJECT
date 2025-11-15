// src/utils/subscriptionLimits.js

export const SUBSCRIPTION_TIERS = {
  FREE: 'free',
  PREMIUM: 'premium'
};

export const SUBSCRIPTION_LIMITS = {
  [SUBSCRIPTION_TIERS.FREE]: {
    name: 'Free',
    price: 0,
    currency: 'USD',
    features: {
      aiTutorQueries: {
        daily: 10,
        message: 'Daily AI Tutor queries'
      },
      taskGeneration: {
        weekly: 5,
        message: 'Task generations per week'
      },
      skillsAnalysis: {
        weekly: 5,
        message: 'Skills analysis per week'
      },
      learningPaths: {
        weekly: 3,
        message: 'Learning paths per week'
      },
      achievements: {
        weekly: 5,
        message: 'Achievement generations per week'
      },
      communityAccess: true,
      offlineContent: true,
      prioritySupport: false,
      detailedSolutions: false,
      careerGuidance: false,
      premiumBadges: false
    }
  },
  [SUBSCRIPTION_TIERS.PREMIUM]: {
    name: 'Premium',
    price: 2,
    currency: 'USD',
    features: {
      aiTutorQueries: {
        daily: Infinity,
        message: 'Unlimited AI Tutor queries'
      },
      taskGeneration: {
        weekly: Infinity,
        message: 'Unlimited task generation'
      },
      skillsAnalysis: {
        weekly: Infinity,
        message: 'Unlimited skills analysis'
      },
      learningPaths: {
        weekly: Infinity,
        message: 'Unlimited learning paths'
      },
      achievements: {
        weekly: Infinity,
        message: 'Unlimited achievements'
      },
      communityAccess: true,
      offlineContent: true,
      prioritySupport: true,
      detailedSolutions: true,
      careerGuidance: true,
      premiumBadges: true
    }
  }
};

// Mobile money providers for Africa
export const PAYMENT_PROVIDERS = {
  MPESA: {
    id: 'mpesa',
    name: 'M-Pesa',
    countries: ['Kenya', 'Tanzania', 'Ghana', 'South Africa'],
    icon: '📱'
  },
  AIRTEL_MONEY: {
    id: 'airtel_money',
    name: 'Airtel Money',
    countries: ['Kenya', 'Uganda', 'Tanzania', 'Zambia', 'Nigeria'],
    icon: '💰'
  },
  MTN_MOBILE_MONEY: {
    id: 'mtn_mobile_money',
    name: 'MTN Mobile Money',
    countries: ['Ghana', 'Uganda', 'Rwanda', 'Cameroon', 'Nigeria'],
    icon: '💳'
  },
  ORANGE_MONEY: {
    id: 'orange_money',
    name: 'Orange Money',
    countries: ['Senegal', 'Ivory Coast', 'Mali', 'Burkina Faso'],
    icon: '🟠'
  }
};

// Get available payment methods for a country
export const getPaymentMethodsForCountry = (country) => {
  return Object.values(PAYMENT_PROVIDERS).filter(provider => 
    provider.countries.includes(country)
  );
};

// Calculate local currency price (example conversion rates)
export const CURRENCY_RATES = {
  KES: 130, // Kenyan Shilling (1 USD = ~130 KES)
  UGX: 3700, // Ugandan Shilling
  TZS: 2300, // Tanzanian Shilling
  GHS: 12, // Ghanaian Cedi
  ZAR: 18, // South African Rand
  NGN: 750, // Nigerian Naira
  RWF: 1100, // Rwandan Franc
  ZMW: 20 // Zambian Kwacha
};

export const getLocalPrice = (country) => {
  const priceUSD = SUBSCRIPTION_LIMITS[SUBSCRIPTION_TIERS.PREMIUM].price;
  
  const countryToCurrency = {
    'Kenya': { currency: 'KES', rate: CURRENCY_RATES.KES },
    'Uganda': { currency: 'UGX', rate: CURRENCY_RATES.UGX },
    'Tanzania': { currency: 'TZS', rate: CURRENCY_RATES.TZS },
    'Ghana': { currency: 'GHS', rate: CURRENCY_RATES.GHS },
    'South Africa': { currency: 'ZAR', rate: CURRENCY_RATES.ZAR },
    'Nigeria': { currency: 'NGN', rate: CURRENCY_RATES.NGN },
    'Rwanda': { currency: 'RWF', rate: CURRENCY_RATES.RWF },
    'Zambia': { currency: 'ZMW', rate: CURRENCY_RATES.ZMW }
  };
  
  const currencyInfo = countryToCurrency[country];
  
  if (currencyInfo) {
    return {
      amount: Math.round(priceUSD * currencyInfo.rate),
      currency: currencyInfo.currency,
      display: `${currencyInfo.currency} ${Math.round(priceUSD * currencyInfo.rate).toLocaleString()}`
    };
  }
  
  return {
    amount: priceUSD,
    currency: 'USD',
    display: `$${priceUSD}`
  };
};