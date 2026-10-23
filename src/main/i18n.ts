import { EN } from '../renderer/lib/i18n-en';
import * as settings from './settings';

export const t = (text: string): string => (settings.get().language === 'en' && Object.hasOwn(EN, text) ? (EN[text] as string) : text);
