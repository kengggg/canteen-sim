import { language, msg } from '../i18n';

/** Adapt the existing English notice contract at the UI boundary, preserving the research/config source. */
export function noticeText(source: string): string {
  if (language.value === 'en') return source;
  const direct = msg(source);
  if (direct !== source) return direct;
  let match: RegExpExecArray | null;
  if ((match = /^Shared with model (\d+); results may differ in model (\d+)\.$/.exec(source))) {
    return msg('Shared with model {v0}; results may differ in model {v1}.', { v0: match[1], v1: match[2] });
  }
  if ((match = /^Groups of (.+) cannot sit at (\d+)-seat tables: set their share to 0% or use larger tables\.$/.exec(source))) {
    return msg('Groups of {sizes} cannot sit at {seats}-seat tables: set their share to 0% or use larger tables.', { sizes: match[1].split(' and ').join(msg(' and ')), seats: match[2] });
  }
  if ((match = /^Offered stall load ([\d.]+) is above 0\.9; queues may never clear\.$/.exec(source))) {
    return msg('Offered stall load {load} is above 0.9; queues may never clear.', { load: match[1] });
  }
  if ((match = /^Group sizes above (\d+) were moved onto groups of (\d+) to fit (\d+)-seat tables\.$/.exec(source))) {
    return msg('Group sizes above {max} were moved onto groups of {size} to fit {seats}-seat tables.', { max: match[1], size: match[2], seats: match[3] });
  }
  const labels = (text: string) => text.split(', ').map((label) => msg(label)).join(', ');
  if ((match = /^Out-of-range values were adjusted: (.+)\.$/.exec(source))) {
    return msg('Out-of-range values were adjusted: {settings}.', { settings: labels(match[1]) });
  }
  if ((match = /^(.+) Reset (.+) to defaults\.$/.exec(source))) {
    return msg('{issue} Reset {settings} to defaults.', { issue: noticeText(match[1]), settings: labels(match[2]) });
  }
  if ((match = /^The value (.+) for (.+) is outside its range \((.+)–(.+), step (.+)\)\.$/.exec(source))) {
    return msg('The value {value} for {setting} is outside its range ({lo}–{hi}, step {step}).', { value: match[1], setting: match[2], lo: match[3], hi: match[4], step: match[5] });
  }
  if ((match = /^The value (.+) for (.+) cannot run: (.+)$/.exec(source))) {
    return msg('The value {value} for {setting} cannot run: {issue}', { value: match[1], setting: match[2], issue: noticeText(match[3]) });
  }
  if ((match = /^At (.+) seats per side sharing is disabled \(shareMinEmpty = (.+)\)\.$/.exec(source))) {
    return msg('At {seats} seats per side sharing is disabled (shareMinEmpty = {threshold}).', { seats: match[1], threshold: match[2] });
  }
  if ((match = /^(.+) cannot be swept\.$/.exec(source))) return msg('{setting} cannot be swept.', { setting: match[1] });
  // Multiple independent blocking messages are joined by the existing configuration API.
  const boundaries = source.split(/(?<=\.)\s+(?=[A-Z])/);
  if (boundaries.length > 1) return boundaries.map(noticeText).join(' ');
  return source; // Preserve unknown technical diagnostics verbatim rather than altering their meaning.
}
