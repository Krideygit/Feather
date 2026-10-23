import * as languages from './languages';
import * as settings from './settings';

export const t = (text: string): string => {
  const dict = languages.dictionary(settings.get().language);
  return dict && Object.hasOwn(dict, text) ? (dict[text] as string) : text;
};
