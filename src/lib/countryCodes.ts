export interface CountryCode {
  name: string;
  code: string;
  flag: string;
  regex?: RegExp; // Regex pattern for phone number validation (without country code)
  minLength?: number;
  maxLength?: number;
  example?: string; // Example phone number
}

// Phone number validation regex patterns (for numbers without country code)
export const countryPhoneRegex: Record<string, { regex: RegExp; minLength: number; maxLength: number; example: string }> = {
  '+966': { regex: /^5[0-9]{8}$/, minLength: 9, maxLength: 9, example: '501234567' }, // Saudi Arabia: 9 digits, starts with 5
  '+971': { regex: /^[2-9][0-9]{8}$/, minLength: 9, maxLength: 9, example: '501234567' }, // UAE: 9 digits, starts with 2-9
  '+965': { regex: /^[569][0-9]{7}$/, minLength: 8, maxLength: 8, example: '50123456' }, // Kuwait: 8 digits, starts with 5, 6, or 9
  '+974': { regex: /^[3-7][0-9]{7}$/, minLength: 8, maxLength: 8, example: '33123456' }, // Qatar: 8 digits, starts with 3-7
  '+973': { regex: /^[3-9][0-9]{7}$/, minLength: 8, maxLength: 8, example: '36123456' }, // Bahrain: 8 digits, starts with 3-9
  '+968': { regex: /^[79][0-9]{7}$/, minLength: 8, maxLength: 8, example: '90123456' }, // Oman: 8 digits, starts with 7 or 9
  '+20': { regex: /^1[0-9]{9}$/, minLength: 10, maxLength: 10, example: '1012345678' }, // Egypt: 10 digits, starts with 1
  '+93': { regex: /^[0-9]{9}$/, minLength: 9, maxLength: 9, example: '701234567' }, // Afghanistan: 9 digits
  '+355': { regex: /^[0-9]{9}$/, minLength: 9, maxLength: 9, example: '691234567' }, // Albania: 9 digits
  '+213': { regex: /^[5-7][0-9]{8}$/, minLength: 9, maxLength: 9, example: '551234567' }, // Algeria: 9 digits, starts with 5-7
  '+54': { regex: /^[0-9]{10}$/, minLength: 10, maxLength: 10, example: '9112345678' }, // Argentina: 10 digits
  '+61': { regex: /^4[0-9]{8}$/, minLength: 9, maxLength: 9, example: '412345678' }, // Australia: 9 digits, starts with 4
  '+43': { regex: /^[0-9]{10,13}$/, minLength: 10, maxLength: 13, example: '66412345678' }, // Austria: 10-13 digits
  '+880': { regex: /^1[0-9]{9}$/, minLength: 10, maxLength: 10, example: '1712345678' }, // Bangladesh: 10 digits, starts with 1
  '+32': { regex: /^[0-9]{9}$/, minLength: 9, maxLength: 9, example: '470123456' }, // Belgium: 9 digits
  '+55': { regex: /^[0-9]{10,11}$/, minLength: 10, maxLength: 11, example: '11912345678' }, // Brazil: 10-11 digits
  '+1': { regex: /^[2-9][0-9]{9}$/, minLength: 10, maxLength: 10, example: '2012345678' }, // Canada/US: 10 digits, starts with 2-9
  '+86': { regex: /^1[3-9][0-9]{9}$/, minLength: 11, maxLength: 11, example: '13812345678' }, // China: 11 digits, starts with 1
  '+45': { regex: /^[0-9]{8}$/, minLength: 8, maxLength: 8, example: '20123456' }, // Denmark: 8 digits
  '+358': { regex: /^[0-9]{6,10}$/, minLength: 6, maxLength: 10, example: '501234567' }, // Finland: 6-10 digits
  '+33': { regex: /^[6-7][0-9]{8}$/, minLength: 9, maxLength: 9, example: '612345678' }, // France: 9 digits, starts with 6-7
  '+49': { regex: /^[0-9]{10,11}$/, minLength: 10, maxLength: 11, example: '15123456789' }, // Germany: 10-11 digits
  '+30': { regex: /^[0-9]{10}$/, minLength: 10, maxLength: 10, example: '6941234567' }, // Greece: 10 digits
  '+91': { regex: /^[6-9][0-9]{9}$/, minLength: 10, maxLength: 10, example: '9876543210' }, // India: 10 digits, starts with 6-9
  '+62': { regex: /^[0-9]{9,11}$/, minLength: 9, maxLength: 11, example: '8123456789' }, // Indonesia: 9-11 digits
  '+98': { regex: /^9[0-9]{9}$/, minLength: 10, maxLength: 10, example: '9123456789' }, // Iran: 10 digits, starts with 9
  '+964': { regex: /^7[0-9]{9}$/, minLength: 10, maxLength: 10, example: '7901234567' }, // Iraq: 10 digits, starts with 7
  '+353': { regex: /^[0-9]{9}$/, minLength: 9, maxLength: 9, example: '851234567' }, // Ireland: 9 digits
  '+39': { regex: /^3[0-9]{9}$/, minLength: 10, maxLength: 10, example: '3123456789' }, // Italy: 10 digits, starts with 3
  '+81': { regex: /^[0-9]{10,11}$/, minLength: 10, maxLength: 11, example: '9012345678' }, // Japan: 10-11 digits
  '+962': { regex: /^7[0-9]{8}$/, minLength: 9, maxLength: 9, example: '791234567' }, // Jordan: 9 digits, starts with 7
  '+961': { regex: /^[0-9]{7,8}$/, minLength: 7, maxLength: 8, example: '3123456' }, // Lebanon: 7-8 digits
  '+60': { regex: /^1[0-9]{8,9}$/, minLength: 9, maxLength: 10, example: '123456789' }, // Malaysia: 9-10 digits, starts with 1
  '+52': { regex: /^[0-9]{10}$/, minLength: 10, maxLength: 10, example: '5512345678' }, // Mexico: 10 digits
  '+212': { regex: /^[5-7][0-9]{8}$/, minLength: 9, maxLength: 9, example: '612345678' }, // Morocco: 9 digits, starts with 5-7
  '+31': { regex: /^6[0-9]{8}$/, minLength: 9, maxLength: 9, example: '612345678' }, // Netherlands: 9 digits, starts with 6
  '+64': { regex: /^[0-9]{8,9}$/, minLength: 8, maxLength: 9, example: '211234567' }, // New Zealand: 8-9 digits
  '+234': { regex: /^[0-9]{10}$/, minLength: 10, maxLength: 10, example: '8021234567' }, // Nigeria: 10 digits
  '+47': { regex: /^[0-9]{8}$/, minLength: 8, maxLength: 8, example: '41234567' }, // Norway: 8 digits
  '+92': { regex: /^3[0-9]{9}$/, minLength: 10, maxLength: 10, example: '3012345678' }, // Pakistan: 10 digits, starts with 3
  '+970': { regex: /^5[0-9]{8}$/, minLength: 9, maxLength: 9, example: '591234567' }, // Palestine: 9 digits, starts with 5
  '+63': { regex: /^9[0-9]{9}$/, minLength: 10, maxLength: 10, example: '9123456789' }, // Philippines: 10 digits, starts with 9
  '+48': { regex: /^[0-9]{9}$/, minLength: 9, maxLength: 9, example: '501234567' }, // Poland: 9 digits
  '+351': { regex: /^[0-9]{9}$/, minLength: 9, maxLength: 9, example: '912345678' }, // Portugal: 9 digits
  '+7': { regex: /^[0-9]{10}$/, minLength: 10, maxLength: 10, example: '9123456789' }, // Russia: 10 digits
  '+65': { regex: /^[689][0-9]{7}$/, minLength: 8, maxLength: 8, example: '81234567' }, // Singapore: 8 digits, starts with 6, 8, or 9
  '+27': { regex: /^[0-9]{9}$/, minLength: 9, maxLength: 9, example: '821234567' }, // South Africa: 9 digits
  '+82': { regex: /^1[0-9]{9,10}$/, minLength: 10, maxLength: 11, example: '1012345678' }, // South Korea: 10-11 digits, starts with 1
  '+34': { regex: /^[6-9][0-9]{8}$/, minLength: 9, maxLength: 9, example: '612345678' }, // Spain: 9 digits, starts with 6-9
  '+249': { regex: /^9[0-9]{8}$/, minLength: 9, maxLength: 9, example: '912345678' }, // Sudan: 9 digits, starts with 9
  '+46': { regex: /^7[0-9]{8}$/, minLength: 9, maxLength: 9, example: '701234567' }, // Sweden: 9 digits, starts with 7
  '+41': { regex: /^[0-9]{9}$/, minLength: 9, maxLength: 9, example: '781234567' }, // Switzerland: 9 digits
  '+963': { regex: /^9[0-9]{8}$/, minLength: 9, maxLength: 9, example: '912345678' }, // Syria: 9 digits, starts with 9
  '+66': { regex: /^[0-9]{9}$/, minLength: 9, maxLength: 9, example: '812345678' }, // Thailand: 9 digits
  '+216': { regex: /^[0-9]{8}$/, minLength: 8, maxLength: 8, example: '20123456' }, // Tunisia: 8 digits
  '+90': { regex: /^5[0-9]{9}$/, minLength: 10, maxLength: 10, example: '5321234567' }, // Turkey: 10 digits, starts with 5
  '+380': { regex: /^[0-9]{9}$/, minLength: 9, maxLength: 9, example: '501234567' }, // Ukraine: 9 digits
  '+44': { regex: /^7[0-9]{9}$/, minLength: 10, maxLength: 10, example: '7123456789' }, // UK: 10 digits, starts with 7
  '+84': { regex: /^[0-9]{9,10}$/, minLength: 9, maxLength: 10, example: '9123456789' }, // Vietnam: 9-10 digits
  '+967': { regex: /^7[0-9]{8}$/, minLength: 9, maxLength: 9, example: '712345678' }, // Yemen: 9 digits, starts with 7
};

export const countryCodes: CountryCode[] = [
  // Gulf Countries (GCC)
  { name: 'Saudi Arabia', code: '+966', flag: '🇸🇦', ...countryPhoneRegex['+966'] },
  { name: 'United Arab Emirates', code: '+971', flag: '🇦🇪', ...countryPhoneRegex['+971'] },
  { name: 'Kuwait', code: '+965', flag: '🇰🇼', ...countryPhoneRegex['+965'] },
  { name: 'Qatar', code: '+974', flag: '🇶🇦', ...countryPhoneRegex['+974'] },
  { name: 'Bahrain', code: '+973', flag: '🇧🇭', ...countryPhoneRegex['+973'] },
  { name: 'Oman', code: '+968', flag: '🇴🇲', ...countryPhoneRegex['+968'] },

  // Rest of the world (alphabetical)
  { name: 'Afghanistan', code: '+93', flag: '🇦🇫', ...countryPhoneRegex['+93'] },
  { name: 'Albania', code: '+355', flag: '🇦🇱', ...countryPhoneRegex['+355'] },
  { name: 'Algeria', code: '+213', flag: '🇩🇿', ...countryPhoneRegex['+213'] },
  { name: 'Argentina', code: '+54', flag: '🇦🇷', ...countryPhoneRegex['+54'] },
  { name: 'Australia', code: '+61', flag: '🇦🇺', ...countryPhoneRegex['+61'] },
  { name: 'Austria', code: '+43', flag: '🇦🇹', ...countryPhoneRegex['+43'] },
  { name: 'Bangladesh', code: '+880', flag: '🇧🇩', ...countryPhoneRegex['+880'] },
  { name: 'Belgium', code: '+32', flag: '🇧🇪', ...countryPhoneRegex['+32'] },
  { name: 'Brazil', code: '+55', flag: '🇧🇷', ...countryPhoneRegex['+55'] },
  { name: 'Canada', code: '+1', flag: '🇨🇦', ...countryPhoneRegex['+1'] },
  { name: 'China', code: '+86', flag: '🇨🇳', ...countryPhoneRegex['+86'] },
  { name: 'Denmark', code: '+45', flag: '🇩🇰', ...countryPhoneRegex['+45'] },
  { name: 'Egypt', code: '+20', flag: '🇪🇬', ...countryPhoneRegex['+20'] },
  { name: 'Finland', code: '+358', flag: '🇫🇮', ...countryPhoneRegex['+358'] },
  { name: 'France', code: '+33', flag: '🇫🇷', ...countryPhoneRegex['+33'] },
  { name: 'Germany', code: '+49', flag: '🇩🇪', ...countryPhoneRegex['+49'] },
  { name: 'Greece', code: '+30', flag: '🇬🇷', ...countryPhoneRegex['+30'] },
  { name: 'India', code: '+91', flag: '🇮🇳', ...countryPhoneRegex['+91'] },
  { name: 'Indonesia', code: '+62', flag: '🇮🇩', ...countryPhoneRegex['+62'] },
  { name: 'Iran', code: '+98', flag: '🇮🇷', ...countryPhoneRegex['+98'] },
  { name: 'Iraq', code: '+964', flag: '🇮🇶', ...countryPhoneRegex['+964'] },
  { name: 'Ireland', code: '+353', flag: '🇮🇪', ...countryPhoneRegex['+353'] },
  { name: 'Italy', code: '+39', flag: '🇮🇹', ...countryPhoneRegex['+39'] },
  { name: 'Japan', code: '+81', flag: '🇯🇵', ...countryPhoneRegex['+81'] },
  { name: 'Jordan', code: '+962', flag: '🇯🇴', ...countryPhoneRegex['+962'] },
  { name: 'Lebanon', code: '+961', flag: '🇱🇧', ...countryPhoneRegex['+961'] },
  { name: 'Malaysia', code: '+60', flag: '🇲🇾', ...countryPhoneRegex['+60'] },
  { name: 'Mexico', code: '+52', flag: '🇲🇽', ...countryPhoneRegex['+52'] },
  { name: 'Morocco', code: '+212', flag: '🇲🇦', ...countryPhoneRegex['+212'] },
  { name: 'Netherlands', code: '+31', flag: '🇳🇱', ...countryPhoneRegex['+31'] },
  { name: 'New Zealand', code: '+64', flag: '🇳🇿', ...countryPhoneRegex['+64'] },
  { name: 'Nigeria', code: '+234', flag: '🇳🇬', ...countryPhoneRegex['+234'] },
  { name: 'Norway', code: '+47', flag: '🇳🇴', ...countryPhoneRegex['+47'] },
  { name: 'Pakistan', code: '+92', flag: '🇵🇰', ...countryPhoneRegex['+92'] },
  { name: 'Palestine', code: '+970', flag: '🇵🇸', ...countryPhoneRegex['+970'] },
  { name: 'Philippines', code: '+63', flag: '🇵🇭', ...countryPhoneRegex['+63'] },
  { name: 'Poland', code: '+48', flag: '🇵🇱', ...countryPhoneRegex['+48'] },
  { name: 'Portugal', code: '+351', flag: '🇵🇹', ...countryPhoneRegex['+351'] },
  { name: 'Russia', code: '+7', flag: '🇷🇺', ...countryPhoneRegex['+7'] },
  { name: 'Singapore', code: '+65', flag: '🇸🇬', ...countryPhoneRegex['+65'] },
  { name: 'South Africa', code: '+27', flag: '🇿🇦', ...countryPhoneRegex['+27'] },
  { name: 'South Korea', code: '+82', flag: '🇰🇷', ...countryPhoneRegex['+82'] },
  { name: 'Spain', code: '+34', flag: '🇪🇸', ...countryPhoneRegex['+34'] },
  { name: 'Sudan', code: '+249', flag: '🇸🇩', ...countryPhoneRegex['+249'] },
  { name: 'Sweden', code: '+46', flag: '🇸🇪', ...countryPhoneRegex['+46'] },
  { name: 'Switzerland', code: '+41', flag: '🇨🇭', ...countryPhoneRegex['+41'] },
  { name: 'Syria', code: '+963', flag: '🇸🇾', ...countryPhoneRegex['+963'] },
  { name: 'Thailand', code: '+66', flag: '🇹🇭', ...countryPhoneRegex['+66'] },
  { name: 'Tunisia', code: '+216', flag: '🇹🇳', ...countryPhoneRegex['+216'] },
  { name: 'Turkey', code: '+90', flag: '🇹🇷', ...countryPhoneRegex['+90'] },
  { name: 'Ukraine', code: '+380', flag: '🇺🇦', ...countryPhoneRegex['+380'] },
  { name: 'United Kingdom', code: '+44', flag: '🇬🇧', ...countryPhoneRegex['+44'] },
  { name: 'United States', code: '+1', flag: '🇺🇸', ...countryPhoneRegex['+1'] },
  { name: 'Vietnam', code: '+84', flag: '🇻🇳', ...countryPhoneRegex['+84'] },
  { name: 'Yemen', code: '+967', flag: '🇾🇪', ...countryPhoneRegex['+967'] },
];

/**
 * Validate phone number based on country code
 * @param phone - Phone number without country code
 * @param countryCode - Country code (e.g., '+966')
 * @param language - Language for error messages ('en' or 'ar')
 * @returns Validation result with error message if invalid
 */
export function validatePhoneNumberByCountry(
  phone: string,
  countryCode: string,
  language: 'en' | 'ar' = 'en'
): { valid: boolean; error?: string } {
  if (!phone || phone.trim().length === 0) {
    return {
      valid: false,
      error: language === 'ar' ? 'رقم الهاتف مطلوب' : 'Phone number is required',
    };
  }

  // Remove any non-digit characters
  const cleanPhone = phone.replace(/[^\d]/g, '');

  // Get validation rules for this country
  const countryRules = countryPhoneRegex[countryCode];

  if (!countryRules) {
    // If no specific rules, just check minimum length
    if (cleanPhone.length < 7) {
      return {
        valid: false,
        error: language === 'ar' ? 'رقم الهاتف قصير جداً' : 'Phone number is too short',
      };
    }
    return { valid: true };
  }

  // Remove leading 0 for Gulf countries
  let phoneNumber = cleanPhone;
  const gulfCountries = ['+966', '+971', '+968', '+965', '+973', '+974'];
  if (gulfCountries.includes(countryCode) && phoneNumber.startsWith('0')) {
    phoneNumber = phoneNumber.substring(1);
  }

  // Check length
  if (phoneNumber.length < countryRules.minLength) {
    return {
      valid: false,
      error:
        language === 'ar'
          ? `رقم الهاتف يجب أن يكون ${countryRules.minLength} أرقام على الأقل (مثال: ${countryRules.example})`
          : `Phone number must be at least ${countryRules.minLength} digits (e.g., ${countryRules.example})`,
    };
  }

  if (phoneNumber.length > countryRules.maxLength) {
    return {
      valid: false,
      error:
        language === 'ar'
          ? `رقم الهاتف يجب أن يكون ${countryRules.maxLength} أرقام على الأكثر (مثال: ${countryRules.example})`
          : `Phone number must be at most ${countryRules.maxLength} digits (e.g., ${countryRules.example})`,
    };
  }

  // Check regex pattern
  if (!countryRules.regex.test(phoneNumber)) {
    return {
      valid: false,
      error:
        language === 'ar'
          ? `رقم الهاتف غير صحيح. مثال صحيح: ${countryRules.example}`
          : `Invalid phone number format. Valid example: ${countryRules.example}`,
    };
  }

  return { valid: true };
}
