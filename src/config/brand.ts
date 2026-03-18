// Brand configuration based on Rillcod Technologies logo colors
export const brandColors = {
  // Primary colors from logo
  primary: {
    blue: '#2563eb', // Blue-600
    purple: '#9333ea', // Purple-600
    gradient: 'from-blue-600 to-purple-600',
    gradientHover: 'from-blue-700 to-purple-700'
  },

  // Secondary colors
  secondary: {
    orange: '#FF914D', // Original theme color
    green: '#10b981', // Success/CTA color
    red: '#ef4444' // Error/alert color
  },

  // Text colors
  text: {
    primary: '#111827', // Gray-900
    secondary: '#6b7280', // Gray-500
    light: '#f9fafb', // Gray-50
    white: '#ffffff'
  },

  // Background colors
  background: {
    primary: '#ffffff',
    secondary: '#f3f4f6', // Gray-100
    dark: '#111827', // Gray-900
    gradient: 'from-blue-50 via-indigo-50 to-purple-50'
  }
};

// Brand assets
export const brandAssets = {
  logo: '/images/logo.png',
  logoSvg: '/images/logo.svg',
  logoCloudinary: 'https://res.cloudinary.com/dpigtwit0/image/upload/v1747032682/PhotoRoom-20250512_074926_zgudyt.png',
  favicon: '/favicon.png',
  ogImage: '/images/logo.png'
};

// Contact information
export const contactInfo = {
  phone: '+234 811 660 0091',
  email: 'info@rillcod.com',
  address: 'No 26 Ogiesoba Avenue, Benin City',
  whatsapp: 'https://wa.me/2348116600091'
};

// Social media links
export const socialLinks = {
  facebook: 'https://facebook.com/rillcodacademy',
  twitter: 'https://twitter.com/rillcodacademy',
  instagram: 'https://instagram.com/rillcodacademy',
  linkedin: 'https://linkedin.com/company/rillcodacademy',
  youtube: 'https://youtube.com/@rillcodacademy'
};

// Company information
export const companyInfo = {
  name: 'Rillcod Technologies',
  tagline: 'Inspiring Young Minds Through Technology',
  description: 'Transform Nigeria\'s educational system with cutting-edge technology education. Learn coding, robotics, web development, and more through fun, hands-on projects.',
  founded: '2024',
  location: 'Benin City, Nigeria'
};

// SEO configuration
export const seoConfig = {
  siteUrl: 'https://rillcod.com',
  siteName: 'Rillcod Technologies',
  defaultTitle: "Rillcod Technologies — Nigeria's Leading STEM & Coding Academy | Benin City, Edo State",
  defaultDescription:
    'Rillcod Technologies is Nigeria\'s premier STEM and coding academy for children. We offer hands-on coding, robotics, AI, and web development classes in partner schools across Benin City, Edo State, and Nigeria. Empowering kids from JSS1 to SS3 with future-ready tech skills.',
  keywords: [
    // Primary
    'coding academy Nigeria',
    'STEM education Nigeria',
    'coding for kids Nigeria',
    'robotics classes Nigeria',
    'programming school Nigeria',
    // Benin City
    'coding academy Benin City',
    'STEM education Benin City',
    'coding classes Benin City',
    'robotics Benin City',
    'computer programming Benin City',
    'tech education Benin City',
    // Edo State
    'coding academy Edo State',
    'STEM education Edo State',
    'technology school Edo State',
    // Specific cities
    'coding classes Ekpoma',
    'STEM education Ekpoma',
    'coding academy Uromi',
    'tech education Uromi',
    'coding classes Auchi',
    'STEM education Auchi',
    'programming school Auchi',
    // Africa / Global
    'best coding academy Africa',
    'STEM education Africa',
    'kids coding Africa',
    'robotics education Africa',
    // Program-specific
    'Python programming for kids',
    'Scratch programming Nigeria',
    'web development for children',
    'AI education Nigeria',
    'robotics for kids Nigeria',
    'ICT fundamentals Nigeria',
    // Brand
    'Rillcod Technologies',
    'RILLCOD',
  ],
  locale: 'en_NG',
  geo: {
    region: 'NG-ED', // Edo State, Nigeria
    placename: 'Benin City',
    position: '6.3350;5.6037', // lat;lng
    icbm: '6.3350, 5.6037',
  },
  serviceAreas: [
    { name: 'Benin City', state: 'Edo', country: 'Nigeria' },
    { name: 'Ekpoma', state: 'Edo', country: 'Nigeria' },
    { name: 'Uromi', state: 'Edo', country: 'Nigeria' },
    { name: 'Auchi', state: 'Edo', country: 'Nigeria' },
  ],
};
