import protocolEn from '../../docs/research-protocol.md?raw';
import reportEn from '../../docs/studies/visibility-roles-v1.md?raw';
import protocolTh from '../../docs/research-protocol.th.md?raw';
import reportTh from '../../docs/studies/visibility-roles-v1.th.md?raw';
import type { Language } from '../i18n';

export function researchDocuments(lang: Language) {
  return {
    protocol: lang === 'th' ? protocolTh : protocolEn,
    report: lang === 'th' ? reportTh : reportEn,
    protocolFilename: lang === 'th' ? 'canteen-research-protocol.th.md' : 'canteen-research-protocol.md',
    reportFilename: lang === 'th' ? 'canteen-visibility-roles-v1.th.md' : 'canteen-visibility-roles-v1.md',
  };
}
