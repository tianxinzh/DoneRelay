import { check, parseReply, safeError } from './util.js';

export function languageChoice(value = 'auto') {
  check(['auto', 'en', 'zh'].includes(value), 'language must be auto, en, or zh');
  return value;
}
// No model runs in the bridge. Agents can explicitly choose a language from context.
export function resolveLanguage(value, content = '') {
  const choice = languageChoice(value);
  return choice === 'auto' ? (/\p{Script=Han}/u.test(content) ? 'zh' : 'en') : choice;
}
const labels = {
  en: { notification: 'NOTIFICATION', question: 'QUESTION', approval: 'APPROVAL', task: 'Task', request: 'Request', expires: 'Expires',
    approve: 'approve', deny: 'deny', answer: 'answer', answerHint: '<your answer>', approveButton: 'Approve once', denyButton: 'Deny',
    pending: 'pending', approved: 'approved', denied: 'denied', answered: 'answered', expired: 'expired', cancelled: 'cancelled', sent: 'sent', failed: 'failed', completed: 'completed', interrupted: 'interrupted',
    replyHelp: 'Use approve ID, deny ID, or answer ID your reply.', questionHeader: 'Question', options: 'Options (reply with the exact label)', item: 'Item', turn: 'Turn',
    languageHelp: 'Choose a language: /language en (English), /language zh (Chinese), or /language auto (automatic).',
    selected: 'Language preference saved.', auto: 'Automatic: the agent may choose; otherwise the request text determines the language.' },
  zh: { notification: '通知', question: '问题', approval: '审批', task: '任务', request: '请求', expires: '到期时间',
    approve: '批准', deny: '拒绝', answer: '回答', answerHint: '<你的回答>', approveButton: '批准一次', denyButton: '拒绝',
    pending: '待处理', approved: '已批准', denied: '已拒绝', answered: '已回答', expired: '已过期', cancelled: '已取消', sent: '已发送', failed: '失败', completed: '已完成', interrupted: '已中断',
    replyHelp: '请使用：批准 编号、拒绝 编号、回答 编号 内容。', questionHeader: '问题', options: '选项（请回复完整选项名称）', item: '操作', turn: '任务',
    languageHelp: '选择语言：/language en（英语）、/language zh（中文）、/language auto（自动）。',
    selected: '语言偏好已保存。', auto: '自动模式：由智能体选择；未指定时根据请求正文判断语言。' },
};
export const words = language => labels[resolveLanguage(language)];
export function replyLanguage(relay, input) {
  const id = parseReply(input)?.id;
  const request = id && relay.store.data.requests[id];
  return request ? (request.language ?? resolveLanguage('auto', request.message)) : resolveLanguage(relay.preference(), input);
}
export function replyError(error, language) {
  if (language !== 'zh') return safeError(error);
  const message = safeError(error);
  const status = message.match(/^Request is already (\w+)$/)?.[1];
  if (status) return `请求${words('zh')[status] ?? '已结束'}，不能再次处理。`;
  if (message === 'Unknown request') return '找不到此请求。';
  if (message === 'Reply type does not match request') return '回复类型与请求不匹配；回答问题不代表批准操作。';
  if (message.includes('delivery is not confirmed')) return '此渠道尚未确认发送成功，不能处理决定。';
  if (message.includes('not sent to this channel')) return '此请求未发送到当前渠道。';
  if (message.startsWith('Use approve')) return words('zh').replyHelp;
  return '无法处理回复，请检查请求编号、回复格式和请求状态。';
}
