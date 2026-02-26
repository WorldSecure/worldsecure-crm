import { he } from './he';
import { en } from './en';
import { pt } from './pt';

export const translations = {
  he,
  en,
  pt
};

export const getTranslation = (language, key) => {
  return translations[language]?.[key] || key;
};
